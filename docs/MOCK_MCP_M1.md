# M1 mock MCP adapter acceptance

**Status: synthetic, in-process, pre-alpha.** This module is an MCP-shaped fake client, **not** an MCP SDK implementation, JSON-RPC transport, registered server, OAuth client or deployment.

It is layered on the source-only `SessionCore` fixture in PR #2. Its client identity is injected by a trusted *test harness*, never taken from MCP tool arguments. This is not authentication. A future real MCP service must bind actual user/device/client identity to each authorization independently of model-generated arguments.

## Mock tools

| Tool | Fixture effect |
| --- | --- |
| `concord_observe({after?})` | Read only an allowlisted projection of session/event metadata and a bounded resume cursor. No PTY output or event text. |
| `concord_request_control({})` | Add a pending request. Does not grant authority. |
| `concord_grant_control({targetId})` | **Fixture owner only** approves an attached, pending target. No implicit AI consent. |

There is intentionally **no** `concord_input`, `execute`, `shell`, `open_port`, `credential`, remote control or arbitrary method dispatch. Calling unknown methods returns an error without forwarding them. Output events are untrusted, and the mock response excludes all arbitrary event payload fields.

## Deterministic acceptance

Run `npm test` with Node 22 or higher, or the PR-scoped `Synthetic session contract` workflow. Tests cover:

- allowed tool catalog and observer reconnect with cursor;
- requested takeover and separate owner approval;
- denied self-grants and spoofed `actorId` or `identity` parameters;
- unknown mutation tools, invalid types, wrong shapes and cursor rejection;
- metadata-only output projection with adversarial fixture text;
- revoked client's denied observation and control requests;
- zero transport writes throughout the mock MCP tests.

## Explicit limitations

- No real MCP wire protocol, JSON-RPC, HTTP, SSE, stdio, network listener or client integration exists.
- No trustworthy identity provider, consent UI, signed authority, durable authorization, server-side policy or attested terminal state exists.
- The underlying `SessionCore` remains in-memory and has no crash-persistent idempotency ledger; **never** connect this code to a real input transport.
- The fixture owner can approve requests only in-memory and cannot establish physical/organizational permission.
- A future real adapter needs a documented threat model, exact permission mapping, lifecycle reconciliation, redaction, negative tests and separate P0/production authorization.
- Private Cloud is optional and is never imported by the public fixture.

The acceptance claim is limited to **unit-test-only in-process protocol behavior**. No terminal collaboration or deployable MCP functionality is implied.
