// Synthetic MCP-shaped in-process harness. Not an MCP SDK/server or trusted auth boundary.
import { SessionError } from "./session-core.mjs";

const METHODS = Object.freeze([
  Object.freeze({ name: "concord_observe", description: "Read fixture metadata with a cursor" }),
  Object.freeze({ name: "concord_request_control", description: "Request a human-approved fixture lease" }),
  Object.freeze({ name: "concord_grant_control", description: "Owner approves a pending fixture request" })
]);

const fail = (code) => Object.freeze({
  isError: true, structuredContent: Object.freeze({ ok: false, code })
});
const ok = (value) => Object.freeze({
  isError: false, structuredContent: Object.freeze({ ok: true, ...value })
});
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const exact = (args, names) => isObject(args) &&
  Object.keys(args).every(k => names.includes(k));
const validActor = (s) => typeof s === "string" &&
  /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(s);

/**
 * A test-only simulated client; actor is injected by the test harness and NEVER taken
 * from tool arguments. It does not authenticate a model, browser, token or OS process.
 * API intentionally contains NO input / execute / shell / open-port capability.
 */
export function createMockMcpClient({ session, actorId } = {}) {
  if (!session || typeof session.snapshot !== "function" ||
      typeof session.requestControl !== "function" ||
      typeof session.grantControl !== "function" ||
      !validActor(actorId)) throw new SessionError("INVALID_ADAPTER_CONFIG");

  const tools = Object.freeze(METHODS.map(t => ({ ...t })));

  return Object.freeze({
    listTools() { return Object.freeze({ tools }); },
    async callTool({ name, arguments: args = {} } = {}) {
      if (typeof name !== "string") return fail("INVALID_TOOL");
      try {
        switch (name) {
          case "concord_observe": {
            if (!exact(args, ["after"]) ||
                (args.after !== undefined && (!Number.isSafeInteger(args.after) || args.after < 0)))
              return fail("INVALID_ARGUMENTS");
            const snapshot = session.snapshot(actorId, args.after ?? 0);
            // Only fixture event metadata crosses this boundary.
            return ok({ snapshot });
          }
          case "concord_request_control": {
            if (!exact(args, []) || Object.keys(args).length !== 0)
              return fail("INVALID_ARGUMENTS");
            session.requestControl(actorId);
            return ok({ requested: true });
          }
          case "concord_grant_control": {
            if (!exact(args, ["targetId"]) || Object.keys(args).length !== 1 ||
                !validActor(args.targetId)) return fail("INVALID_ARGUMENTS");
            if (actorId !== session.ownerId) return fail("OWNER_APPROVAL_REQUIRED");
            session.grantControl(actorId, args.targetId);
            return ok({ approved: true, targetId: args.targetId });
          }
          default:
            return fail("UNKNOWN_TOOL");
        }
      } catch (error) {
        if (error instanceof SessionError) return fail(error.code);
        // No stack, input, credentials, or underlying errors leave this fixture.
        return fail("INTERNAL_ERROR");
      }
    }
  });
}
