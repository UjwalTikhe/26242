/**
 * Trade pack tests:
 *  1. every pack file validates against the contract TradePack schema
 *  2. internal referential integrity (nosRefs / criteriaRefs / mcqIds / weights)
 *  3. content guarantees the assessment pipeline depends on
 *  4. public /trades endpoints
 */
import { describe, expect, it } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';
import { TradePack, type TradePack as TradePackT } from '@sih/contracts';
import { createApp } from '../src/app.js';

const PACKS_DIR = path.join(process.cwd(), 'src', 'data', 'trade-packs');

async function loadPacks(): Promise<Array<{ file: string; pack: TradePackT }>> {
  const files = (await readdir(PACKS_DIR)).filter((f) => f.endsWith('.json')).sort();
  expect(files.length).toBeGreaterThanOrEqual(2);
  const out: Array<{ file: string; pack: TradePackT }> = [];
  for (const file of files) {
    const raw = await readFile(path.join(PACKS_DIR, file), 'utf8');
    const pack = TradePack.parse(JSON.parse(raw)); // throws on schema violation
    out.push({ file, pack });
  }
  return out;
}

describe('trade pack files', () => {
  it('every pack parses against the contract schema and matches its file name', async () => {
    const packs = await loadPacks();
    const ids = packs.map((p) => p.pack.id);
    expect(ids).toContain('electrician');
    expect(ids).toContain('welder');
    for (const { file, pack } of packs) {
      expect(pack.id).toBe(path.basename(file, '.json'));
    }
  });

  it('every pack cites at least one source with a confidence marker', async () => {
    for (const { pack } of await loadPacks()) {
      expect(pack.sources.length).toBeGreaterThanOrEqual(1);
      for (const s of pack.sources) {
        expect(['verified', 'estimated']).toContain(s.confidence);
        expect(s.title.length).toBeGreaterThan(0);
      }
      // at least one source should point at a real document URL
      expect(pack.sources.some((s) => s.url !== undefined)).toBe(true);
    }
  });

  it('internal references resolve: nosRefs, criteriaRefs, mcqIds', async () => {
    for (const { pack } of await loadPacks()) {
      const nosCodes = new Set(pack.nos.map((n) => n.code));
      const pcIds = new Set(pack.nos.flatMap((n) => n.performanceCriteria.map((p) => p.id)));
      const mcqIds = new Set(pack.mcqBank.map((m) => m.id));
      const taskIds = new Set<string>();

      for (const nos of pack.nos) {
        expect(nos.performanceCriteria.length).toBeGreaterThanOrEqual(1);
        for (const pc of nos.performanceCriteria) {
          expect(pcIds.has(pc.id)).toBe(true);
          expect(pc.keywords.length).toBeGreaterThanOrEqual(3);
        }
      }
      for (const task of pack.taskBlueprints) {
        expect(taskIds.has(task.id)).toBe(false); // unique ids
        taskIds.add(task.id);
        expect(task.nosRefs.length).toBeGreaterThanOrEqual(1);
        for (const ref of task.nosRefs) expect(nosCodes.has(ref)).toBe(true);
        for (const ref of task.criteriaRefs) expect(pcIds.has(ref)).toBe(true);
        for (const ref of task.mcqIds) expect(mcqIds.has(ref)).toBe(true);
      }
      for (const bt of pack.bridgeTraining) {
        for (const ref of bt.nosRefs) expect(nosCodes.has(ref)).toBe(true);
      }
    }
  });

  it('MCQs reference real NOS codes, options and answers are consistent', async () => {
    for (const { pack } of await loadPacks()) {
      const nosCodes = new Set(pack.nos.map((n) => n.code));
      expect(pack.mcqBank.length).toBeGreaterThanOrEqual(24);
      const topics = new Set(pack.mcqBank.map((m) => m.topic));
      expect(topics).toContain('safety');
      expect(topics).toContain('tools');
      expect(topics).toContain('theory');
      for (const mcq of pack.mcqBank) {
        const optionIds = mcq.options.map((o) => o.id);
        expect(new Set(optionIds).size).toBe(optionIds.length);
        expect(optionIds).toContain(mcq.correctOptionId);
        expect(optionIds.length).toBeGreaterThanOrEqual(2);
        for (const ref of mcq.nosRefs) expect(nosCodes.has(ref)).toBe(true);
        expect(mcq.explanation).toBeDefined();
      }
    }
  });

  it('task blueprints: six task types, weights sum to 100, evidence specs sane', async () => {
    for (const { pack } of await loadPacks()) {
      const types = new Set(pack.taskBlueprints.map((t) => t.type));
      for (const required of ['mcq', 'tool_identification', 'checklist', 'practical_photo', 'practical_video', 'narration']) {
        expect(types).toContain(required);
      }

      const weightSum = pack.taskBlueprints.reduce((acc, t) => acc + t.weight, 0);
      expect(weightSum).toBeCloseTo(100, 5);

      for (const task of pack.taskBlueprints) {
        if (task.type === 'practical_photo') {
          expect(task.evidenceSpec).toBeDefined();
          expect(task.evidenceSpec?.media).toContain('photo');
          expect(task.evidenceSpec?.requireGps).toBe(true);
          expect(task.evidenceSpec?.requireWorkerInFrame).toBe(true);
        }
        if (task.type === 'practical_video') {
          expect(task.evidenceSpec?.media).toContain('video');
        }
        if (task.type === 'narration') {
          expect(task.evidenceSpec?.media).toContain('audio');
        }
        if (task.type === 'tool_identification') {
          expect(task.toolPickCount).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it('critical-safety coverage: critical PCs, critical tasks, criticalMustPass', async () => {
    for (const { pack } of await loadPacks()) {
      const criticalPcs = pack.nos.flatMap((n) => n.performanceCriteria).filter((p) => p.criticalSafety);
      expect(criticalPcs.length).toBeGreaterThanOrEqual(1);

      const criticalTasks = pack.taskBlueprints.filter((t) => t.criticalSafety);
      expect(criticalTasks.length).toBeGreaterThanOrEqual(1);

      expect(pack.thresholds.criticalMustPass).toBe(true);
      expect(pack.thresholds.overallPass).toBeGreaterThan(0);
      expect(pack.thresholds.perTaskPass).toBeLessThan(pack.thresholds.overallPass);
      expect(pack.safetyTopics.length).toBeGreaterThanOrEqual(10);
      expect(pack.tools.length).toBeGreaterThanOrEqual(5);
    }
  });

  it('level bands are ascending, non-overlapping and bridge band fits between them', async () => {
    for (const { pack } of await loadPacks()) {
      const bands = pack.thresholds.levelBands;
      expect(bands.length).toBeGreaterThanOrEqual(3);
      for (let i = 0; i < bands.length; i++) {
        expect(bands[i].minScore).toBeLessThan(bands[i].maxScore);
        if (i > 0) {
          expect(bands[i].minScore).toBeGreaterThanOrEqual(bands[i - 1].maxScore);
        }
      }
      const { bridgeBand } = pack.thresholds;
      expect(bridgeBand.minScore).toBeLessThan(bridgeBand.maxScore);
      expect(bridgeBand.minScore).toBeGreaterThanOrEqual(0);
      expect(bridgeBand.maxScore).toBeLessThanOrEqual(1);
    }
  });
});

describe('GET /api/v1/trades (public)', () => {
  const app = createApp();

  it('lists pack summaries without authentication', async () => {
    const res = await request(app).get('/api/v1/trades');
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(2);
    const electrician = res.body.items.find((i: { id: string }) => i.id === 'electrician');
    expect(electrician).toBeDefined();
    expect(electrician.title.en.length).toBeGreaterThan(0);
    expect(electrician.qp.nsqfLevel).toBeGreaterThanOrEqual(1);
    // summaries must NOT include the full pack payload
    expect(electrician.nos).toBeUndefined();
    expect(electrician.mcqBank).toBeUndefined();
    expect(electrician.taskBlueprints).toBeUndefined();
  });

  it('returns the full pack for a known id', async () => {
    const res = await request(app).get('/api/v1/trades/welder');
    expect(res.status).toBe(200);
    TradePack.parse(res.body);
    expect(res.body.id).toBe('welder');
    expect(res.body.taskBlueprints.length).toBeGreaterThanOrEqual(8);
  });

  it('404s for an unknown pack id', async () => {
    const res = await request(app).get('/api/v1/trades/rocket-scientist');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });
});
