# Studio

Studio is a Codex-focused desktop client for working with coding agents. It provides an Electron
application backed by a Node.js server and a React/Vite interface, with support for local and remote
agent sessions.

## Upstream credit

Studio is built on the excellent open-source [T3 Code](https://github.com/pingdotgg/t3code)
project. T3 Code established the core agent runtime, provider integrations, and much of the
application architecture used here. The upstream source is MIT-licensed; see [LICENSE](./LICENSE)
for the applicable license and copyright notice.

Studio is an independent project and is not affiliated with T3 Code, Ping Labs, or OpenAI.

## Supported agents

- [Codex CLI](https://developers.openai.com/codex/cli)
- [Claude Code](https://claude.com/product/claude-code)
- [Cursor CLI](https://cursor.com/cli)
- [OpenCode](https://opencode.ai)

Install and authenticate at least one provider before starting the application.

## Local development

Install [Vite+](https://viteplus.dev/guide/), then install dependencies and launch the desktop app:

```bash
vp i
vp run dev:desktop
```

Useful validation commands:

```bash
vp check
vp run typecheck
vp test
```

## Documentation

- [Architecture overview](./docs/architecture/overview.md)
- [Codex prerequisites](./docs/getting-started/codex-prerequisites.md)
- [Provider guides](./docs/providers/codex.md)
- [Operations](./docs/operations/ci.md)
- [Reference](./docs/reference/encyclopedia.md)

This project is an early work in progress. Expect interfaces and behavior to evolve quickly.
