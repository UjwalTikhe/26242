/**
 * Fairness analytics.
 *
 * Descriptive statistics only: how candidate outcomes distribute across
 * language / gender / region buckets. This is deliberately informational — no
 * automated decision in the pipeline consumes these attributes, and the note
 * returned to the client says so. Buckets are computed by joining assessments
 * with the worker profile (for the attribute) and the latest competency report +
 * decision (for the outcome).
 */
import type { z } from 'zod';
import { FairnessRes } from '@sih/contracts';
import { Assessment } from '../models/assessment.models.js';
import { WorkerProfile } from '../models/profile.models.js';
import { Report } from '../models/report.models.js';
import { Decision } from '../models/review.models.js';

type Bucket = z.infer<typeof FairnessRes>['buckets'][number];
type Dimension = Bucket['dimension'];

const round2 = (n: number) => Math.round(n * 100) / 100;

interface Group {
  count: number;
  scoreSum: number;
  scoreN: number;
  approved: number;
  decided: number;
}

export async function computeFairness(): Promise<z.infer<typeof FairnessRes>> {
  const assessments = await Assessment.find({
    status: { $in: ['AI_ANALYZED', 'UNDER_REVIEW', 'REVIEWED', 'APPROVED', 'REJECTED'] },
  }).lean();

  const assessmentIds = assessments.map((a) => a._id);
  const workerIds = [...new Set(assessments.map((a) => a.workerId))];

  const [profiles, reports, decisions] = await Promise.all([
    WorkerProfile.find({ userId: { $in: workerIds } }).lean(),
    assessmentIds.length
      ? Report.find({ assessmentId: { $in: assessmentIds } }).sort({ round: 1 }).lean()
      : Promise.resolve([]),
    assessmentIds.length
      ? Decision.find({ assessmentId: { $in: assessmentIds } }).lean()
      : Promise.resolve([]),
  ]);

  const profileByUser = new Map(profiles.map((p) => [p.userId, p]));
  // latest round report wins
  const reportByAssessment = new Map<string, (typeof reports)[number]>();
  for (const r of reports) reportByAssessment.set(r.assessmentId, r);
  const decisionByAssessment = new Map(decisions.map((d) => [d.assessmentId, d]));

  const pickers: Record<Dimension, (a: (typeof assessments)[number]) => string> = {
    language: (a) => a.language ?? profileByUser.get(a.workerId)?.language ?? 'unknown',
    gender: (a) => profileByUser.get(a.workerId)?.gender ?? 'unknown',
    region: (a) => profileByUser.get(a.workerId)?.region?.state ?? 'unknown',
  };

  const buckets: Bucket[] = [];
  for (const [dimension, pick] of Object.entries(pickers) as [Dimension, (a: (typeof assessments)[number]) => string][]) {
    const groups = new Map<string, Group>();
    for (const a of assessments) {
      const value = pick(a) || 'unknown';
      let g = groups.get(value);
      if (!g) {
        g = { count: 0, scoreSum: 0, scoreN: 0, approved: 0, decided: 0 };
        groups.set(value, g);
      }
      g.count += 1;

      const report = reportByAssessment.get(a._id);
      if (report) {
        g.scoreSum += report.overallScore;
        g.scoreN += 1;
      }
      const decision = decisionByAssessment.get(a._id);
      if (decision) {
        g.decided += 1;
        if (decision.outcome === 'APPROVED') g.approved += 1;
      }
    }

    for (const [value, g] of groups) {
      buckets.push({
        dimension,
        value,
        count: g.count,
        avgScore: g.scoreN ? round2(g.scoreSum / g.scoreN) : 0,
        approvalRate: g.decided ? round2(g.approved / g.decided) : 0,
      });
    }
  }

  buckets.sort((a, b) => a.dimension.localeCompare(b.dimension) || a.value.localeCompare(b.value));

  return {
    buckets,
    note: 'Descriptive only — no automated decision uses language, gender, or region.',
  };
}
