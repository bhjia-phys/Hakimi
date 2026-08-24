/**
 * The agent facade — one `session.agent(id)` handle over the agent-scope
 * services the wire exposes. Turn-driving calls (prompt / steer / cancel),
 * skill activation, permission mode, and commands go straight to their domain
 * services, as do shell commands, model, usage, plan, and task calls;
 * `getContext` merges two reads client-side. Prompt streaming is
 * NOT on this interface: it flows through the agent's `events` hub
 * (`turn.*`, `assistant.delta`, `tool.call.*`, `prompt.completed`, …).
 */

import type { IAgentCommandService } from '@moonshot-ai/agent-core-v2/agent/command/agentCommand';
import type { IAgentContextMemoryService } from '@moonshot-ai/agent-core-v2/agent/contextMemory/contextMemory';
import type { IAgentMcpService } from '@moonshot-ai/agent-core-v2/agent/mcp/mcp';
import type { IAgentRuntimeBindingService } from '@moonshot-ai/agent-core-v2/agent/runtimeBinding/runtimeBinding';
import type { IAgentPromptService } from '@moonshot-ai/agent-core-v2/agent/prompt/prompt';
import type { IAgentTokenCountingService } from '@moonshot-ai/agent-core-v2/agent/tokenCounting/tokenCounting';
import type { IAgentPlanService } from '@moonshot-ai/agent-core-v2/features/plan/plan';
import type { IAgentProfileService } from '@moonshot-ai/agent-core-v2/agent/profile/profile';
import type { IAgentShellCommandService } from '@moonshot-ai/agent-core-v2/agent/shellCommand/shellCommand';
import type { IAgentSkillService } from '@moonshot-ai/agent-core-v2/agent/skill/skill';
import type { IAgentTaskService } from '@moonshot-ai/agent-core-v2/agent/task/task';
import type { IAgentUsageService } from '@moonshot-ai/agent-core-v2/agent/usage/usage';
import type {
  GoalReasonInput,
  ResumeGoalInput,
} from '@moonshot-ai/agent-core-v2/agent/goal/goal';
import type {
  CreateGoalInput,
  GoalBudgetLimits,
  GoalSnapshot,
  GoalToolResult,
} from '@moonshot-ai/agent-core-v2/agent/goal/types';
import type { ContentPart } from '@moonshot-ai/agent-core-v2/kosong/contract/message';
import type { PermissionMode } from '@moonshot-ai/agent-core-v2/agent/permissionPolicy/types';

import type {
  HumanSteeringCommand,
  ResearchCheckpoint,
  ResearchCommittedCursor,
  ResearchLine,
  ResearchLineCreationInput,
  ResearchQuestion,
  ResearchStatusSnapshot,
} from '@moonshot-ai/agent-core-v2/features/aitpResearch/types';
import type {
  CommitCheckpointInput,
  CreateQuestionInput,
  ProposeCheckpointInput,
  UpdateLineInput,
  UpdateQuestionInput,
} from '@moonshot-ai/agent-core-v2/features/aitpResearch/research/agentResearch';
import type { AitpModeEntryOptions } from '@moonshot-ai/agent-core-v2/features/aitpResearch/mode/agentAitpMode';
import type { ScopeRef } from '../channel.js';
import type { ScopedCaller } from './session.js';

// Wire-type aliases derived through the engine service interfaces (keeps
// klient free of protocol-package imports).
export type PromptLaunchResult = Awaited<ReturnType<IAgentPromptService['submit']>>;
export type PromptWithSkillsInput = Parameters<IAgentSkillService['promptWithSkills']>[0];
export type ShellCommandResult = Awaited<ReturnType<IAgentShellCommandService['run']>>;
export type SetModelResult = Awaited<ReturnType<IAgentProfileService['setModel']>>;
export type ThinkingLevel = ReturnType<IAgentProfileService['getEffectiveThinkingLevel']>;
export type UsageStatus = Awaited<ReturnType<IAgentUsageService['status']>>;
export type AgentContextData = {
  history: ReturnType<IAgentContextMemoryService['get']>;
  tokenCount: ReturnType<IAgentTokenCountingService['statusSize']>;
};
export type AgentCommandInfo = Awaited<ReturnType<IAgentCommandService['list']>>[number];
export type RuntimeBinding = ReturnType<IAgentRuntimeBindingService['get']>;
export type PlanData = Awaited<ReturnType<IAgentPlanService['status']>>;
export type AgentTaskInfo = Awaited<ReturnType<IAgentTaskService['list']>>[number];
export type McpServerEntry = ReturnType<IAgentMcpService['list']>[number];

/**
 * The main-agent goal lifecycle. `markBlocked` / `markComplete` are
 * deliberately absent: those transitions are owned by the engine's loop and
 * the model's goal tools, not by clients. The engine's `actor` argument is
 * never sent — the wire default (`user`) applies.
 */
export interface AgentGoalFacade {
  /** Create a goal; fails when one already exists unless `replace` is set. */
  create(input: CreateGoalInput): Promise<GoalSnapshot>;
  /** The current goal snapshot, or `null` when no goal exists. */
  get(): Promise<GoalSnapshot | null>;
  pause(input?: GoalReasonInput): Promise<GoalSnapshot>;
  resume(input?: ResumeGoalInput): Promise<GoalSnapshot>;
  /** Clear the goal; resolves with the snapshot from just before the clear. */
  cancel(input?: GoalReasonInput): Promise<GoalSnapshot>;
  /** Merge budget limits over the current goal. */
  setBudgetLimits(limits: GoalBudgetLimits): Promise<GoalSnapshot>;
}

export interface AgentFacade {
  prompt(input: { input: readonly ContentPart[] }): Promise<PromptLaunchResult>;
  /**
   * Submit one prompt with one or more skill activations bundled into the
   * same user message: the skills are validated up front (an unknown name or
   * an empty list rejects the whole submission), rendered ahead of the
   * caller's parts in the same turn, and the bundle undoes as a single
   * anchor. Resolves with the launched turn id, or `undefined` when the
   * submission queued behind a running turn.
   */
  promptWithSkills(input: PromptWithSkillsInput): Promise<PromptLaunchResult>;
  steer(input: { input: readonly ContentPart[] }): Promise<PromptLaunchResult>;
  /**
   * Activate a skill as a user-slash activation: the engine renders the skill
   * prompt and drives it as a normal turn (same settlement/event flow as
   * `prompt`). Resolves with the launched turn id; rejects when the skill is
   * unknown or the agent is busy.
   */
  activateSkill(input: { name: string; args?: string }): Promise<PromptLaunchResult>;
  cancel(input?: { turnId?: number }): Promise<void>;
  runShellCommand(input: { command: string; commandId?: string }): Promise<ShellCommandResult>;
  cancelShellCommand(input: { commandId: string }): Promise<void>;
  getModel(): Promise<string>;
  setModel(model: string): Promise<SetModelResult>;
  getThinking(): Promise<ThinkingLevel>;
  setThinking(level: string): Promise<void>;
  setPermission(mode: PermissionMode): Promise<void>;
  getUsage(): Promise<UsageStatus>;
  getContext(): Promise<AgentContextData>;
  listCommands(): Promise<readonly AgentCommandInfo[]>;
  runCommand(input: { name: string; args?: string }): Promise<void>;
  getRuntime(): Promise<RuntimeBinding>;
  switchRuntime(runtimeId: string): Promise<RuntimeBinding>;
  getPlan(): Promise<PlanData>;
  enterPlan(): Promise<void>;
  clearPlan(): Promise<void>;
  cancelPlan(input?: { id?: string }): Promise<void>;
  getTasks(input?: { activeOnly?: boolean; limit?: number }): Promise<readonly AgentTaskInfo[]>;
  stopTask(input: { taskId: string; reason?: string }): Promise<void>;
  getTaskOutput(input: { taskId: string; tail?: number }): Promise<string>;
  /**
   * Session-merged MCP server entries (workspace set + ephemeral session
   * overlay). This is a live snapshot, so entries may still be pending while
   * the initial connection attempt runs.
   */
  getMcpServers(): Promise<readonly McpServerEntry[]>;
  /**
   * Trigger a manual full compaction. Async: `true` means the compaction was
   * started (it runs in the background); `false` means one is already running.
   * Throws when there is nothing to compact or a turn is active.
   */
  compact(input?: { instruction?: string }): Promise<boolean>;

  /** AITP Research Mode — snapshot read and steering command dispatch. */
  readonly research: ResearchFacade;
  /** AITP Mode lifecycle — enter / exit / pause / resume. */
  readonly aitpMode: AitpModeFacade;
  /** Main-agent goal lifecycle (`goal.updated` flows through `events`). */
  readonly goal: AgentGoalFacade;
}

export type ResearchSnapshot = ResearchStatusSnapshot;
export type { HumanSteeringCommand };

export interface ResearchFacade {
  getSnapshot(): Promise<ResearchSnapshot>;
  getQuestions(): Promise<readonly ResearchQuestion[]>;
  getLines(): Promise<readonly ResearchLine[]>;
  getPendingCheckpoint(): Promise<ResearchCheckpoint | undefined>;
  getCommittedCursor(): Promise<ResearchCommittedCursor | undefined>;
  createQuestion(input: CreateQuestionInput): Promise<ResearchQuestion>;
  createLine(input: ResearchLineCreationInput): Promise<ResearchLine>;
  updateLine(input: UpdateLineInput): Promise<ResearchLine>;
  updateQuestion(input: UpdateQuestionInput): Promise<ResearchQuestion>;
  setFocus(questionId: string, boundedAction?: string, expectedRevision?: number): Promise<void>;
  switchLine(lineSlug: string, expectedRevision?: number): Promise<void>;
  steer(command: HumanSteeringCommand): Promise<void>;
  reopenQuestion(questionId: string, reason?: string, expectedRevision?: number): Promise<void>;
  proposeCheckpoint(input: ProposeCheckpointInput): Promise<ResearchCheckpoint>;
  commitCheckpoint(input: CommitCheckpointInput): Promise<void>;
}

export interface AitpModeFacade {
  enter(options: AitpModeEntryOptions): Promise<void>;
  exit(): Promise<void>;
  pauseLoop(expectedRevision: number): Promise<void>;
  resumeLoop(expectedRevision: number): Promise<void>;
}

export function createAgentFacade(call: ScopedCaller, scope: ScopeRef): AgentFacade {
  return {
    prompt: (input) =>
      call(scope, 'agentPromptService', 'submit', [input]) as Promise<PromptLaunchResult>,
    promptWithSkills: (input) =>
      call(scope, 'agentSkillService', 'promptWithSkills', [input]) as Promise<PromptLaunchResult>,
    steer: (input) =>
      call(scope, 'agentPromptService', 'submitSteer', [input]) as Promise<PromptLaunchResult>,
    activateSkill: (input) =>
      call(scope, 'agentSkillService', 'activate', [input]) as Promise<PromptLaunchResult>,
    cancel: (input) =>
      // No turnId sends an empty arg list: `[undefined]` would cross the wire
      // as `[null]`, and `cancelFromUser(null)` would not match the active turn.
      call(scope, 'agentLoopService', 'cancelFromUser', input?.turnId === undefined ? [] : [input.turnId]) as Promise<void>,
    runShellCommand: (input) =>
      call(scope, 'agentShellCommandService', 'run', [input]) as Promise<ShellCommandResult>,
    cancelShellCommand: (input) =>
      call(scope, 'agentShellCommandService', 'cancel', [input.commandId]) as Promise<void>,
    getModel: () => call(scope, 'agentProfileService', 'getModel', []) as Promise<string>,
    setModel: (model) =>
      call(scope, 'agentProfileService', 'setModel', [model]) as Promise<SetModelResult>,
    getThinking: () =>
      call(scope, 'agentProfileService', 'getEffectiveThinkingLevel', []) as Promise<ThinkingLevel>,
    setThinking: (level) =>
      call(scope, 'agentProfileService', 'setThinking', [level]) as Promise<void>,
    setPermission: (mode) =>
      call(scope, 'agentPermissionModeService', 'setModeAndBroadcast', [mode]) as Promise<void>,
    getUsage: () => call(scope, 'agentUsageService', 'status', []) as Promise<UsageStatus>,
    getContext: async () => {
      const [history, tokenCount] = await Promise.all([
        call(scope, 'agentContextMemoryService', 'get', []),
        call(scope, 'agentTokenCountingService', 'statusSize', []),
      ]);
      return { history, tokenCount } as AgentContextData;
    },
    listCommands: () =>
      call(scope, 'agentCommandService', 'list', []) as Promise<readonly AgentCommandInfo[]>,
    runCommand: (input) =>
      // Same `[undefined]` → `[null]` wire hazard as `cancel`: the engine's
      // `args = ''` default only applies to a missing arg.
      call(
        scope,
        'agentCommandService',
        'run',
        input.args === undefined ? [input.name] : [input.name, input.args],
      ) as Promise<void>,
    getRuntime: () =>
      call(scope, 'agentRuntimeBindingService', 'get', []) as Promise<RuntimeBinding>,
    switchRuntime: (runtimeId) =>
      call(scope, 'agentRuntimeBindingService', 'switch', [runtimeId]) as Promise<RuntimeBinding>,
    getPlan: () => call(scope, 'agentPlanService', 'status', []) as Promise<PlanData>,
    enterPlan: () => call(scope, 'agentPlanService', 'enter', []) as Promise<void>,
    clearPlan: () => call(scope, 'agentPlanService', 'clear', []) as Promise<void>,
    cancelPlan: (input) =>
      call(scope, 'agentPlanService', 'cancel', [input?.id]) as Promise<void>,
    getTasks: (input) =>
      call(scope, 'agentTaskService', 'list', [
        input?.activeOnly ?? false,
        input?.limit,
      ]) as Promise<readonly AgentTaskInfo[]>,
    stopTask: async (input) => {
      if (input.reason === undefined) {
        await call(scope, 'agentTaskService', 'stopByUser', [input.taskId]);
        return;
      }
      await call(scope, 'agentTaskService', 'stop', [input.taskId, input.reason]);
    },
    getTaskOutput: (input) =>
      call(scope, 'agentTaskService', 'readOutput', [input.taskId, input.tail]) as Promise<string>,
    getMcpServers: () =>
      call(scope, 'agentMcpService', 'list', []) as Promise<readonly McpServerEntry[]>,
    compact: (input) =>
      call(scope, 'agentFullCompactionService', 'begin', [
        { source: 'manual', instruction: input?.instruction },
      ]) as Promise<boolean>,

    research: {
      getSnapshot: () =>
        call(scope, 'agentResearchService', 'getSnapshot', []) as Promise<ResearchSnapshot>,
      getQuestions: () =>
        call(scope, 'agentResearchService', 'getQuestions', []) as Promise<
          readonly ResearchQuestion[]
        >,
      getLines: () =>
        call(scope, 'agentResearchService', 'getLines', []) as Promise<readonly ResearchLine[]>,
      getPendingCheckpoint: () =>
        call(scope, 'agentResearchService', 'getPendingCheckpoint', []) as Promise<
          ResearchCheckpoint | undefined
        >,
      getCommittedCursor: () =>
        call(scope, 'agentResearchService', 'getCommittedCursor', []) as Promise<
          ResearchCommittedCursor | undefined
        >,
      createQuestion: (input) =>
        call(scope, 'agentResearchService', 'createQuestion', [input]) as Promise<ResearchQuestion>,
      createLine: (input) =>
        call(scope, 'agentResearchService', 'createLine', [input]) as Promise<ResearchLine>,
      updateLine: (input) =>
        call(scope, 'agentResearchService', 'updateLine', [input]) as Promise<ResearchLine>,
      updateQuestion: (input) =>
        call(scope, 'agentResearchService', 'updateQuestion', [input]) as Promise<ResearchQuestion>,
      setFocus: (questionId, boundedAction, expectedRevision) =>
        call(
          scope,
          'agentResearchService',
          'setFocus',
          boundedAction === undefined
            ? expectedRevision === undefined ? [questionId] : [questionId, expectedRevision]
            : expectedRevision === undefined
              ? [questionId, boundedAction]
              : [questionId, boundedAction, expectedRevision],
        ) as Promise<void>,
      switchLine: (lineSlug, expectedRevision) =>
        call(
          scope,
          'agentResearchService',
          'switchLine',
          expectedRevision === undefined ? [lineSlug] : [lineSlug, expectedRevision],
        ) as Promise<void>,
      steer: (command) =>
        call(scope, 'agentResearchService', 'steer', [command]) as Promise<void>,
      reopenQuestion: (questionId, reason, expectedRevision) =>
        call(
          scope,
          'agentResearchService',
          'reopenQuestion',
          reason === undefined
            ? expectedRevision === undefined ? [questionId] : [questionId, expectedRevision]
            : expectedRevision === undefined
              ? [questionId, reason]
              : [questionId, reason, expectedRevision],
        ) as Promise<void>,
      proposeCheckpoint: (input) =>
        call(scope, 'agentResearchService', 'proposeCheckpoint', [input]) as Promise<ResearchCheckpoint>,
      commitCheckpoint: (input) =>
        call(scope, 'agentResearchService', 'commitCheckpoint', [input]) as Promise<void>,
    },

    aitpMode: {
      enter: (options) =>
        call(scope, 'agentAitpModeService', 'enter', [options]) as Promise<void>,
      exit: () => call(scope, 'agentAitpModeService', 'exit', []) as Promise<void>,
      pauseLoop: (expectedRevision) =>
        call(scope, 'agentAitpModeService', 'pauseLoop', [expectedRevision]) as Promise<void>,
      resumeLoop: (expectedRevision) =>
        call(scope, 'agentAitpModeService', 'resumeLoop', [expectedRevision]) as Promise<void>,
    },

    goal: {
      create: (input) =>
        call(scope, 'agentGoalService', 'createGoal', [input]) as Promise<GoalSnapshot>,
      get: async () => {
        const result = (await call(scope, 'agentGoalService', 'getGoal', [])) as GoalToolResult;
        return result.goal;
      },
      pause: (input) =>
        call(scope, 'agentGoalService', 'pauseGoal', [input ?? {}]) as Promise<GoalSnapshot>,
      resume: (input) =>
        call(scope, 'agentGoalService', 'resumeGoal', [input ?? {}]) as Promise<GoalSnapshot>,
      cancel: (input) =>
        call(scope, 'agentGoalService', 'cancelGoal', [input ?? {}]) as Promise<GoalSnapshot>,
      setBudgetLimits: (limits) =>
        call(scope, 'agentGoalService', 'setBudgetLimits', [
          { budgetLimits: limits },
        ]) as Promise<GoalSnapshot>,
    },
  };
}
