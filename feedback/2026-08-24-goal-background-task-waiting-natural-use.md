# Goal mode × long-running background task natural-use feedback

- **Date:** 2026-08-24
- **Observed runtime:** Hakimi `0.21.0`
- **Source checkout inspected:** `9f8de1cb8216e994ea40185e0e5655893fc81616` with unrelated pre-existing local changes
- **Platform:** Linux under WSL2
- **Scope:** orchestration feedback only; no runtime, monitor, scheduler, or scientific-workflow change is authorized by this note

## 1. User-visible problem

A multi-hour research goal submitted remote scheduler work and started one detached background monitor. The monitor was healthy: it checked the two remote jobs internally every 120 seconds and intentionally emitted output only when the chain became terminal. Hakimi also correctly promised an automatic terminal notification.

The goal nevertheless consumed more than 50 continuation turns in a short period without receiving new evidence. Each goal turn found that the only remaining useful action was to wait, called the non-blocking `TaskOutput`, received `retrieval_status: not_ready`, ended while the goal was still `active`, and was immediately followed by another goal continuation turn. The user had to interrupt the session, which paused the goal, to stop the empty loop.

The concrete task and scheduler identifiers are deliberately omitted from this public repository note. The original session retains them; replacing them here does not affect reproducibility because the defect depends only on task lifecycle state and continuation timing.

## 2. Minimal reproduction

1. Create an `active` goal whose completion depends on an external job expected to run for hours.
2. Start one detached background monitor that polls the external scheduler internally at a reasonable cadence and exits only when the job reaches a terminal state.
3. Finish all independent local work, leaving the monitor as the only outstanding dependency.
4. End the current goal turn without marking the goal `complete` or `blocked`.
5. On the automatic continuation, inspect the monitor with `TaskOutput`; it returns immediately with `retrieval_status: not_ready`.
6. End the turn. The runtime immediately starts another continuation because the goal remains `active`.
7. Repeat until the user interrupts or a budget stops the goal.

Expected behavior: the goal should suspend without consuming model turns, tokens, or active-work time, then wake exactly once when the bound background task reaches a terminal state. An optional coarse diagnostic heartbeat may wake it occasionally, but immediate continuation churn must not occur.

Actual behavior: the goal driver treats every still-`active` turn ending as evidence that another model turn is useful, even when a healthy task completion notification is the only possible source of new information.

## 3. Repository evidence

The observed loop follows the current contracts rather than a scheduler or monitor failure:

- `GOAL.md:17-22` defines only `active`, `paused`, `blocked`, and `complete`; only `active` automatically runs another turn.
- `packages/agent-core-v2/src/agent/goal/types.ts:5` exposes the same four-state `GoalStatus` union.
- `packages/agent-core-v2/src/agent/goal/goalService.ts:832-865` handles `turn.ended` and calls `launchContinuationTurn` whenever the same goal is still `active` and within budget.
- `packages/agent-core-v2/src/agent/goal/goalService.ts:924-963` immediately enqueues a `goal_continuation` `MessageStepRequest`; there is no task dependency or delay in that decision.
- `packages/agent-core-v2/src/agent/tools/task/task-output/taskOutputTool.ts:40-41` maps every non-terminal task to `retrieval_status: not_ready`.
- `packages/agent-core-v2/src/agent/tools/task/task-output/task-output.md:6-8` correctly says that `TaskOutput` is always non-blocking, must not be used to wait, and that completion arrives automatically.
- `docs/en/reference/tools.md:102-112` documents the same notification-first, non-blocking task contract.
- `docs/en/guides/goals.md:13` says the runtime checks goal state after each turn, while `docs/en/guides/goals.md:99-105` offers only complete, paused, and blocked stopping outcomes.

These components are individually coherent. The defect is their composition: the task subsystem says “return control and await the terminal event,” while the goal subsystem interprets returned control with `status=active` as “start another model turn immediately.”

## 4. Why existing states are insufficient

This situation is not `blocked`. The external job and monitor are healthy, no user input or credentials are missing, and a known event will make progress possible. Marking it blocked would misreport ordinary latency as an impasse and would require a manual resume after an event the runtime already receives.

It is not ordinary user `paused` either. A pause is a user/runtime stop that deliberately disables autonomous pursuit. Requiring the user to pause every long job and manually resume after each completion defeats the purpose of goal mode.

It should not remain actively pursuing the goal. No model action can produce new evidence before the event, so additional turns are pure polling overhead. The current four-state lifecycle has no model-expressible “healthy wait with an event wake-up” state.

## 5. Recommended contract

Add an explicit event-driven suspension primitive owned by the goal runtime. Two compatible shapes are possible:

1. Add a lifecycle state such as `waiting` / `suspended_on_task`, with one or more task IDs and an `any` / `all` wake policy.
2. Keep the public goal status stable but add a persisted goal-driver wait lease that suppresses continuations while retaining the underlying objective as resumable.

The first shape is clearer to users and clients; the second may reduce public API migration. Either way, the model needs one narrow structured action such as `SuspendGoalOnTask` or an extended `UpdateGoal` input. The action must subscribe to existing terminal task events rather than repeatedly calling `TaskOutput`.

Required semantics:

- Stop immediate goal continuations while every declared wake condition is non-terminal.
- Wake exactly one continuation when the `any` / `all` policy becomes true, whether terminal status is success, failure, timeout, cancellation, or loss.
- Deliver the same terminal metadata and persisted output path that the task notification already carries.
- Do not count suspended wall-clock time as active pursuit; do not increment turn or token budgets while no model turn runs.
- Preserve user pause and cancel controls. Goal cancellation must not silently kill an external/background task; task cancellation remains a separate explicit action.
- Define cold-resume behavior fail-closed: restore the dependency, reconcile task status, and never duplicate the monitor or continuation.
- Coalesce races between terminal notification, user resume, and task reconciliation so only one continuation is admitted.
- Keep `blocked` for genuine impasses. A healthy finite wait must not be routed through the three-turn blocked audit.

A secondary safety guard should detect repeated continuations with no changed task revision or other new evidence and apply exponential backoff or pause with a precise orchestration warning. This is a circuit breaker, not a substitute for the event-driven contract.

If users request periodic progress reports before terminal completion, schedule a coarse timer/cron wake or consume meaningful monitor progress events. Do not use back-to-back goal continuations as a clock.

## 6. Acceptance scenarios

1. **Single task:** an active goal suspends on one running task; zero continuation turns occur before terminal notification; exactly one turn starts afterward.
2. **Multiple tasks:** `all` waits for all terminal states; `any` wakes on the first terminal state; duplicate task events do not duplicate turns.
3. **Task failure:** a failed or lost task wakes the goal with failure evidence instead of silently blocking or spinning.
4. **User control:** the user can pause or cancel a suspended goal without stopping the task; an explicitly stopped task still wakes/reconciles the goal once.
5. **Restart:** session restore reconciles persisted goal/task state without starting a duplicate task and without converting a healthy wait into active polling.
6. **Budgets:** waiting for one hour consumes no continuation turns, model tokens, or active-work wall-clock budget.
7. **No-progress guard:** repeated `not_ready` snapshots for an unchanged task cannot produce an unbounded immediate loop.
8. **Ordinary goals:** goals with useful local work continue turn-by-turn exactly as before.

## 7. Current workaround

Until the runtime has an event-driven wait state, the least misleading workaround is:

1. submit the long job and start exactly one detached monitor;
2. manually pause the goal after all independent work is exhausted;
3. rely on the automatic terminal task notification;
4. resume the goal once to analyze the result.

Splitting “submit/monitor” and “analyze/close out” into separate goals is also safe. Both workarounds are operational compromises and should not be the only way to use autonomous goals with long external jobs.

## 8. Non-goals and boundary

- Do not make `TaskOutput` blocking again; its current immediate-snapshot contract is correct for interactive use.
- Do not shorten the monitor interval or start duplicate monitors. The observed 120-second internal scheduler poll was healthy.
- Do not classify ordinary remote scheduler latency as a scientific, Slurm, SSH, or monitor failure.
- Do not weaken goal completion criteria merely to avoid waiting.
- Do not infer that the interrupted research goal, remote computation, or scientific campaign failed; this note records only a Hakimi orchestration defect.
- This feedback does not authorize a `GoalFeature` migration or a second Goal owner. The fix belongs within the existing canonical Goal/task/event boundaries and must follow the repository's later `GoalFeature` evaluation gate.
