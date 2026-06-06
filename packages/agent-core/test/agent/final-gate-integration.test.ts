import { describe, expect, it } from 'vitest';

import { compileAitpProcessGraphSlice } from '../../src/aitp';
import type { ResearchObligation } from '../../src/research-action';
import { testAgent } from './harness/agent';

describe('final gate lifecycle integration', () => {
  it('continues the turn with a concise final-gate correction when blocking checks remain open', async () => {
    const ctx = testAgent();
    ctx.configure();
    ctx.agent.workFrames.open(
      {
        id: 'frame.fqhe',
        domain: 'topological-order',
        topic: 'fqhe-cs-effective-theory',
        goal: 'Check flux convention before final claim.',
        trustState: 'checking',
        openObligationIds: ['obl.flux-convention'],
      },
      { source: 'controller' },
    );
    ctx.agent.researchAction.registerObligations([blockingObligation()]);

    ctx.mockNextResponse({ type: 'text', text: 'Everything is solved.' });
    ctx.mockNextResponse({
      type: 'text',
      text: 'Status: provisional. Flux convention still needs to be checked.',
    });

    await ctx.rpc.prompt({ input: [{ type: 'text', text: 'Can we conclude now?' }] });
    await ctx.untilTurnEnd();

    expect(ctx.llmCalls).toHaveLength(2);
    expect(ctx.llmCalls[1]?.history).toContainEqual({
      role: 'user',
      content: [
        {
          type: 'text',
          text: expect.stringContaining('status="provisional"'),
        },
      ],
      toolCalls: [],
    });
    expect(ctx.llmCalls[1]?.history).toContainEqual({
      role: 'user',
      content: [
        {
          type: 'text',
          text: expect.stringContaining('validate.check_convention'),
        },
      ],
      toolCalls: [],
    });
    expect(ctx.agent.context.data().history).toContainEqual(
      expect.objectContaining({
        role: 'user',
        origin: { kind: 'system_trigger', name: 'final_gate' },
      }),
    );
  });

  it('keeps lightweight turns natural when no final-gate conditions apply', async () => {
    const ctx = testAgent();
    ctx.configure();
    ctx.mockNextResponse({ type: 'text', text: 'A simple answer.' });

    await ctx.rpc.prompt({ input: [{ type: 'text', text: 'What is a wavefunction?' }] });
    await ctx.untilTurnEnd();

    expect(ctx.llmCalls).toHaveLength(1);
    expect(
      ctx.agent.context.data().history.some(
        (message) => message.origin?.kind === 'system_trigger' && message.origin.name === 'final_gate',
      ),
    ).toBe(false);
  });

  it('does not let evidence from another WorkFrame satisfy validated status', async () => {
    const ctx = testAgent();
    ctx.configure();
    ctx.agent.workFrames.open(
      {
        id: 'frame.librpa',
        domain: 'librpa/head-wing',
        topic: 'librpa-head-wing',
        goal: 'Map formula to code.',
      },
      { source: 'controller' },
    );
    ctx.agent.researchAction.recordActionResult(
      {
        actionId: 'validate.check_formula_code_mapping',
        callId: 'call.old-evidence',
        input: {},
        output: {},
        graphRefs: [],
        capsuleRefs: [],
        ledgerEventIds: ['event.librpa.mapping'],
        evidenceRefs: ['ledger:event.librpa.mapping'],
        outcome: 'pass',
        nextSuggestedActions: [],
      },
      { source: 'controller' },
    );
    ctx.agent.workFrames.open(
      {
        id: 'frame.fqhe',
        domain: 'topological-order',
        topic: 'fqhe-cs-effective-theory',
        goal: 'Finalize charge-flux convention claim.',
        trustState: 'validated',
      },
      { source: 'controller' },
    );

    ctx.mockNextResponse({ type: 'text', text: 'Status: validated. Fully done.' });
    ctx.mockNextResponse({
      type: 'text',
      text: 'Status: checked. Source support still needs explicit evidence.',
    });

    await ctx.rpc.prompt({ input: [{ type: 'text', text: 'Can we mark this validated?' }] });
    await ctx.untilTurnEnd();

    expect(ctx.llmCalls).toHaveLength(2);
    expect(ctx.llmCalls[1]?.history).toContainEqual({
      role: 'user',
      content: [
        {
          type: 'text',
          text: expect.stringContaining('validate.check_source_support'),
        },
      ],
      toolCalls: [],
    });
  });

  it('continues the turn when AITP required call obligations are still open', async () => {
    const ctx = testAgent();
    ctx.configure();
    ctx.agent.workFrames.open(
      {
        id: 'frame.aitp',
        domain: 'theoretical-physics/qg-algebra',
        topic: 'qg-algebra-mipt',
        goal: 'Do not cross the AITP policy boundary silently.',
        trustState: 'checking',
      },
      { source: 'controller' },
    );
    ctx.agent.researchContext.compileForWorkFrame(
      {
        aitp: compileAitpProcessGraphSlice(aitpRequiredCallSlicePayload()),
      },
      { source: 'controller' },
    );

    ctx.mockNextResponse({ type: 'text', text: 'Status: checked. The claim is ready.' });
    ctx.mockNextResponse({
      type: 'text',
      text: 'Status: exploratory. The AITP evidence record still has to be written.',
    });

    await ctx.rpc.prompt({ input: [{ type: 'text', text: 'Can we finish this checked?' }] });
    await ctx.untilTurnEnd();

    expect(ctx.llmCalls).toHaveLength(2);
    expect(ctx.llmCalls[1]?.history).toContainEqual({
      role: 'user',
      content: [
        {
          type: 'text',
          text: expect.stringContaining('aitp.record_evidence'),
        },
      ],
      toolCalls: [],
    });
    expect(ctx.llmCalls[1]?.history).toContainEqual({
      role: 'user',
      content: [
        {
          type: 'text',
          text: expect.stringContaining('Open AITP call obligations'),
        },
      ],
      toolCalls: [],
    });
  });

  it('allows final gate completion after the AITP required call is recorded', async () => {
    const ctx = testAgent();
    ctx.configure();
    ctx.agent.workFrames.open(
      {
        id: 'frame.aitp',
        domain: 'theoretical-physics/qg-algebra',
        topic: 'qg-algebra-mipt',
        goal: 'Respect AITP policy obligations.',
        trustState: 'checking',
      },
      { source: 'controller' },
    );
    ctx.agent.researchContext.compileForWorkFrame(
      {
        aitp: compileAitpProcessGraphSlice(aitpRequiredCallSlicePayload()),
      },
      { source: 'controller' },
    );
    ctx.agent.researchAction.recordActionResult(
      {
        actionId: 'aitp.record_validation_result',
        callId: 'call.aitp-validation-result',
        input: {},
        output: {},
        graphRefs: [],
        capsuleRefs: [],
        ledgerEventIds: [],
        evidenceRefs: ['aitp:validation_result:validation-result-source-audit'],
        outcome: 'pass',
        nextSuggestedActions: [],
      },
      { source: 'controller' },
    );

    ctx.mockNextResponse({ type: 'text', text: 'Status: checked. The AITP call is recorded.' });

    await ctx.rpc.prompt({ input: [{ type: 'text', text: 'Can we finish this checked?' }] });
    await ctx.untilTurnEnd();

    expect(ctx.llmCalls).toHaveLength(1);
    expect(
      ctx.agent.context.data().history.some(
        (message) => message.origin?.kind === 'system_trigger' && message.origin.name === 'final_gate',
      ),
    ).toBe(false);
  });
});

function blockingObligation(): ResearchObligation {
  return {
    id: 'obl.flux-convention',
    kind: 'convention_check',
    domain: 'topological-order',
    topic: 'fqhe-cs-effective-theory',
    targetObjectId: 'formula.fqhe.flux-quantization',
    severity: 'blocking',
    reason: 'Flux convention must be checked.',
    requiredActionId: 'validate.check_convention',
    status: 'open',
  };
}

function aitpRequiredCallSlicePayload() {
  return {
    ok: true,
    kind: 'process_graph_slice',
    truth_source: 'typed_records',
    orientation_only: true,
    nodes: [],
    edges: [],
    open_obligations: [],
    source_backtrace: [],
    relation_neighborhood: [],
    exploratory_records: [],
    trust_boundary_reasons: [],
    recommended_moments: [],
    moment_policy: {
      ok: true,
      kind: 'host_agnostic_moment_policy',
      decisions: [
        {
          moment: 'record_or_validate_open_obligation',
          decision_type: 'recording',
          action_kind: 'record_evidence_or_validation',
          required_now: true,
          reason: 'open proof obligation requires typed evidence or validation',
          target_type: 'proof_obligation',
          target_id: 'obligation-source',
          record_entrypoints: [
            'aitp_v5_record_evidence',
            'aitp_v5_record_validation_result',
          ],
          exploration_entrypoints: [],
          entrypoints: [
            'aitp_v5_record_evidence',
            'aitp_v5_record_validation_result',
            'aitp_v5_preflight_trust_update',
          ],
          required_before_trust_change: [
            'record typed evidence or validation for the open obligation',
            'run aitp_v5_preflight_trust_update',
          ],
          missing_components: [],
          trust_boundary: true,
          orientation_only: true,
          can_update_claim_trust: false,
        },
      ],
      recommended_moments: [],
      trust_boundary_reasons: [],
      truth_source: 'typed_records',
      orientation_only: true,
      can_update_claim_trust: false,
    },
  };
}
