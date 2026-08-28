# Hakimi Web

A browser client for Hakimi — a peer to the TUI (`apps/kimi-code`) that talks
to a local **server** over REST + WebSocket. Vue 3 + Vite + TypeScript.

---

## Quick start

```bash
# Against a REAL server (the server must be running and reachable)
WEB_PORT=5197 KIMI_SERVER_URL=http://192.168.1.10:58627 pnpm -C apps/kimi-web run dev
#   …or from the repo root:  pnpm dev:web   (uses the defaults below)

# checks
pnpm -C apps/kimi-web run typecheck     # vue-tsc --noEmit
pnpm -C apps/kimi-web run test          # vitest (pure logic only)
pnpm -C apps/kimi-web run build         # vite build
```

### How it connects to the server

The browser cannot reach the server cross-origin (no CORS), so Vite **same-origin
proxies** `/api/v1` (HTTP + WS) to the server (`vite.config.ts`):

| env var           | default                  | meaning                                  |
| ----------------- | ------------------------ | ---------------------------------------- |
| `WEB_PORT`        | `5175`                   | port the dev server listens on           |
| `KIMI_SERVER_URL` | `http://127.0.0.1:58627`  | where `/api/v1` (and `/api/v1/ws`) is forwarded |

> Behind a corporate HTTP proxy, also set `NO_PROXY=<server-host>` (for example,
> `NO_PROXY=127.0.0.1,localhost`) so the proxy forward reaches the server directly.

---

## Architecture

A strict one-direction data flow; components never touch the network or the
reducer — they consume computed view props and call actions.

```
server (REST + WS)
  └─ src/api/daemon/client.ts      REST adapter  (envelope → AppX types)
  └─ src/api/daemon/ws.ts          WS frames → classify → projector/reducer
       └─ agentEventProjector.ts   RAW agent-core events → AppEvent[]
       └─ eventReducer.ts          AppEvent[] → state
  └─ src/composables/useKimiWebClient.ts   the ONLY place that imports api + state;
                                           exposes computed view props + actions
  └─ src/components/*.vue          render props, emit intents (no api access)
```

> The directory name `src/api/daemon/` is historical and kept to minimise
> diff churn; conceptually it is the **server** adapter.

- **Adapter** (`src/api/`): wire types are snake_case; `AppX` types are camelCase.
  `config.ts` builds `/api/v1` URLs.
- **Event projector** (`agentEventProjector.ts`): the server streams **raw
  agent-core events** (no `event.` prefix). `classifyFrame` routes raw vs
  protocol (`event.*`) frames; the projector converts them to `AppEvent`s.
- **i18n** (`src/i18n/`): vue-i18n, en/zh, per-namespace flat camelCase keys.
  Detect order: `localStorage('kimi-locale')` → `navigator.language` → `en`.
---

## Server contract — non-obvious notes

The server's wire protocol has a few things that will bite you if forgotten:

- **Envelope:** every response is `{ code, msg, data, request_id }` and the HTTP
  status is **always 200** — check `code` (0 = ok), not the status.
- **Prompt settings are explicit in the restored client.** It sends `model`,
  `thinking`, and `permission_mode` with `content`. It also still sends the legacy
  `plan_mode` field, which the server adapts with deprecation headers; new code
  should update plan mode through `POST /sessions/{id}/profile` instead.
- **Creating a session needs a *registered* workspace.** `workspace_id` must be a
  `wd_<slug>_<hash>` id that exists in the server's registry. Sessions get one
  auto-assigned by cwd, but it isn't *registered* until you `POST /workspaces
  { root }` (idempotent). The web registers on demand before `createSession`
  (otherwise: `workspace not found: wd_…`).
- **Persisted sessions are directly promptable** — selecting an old session and
  sending a message just works; there is **no `:activate` step**.
- **Workspaces** = real folders. `GET/POST/PATCH/DELETE /workspaces`,
  `GET /fs:browse?path=`, `GET /fs:home` back the rail + folder picker.

## Release & deployment

`apps/kimi-web` is the only editable production source for Hakimi Web. It is still
not published or deployed as a standalone package: CLI and native releases serve
the tracked derived `apps/kimi-code/dist-web` bundle together with its
`apps/kimi-code/web-base.json` provenance.

### Canonical production build

From the repository root, use the canonical command after every source change to
generate and atomically replace the package bundle and its provenance:

```bash
pnpm run build:web-assets
```

Commit both generated outputs with the source change. Use the check form to
rebuild in a clean staging directory and require a byte-for-byte match with the
tracked bundle and provenance:

```bash
pnpm run build:web-assets -- --check
```

Do not copy `apps/kimi-web/dist`, hand-edit the generated package outputs, or
replace only part of the bundle. `web-base.json` provenance schema v4 binds three
identities: the complete `apps/kimi-web` source manifest and digest, the canonical
recipe/toolchain manifest and digest, and the generated bundle manifest and
digest. CI, release, and native flows verify tracked outputs before regenerating
them; direct package build/prepack and Nix generate and validate outputs for
consumption. Native SEA builds collect a verified snapshot;
the native receipt binds the same source/recipe/bundle identity and branding patch
version to the final executable's SHA-256.

For rollback, restore the source and canonical recipe from an older release tag,
then regenerate the complete package outputs and native receipt. A mixed set must
fail verification or packaging.

Local development remains separate: `pnpm dev:web` (or
`pnpm -C apps/kimi-web run dev`) runs Vite, while
`pnpm -C apps/kimi-web run build` produces only the local `dist/` directory.
`apps/kimi-web/package.json` remains internal workspace metadata; the Web UI has
no independent version or standalone deployment channel.
