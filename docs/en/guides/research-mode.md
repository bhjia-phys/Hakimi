# Research Mode

Research Mode keeps two things useful across research sessions: **local knowledge — what we know now**, and **long-term memory — how we got here**. It does not manage every scientific step or require a research board before you can work.

::: warning
The architecture is **locally implemented, installed, and verified in this workspace**. Research Mode uses official [AITP](https://github.com/bhjia-phys/AITP-Research-Protocol) 0.10.0 skills and CLI at source commit `3bebd4cc0fe786ea30420ab45692d8968cc0990b`, with `aitp/adapter-contract-0.3`. This is a pinned source archive, not a Git checkout or release tag. Newly started `hakimi` processes use the built workspace output, which currently backs the CLI wrapper; already-running processes need a restart to pick up the new code. No user session has been restarted by force. CLI, core, and Web suites passed on this workspace, and a default-model read-only smoke recovered memory with zero knowledge or ledger change. A formal release and a complete server-plus-browser end-to-end run are not claimed. See the [current compatibility amendment](../../aitp/compatibility-matrix.md#research-memory-lite-20260913).
:::

## Local knowledge and long-term memory

The two layers answer different questions without creating a second research database in Hakimi.

- **Local knowledge** describes the current understanding: conclusions, assumptions, open questions, sources, and applicable limits. The agent reads and updates ordinary project files with `Read`, `Grep`, `Glob`, `Edit`, and `Write`.
- **Long-term memory** preserves worthwhile progress: evidence behind a result, failed approaches, changes in understanding, consequential decisions, and reusable methods. Official AITP skills guide the agent in maintaining Entry/Note records through the official CLI.

Start from the existing project's `AGENTS.md` and `README` indexes. Keep its file names and organization; Research Mode imposes no new directory template and does not create a knowledge store in a parent workspace. Each research line can be its own Git repository: its knowledge text and its `.aitp/` store live inside that repository, and a global research index is optional navigation only, not a parent store you depend on. A repository keeps its own directory names — no fixed `knowledge/` layout is required. Existing knowledge remains useful even when AITP is unavailable or the mode is off.

A summary should retain links to sources and artifacts, distinguish evidence from interpretation, and state what remains uncertain. Neither a saved record nor a concise knowledge page certifies scientific correctness.

## Turning Research Mode on and off

The switch controls lightweight research guidance and visibility of official AITP skills, not permission to perform ordinary research work.

| Command | Purpose |
| --- | --- |
| `/research on` | Enable the lightweight mode and make discoverable official AITP skills visible |
| `/research off` | Disable the mode and hide those skills; preserve existing knowledge and memory |
| `/research status` | Read the local mode status without running the AITP CLI |

New sessions start with Research Mode off. Turning it on does not install AITP, initialize a store, probe the CLI, write the ledger, or schedule another model turn. Status reads, session restore, and ordinary turn boundaries do not trigger CLI maintenance or ledger writes either. An on/off status is not proof that AITP is installed or healthy.

There is no separate research-management or advancement command workflow. The old Line, Question, Action, alignment, and checkpoint commands are no longer supported; historical records do not enable a second legacy execution mode. Exact additional interface details must be checked against the implemented backend rather than inferred from old command lists.

## Working with knowledge and memory

Work normally, then save only what changes the useful record. No registration of a Line or Question, Action lifecycle, or host checkpoint is required before a search, calculation, discussion, or file edit.

1. Read relevant knowledge through the project's existing indexes. Retrieve earlier AITP evidence on demand when it helps answer the question; reading does not require a new result.
2. Perform the task using ordinary tools and the existing permission rules. Preserve enough source and artifact references to explain the result and its limits.
3. If there is new knowledge or progress worth remembering, update the relevant project summary and use the official AITP skill when a durable record is warranted. Confirm the intended project and record scope; do not infer ownership from similar names or paths.
4. Report what was actually saved, where it was saved, and what remains unverified. If saving fails, retain the useful local evidence and say that long-term memory was not saved; do not invent a receipt or silently retry into another scope.

A normal follow-up, rephrasing, status question, or repeated explanation with **no meaningful delta causes zero knowledge or ledger writes**. Opening the mode, loading a skill, finishing a turn, or completing a Goal is not itself a reason to save. Stage synthesis or a reusable lesson may be worth remembering without a new calculation, but should not be manufactured to satisfy a reporting ritual.

For example, asking why an existing approximation is valid usually needs only a read and an explanation. Discovering that it fails in a specific regime may justify a knowledge correction and an AITP record linking the counterexample, assumptions, and limits. The distinction is useful new information, not tool count or conversation length.

## Official AITP skills and CLI

AITP is the external protocol authority, not a native Hakimi service. Its official `using-aitp` and `distilling-methods` skills provide the recording and reusable-method guidance; Hakimi does not copy their full content or add a post-save distillation coordinator.

For long-term memory, the deployment must provide the official skills in the session's [skill catalog](../customization/skills.md), a working official CLI, and the intended initialized AITP store. Follow the [upstream instructions at the pinned source](https://github.com/bhjia-phys/AITP-Research-Protocol/tree/3bebd4cc0fe786ea30420ab45692d8968cc0990b) for setup and actual command syntax. Research Mode does not automatically install, initialize, adopt, inventory, or backfill a project. The pinned upstream CLI can resolve a store from an ancestor directory; a Git boundary alone does not guarantee isolation. The separately tested local derivative `0.10.0+repo.1` adds the nearest-Git-root boundary and reports `not_initialized` instead of borrowing a parent store. That patch is not included in the linked upstream baseline or provided by the mode toggle. With either build, verify the resolved store and intended scope before reading or saving memory. Confirm the intended repository before running the official `init`, and use an explicit `init --adopt` when creating a store at its root. Do not infer ownership from a similar name or path. Missing AITP support does not prevent local knowledge work and must not be reported as a successful memory save.

The selected 0.10.0 / contract-0.3 baseline supports atomic scoped saves for both **Entry** and **Note** records. Follow the official skill and CLI's scope preconditions, draft/save flow, validation, and retry rules. The atomic guarantee belongs to the official CLI operation with those preconditions, not to every filesystem write or to the whole research session. Human decisions, method approval, and publication remain subject to the official protocol; Hakimi does not supply them automatically.

## Goal, Plan, and permissions

Research Mode is independent of the ordinary [Goal](./goals.md), [Plan mode](../reference/tools.md#plan-mode), and tool permission systems. Goal still owns cross-turn continuation, budgets, and completion. Plan still organizes work under its usual rules. Enabling or disabling Research Mode neither creates nor resumes a Goal, changes permissions, nor adds a Research-specific completion or continuation veto.

The old host Action-ownership and canonical-file vetoes are retired. Ordinary file tools therefore have **no additional Research-specific guarantee preventing direct access to canonical AITP files**. Use the official CLI to maintain those records, but do not confuse that protocol rule with an executor barrier or operating-system isolation. Existing file-access policies, tool approvals, and any configured sandbox remain the actual host boundaries; turning the mode off is not a security boundary either.

The optional `theory-physics` domain guidance can still help with assumptions, derivations, numerical checks, and evidence reporting. It is not a second runtime or a requirement to register every scientific step. Scientific judgment remains with the researcher.

## Historical records and retired controls

This is a change of architecture, not a smaller Research Board. Production no longer mounts the host ResearchService, Line/Question/Action management, Research Plan, checkpoint machinery, Research Loop, automatic maintenance, distillation orchestration, Research Goal veto, or native AITP adapter.

The eight built-in wrappers — `aitp_enter`, `aitp_list`, `aitp_show`, `aitp_check`, `aitp_record_prepare`, `aitp_record_save`, `aitp_note_prepare`, and `aitp_note_save` — are retired. Use ordinary file tools for project knowledge and official AITP skills plus CLI for long-term memory instead.

For SDK snapshot, event, and command changes, see the [migration guide](../release-notes/breaking-changes.md#research-mode-and-sdk-research-apis). Old Research state and records remain readable through raw session logs or session exports, not a structured Research history API or Manager. They are not resumed as live Actions, pending checkpoints, bindings, or a parallel legacy workflow; old mutations are unsupported. Existing AITP records are not deleted, migrated, or automatically backfilled. Conversation undo neither changes the new mode switch nor undoes external CLI saves.

## Local installation and remaining checks

The [tracking amendment](../../aitp/TRACKING.md#research-memory-lite-20260913) records the completed suites and reviews, the local build, the managed AITP 0.10.0 installation, the built-SDK process smoke, and the final default-model read-only memory smoke. The implementation is installed locally: the CLI wrapper points at the built workspace output, so newly started `hakimi` processes use it, while already-running processes need a restart and none were force-restarted. No version bump, tag, publish, or formal release has been performed, and a complete server-plus-browser end-to-end run has not been independently exercised. These remaining boundaries do not imply the user-facing Research Mode workflow is undelivered, and none of this certifies a scientific claim.
