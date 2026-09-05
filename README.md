# Hakimi

<p align="center">
  <img src="docs/assets/hakimi-terminal-welcome.png" width="920" alt="Hakimi terminal welcome screen with a pixel cat-ear exploration spacecraft" />
</p>

<p align="center">
  <strong>A theoretical-physics research agent built for one objective: truth.</strong><br />
  <span>Truth is the objective. Evidence is the boundary. Reproducibility is the test.</span>
</p>

<p align="center">
  <a href="README.zh-CN.md">中文</a> |
  <a href="https://github.com/bhjia-phys/Hakimi">Repository</a> |
  <a href="docs/en/guides/getting-started.md">User manual</a> |
  <a href="LICENSE">License</a>
</p>

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

## Why Hakimi

Hakimi is not a machine for producing one-shot answers. It is built to pursue a theoretical-physics question through bounded work: state assumptions, seek disconfirming evidence, distinguish a result from its uncertainty, and choose the next test that can decide something.

Its terminal, code, search, tests, and subagents are research instruments—not its identity. Hakimi does not optimize for busywork or engineering complexity. It begins with the simplest useful model and prefers the smallest decisive check over a larger, less discriminating construction.

## The research loop

```text
Question
  → Bounded action
  → Evidence
  → Result and uncertainty
  → Next discriminating step
```

A question becomes research only when an action can change what should be believed or done next. Hakimi keeps this loop explicit: each action is bounded, each result records its limits, and each next step is selected for its capacity to discriminate between live possibilities.

## What is implemented

- **Research surfaces:** TUI and Web provide a Research Board and Research Manager for following and steering active work.
- **Research structure:** Research Lines, Questions, and Focus make the current unknown, assumptions, and priorities visible.
- **Bounded actions:** `BeginResearchAction` and `ConcludeResearchAction` frame scientific work with an outcome, limitations, a next step, and one explicit durability assessment. No durable delta performs no ledger persistence; a bound durable delta emits one typed pending candidate for the existing AITP commit barrier. An unbound result closes the Action and remains a local conclusion, not an AITP record, until the researcher explicitly confirms its ownership.
- **Science-first progress:** progress is organized around evidence and uncertainty rather than tool activity or transcript volume.
- **Review and human control:** human gates and alerts support explicit judgment, while typed child-evidence review keeps delegated work inspectable.
- **External-compute observations:** Hakimi can record structured observations about externally run HPC work while keeping scheduler state separate from scientific evidence. It does not schedule jobs, poll them to completion, or certify success. Goal is the sole owner of cross-turn continuation.

## Theory-physics discipline

The optional `theory-physics` domain pack is the upper-layer handbook for sustained theoretical-physics research. It supports discussing uncertainty, retrieving relevant recorded evidence, and carrying out owned literature or derivation work before a candidate is clear. A scientific loop may span several bounded Actions and turns; a Goal is optional, a local reviewed plan serves a complex Action, and Research Plan guides milestone strategy. Existing AITP knowledge can be read on demand without a new durable delta. Durable records and conditional method review remain governed by the external `using-aitp` and `distilling-methods` skills, not a second Hakimi protocol.

An ordinary one-off physics answer does not need Research Mode. The pack is a discipline, not an oracle: it is not a literature database, physics-correctness service, scheduler, second runtime, ledger, or background autonomous loop. The researcher remains responsible for conventions, significance, and final scientific judgment; AITP remains the protocol authority.

## Evidence before confidence

Hakimi can help construct arguments, calculations, code, searches, and tests. None of these alone authenticates a physical claim. Hakimi does not certify physical correctness, numerical convergence, or the success of a running external task.

Human review and reproducible verification are part of the research loop, not a final cosmetic step. When the evidence is insufficient or conflicts, the honest result is uncertainty, a blocked question, or a smaller discriminating check.

## Research Mode and AITP

Goal recovery checks the remaining budget before restarting. An exhausted Goal stays blocked and the model is told it was not resumed, without a transient active state or an immediate deadline cancelling its explanation. Existing usage, budget limits and earlier blocker reasons are preserved. Source verification and installation status are tracked in the [bounded recovery fix](docs/aitp/theory-physics-collaborator-program.md#goal-budget-resume-preflight).

Print-mode shutdown now pauses an active Goal and flushes its journal before releasing the runtime, including on SIGINT, SIGTERM and SIGHUP. Already stopped Goals are unchanged; interruption does not complete scientific work or write AITP records. The existing bounded cleanup cannot guarantee persistence after SIGKILL or a stalled storage write. See [non-interactive execution](docs/en/reference/kimi-command.md#non-interactive-execution).

The clean-installed build has passed independent-process signal tests and native PTY verification. This verifies shutdown persistence, not completion of cross-turn scientific acceptance; see the [delivery evidence](docs/aitp/theory-physics-collaborator-program.md#print-goal-shutdown).

Interactive SIGTERM shutdown retains its signal handler until Session cleanup finishes, preventing signal helpers from terminating an active turn before its cancellation and Goal pause are saved. Repeated SIGTERM does not skip that cleanup. SIGHUP/dead-terminal emergency exit and SIGKILL are not covered by this guarantee; see the [TUI shutdown verification and delivery status](docs/aitp/theory-physics-collaborator-program.md#tui-sigterm-shutdown).

Native sessions and print mode use the same home as the Hakimi SDK: explicit `homeDir`, then `HAKIMI_HOME`, then legacy `KIMI_CODE_HOME`, then `~/.hakimi`. This fixes a real research acceptance failure where the native engine opened the old Kimi home and could not find the installed AITP contract. No old configuration, plugins, or sessions are migrated or merged; to open a session created in the old home, select that home explicitly. Real-project acceptance and remaining limitations are tracked in the [collaborator program](docs/aitp/theory-physics-collaborator-program.md#1911-g7-首次真实运行与启动目录修复).

AITP discovery also waits for the session Skill catalog during cold restore. Exiting or resetting Research Mode cancels that wait; a late catalog result cannot restore old permissions. A missing/incompatible plugin or failed catalog initialization still reports unavailable, without extra maintenance retries.

Delegated operators do not own the shared AITP lifecycle: restoring or undoing a child agent cannot reset the main researcher's adapter or maintenance state. Research Mode entry and active restore also expose the existing evidence-review, run-observation, and historical-checkpoint-discard tools to restored tool allowlists. These repairs do not approve evidence or change checkpoint/human-decision semantics.

After a settled conclusion, the next explicit `BeginResearchAction` can start directly from `state_updated`; no extra phase-setting, Focus edit, or duplicate progress report is required. A pending checkpoint, live action/run, unresolved human gate, or stale plan still prevents replacement. This repairs action continuation, not scientific judgment or automatic Goal scheduling.

For a retained unbound result, the Board shows the actual outcome and asks for record ownership instead of leaving the completed work labelled running. The Research Manager or `/research adopt-conclusion <localConclusionId> <lineSlug> [questionId]` can explicitly adopt it after the target Line/workstream is confirmed. This creates only a pending checkpoint; AITP save and verification remain separate. New scientific work and Goal continuation wait so they cannot overwrite the retained result. See [recovery details](docs/en/guides/research-mode.md#retained-local-conclusions).

The retained-result fix was installed from commit `06b8524102df` and verified by closing an existing real Heisenberg Action without repeating its calculation, followed by cold restore. This does not yet establish bound AITP persistence or automatic Goal research; [the acceptance record](docs/aitp/theory-physics-collaborator-program.md#1923-本地结论交付与原会话恢复验收) distinguishes those remaining checks and a model attribution error.

The run-observation recovery fix is delivered and locally installed: a closed Action can record a fresh observation of its existing external job without reopening the Action or changing its conclusion. This grants no polling or new-work permission. The [bounded recovery slice](docs/aitp/theory-physics-collaborator-program.md#retained-run-recovery) records the installed CLI restart and WebSocket checks; these are fixture tests, not scientific or Goal-continuation acceptance.

Research Mode is discoverable by default, but every new session starts inactive. For sustained work, `theory-physics` can guide the model to call `EnterAITPMode`, wait for authoritative probe status, and perform a bounded action; inactive sessions perform zero AITP I/O. The Research Board and model context distinguish the Hakimi Goal, the observed AITP Program (including its top-level **Research goal**), and the Local Research Loop. Hakimi observes that top-level goal only through AITP `enter`; it never writes `TOPIC.md` or an AITP Topic. A Goal-to-Program alignment is a local, checkpointed binding that the user explicitly confirms rather than a text-similarity inference. In active Research Mode, a missing, stale, or explicitly conflicting binding holds Goal completion and automatic continuation; an inactive Goal is unaffected. Entering Research Mode does not schedule model turns—Goal alone owns cross-turn continuation, while Plan is only a short-lived action overlay. Interactive Research still works without a Goal. The compact TUI/Web Board uses four slots—Project, Current cycle, Attention, and Next—and labels the legacy period counter as Research turns; healthy AITP/provenance stays in expanded detail. A Line switch is rejected until any live Action/Run, checkpoint, human gate, or non-idle cycle is resolved, and another Line's alerts never appear as current attention. The default Goal engine exposes derived `idle`/`deciding`/`enqueued`/`running`/`held`/`waiting` continuation state, so an active Goal held by Research policy is shown as `active · continuation held` with its owner and reason instead of being confused with a paused Goal. Legacy snapshots without that optional field are labelled unavailable, and multi-Line Board state remains scoped to the selected Line. Every admitted Research turn performs one deterministic local reconciliation before model context is injected, so mechanically recoverable Line/Action/phase/period/cursor drift is repaired before the answer; this does not run another AITP maintenance cycle or infer scientific outcomes. A historical checkpoint is discarded automatically only when Hakimi can prove that no save receipt, committed Entry, or committed-history trace exists and its captured Question or Program binding is stale; any ambiguous checkpoint remains blocked for explicit recovery. Replay repairs only deterministic Action/phase structure: the same Action remains live, blocks Goal completion, and is routed to evidence-based resolution on the next interactive Research turn without being auto-completed or auto-abandoned.

In the paragraph above, “Plan” means the short-lived Action-local Plan/Todo. The revisioned Research Plan is the multi-turn scientific strategy; it may evolve with evidence but still does not own continuation or complete the Goal. A reviewed local Action Plan can execute without creating a Goal or full Research Plan. If a draft or active Research Plan already exists, a planned action must bind its active milestone as well as the reviewed local plan; partial or stale bindings still fail closed. A simple check may also explicitly bind the active milestone without a detailed local Action Plan. Omitting that association remains valid; it is never inferred. The fix is clean-installed and verified through the installed CLI's REST/WS surface and process restart; this software fixture is not real-model scientific acceptance. See the [milestone-binding evidence](docs/aitp/theory-physics-collaborator-program.md#simple-action-milestone).

The compact Board puts the selected Line, scientific objective or milestone, and current work ahead of bookkeeping. A live Action's purpose stays visible alongside its running job; explicitly foreign Action/run metadata stays out of the selected Line, including legacy single-Line views. Turn counts and classified historical failures remain in expanded audit detail; they are not scientific progress or current blockers. A concluded action with no pending checkpoint shows “Next / ready”, and an explicit Goal wait shows “Waiting”. Research context does not repeat a full brief solely because budget counters or internal revisions changed; meaningful scope, completion, continuation, and budget-limit changes still refresh it. These presentation fixes are one part of the [collaborator program](docs/aitp/theory-physics-collaborator-program.md), not acceptance of the entire research workflow.

Research collaboration policy and tool permission are orthogonal. `collaborative` asks the researcher only when a consequential unknown would change the Research Plan. `dreaming` means that, once the Goal, scope, and completion criterion are clear, Hakimi records reversible, low-cost, in-scope assumptions and lets Goal-owned continuation keep the project moving without per-step confirmation. Both still stop for changes to the Goal or scope, ambiguous scientific conventions that affect the claim, expensive or irreversible actions, and AITP or other human decisions. `auto` controls routine tool-risk confirmations only; combining Goal + `dreaming` + `auto` therefore enables autonomous research inside the agreed scientific and operational boundary without granting new scientific authority.

Action ownership is executor-enforced whenever Research Mode is active; no experimental switch is required. Model-initiated research tools require one fresh, in-progress bounded Action and one explicitly granted capability, while control/recovery operations and exact checkpoint-draft persistence have narrower separate leases. A rejected `BeginResearchAction` cannot be followed by unowned Web, workspace, shell, subagent, scheduler, or unknown plugin/MCP work, and beginning an Action cannot share the same tool batch with that work. This is a Tool Executor policy, not OS-level isolation: a granted shell capability is still broad and remains subject to the normal permission system and host sandbox.

A Research Line and an AITP workstream are also separate identities. After Hakimi observes the current Topic, the user or main agent must explicitly confirm a revisioned local Line-to-workstream binding; matching slugs, text, paths, or IDs never imply membership. Each confirmation has a server-owned opaque identity, and clear must compare both that identity and the non-rewinding public Research revision. Unbound, unavailable, stale, or conflicting Lines may continue low-risk local exploration, but scoped maintenance and Hakimi checkpoint adoption require the exact confirmed binding. Hakimi re-observes the unscoped Topic before scoped maintenance and checkpoint writes, while the post-save commit barrier verifies the captured Topic and exactly one captured workstream. Checkpoint-bound saves require AITP 0.9.0 adapter-contract 0.2: Hakimi supplies the captured Topic and exact singleton workstream to atomic `record save`, so a mismatch creates no canonical Entry; post-save `show` and scoped `check` remain defense in depth. The expanded Board reports read readiness separately from scoped checkpoint-write capability, so a ready 0.1 adapter is never presented as atomic-write capable. Rebinding requires an explicit clear first, and undo or cold restore revalidates the stored Topic and observed revision instead of repairing the binding automatically. The same binding and typed durable-candidate state is projected through REST, WebSocket, Node SDK, klient, TUI, and Web.

[AITP](docs/aitp/) is an optional external durable-evidence ledger, used through its CLI and files. It is not a second Hakimi runtime or database. After `ConcludeResearchAction`, Hakimi can route one assessed durable delta through the existing prepare/fill/save/show/checkpoint path; a no-delta conclusion schedules no persistence or distillation work, and human assertions or decisions remain separate from agent/tool/source verification. After the first successful commit of a new checkpoint, Hakimi makes one same-turn, best-effort handoff of only that touched Entry to the exact external `distilling-methods` Skill. A duplicate commit or unavailable Skill is a non-blocking no-op, and the external Skill alone decides whether the evidence meets an existing trigger. The Research snapshot can show only that the latest exact handoff was requested or unavailable; it never claims a trigger, card, trial, completed review, approval, or publication. Hakimi does not parse markers, create or revise cards on its own, approve or publish them, auto-initialize/adopt/backfill workspaces, add `/research goal`, introduce a workstream registry, or provide the planned native H6b coordinator. Hakimi-local Goal–Program and Line–workstream bindings never write AITP. When AITP is unavailable, Research Mode reports a degraded state and blocks durable writes, checkpoints, and completion of an active Research Goal. Detailed compatibility and operating boundaries are maintained in the [AITP documentation](docs/aitp/).

Post-commit Note review keeps the verified source Line/Topic/workstream confirmation and rechecks it at actual Note-tool execution. Switching Line, rebinding, losing readiness, undo, or restore cannot reuse an old draft's write permission. A restored review marker alone remains read-only. Stage synthesis and interrupted review can use a fresh bounded Note Action: the host verifies the selected Question evidence through canonical Entry reads before preparing or saving a new draft, without requiring a fabricated scientific delta. This local protection is not AITP's atomic Entry compare-and-save and adds no automatic card approval, publication, or distillation coordinator.

When AITP is degraded, user-directed Research turns may still perform provisional exploration inside a fresh bounded Action with the normal scope and permission checks. Automatic Goal work, AITP writes and Goal completion remain held. A new result or failure with confirmed record ownership stays a local pending candidate until recovery; it is not silently reclassified as no-delta. This fixes the conflict between allowing local Research actions and refusing all their work tools.

Opening Research Mode within a user turn now starts its Research context and one local boundary as entry settles, without requiring another prompt. Pause/exit revokes admission; mode recovery never grants autonomous Goal continuation.

Saving evidence does not itself update the scientific Question. Durable-action guidance finishes the captured checkpoint first, then the first successful commit prompts conditional synthesis for the still-current Question: assessment, relevant evidence, remaining unknowns, and next action. Duplicate commits or changed context do not repeat that targeted prompt. The model performs this synthesis through the existing Question tool; receipts never automatically promote scientific confidence or close a Question.

The current Question respects explicit Focus. Without Focus, it can use the foreground Action's explicit Question on the current Line, without setting Focus or guessing ownership. After higher-priority action, run, decision and persistence work settles, the Question's explicit next step takes precedence over historical progress. Snapshot, status and post-commit guidance share that context. See the [Question-context repair and verification status](docs/aitp/theory-physics-collaborator-program.md#question-context-projection).

For a stage Note from existing evidence, the model should settle the Question's canonical evidence references before beginning its Note Action, since Begin captures that revision. The existing context also identifies completed native scoped maintenance when its Topic and confirmed binding match; Skill loading alone does not require another `enter/check`. Evidence review, genuine stale-state refresh, and required save verification remain necessary. These are guidance corrections, not new phases or automatic scientific judgments.

The optional Theory Physics plugin includes a `calculation-operator` agent profile for bounded build, input, numerical and postprocessing work. The main agent supplies the scientific test and scope, reviews the existing typed evidence packet, and owns all Research/AITP mutations. This role is distinct from the `/preset` model-routing pool; it installs no runner or scheduler and provides no OS-level isolation. Real scientific acceptance is tracked separately in the collaborator program.

Theory Physics 0.2.3 exposes delegation guidance directly in the calling researcher's available-agent description: pass the whole task's remaining time and reserve parent review/closeout, then request one saved packet with a brief return or one inline packet. The specialist's detailed instructions remain separate; the caller need not read its full prompt to see these essentials. Requested packet saving and evidence-backed failure reporting remain required: an unattempted write is not proof of a missing tool, and a failed handoff does not erase a numerical result. These are instructions, not a runtime deadline or a guarantee that a model will follow them.

The checkpoint barrier also compares the saved Entry's kind, authority and creator with the concluded candidate before accepting it. A mismatch retains the saved record and receipt for review, leaves the checkpoint pending, and prevents the post-commit distillation handoff. This is a post-save identity check, not a semantic validation or an atomic pre-save authority guarantee.

## Install from source

Hakimi currently installs from source. Use Node.js 24.15.0 or newer and pnpm 10.33.0:

```sh
git clone https://github.com/bhjia-phys/Hakimi.git
cd Hakimi
corepack enable
corepack prepare pnpm@10.33.0 --activate
pnpm install
pnpm build:packages
pnpm -C apps/kimi-code build
mkdir -p .tmp/dist-pack
pnpm -C apps/kimi-code pack --pack-destination ../../.tmp/dist-pack
npm install -g "$(ls -t ./.tmp/dist-pack/*.tgz | head -n 1)"
hakimi --version
```

`pnpm pack` prints the tarball filename it creates; the command above selects the newest tarball in `.tmp/dist-pack`. To update a source installation, pull the desired revision and repeat the build, pack, and install steps.

Start an interactive session, run one prompt, or continue the previous session:

```sh
hakimi
hakimi -p "Summarize the test failures in this repository."
hakimi -c
```

In an interactive session, toggle Research Mode when the work requires it:

```text
/research
```

Use `/login` to configure an available provider. For DeepSeek setup, run `hakimi provider deepseek`. Login is explicit; Hakimi never begins OAuth login at startup. Configuration, sessions, logs, and caches live under `~/.hakimi` by default; set `HAKIMI_HOME` to use another data directory.

On Windows, install [Git for Windows](https://gitforwindows.org/) before first launch. Hakimi uses its bundled Git Bash shell; if Git Bash is installed elsewhere, set `KIMI_SHELL_PATH` to the absolute path of `bash.exe`.

## Current status

- Hakimi is a development version that can be built from source.
- The Research Loop and the optional `theory-physics` pack are experimental and may change.
- There is no public npm package or release installer; use the source-build path above.
- Hakimi does not replace expert judgment, human review, or reproducible scientific validation.

## Documentation

- [Getting started](docs/en/guides/getting-started.md)
- [Configuration](docs/en/configuration/config-files.md)
- [Research Mode](docs/en/guides/research-mode.md)
- [Theory-physics collaborator forward program](docs/aitp/theory-physics-collaborator-program.md)
- [Theory-physics collaborator and Research Loop design](docs/aitp/theory-research-agent-design.md)
- [AITP documentation and compatibility records](docs/aitp/)
- [Implementation notes](IMPLEMENTATION.md)

## Project background

Hakimi is an independent repository with its own `hakimi` command, `~/.hakimi` data directory, semver release line, and research direction. It selectively builds on engineering foundations from [MoonshotAI/kimi-code](https://github.com/MoonshotAI/kimi-code), but it is not a product-parity fork and does not adopt upstream behavior automatically.

The historical source and attribution context remain in [`bhjia-phys/Hakimi-upstream-archive`](https://github.com/bhjia-phys/Hakimi-upstream-archive). See the [MIT license](LICENSE) for required attribution.

## Development

From the repository root:

```sh
corepack pnpm --config.engine-strict=false install
corepack pnpm --config.engine-strict=false -C apps/kimi-code typecheck
corepack pnpm --config.engine-strict=false -C apps/kimi-code test
```

The CLI lives in `apps/kimi-code`; packages provide the SDK, model/provider integrations, and agent runtime used by the application.

## License

MIT. See [LICENSE](LICENSE). Hakimi retains the required attribution for upstream Kimi Code work by Moonshot AI.
