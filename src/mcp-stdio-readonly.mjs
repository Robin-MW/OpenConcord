// Pre-alpha MCP JSON-RPC 2.0 stdio server. Synthetic, read-only, no network / PTY.
import { SessionCore } from "./session-core.mjs";
import { createMockMcpClient } from "./mock-mcp-client.mjs";

const PROTOCOL_VERSION = "2025-06-18";
const MAX_LINE = 65536;
const TOOL_NAME = "concord_observe";
const session = new SessionCore({
  sessionId: "synthetic-local-session",
  ownerId: "fixture-owner",
  transport: { input: async () => { throw Error("DISABLED"); } }
});
session.attach("fixture-observer");
const observer = createMockMcpClient({ session, actorId: "fixture-observer" });
const tool = Object.freeze({
  name: TOOL_NAME,
  description: "Read synthetic session metadata. No terminal output, control or execution.",
  inputSchema: {
    type: "object",
    properties: { after: { type: "integer", minimum: 0 } },
    additionalProperties: false
  }
});
let initialized = false;
const object = x => x !== null && typeof x === "object" && !Array.isArray(x);
const idValid = x => typeof x === "string" || (typeof x === "number" && Number.isSafeInteger(x));
const answer = (id, result) => ({ jsonrpc: "2.0", id, result });
const error = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });

function processMessage(message) {
  if (!object(message) || message.jsonrpc !== "2.0") return error(null, -32600, "Invalid Request");
  const notification = !Object.hasOwn(message, "id");
  if (!notification && !idValid(message.id)) return error(null, -32600, "Invalid Request");
  if (typeof message.method !== "string") return error(notification ? null : message.id, -32600, "Invalid Request");
  if (notification) return null; // No notification may mutate fixture state.
  const id = message.id;
  if (message.method === "initialize") {
    if (!object(message.params) || typeof message.params.protocolVersion !== "string" ||
        !object(message.params.capabilities) || !object(message.params.clientInfo) ||
        typeof message.params.clientInfo.name !== "string" || !message.params.clientInfo.name ||
        typeof message.params.clientInfo.version !== "string" || !message.params.clientInfo.version)
      return error(id, -32602, "Invalid params");
    if (message.params.protocolVersion !== PROTOCOL_VERSION)
      return error(id, -32602, "Unsupported protocol version");
    initialized = true;
    return answer(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "openconcord-synthetic-readonly", version: "0.0.0" }
    });
  }
  if (!initialized) return error(id, -32002, "Initialize required");
  if (message.method === "ping") return answer(id, {});
  if (message.method === "tools/list") return answer(id, { tools: [tool] });
  if (message.method === "tools/call") {
    if (!object(message.params) || message.params.name !== TOOL_NAME)
      return error(id, -32602, "Unknown or forbidden tool");
    const args = Object.hasOwn(message.params, "arguments") ? message.params.arguments : {};
    if (!object(args) || Object.keys(args).some(k => k !== "after") ||
      (args.after !== undefined && (!Number.isSafeInteger(args.after) || args.after < 0)))
      return error(id, -32602, "Invalid params");
    // The underlying fixture adapter is asynchronous, so this case is dispatched below.
    return { deferred: true, id, args };
  }
  return error(id, -32601, "Method not found");
}

async function dispatch(message) {
  const first = processMessage(message);
  if (!first?.deferred) return first;
  const reply = await observer.callTool({ name: TOOL_NAME, arguments: first.args });
  const payload = reply.structuredContent;
  const content = [{ type: "text", text: JSON.stringify(payload) }];
  return answer(first.id, { content, structuredContent: payload, isError: reply.isError });
}

function send(message) {
  if (message !== null) process.stdout.write(JSON.stringify(message) + "\n");
}
// Bound memory before a full newline arrives; preserve response order for pipelined calls.
let incoming = Buffer.alloc(0);
let discarding = false;
let serial = Promise.resolve();
function onLine(bytes) {
  const line = bytes.toString("utf8").replace(/\r$/, "");
  serial = serial.then(async () => {
    let request;
    try { request = JSON.parse(line); }
    catch { send(error(null, -32700, "Parse error")); return; }
    try { send(await dispatch(request)); }
    catch { send(error(idValid(request?.id) ? request.id : null, -32603, "Internal error")); }
  }).catch(() => send(error(null, -32603, "Internal error")));
}
process.stdin.on("data", chunk => {
  let offset = 0;
  while (offset < chunk.length) {
    const end = chunk.indexOf(10, offset);
    const limit = end === -1 ? chunk.length : end;
    const part = chunk.subarray(offset, limit);
    if (!discarding) {
      if (incoming.length + part.length > MAX_LINE) {
        incoming = Buffer.alloc(0);
        discarding = true;
        serial = serial.then(() => send(error(null, -32700, "Message too large")));
      } else {
        incoming = Buffer.concat([incoming, part]);
      }
    }
    offset = end === -1 ? chunk.length : end + 1;
    if (end !== -1) {
      if (!discarding) onLine(incoming);
      incoming = Buffer.alloc(0);
      discarding = false;
    }
  }
});
