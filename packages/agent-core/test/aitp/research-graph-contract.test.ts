import { describe, expect, it } from 'vitest';

import {
  HAKIMI_AITP_RESEARCH_GRAPH_CONTRACT,
  canonicalResearchGraphSurfaces,
  compatibilityResearchGraphSurfaces,
  getResearchGraphBoundarySurface,
  renderResearchGraphBoundaryContract,
} from '../../src/aitp';

describe('Hakimi/AITP research graph boundary contract', () => {
  it('keeps AITP typed records as the only canonical research graph truth', () => {
    expect(canonicalResearchGraphSurfaces().map((surface) => surface.id)).toEqual([
      'aitp.typed-record-kernel',
    ]);

    for (const surface of HAKIMI_AITP_RESEARCH_GRAPH_CONTRACT) {
      if (surface.id === 'aitp.typed-record-kernel') continue;
      expect(surface.canonicalTruth, surface.id).toBe(false);
    }
  });

  it('marks ResearchLedger and PhysicsMemory as compatibility projections after migration', () => {
    expect(compatibilityResearchGraphSurfaces().map((surface) => surface.id)).toEqual([
      'hakimi.research-ledger',
      'hakimi.physics-memory',
    ]);

    for (const id of ['hakimi.research-ledger', 'hakimi.physics-memory']) {
      const surface = getResearchGraphBoundarySurface(id);
      expect(surface).toMatchObject({
        owner: 'hakimi',
        authority: 'compat_projection',
        apiStatus: 'deprecate_after_migration',
        canonicalTruth: false,
        mayCreateTypedRecords: false,
        mayUpdateClaimTrust: false,
      });
      expect(surface?.replacement).toContain('AITP');
      expect(surface?.boundaryRules.join('\n')).toMatch(/canonical|typed|trust/i);
    }
  });

  it('allows Hakimi ResearchAction to execute configured AITP writes without becoming trust authority', () => {
    expect(getResearchGraphBoundarySurface('hakimi.research-action')).toMatchObject({
      owner: 'hakimi',
      authority: 'runtime_controller',
      canonicalTruth: false,
      mayCreateTypedRecords: true,
      mayUpdateClaimTrust: false,
    });
    expect(
      getResearchGraphBoundarySurface('hakimi.research-action')?.boundaryRules.join('\n'),
    ).toContain('AITP write bridges');
  });

  it('keeps RAG, evals, and derived AITP surfaces non-evidentiary by contract', () => {
    for (const id of [
      'aitp.execution-brief',
      'aitp.process-graph-slice',
      'aitp.claim-relation-map',
      'aitp.curated-rag',
      'hakimi.eval-harness',
    ]) {
      const surface = getResearchGraphBoundarySurface(id);
      expect(surface?.canonicalTruth, id).toBe(false);
      expect(surface?.mayUpdateClaimTrust, id).toBe(false);
      expect(surface?.boundaryRules.join('\n'), id).toMatch(
        /not evidence|not be cited as evidence|not scientific evidence|orientation-only|Claim support requires|recovery guidance/i,
      );
    }
  });

  it('renders a concise operator-readable contract summary', () => {
    const rendered = renderResearchGraphBoundaryContract();
    expect(rendered).toContain('aitp.typed-record-kernel');
    expect(rendered).toContain('hakimi.research-ledger');
    expect(rendered).toContain('replacement: AITP typed evidence/tool_run/artifact/exploratory_record records');
  });
});
