# M1 read-only MCP stdio pilot (synthetic only)

This is a **real JSON-RPC 2.0 MCP stdio transport** with a deliberately tiny tool surface. It is **not** a remotely accessible MCP server, authorized real-user integration, terminal bridge or deployed product. Protocol pinned to `2025-06-18`; reject other protocol versions until explicitly tested.

## Local development

Requires Node.js 22 or newer, no npm dependencies, credentials or download step beyond cloning the source repository.

```sh
npm test
node src/mcp-stdio-readonly.mjs
```

Only test fixtures are constructed at startup. This process reads newline-delimited JSON-RPC messages from stdin and sends JSON-RPC responses to stdout; it does not bind a TCP listener, spawn a shell or open a PTY. Standard input is protocol data, **not** terminal input. Never deploy this process to a network endpoint or add it as an execution-enabled client.

## Implemented MCP surface

- `initialize`: fixed protocol version, tools capability and pre-alpha server identity.
- `notifications/initialized`: ignored, never grants authority.
- `ping`, `tools/list`: supported after initialization.
- `tools/call`: only `concord_observe` with optional nonnegative integer `after`.
- `concord_observe`: returns allowlisted synthetic session metadata (cursor, gap flag, controller lease metadata, event type/actor/request identifiers) through MCP `structuredContent` and text `content`.
- Any `concord_input`, `concord_request_control`, `concord_grant_control` or arbitrary tool/method request with an ID is rejected. Unknown notifications without a request ID are ignored without response; they never authorize a mutation. No tool allows user-chosen session IDs or identity parameters.

The fixture actor is hardcoded, not authenticated. No real user, host, authorization ledger, session output, approval UI, command execution result or persistent request fence exists.

## Acceptance and limitations

Node `node:test` spawns the actual child process and sends MCP messages over its standard streams to prove initialization, observe-only discovery, denied mutation methods, invalid params, forced actor spoof denial and metadata allowlisting. The earlier in-process mock tests remain in CI.

A new physical adapter is blocked until it has strong client authentication, explicit host/user binding, per-session consent and revocation, bounded retention and redaction, backpressure, crash-durable input idempotency, verified protocol compliance across supported MCP clients, and separate native Windows/Linux acceptance.

No production or P0 runtime changes. OpenConcord-Cloud is not imported. This PR is stacked on the mock adapter PR and stays draft until exact-head CI and independent review.
