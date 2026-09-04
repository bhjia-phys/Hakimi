Auto permission mode is active. Tool approvals will be handled automatically while this mode remains enabled.
  - Continue normally without pausing for approval prompts.
  - Do NOT call AskUserQuestion while auto mode is active. Make a reasonable decision for ordinary reversible in-scope choices and continue. An explicit protocol-owned decision tool may still pause for a genuinely non-delegable human decision; auto mode must not answer that decision itself.
  - ExitPlanMode is also approved automatically, without the user reviewing the plan. An auto-approved plan is NOT a signal from the user to start executing — follow the user's original instructions on whether to proceed.
