# @bhjia-phys/hakimi

> Hakimi: truth-seeking physics research agent.

Hakimi is a terminal AI agent for theoretical-physics research. It keeps the native Kimi Code runtime, tool loop, sessions, skills, MCP, subagents, permissions, and OAuth compatibility, then adds AITP research memory, scoped WorkFrames, research actions, evidence ledgers, domain packs, and graph-aware validation inside the runtime rather than as an external wrapper.

## Install From This Repository

Build and pack the local CLI:

```powershell
corepack pnpm --config.engine-strict=false install
corepack pnpm --config.engine-strict=false build
New-Item -ItemType Directory -Force dist-pack
corepack pnpm --config.engine-strict=false -C apps/kimi-code pack --pack-destination ..\..\dist-pack
npm install -g .\dist-pack\bhjia-phys-hakimi-0.8.0.tgz
```

> On Windows, install [Git for Windows](https://gitforwindows.org/) before first launch because Hakimi uses the bundled Git Bash as its shell environment. If Git Bash is installed in a custom location, set `KIMI_SHELL_PATH` to the absolute path of `bash.exe`.

Run Hakimi:

```sh
hakimi --version
hakimi
```

The package also keeps a `kimi` executable alias for compatibility with older scripts.

## Login

On first launch, run `/login`. Choose Kimi Platform OAuth or a compatible API-key provider. Hakimi keeps the upstream `.kimi-code` config/data directory intentionally, so existing model/provider/session configuration can continue to work.

## Research Runtime

Enable the experimental AITP lanes when you want the physics research runtime:

```powershell
$env:KIMI_CODE_EXPERIMENTAL_PHYSICS_MEMORY = "1"
$env:KIMI_CODE_EXPERIMENTAL_RESEARCH_LEDGER = "1"
$env:KIMI_CODE_EXPERIMENTAL_RESEARCH_ACTION = "1"
$env:KIMI_CODE_EXPERIMENTAL_DOMAIN_PROFILE = "1"
$env:KIMI_CODE_EXPERIMENTAL_WORKFLOW_RECIPE = "1"
$env:KIMI_CODE_EXPERIMENTAL_RESEARCH_HARNESS = "1"
hakimi
```

## Source

- Repository: https://github.com/bhjia-phys/Hakimi
- Upstream runtime: https://github.com/MoonshotAI/kimi-code
- License: MIT
