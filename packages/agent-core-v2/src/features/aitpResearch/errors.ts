/**
 * `aitpResearch` domain error codes.
 */

import { registerErrorDomain, type ErrorDomain } from '#/_base/errors/codes';
import { Error2, type Error2Options } from '#/_base/errors/errors';

export class AitpResearchError extends Error2 {
  constructor(code: string, message: string, options?: Error2Options) {
    super(code as never, message, options);
    this.name = 'AitpResearchError';
  }
}

export const AitpResearchErrors = {
  codes: {
    AITP_MODE_INACTIVE: 'aitp.mode_inactive',
    AITP_MODE_ALREADY_ACTIVE: 'aitp.mode_already_active',
    AITP_MODE_FLAG_DISABLED: 'aitp.mode_flag_disabled',
    AITP_MODE_NOT_MAIN_AGENT: 'aitp.mode_not_main_agent',
    AITP_MODE_PLAN_CONFLICT: 'aitp.mode_plan_conflict',
    AITP_ADAPTER_NOT_READY: 'aitp.adapter_not_ready',
    AITP_ADAPTER_DEGRADED: 'aitp.adapter_degraded',
    AITP_ADAPTER_TIMEOUT: 'aitp.adapter_timeout',
    AITP_ADAPTER_SPAWN_FAILED: 'aitp.adapter_spawn_failed',
    AITP_ADAPTER_CONTRACT_UNKNOWN: 'aitp.adapter_contract_unknown',
    AITP_ADAPTER_COMMAND_FAILED: 'aitp.adapter_command_failed',
    AITP_ADAPTER_NOT_INITIALIZED: 'aitp.adapter_not_initialized',
    AITP_ADAPTER_SINGLE_FLIGHT: 'aitp.adapter_single_flight',
    AITP_CHECKPOINT_PENDING: 'aitp.checkpoint_pending',
    AITP_CHECKPOINT_DEGRADED: 'aitp.checkpoint_degraded',
    AITP_GOAL_COMPLETE_BLOCKED: 'aitp.goal_complete_blocked',
    AITP_SUBAGENT_NOT_ALLOWED: 'aitp.subagent_not_allowed',
    RESEARCH_REVISION_STALE: 'research.revision_stale',
    RESEARCH_QUESTION_NOT_FOUND: 'research.question_not_found',
    RESEARCH_LINE_NOT_FOUND: 'research.line_not_found',
    RESEARCH_LOOP_PAUSED: 'research.loop_paused',
  },
  info: {
    'aitp.mode_inactive': {
      title: 'AITP Research Mode is inactive',
      retryable: false,
      public: true,
      action: 'Enter AITP Research Mode first by calling EnterAITPMode.',
    },
    'aitp.mode_already_active': {
      title: 'AITP Research Mode is already active',
      retryable: false,
      public: true,
      action: 'Use ExitAITPMode to exit before re-entering.',
    },
    'aitp.mode_flag_disabled': {
      title: 'AITP Research Mode is not enabled',
      retryable: false,
      public: true,
      action: 'Enable the experimental flag KIMI_CODE_EXPERIMENTAL_AITP_RESEARCH_MODE.',
    },
    'aitp.mode_not_main_agent': {
      title: 'AITP Research Mode is only available on the main agent',
      retryable: false,
      public: true,
      action: 'Run AITP/Research tools on the main agent only.',
    },
    'aitp.mode_plan_conflict': {
      title: 'Plan mode and Research Mode are mutually exclusive',
      retryable: false,
      public: true,
      action: 'Exit the active mode before entering the other.',
    },
    'aitp.adapter_not_ready': {
      title: 'AITP adapter is not ready',
      retryable: false,
      public: true,
      action: 'Wait for the AITP adapter to finish probing.',
    },
    'aitp.adapter_degraded': {
      title: 'AITP adapter is degraded',
      retryable: false,
      public: true,
      action: 'Check AITP health; durable operations are blocked until AITP recovers.',
    },
    'aitp.adapter_timeout': {
      title: 'AITP adapter operation timed out',
      retryable: true,
      public: true,
      action: 'Retry; if the problem persists, check the AITP workspace and Python.',
    },
    'aitp.adapter_spawn_failed': {
      title: 'Failed to spawn AITP process',
      retryable: false,
      public: true,
      action: 'Ensure Python 3.11+ and the AITP plugin are installed.',
    },
    'aitp.adapter_contract_unknown': {
      title: 'AITP adapter contract is unknown',
      retryable: false,
      public: true,
      action: 'Update the AITP plugin or the adapter to a compatible version.',
    },
    'aitp.adapter_command_failed': {
      title: 'AITP command failed',
      retryable: false,
      public: true,
      action: 'Check the AITP error code and message; resolve the underlying issue and retry.',
    },
    'aitp.adapter_not_initialized': {
      title: 'AITP workspace is not initialized',
      retryable: false,
      public: true,
      action: 'Initialize the AITP workspace before entering Research Mode.',
    },
    'aitp.adapter_single_flight': {
      title: 'An AITP mutation is already in progress',
      retryable: false,
      public: true,
      action: 'Wait for the current AITP operation to finish.',
    },
    'aitp.checkpoint_pending': {
      title: 'Research checkpoint is pending commit',
      retryable: false,
      public: true,
      action: 'Commit or discard the pending checkpoint before proceeding.',
    },
    'aitp.checkpoint_degraded': {
      title: 'Research checkpoint is degraded',
      retryable: false,
      public: true,
      action: 'Reconcile AITP health before committing.',
    },
    'aitp.goal_complete_blocked': {
      title: 'Goal completion is blocked by Research Mode',
      retryable: false,
      public: true,
      action: 'Resolve pending checkpoints or AITP degradation before completing the goal.',
    },
    'aitp.subagent_not_allowed': {
      title: 'Subagents cannot use AITP/Research mutation tools',
      retryable: false,
      public: true,
      action: 'Use typed packets to return results to the main agent.',
    },
    'research.revision_stale': {
      title: 'Research revision is stale',
      retryable: false,
      public: true,
      action: 'Refresh the research status and retry with the current revision.',
    },
    'research.question_not_found': {
      title: 'Research question not found',
      retryable: false,
      public: true,
      action: 'Create the question first or check the ID.',
    },
    'research.line_not_found': {
      title: 'Research line not found',
      retryable: false,
      public: true,
      action: 'Create the line first or check the slug.',
    },
    'research.loop_paused': {
      title: 'Research loop is paused',
      retryable: false,
      public: true,
      action: 'Resume the research loop before performing research operations.',
    },
  },
} as const satisfies ErrorDomain;

registerErrorDomain(AitpResearchErrors);
