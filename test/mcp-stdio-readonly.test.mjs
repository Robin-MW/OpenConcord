import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

function start() {
  const child = spawn(process.execPath, ["src/mcp-stdio-readonly.mjs"], {
    cwd: process.cwd(), stdio: ["pipe", "pipe", "pipe"]
  });
  const messages = [];
  const pending = [];
  const lines = createInterface({ input: child.stdout });
  lines.on("line", line => {
    const message = JSON.parse(line);
    if (pending.length) pending.shift()(message); else messages.push(message);
  });
  function read() {
    if (messages.length) return Promise.resolve(messages.shift());
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error("no stdio reply")), 3000);
      timeout.unref();
      pending.push(message => { clearTimeout(timeout); resolve(message); });
    });
  }
  return {
    child, read,
    send: message => child.stdin.write(JSON.stringify(message) + "\n"),
    close: () => { child.stdin.end(); child.kill(); lines.close(); }
  };
}
const req = (id, method, params) => ({
  jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params })
});
const init = () => req(1, "initialize", {
  protocolVersion: "2025-06-18", capabilities: {},
  clientInfo: { name: "test", version: "0.0.0" }
});

test("real stdio JSON-RPC initializes, lists only observe, reads metadata", async () => {
  const app = start();
  try {
    app.send(init());
    const ready = await app.read();
    assert.equal(ready.result.protocolVersion, "2025-06-18");
    assert.equal(ready.result.capabilities.tools.listChanged, false);
    app.send(req(2, "tools/list"));
    const listed = await app.read();
    assert.deepEqual(listed.result.tools.map(x => x.name), ["concord_observe"]);
    app.send(req(3, "tools/call", { name: "concord_observe", arguments: { after: 0 } }));
    const called = await app.read();
    assert.equal(called.id, 3);
    assert.equal(called.result.isError, false);
    assert.equal(called.result.structuredContent.ok, true);
    assert.equal(called.result.structuredContent.snapshot.sessionId, "synthetic-local-session");
    assert.equal(JSON.stringify(called).includes("transport"), false);
  } finally { app.close(); }
});

test("preinit, wrong version, unknown method and unauthorized tools fail closed", async () => {
  const app = start();
  try {
    app.send(req(5, "tools/list"));
    assert.equal((await app.read()).error.code, -32002);
    app.send(req(6, "initialize", { protocolVersion: "unsupported" }));
    assert.equal((await app.read()).error.code, -32602);
    app.send(init());
    await app.read();
    for (const [name, args] of [
      ["concord_input", { text: "whoami" }],
      ["concord_request_control", {}],
      ["concord_grant_control", { targetId: "fixture-observer" }]
    ]) {
      app.send(req(9, "tools/call", { name, arguments: args }));
      assert.equal((await app.read()).error.code, -32602);
    }
    app.send(req(10, "tools/call", {
      name: "concord_observe", arguments: { after: 0, actorId: "fixture-owner" }
    }));
    assert.equal((await app.read()).error.code, -32602);
    for (const argumentsValue of [null, { after: -1 }, { after: "0" }]) {
      app.send(req(13, "tools/call", { name: "concord_observe", arguments: argumentsValue }));
      assert.equal((await app.read()).error.code, -32602);
    }
    app.send(req(14, "initialize", { protocolVersion: "2025-06-18" }));
    assert.equal((await app.read()).error.code, -32602);
    app.send(req(11, "shell", { command: "whoami" }));
    assert.equal((await app.read()).error.code, -32601);
    app.send(req(12, "tools/list"));
    assert.deepEqual((await app.read()).result.tools.map(x => x.name), ["concord_observe"]);
  } finally { app.close(); }
});

test("stdio session is fixed and does not expose arbitrary event text or inputs", async () => {
  const app = start();
  try {
    app.send(init()); await app.read();
    app.send(req(8, "tools/call", { name: "concord_observe", arguments: {} }));
    const result = (await app.read()).result.structuredContent;
    assert.equal(result.snapshot.controller.actorId, "fixture-owner");
    assert.ok(result.snapshot.events.every(e =>
      Object.keys(e).every(k => ["sequence", "type", "actorId", "targetId", "requestId"].includes(k))
    ));
    assert.equal(result.snapshot.events.some(e => Object.hasOwn(e, "data")), false);
  } finally { app.close(); }
});

test("stdio rejects oversized unterminated messages and recovers at newline", async () => {
  const app = start();
  try {
    app.child.stdin.write("x".repeat(70000));
    assert.equal((await app.read()).error.code, -32700);
    app.child.stdin.write("\\n");
    app.send(init());
    assert.equal((await app.read()).result.protocolVersion, "2025-06-18");
    app.send(req(2, "tools/list"));
    assert.equal((await app.read()).result.tools.length, 1);
  } finally { app.close(); }
});

test("pipelined requests preserve response order", async () => {
  const app = start();
  try {
    app.send(init()); await app.read();
    app.send(req(20, "tools/call", { name: "concord_observe", arguments: {} }));
    app.send(req(21, "ping"));
    assert.equal((await app.read()).id, 20);
    assert.equal((await app.read()).id, 21);
  } finally { app.close(); }
});
