# Session protocol M1: isolated synthetic fixture

Status: **experimental source-only fixture**, not a terminal product, local daemon, MCP server or authorized execution service.

## Boundary

The fixture simulates one opaque session identity and owner. A client explicitly attaches to observe bounded event metadata. Observers cannot write. A client requests control, and only the owner or present controller may grant the requested takeover. At most one controller holds a time-limited lease. The owner may revoke a participant. A reconnect supplies the last seen sequence cursor and reports a gap if event retention is insufficient.

Each input carries a per-actor request ID. An accepted ID is never written twice, including concurrent retries. Failed/uncertain transport effects are **not** blindly retried. Input content is intentionally excluded from the fixture event stream.

The injected transport in tests is an array, never a real shell, network socket or remote machine. No OS commands or credentials are accepted.

## Tests / acceptance

Run `npm test` with Node 22+. Tests cover observer denial, requested takeover, controller transfer, TTL expiry, owner revoke, resume cursor and retention gaps, duplicate/replayed requests, uncertain input effect, identity validation and content non-disclosure.

## Known limits and hard blockers for physical integration

- In-memory leases and request IDs are **not** durable across process restart. A real adapter must persist effect fences before physical input and reconcile uncertainty after crashes.
- No multi-node consensus, user authentication, Tailscale identity, cryptographic authorization, Windows ConPTY, POSIX PTY, SSH, screen capture or terminal-provider integration exists.
- Reconnect is a bounded metadata stream, not a PTY scrollback stream. Never interpret an output event as verified command completion or exit-code proof.
- The owner is a fixture-level role, not a proven human identity. All user/device/session/capability bindings need an external trusted authority.
- Real clients need redaction, backpressure, physical proof of single-writer ownership, cancellation, event persistence and an audited revocation path.
- This fixture must not be deployed as a production endpoint. Do not expose raw shell execution via MCP.

## Implementation sequence

1. Review public protocol vocabulary and boundary, confirm tests on exact PR HEAD.
2. Pin upstream adapters and verify permission/API/license support before selecting Termix, OpenAgents, native PTY, or other providers.
3. Build a mock MCP adapter that exposes only fixture session metadata and denied-input evidence.
4. Add authenticated real adapters individually, with separate Windows/Linux, network isolation and security acceptance.
5. Keep local self-hosting complete without private cloud. Private services can consume version-pinned public contracts; never invert this dependency.
