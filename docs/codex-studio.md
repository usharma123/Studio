# Studio

Studio is an experimental Electron coding workspace built on the MIT-licensed
[T3 Code](https://github.com/pingdotgg/t3code) stack. It is an independent client and is not an
official OpenAI product.

## What works

- Secure Electron shell with a sandboxed, context-isolated renderer.
- Local projects, Git branches, worktrees, project scripts, diffs, files, and integrated terminals.
- Persistent tasks with streaming assistant output, reasoning and work logs, changed-file summaries,
  plan mode, checkpoint rollback, and interrupt support.
- Codex model and reasoning controls, permission modes, command/file approvals, structured questions,
  skills, slash commands, file mentions, and image attachments.
- Integrated browser preview with element selection and annotations.
- Multiple local or remote environments and multiple Codex accounts.

## Architecture

```text
Electron main process
  -> starts apps/server as a managed child process
  -> exposes a typed, minimal preload bridge

React renderer
  <-> typed WebSocket RPC
Node/Effect server
  <-> newline-delimited JSON request/response messages over stdio
codex app-server
```

The Codex transport lives in `packages/effect-codex-app-server`. Provider lifecycle and event
normalization live in `apps/server/src/provider/Layers/CodexSessionRuntime.ts` and
`CodexAdapter.ts`. The renderer never launches Codex directly.

The fork has an identity isolated from upstream T3 Code: its application protocols are
`codex-studio://` and `codex-studio-dev://`, packaged builds use the
`com.codexstudio.desktop` app ID, and local state defaults to `~/.codex-studio`. `T3CODE_HOME`
remains available as an explicit compatibility override for the inherited runtime.

## Run it

Prerequisites:

1. Node 24 and pnpm 11.
2. A current Codex CLI on `PATH`.
3. An authenticated local session from `codex login`.

```bash
pnpm install --frozen-lockfile
pnpm dev:desktop
```

Validation and release commands:

```bash
pnpm exec vp check
pnpm exec vp run typecheck
pnpm build:desktop
pnpm test:desktop-smoke
pnpm dist:desktop:dmg:arm64
```

## App-server compatibility

The integration performs the required `initialize` / `initialized` handshake, then uses the typed
thread, turn, model, skill, account, approval, and notification surfaces. Core methods include
`thread/start`, `thread/resume`, `thread/read`, `turn/start`, and `turn/interrupt`; streamed items
are normalized into the renderer's persistent orchestration model.

Codex app-server evolves quickly. The repository contains generated Effect schemas pinned to a
known Codex revision, while the transport deliberately supports unknown notifications without
crashing. Before shipping a release, compare the generated schemas with the installed CLI:

```bash
codex app-server generate-ts --experimental --out /tmp/codex-protocol/ts
codex app-server generate-json-schema --experimental --out /tmp/codex-protocol/json
```

## Deliberate gaps

- Scheduled tasks require a scheduler and durable job store outside the app-server protocol.
- A Sites-style publishing surface requires a separate hosting backend.
- Voice input and realtime audio are not exposed in this first desktop iteration.
- Explicit command and file approvals are interactive. Broader permission escalation is
  conservatively denied and MCP elicitation is cancelled until those request types have dedicated
  product UX.
- Dynamic tool, auth-refresh, and attestation requests still require dedicated host capabilities.

These are kept explicit rather than represented by non-functional navigation.
