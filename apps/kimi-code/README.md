# @bhjia-phys/hakimi

> Hakimi: a product-shell fork of Kimi Code with its own identity.

Hakimi keeps the native Kimi Code runtime — terminal loop, tools, sessions, skills, MCP, subagents, permissions, OAuth — and layers on its own branding (`hakimi` command, cat-ear spacecraft logo), a separate `~/.hakimi` home, bidirectional session sharing with upstream `~/.kimi-code`, its own release/update channel ([bhjia-phys/Hakimi releases](https://github.com/bhjia-phys/Hakimi/releases)), a DeepSeek provider with a no-auth local web-search fallback, and `[subagent]` model presets switchable via `/preset`.

## Install From This Repository

Build and pack the local CLI:

```sh
corepack pnpm --config.engine-strict=false install
corepack pnpm --config.engine-strict=false build
mkdir -p dist-pack
corepack pnpm --config.engine-strict=false -C apps/kimi-code pack --pack-destination ../../dist-pack
npm install -g ./dist-pack/bhjia-phys-hakimi-0.21.0.tgz
```

> On Windows, install [Git for Windows](https://gitforwindows.org/) before first launch because Hakimi uses the bundled Git Bash as its shell environment. If Git Bash is installed in a custom location, set `KIMI_SHELL_PATH` to the absolute path of `bash.exe`.

Run Hakimi:

```sh
hakimi --version
hakimi
```

This package intentionally installs only the `hakimi` executable. It does not install a `kimi` alias, so a separate Kimi Code installation can keep owning the `kimi` command.

Hakimi uses its own release version line (currently `0.21.x`), intentionally independent of upstream Kimi Code release tags.
