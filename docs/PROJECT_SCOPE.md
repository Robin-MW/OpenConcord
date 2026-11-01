# OpenConcord | Public project scope

**Status: pre-alpha.** This document describes direction, not shipped functionality.

OpenConcord aims to provide a self-hostable collaboration and verification layer for humans and AI agents working across machines, tools and existing session providers. The intended experience has four independently authorized modes: **Observe**, **Collaborate**, **Orchestrate** and **Validate**.

## Architectural principles

- The community baseline must work without any vendor account or proprietary hosted service.
- Prefer integrating existing tools rather than implementing another shell, terminal emulator, Git engine, task scheduler or sandbox manager.
- Each actor and session must have an explicit identity and independently checked capability. A browser connection or workspace mode never grants operating-system authority.
- Provider output is untrusted information, not verified execution evidence.
- The protocol, local provider adapters, documented MCP contract and validation receipt format belong in the public project.
- Hosted relay, subscriptions and optional proprietary operations must remain separate and must not be required for local operation.

## Current implementation status

There is no validated Windows/Linux end-to-end integration, production authorization layer, native terminal adapter or independently accepted hosted service in this repository yet. The interface and integration choices remain experimental. No unsupported feature is advertised as available.

## Licensing

New original project source is intended to be published under **AGPL-3.0-only**. Any imported upstream code requires separate compatibility, attribution and provenance review. The public license does not license OpenConcord names or logos as trademarks, nor require profit-sharing. Commercial licensing of copyright-controlled original components may be offered separately in the future.
