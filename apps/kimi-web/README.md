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

Hakimi Web is **not published as a standalone package**, and this workspace does
**not yet own the production web bundle**.

### Current release flow (phase 1: source shadow workspace)

- This `apps/kimi-web` tree is maintained as a **source shadow workspace**: we
  track and evolve the web UI source here, but the **production `dist-web` that
  is actually served today is still the external code-app bundle** (built from
  the code-app repo and shipped as part of the CLI's `apps/kimi-code/dist-web`).
- Hakimi does **not copy or ship** this workspace's build yet: there is no
  `copy-web-assets` step and no release wiring from `apps/kimi-web/dist` into
  the CLI package. Production stays on the external bundle until phase 2 flips
  it over — deliberately, and only after the shadow source is validated against
  the current server.
- Local development/checks stay unchanged: `pnpm dev:web` (or
  `pnpm -C apps/kimi-web run dev`), `pnpm -C apps/kimi-web run build` (produces
  only the untracked local `dist/`), `typecheck`, `test`, `check:style`.
- `apps/kimi-web/package.json` remains internal workspace metadata; the web UI
  does not surface its own version or build commit.

### Suggested improvements (for the later flip-over)

- **Keep the current coupling for now.** Because Hakimi is primarily a local
  CLI/server product, bundling the web UI into the CLI package keeps installs
  self-contained and avoids cross-origin/CORS complexity.
- **Add an independent web-deploy workflow only when needed.** If a public
  standalone web deployment is required later, create
  `.github/workflows/web-deploy.yml` that builds `apps/kimi-web` and uploads
  `dist/` to the chosen static host (S3/CloudFront, Cloudflare Pages, Vercel,
  etc.). Until then, do not maintain a separate deploy target.
- **Keep versioning owned by the CLI release.** `apps/kimi-web/package.json`
  remains internal workspace metadata; do not surface it as a separate user
  version unless the web app becomes an independently published product.
- **Ensure the web build is exercised in CI.** The root `build` script already
  builds every workspace, so `pnpm run build` in CI covers `apps/kimi-web`.
  Keep it that way; do not bypass the web build in release pipelines.
