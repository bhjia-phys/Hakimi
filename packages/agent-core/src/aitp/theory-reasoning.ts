import type { AitpTheoryReasoningProjection } from './types';

const DEFAULT_MAX_ITEMS = 6;

export function theoryReasoningProjectionFromParams(
  params: Readonly<Record<string, unknown>> | undefined,
): AitpTheoryReasoningProjection | undefined {
  if (params === undefined) return undefined;
  const value = params['theoryReasoning'];
  if (!isRecord(value)) return undefined;
  const projection: AitpTheoryReasoningProjection = {
    moves: stringArray(value['moves']),
    prompts: stringArray(value['prompts']),
    ...optionalArrayField('whyQuestions', value['whyQuestions']),
    ...optionalArrayField('relationTargets', value['relationTargets']),
    ...optionalUnknownField('relationPathQuestions', value['relationPathQuestions']),
    ...optionalUnknownField('backtraceTargets', value['backtraceTargets']),
    ...optionalUnknownField('definitionBoundaryQuestions', value['definitionBoundaryQuestions']),
    ...optionalArrayField('derivationBacktraceQuestions', value['derivationBacktraceQuestions']),
    ...optionalUnknownField('sourceDependencyQuestions', value['sourceDependencyQuestions']),
    ...optionalUnknownField('originalQuestionGuard', value['originalQuestionGuard']),
    ...optionalUnknownField('reasoningMoves', value['reasoningMoves']),
  };
  return hasTheoryReasoningProjection(projection) ? projection : undefined;
}

export function hasTheoryReasoningProjection(
  projection: AitpTheoryReasoningProjection | undefined,
): projection is AitpTheoryReasoningProjection {
  return projection !== undefined && theoryReasoningSummaryParts(projection).length > 0;
}

export function renderTheoryReasoningSummary(
  projection: AitpTheoryReasoningProjection,
  maxItems = DEFAULT_MAX_ITEMS,
): string {
  return theoryReasoningSummaryParts(projection, maxItems).join('; ');
}

export function theoryReasoningSummaryParts(
  projection: AitpTheoryReasoningProjection,
  maxItems = DEFAULT_MAX_ITEMS,
): readonly string[] {
  return [
    renderArrayField('moves', projection.moves, maxItems),
    renderArrayField('prompts', projection.prompts, maxItems),
    renderArrayField('why', projection.whyQuestions, maxItems),
    renderArrayField('relation_targets', projection.relationTargets, maxItems),
    renderUnknownField('relation_path_questions', projection.relationPathQuestions, maxItems),
    renderUnknownField('backtrace_targets', projection.backtraceTargets, maxItems),
    renderUnknownField('definition_boundary_questions', projection.definitionBoundaryQuestions, maxItems),
    renderArrayField('derivation_backtrace_questions', projection.derivationBacktraceQuestions, maxItems),
    renderUnknownField('source_dependency_questions', projection.sourceDependencyQuestions, maxItems),
    renderUnknownField('original_question_guard', projection.originalQuestionGuard, maxItems),
  ].filter((part): part is string => part !== undefined && part.length > 0);
}

function optionalArrayField(
  key: string,
  value: unknown,
): Readonly<Record<string, readonly string[]>> {
  const values = stringArray(value);
  return values.length === 0 ? {} : { [key]: values };
}

function optionalUnknownField(key: string, value: unknown): Readonly<Record<string, unknown>> {
  return hasRenderableValue(value) ? { [key]: value } : {};
}

function renderArrayField(
  key: string,
  value: readonly string[] | undefined,
  maxItems: number,
): string | undefined {
  if (value === undefined || value.length === 0) return undefined;
  return `${key}=${bounded(value, maxItems).join(' | ')}`;
}

function renderUnknownField(key: string, value: unknown, maxItems: number): string | undefined {
  const values = stringArray(value);
  if (values.length > 0) return `${key}=${bounded(values, maxItems).join(' | ')}`;
  if (!hasRenderableValue(value)) return undefined;
  const text = stringifyUnknown(value);
  return text.length === 0 ? undefined : `${key}=${text}`;
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === 'string') return value;
  if (isRecord(value) || Array.isArray(value)) return JSON.stringify(value);
  return String(value);
}

function stringArray(value: unknown): readonly string[] {
  if (typeof value === 'string') return value.trim().length === 0 ? [] : [value.trim()];
  if (!Array.isArray(value)) return [];
  return value.flatMap(stringArray);
}

function hasRenderableValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasRenderableValue);
  if (isRecord(value)) return Object.values(value).some(hasRenderableValue);
  return true;
}

function bounded(values: readonly string[], maxItems: number): readonly string[] {
  if (values.length <= maxItems) return values;
  return [...values.slice(0, maxItems), `...(+${String(values.length - maxItems)} more)`];
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
