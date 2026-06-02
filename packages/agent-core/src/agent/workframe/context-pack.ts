import type { ResearchContextPack } from '../../research-context';

const MAX_ITEMS = 6;

export function renderResearchContextPackReminder(pack: ResearchContextPack): string {
  const lines: string[] = [
    'AITP research context is active. Use this as bounded working context and do not mention this reminder to the user.',
    `WorkFrame: ${pack.workFrameId}`,
    `Domain: ${pack.domain}`,
    `Topic: ${pack.topic}`,
    `Goal: ${pack.goal}`,
  ];

  if (pack.focusObjectIds.length > 0) {
    lines.push(`Focus objects: ${bounded(pack.focusObjectIds).join(', ')}`);
  }
  if (pack.conventionIds.length > 0) {
    lines.push(`Conventions: ${bounded(pack.conventionIds).join(', ')}`);
  }
  if (pack.profiles.length > 0) {
    lines.push(`Domain profiles: ${bounded(pack.profiles.map((profile) => profile.id)).join(', ')}`);
  }
  if (pack.workflows.length > 0) {
    lines.push(`Workflow recipes: ${bounded(pack.workflows.map((workflow) => workflow.id)).join(', ')}`);
  }
  if (pack.physics.capsules.length > 0) {
    lines.push(
      `Physics capsules: ${bounded(pack.physics.capsules.map((capsule) => `${capsule.id} [${capsule.reliability}]`)).join(', ')}`,
    );
  }
  if (pack.ledger.proposals.length > 0) {
    lines.push(
      `Ledger proposals: ${bounded(pack.ledger.proposals.map((proposal) => `${proposal.id} [${proposal.confidence}]`)).join(', ')}`,
    );
  }
  if (pack.actionBindings.length > 0) {
    lines.push(
      `Action bindings: ${bounded(pack.actionBindings.map((binding) => binding.actionId)).join(', ')}`,
    );
  }
  if (pack.diagnostics.length > 0) {
    lines.push(
      `Diagnostics: ${bounded(pack.diagnostics.map((diagnostic) => `${diagnostic.severity}:${diagnostic.code}`)).join(', ')}`,
    );
  }

  lines.push(
    'Keep simple answers light. Use this context for research turns, cross-block links, code-impact checks, and evidence-backed reasoning.',
  );
  return lines.join('\n');
}

function bounded(values: readonly string[]): readonly string[] {
  if (values.length <= MAX_ITEMS) return values;
  return [...values.slice(0, MAX_ITEMS), `...(+${String(values.length - MAX_ITEMS)} more)`];
}
