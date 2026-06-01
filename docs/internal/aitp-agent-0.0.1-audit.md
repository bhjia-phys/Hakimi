# AITP Agent 0.0.1 Audit

## Scope

This audit covers the first runtime-native physics-memory slice in `packages/agent-core`.

Implemented areas:

- experimental flag `physics-memory`;
- physics capsule parser, scanner, registry, compiler, and public exports;
- research-action foundation types and registry;
- `PhysicsMemory` builtin tool;
- session scanning for `.aitp/physics-memory` and `~/.aitp/physics-memory`;
- agent-side `PhysicsMemoryManager`;
- append-only records for roots loaded, capsule loaded, and context compiled;
- LibRPA fixture capsule set;
- internal design documentation.

## Audit Records

Runtime records added:

- `physics_memory.roots_loaded`
- `physics_memory.capsule_loaded`
- `physics_memory.context_compiled`

Registry diagnostics added:

- `duplicate-capsule-id`
- `scan-warning`

Compiler diagnostics added or covered:

- `missing-focus-capsule`
- `missing-dependency`
- `cross-domain-dependency`
- `missing-benchmark`

## Verification

Focused verification command:

```powershell
corepack pnpm --config.engine-strict=false vitest run packages/agent-core/test/flags/resolver.test.ts packages/agent-core/test/physics-memory packages/agent-core/test/session/physics-memory.test.ts packages/agent-core/test/tools/physics-memory-tool.test.ts packages/agent-core/test/research-action
```

Result:

- 8 test files passed.
- 31 tests passed.

Typecheck:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core typecheck
```

Result: passed.

Lint:

```powershell
corepack pnpm --config.engine-strict=false exec oxlint packages/agent-core/src/agent/physics-memory packages/agent-core/src/physics-memory packages/agent-core/src/research-action packages/agent-core/src/tools/builtin/collaboration/physics-memory-tool.ts packages/agent-core/test/physics-memory packages/agent-core/test/session/physics-memory.test.ts packages/agent-core/test/tools/physics-memory-tool.test.ts packages/agent-core/test/research-action packages/agent-core/test/flags/resolver.test.ts
```

Result: 0 warnings, 0 errors.

## Broader Suite

The broader command:

```powershell
corepack pnpm --config.engine-strict=false --filter @moonshot-ai/agent-core test
```

now passes in this Windows environment.

Result:

- 157 test files passed.
- 1 test file skipped.
- 2252 tests passed.
- 7 tests skipped.
- 1 test remains the repository's existing todo.

The Windows-sensitive failures were resolved by making the affected tests and helpers platform-aware:

- symlink-dependent tests use explicit Windows skips instead of failing on `EPERM`;
- POSIX permission-bit assertions are skipped on Windows, where mode bits are not stable;
- skill scanner expected paths normalize `realpath` output to the runtime's forward-slash canonical form;
- hook tests use portable `node -e` commands instead of POSIX shell redirection and quoting;
- harness recursive `readdir` suffix checks normalize Windows path separators;
- prompt rendering normalizes CRLF to LF before model-visible token estimation.

The lint run on the touched Windows-fix surface completed with no errors. It still reports pre-existing `no-named-as-default-member` warnings in `test/skill/scanner.test.ts`.

## Default Behavior

The feature remains off unless `KIMI_CODE_EXPERIMENTAL_PHYSICS_MEMORY=1` is enabled. When the flag is off, existing sessions do not create a physics memory registry, do not expose `PhysicsMemory`, and do not write physics-memory records.
