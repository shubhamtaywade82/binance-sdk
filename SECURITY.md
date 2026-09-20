# Security Policy

This SDK signs and sends authenticated requests to Binance (HMAC/Ed25519/RSA) using
API keys and secrets you supply. Treat any vulnerability that could leak credentials,
forge signatures, bypass the `safety`/`RiskGateway` guardrails, or cause unintended
order placement as a security issue.

## Supported versions

Only the latest published `3.x` release is supported. Pre-3.0 (`2.x` and earlier) is
unmaintained; upgrade before reporting an issue against it.

## Reporting a vulnerability

Do **not** open a public GitHub issue for a security report. Instead, use GitHub's
[private vulnerability reporting](https://github.com/shubhamtaywade82/binance-sdk/security/advisories/new)
for this repository, or email the maintainer directly (see the `author` field in
`package.json`) with:

- A description of the vulnerability and its impact.
- Steps to reproduce (a minimal script against testnet is ideal — never share live
  API keys or secrets).
- The SDK version and Node.js version.

Expect an initial response within 5 business days. Confirmed vulnerabilities are
fixed in a patch release with a `CHANGELOG.md` entry; credit is given unless you ask
to remain anonymous.

## Scope notes

- Never commit `.env` files or API secrets; `.env.example` documents the expected
  variables with empty values.
- The `safety` (`RiskGateway`) option is opt-in — omitting it leaves no guardrails on
  mutating requests. This is documented behavior, not a vulnerability by itself.
- Transitive dependency advisories in `@modelcontextprotocol/sdk`'s HTTP-transport
  dependencies (`express`/`hono`/`qs`) do not affect this SDK's MCP server, which only
  ever constructs `StdioServerTransport` — no HTTP transport code path is reachable.
