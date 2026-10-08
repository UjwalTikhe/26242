import { describe, expect, it } from 'vitest';
import {
  ASSESSMENT_TRANSITIONS,
  ASSESSMENT_STATUSES,
  TradePack,
  canTransition,
  routes,
} from '@sih/contracts';

describe('contracts', () => {
  it('state machine: happy path and guard rails', () => {
    expect(canTransition('DRAFT', 'DECLARED')).toBe(true);
    expect(canTransition('SUBMITTED', 'AI_ANALYZED')).toBe(true);
    expect(canTransition('UNDER_REVIEW', 'REVIEWED')).toBe(true);
    expect(canTransition('UNDER_REVIEW', 'REASSESS')).toBe(true);
    expect(canTransition('REASSESS', 'IN_PROGRESS')).toBe(true);

    // illegal jumps
    expect(canTransition('DRAFT', 'APPROVED')).toBe(false);
    expect(canTransition('IN_PROGRESS', 'APPROVED')).toBe(false);
    expect(canTransition('APPROVED', 'REJECTED')).toBe(false);
    expect(canTransition('REVIEWED', 'DRAFT')).toBe(false);
  });

  it('every status has a transition entry, terminal states are empty', () => {
    for (const s of ASSESSMENT_STATUSES) {
      expect(ASSESSMENT_TRANSITIONS[s]).toBeDefined();
    }
    expect(ASSESSMENT_TRANSITIONS.APPROVED).toHaveLength(0);
    expect(ASSESSMENT_TRANSITIONS.REJECTED).toHaveLength(0);
    // no orphan states: everything reachable from DRAFT
    const seen = new Set<string>(['DRAFT']);
    let changed = true;
    while (changed) {
      changed = false;
      for (const from of [...seen]) {
        for (const to of ASSESSMENT_TRANSITIONS[from as (typeof ASSESSMENT_STATUSES)[number]]) {
          if (!seen.has(to)) {
            seen.add(to);
            changed = true;
          }
        }
      }
    }
    expect([...seen].sort()).toEqual([...ASSESSMENT_STATUSES].sort());
  });

  it('route registry has unique method+path pairs', () => {
    const keys = routes.map((r) => `${r.method.toUpperCase()} ${r.path}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(routes.length).toBeGreaterThan(30);
  });

  it('trade pack schema requires sources + thresholds + blueprints', () => {
    const minimal = {
      schemaVersion: 1,
      id: 'x',
      title: { en: 'X' },
      qp: { title: 'QP', nsqfLevel: 4 },
      sources: [{ title: 's', confidence: 'verified' }],
      nos: [{ code: 'N1', title: 'n', category: 'core', performanceCriteria: [{ id: 'pc1', text: 't' }] }],
      tools: [{ id: 't1', name: { en: 'Tool' } }],
      taskBlueprints: [
        {
          id: 'tb1',
          type: 'mcq',
          title: { en: 'Q' },
          nosRefs: ['N1'],
          weight: 10,
        },
      ],
      thresholds: {
        overallPass: 0.7,
        perTaskPass: 0.6,
        levelBands: [{ level: 4, minScore: 0.7, maxScore: 1 }],
        bridgeBand: { minScore: 0.5, maxScore: 0.7 },
      },
    };
    const parsed = TradePack.safeParse(minimal);
    expect(parsed.success).toBe(true);
  });
});
