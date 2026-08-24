/**
 * `aitpResearch` domain — `IEnterAITPModeTool` / `IExitAITPModeTool` contracts.
 *
 * The mode entry/exit tools the model calls. `EnterAITPMode` is permanently
 * registered but flag-gated through the `when` predicate; `ExitAITPMode` is
 * active-only. Bound at Agent scope.
 */

import { z } from 'zod';

import { createDecorator } from '#/_base/di/instantiation';
import type { AgentTool } from '#/tool/toolContract';

export const EnterAITPModeInputSchema = z
  .object({
    line_slug: z.string().optional(),
  })
  .strict();
export type EnterAITPModeInput = z.infer<typeof EnterAITPModeInputSchema>;

export interface IEnterAITPModeTool extends AgentTool<EnterAITPModeInput> {
  readonly _serviceBrand: undefined;
}
export const IEnterAITPModeTool =
  createDecorator<IEnterAITPModeTool>('enterAitpModeTool');

export const ExitAITPModeInputSchema = z.object({}).strict();
export type ExitAITPModeInput = z.infer<typeof ExitAITPModeInputSchema>;

export interface IExitAITPModeTool extends AgentTool<ExitAITPModeInput> {
  readonly _serviceBrand: undefined;
}
export const IExitAITPModeTool =
  createDecorator<IExitAITPModeTool>('exitAitpModeTool');
