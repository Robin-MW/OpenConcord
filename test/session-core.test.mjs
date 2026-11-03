import test from "node:test";
import assert from "node:assert/strict";
import { SessionCore } from "../src/session-core.mjs";

function fixture({ capacity = 64 } = {}) {
  let now = 1000; const writes = [];
  const session = new SessionCore({ sessionId: "synthetic-1", ownerId: "owner",
    clock: () => now, leaseMs: 100, capacity,
    transport: { input: async text => { writes.push(text); } } });
  return { session, writes, tick: ms => { now += ms; } };
}
const rejectsCode = (fn, code) => assert.rejects(fn, e => e?.code === code);
const throwsCode = (fn, code) => assert.throws(fn, e => e?.code === code);

test("observer can attach and resume same opaque session without obtaining control", async () => {
  const { session, writes } = fixture();
  const first = session.attach("observer");
  assert.equal(first.sessionId, "synthetic-1");
  assert.equal(first.controller.actorId, "owner");
  await rejectsCode(() => session.input("observer", "r1", "blocked"), "NOT_CONTROLLER");
  assert.equal(writes.length, 0);
  const cursor = first.sequence;
  session.requestControl("observer");
  const resumed = session.snapshot("observer", cursor);
  assert.equal(resumed.gap, false);
  assert.deepEqual(resumed.events.map(e => e.type), ["CONTROL_REQUESTED"]);
});
test("only present controller or owner may grant requested takeover", async () => {
  const { session, writes } = fixture();
  session.attach("a"); session.attach("b");
  session.requestControl("a");
  throwsCode(() => session.grantControl("b", "a"), "NOT_AUTHORIZED");
  throwsCode(() => session.grantControl("owner", "b"), "NO_REQUEST");
  session.grantControl("owner", "a");
  assert.equal(session.activeController().actorId, "a");
  await rejectsCode(() => session.input("owner", "r1", "no"), "NOT_CONTROLLER");
  await session.input("a", "r1", "yes");
  assert.deepEqual(writes, ["yes"]);
});
test("request id prevents duplicate writes, including concurrent calls", async () => {
  const { session, writes } = fixture();
  const [first, second] = await Promise.all([
    session.input("owner", "same", "hello"), session.input("owner", "same", "hello")
  ]);
  assert.equal(writes.length, 1);
  assert.equal(first.replayed, false);
  assert.equal(second.replayed, true);
  assert.equal(first.sequence, second.sequence);
  await rejectsCode(() => session.input("owner", "same", "different"), "REPLAY_PAYLOAD_MISMATCH");
  assert.equal(writes.length, 1);
});
test("lease expiration prevents further input until a requested new grant", async () => {
  const { session, tick, writes } = fixture();
  tick(101);
  await rejectsCode(() => session.input("owner", "late", "no"), "NOT_CONTROLLER");
  assert.equal(session.activeController(), null);
  session.requestControl("owner"); session.grantControl("owner", "owner");
  await session.input("owner", "valid", "yes");
  assert.deepEqual(writes, ["yes"]);
});
test("owner revocation disconnects actor and blocks both input and observation", async () => {
  const { session, writes } = fixture();
  session.attach("observer"); session.requestControl("observer");
  session.grantControl("owner", "observer");
  session.revoke("owner", "observer");
  throwsCode(() => session.snapshot("observer", 0), "NOT_ATTACHED");
  throwsCode(() => session.attach("observer"), "REVOKED");
  throwsCode(() => session.revoke("owner", "owner"), "OWNER_REVOKE_FORBIDDEN");
  await rejectsCode(() => session.input("observer", "r", "no"), "NOT_ATTACHED");
  assert.equal(writes.length, 0);
});
test("bounded log reports replay gap, never echoes input text", async () => {
  const { session } = fixture({ capacity: 2 });
  session.attach("a"); session.attach("b");
  await session.input("owner", "r", "super-secret-fixture-text");
  const s = session.snapshot("owner", 0);
  assert.equal(s.gap, true);
  assert.equal(s.events.length, 2);
  assert.equal(JSON.stringify(s).includes("super-secret-fixture-text"), false);
  throwsCode(() => session.snapshot("owner", -1), "INVALID_CURSOR");
});
test("uncertain transport failure is fenced from automatic replay", async () => {
  let calls = 0;
  const session = new SessionCore({ sessionId: "s", ownerId: "owner",
    transport: { input: async () => { calls++; throw Error("ambiguous"); } } });
  await rejectsCode(() => session.input("owner", "x", "command"), "INPUT_UNCERTAIN_NO_RETRY");
  await rejectsCode(() => session.input("owner", "x", "command"), "INPUT_UNCERTAIN_NO_RETRY");
  assert.equal(calls, 1);
  assert.equal(session.snapshot("owner", 0).events.at(-1).type, "INPUT_UNCERTAIN");
});
test("unknown identity, invalid cursor and unapproved control fail closed", () => {
  const { session } = fixture();
  throwsCode(() => session.attach("bad id"), "INVALID_ID");
  throwsCode(() => session.snapshot("ghost", 0), "NOT_ATTACHED");
  session.attach("a");
  throwsCode(() => session.grantControl("owner", "a"), "NO_REQUEST");
});
