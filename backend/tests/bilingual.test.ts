/**
 * Bilingual / regional-language narration scoring.
 *
 * The deterministic (no-LLM) path historically matched English keywords only,
 * which scored Hindi/Marathi speakers at ~0. These tests lock in the fix:
 *  - `normLang` normalises BCP-47-ish tags to en/hi/mr
 *  - `keywordsHi`/`keywordsMr` participate when the transcript is regional
 *  - code-mixed/Hinglish still matches English keywords
 *  - unstoppable Devanagari narration never gets a silent zero (routes to human)
 */
import { describe, expect, it } from 'vitest';
import type { PerformanceCriterion, Task } from '@sih/contracts';
import { keywordScore, normLang } from '../src/services/analysis.service.js';

const pc = (
  id: string,
  keywords: string[],
  keywordsHi: string[] = [],
  keywordsMr: string[] = [],
): PerformanceCriterion => ({ id, text: id, criticalSafety: false, keywords, keywordsHi, keywordsMr });

const narrationTask = (refs: string[]): Task =>
  ({
    id: 't1',
    type: 'narration',
    title: { en: 'Explain the work you did' },
    brief: undefined,
    nosRefs: ['PSC/N0130'],
    criteriaRefs: refs,
    weight: 100,
    criticalSafety: false,
    checklistFrom: 'criteria',
    checklistItems: [],
    mcqIds: [],
  }) as unknown as Task;

const mapOf = (...pcs: PerformanceCriterion[]) => new Map(pcs.map((p) => [p.id, p]));

describe('normLang', () => {
  it('maps regional tags to en/hi/mr and unknown languages to en', () => {
    expect(normLang('hi-IN')).toBe('hi');
    expect(normLang('HI')).toBe('hi');
    expect(normLang('mr')).toBe('mr');
    expect(normLang('en-US')).toBe('en');
    expect(normLang(undefined)).toBe('en');
    expect(normLang('ta')).toBe('en');
  });
});

describe('keywordScore — regional narration', () => {
  const pcs = mapOf(
    pc(
      'PSC-N0130-PC1',
      ['pipe cutter', 'deburring'],
      ['पाइप कटर', 'डिबरिंग'],
      ['पाइप कटर'],
    ),
  );
  const task = narrationTask(['PSC-N0130-PC1']);

  it('matches English keywords in a code-mixed/Hinglish transcript', () => {
    const out = keywordScore(task, pcs, 'I used a pipe cutter and did deburring before fitting', 'en');
    expect(out.hits).toContain('pipe cutter');
    expect(out.coverage).toBeGreaterThan(0);
    expect(out.devanagari).toBe(false);
  });

  it('matches Devanagari keywords for a Hindi transcript (no longer a zero)', () => {
    const out = keywordScore(task, pcs, 'मैंने पाइप कटर से पाइप काटा और डिबरिंग की', 'hi');
    expect(out.devanagari).toBe(true);
    expect(out.hits).toContain('पाइप कटर');
    expect(out.coverage).toBeGreaterThan(0);
  });

  it('matches Marathi keywords for a Marathi transcript', () => {
    const out = keywordScore(task, pcs, 'मी पाइप कटर वापरला', 'mr');
    expect(out.hits).toContain('पाइप कटर');
  });

  it('tries regional keywords even when the declared language is English but the text is Devanagari', () => {
    const out = keywordScore(task, pcs, 'पाइप कटर', 'en');
    expect(out.devanagari).toBe(true);
    expect(out.hits).toContain('पाइप कटर');
  });

  it('flags unstoppable regional narration for human review when no regional keywords exist', () => {
    const englishOnly = mapOf(pc('X-PC1', ['pipe cutter']));
    const out = keywordScore(narrationTask(['X-PC1']), englishOnly, 'मैंने पाइप काटा', 'hi');
    expect(out.devanagari).toBe(true);
    expect(out.hits).toHaveLength(0);
    expect(out.coverage).toBe(0);
  });

  it('ignores punctuation when matching ("pipe-cutter" still hits)', () => {
    const out = keywordScore(task, pcs, 'pipe-cutter, deburring.', 'en');
    expect(out.hits).toContain('pipe cutter');
    expect(out.hits).toContain('deburring');
  });
});
