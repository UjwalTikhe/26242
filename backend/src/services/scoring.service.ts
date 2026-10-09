/**
 * Scoring engine: turns a plan + review (or AI suggestions) into the aggregate
 * numbers the competency report is built from.
 *
 * Precedence per task: assessor `finalScore` (ReviewItem) > AI `aiScore`.
 * The overall is a weight-normalized average over the tasks that actually have
 * a score; `coverage` tells the report how much of the plan that represents.
 * Critical-safety tasks must be both scored and above the per-task floor to
 * avoid vetoing the pass (packs set `criticalMustPass`).
 *
 * Pure `buildScoreSummary` (unit-tested) + `computeScoreSummary` (loads docs).
 */
import type {
  AIItemScore,
  LevelBand,
  ReportRecommendation,
  ReviewItem,
  SkillResult,
  Task,
  TradePack,
} from '@sih/contracts';
import { notFound } from '../errors.js';
import { AIAnalysis } from '../models/analysis.models.js';
import { Assessment, AssessmentPlan, Declaration } from '../models/assessment.models.js';
import { AssessorReview } from '../models/review.models.js';
import { getTradePack } from './tradepack.service.js';

export interface TaskScore {
  taskId: string;
  nosRefs: string[];
  weight: number;
  score: number | null;
  source: 'review' | 'ai' | 'auto' | 'none';
  criticalSafety: boolean;
}

export interface ScoreSummary {
  /** 0..100, two decimals. */
  overallScore: number;
  /** 0..1 weighted average over scored tasks. */
  normalizedScore: number;
  /** Fraction of total plan weight that had a score. */
  coverage: number;
  skillsPassed: SkillResult[];
  skillsNeedingImprovement: SkillResult[];
  criticalSafetyPassed: boolean;
  consistencyScore: number;
  assessorOverrides: number;
  currentNsqfLevel: number;
  suggestedNsqfLevel: number;
  recommendation: ReportRecommendation;
  items: TaskScore[];
}

export interface SummaryInput {
  tradePackId: string;
  nsqfLevel: number;
  totalWeight: number;
  tasks: Task[];
  pack: TradePack;
  analysis?: { items: AIItemScore[] } | null;
  review?: { items: ReviewItem[] } | null;
  declaration?: { answers: Record<string, unknown> } | null;
}

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const round2 = (x: number) => Math.round(x * 100) / 100;

function pickLevel(bands: LevelBand[], score: number): number | undefined {
  const inBand = bands.find((b) => score >= b.minScore && score <= b.maxScore);
  if (inBand) return inBand.level;
  if (bands.length === 0) return undefined;
  // nearest band by center distance
  return [...bands]
    .sort(
      (a, b) =>
        Math.abs((a.minScore + a.maxScore) / 2 - score) -
        Math.abs((b.minScore + b.maxScore) / 2 - score),
    )[0].level;
}

function recommend(a: {
  normalized: number;
  criticalSafetyPassed: boolean;
  needsImprovement: boolean;
  overallPass: number;
  bridgeMin: number;
}): ReportRecommendation {
  if (!a.criticalSafetyPassed) return 'not_certified';
  if (a.normalized >= a.overallPass) return a.needsImprovement ? 'certify_with_bridge' : 'certify';
  if (a.normalized >= a.bridgeMin) return 'reassess';
  return 'not_certified';
}

export function buildScoreSummary(input: SummaryInput): ScoreSummary {
  const { pack, tasks } = input;
  const reviewByTask = new Map((input.review?.items ?? []).map((i) => [i.taskId, i]));
  const aiByTask = new Map((input.analysis?.items ?? []).map((i) => [i.taskId, i]));
  const perTaskPass = pack.thresholds.perTaskPass;

  const items: TaskScore[] = tasks.map((task) => {
    const review = reviewByTask.get(task.id);
    const ai = aiByTask.get(task.id);
    let score: number | null = null;
    let source: TaskScore['source'] = 'none';
    if (review) {
      score = clamp(review.finalScore);
      source = 'review';
    } else if (ai && ai.aiScore !== null && ai.aiScore !== undefined) {
      score = clamp(ai.aiScore);
      source = ai.routing === 'auto' ? 'auto' : 'ai';
    }
    return {
      taskId: task.id,
      nosRefs: task.nosRefs ?? [],
      weight: task.weight,
      score,
      source,
      criticalSafety: Boolean(task.criticalSafety),
    };
  });

  const scored = items.filter((i) => i.score !== null);
  const weightScored = scored.reduce((acc, i) => acc + i.weight, 0);
  const normalized =
    weightScored > 0
      ? clamp(scored.reduce((acc, i) => acc + i.weight * (i.score as number), 0) / weightScored)
      : 0;

  const totalWeight = input.totalWeight > 0 ? input.totalWeight : tasks.reduce((a, t) => a + t.weight, 0);
  const coverage = totalWeight > 0 ? clamp(weightScored / totalWeight) : 0;

  const criticalTasks = items.filter((i) => i.criticalSafety);
  const criticalSafetyPassed = pack.thresholds.criticalMustPass
    ? criticalTasks.every((i) => i.score !== null && i.score >= perTaskPass)
    : true;

  const skillsPassed: SkillResult[] = [];
  const skillsNeedingImprovement: SkillResult[] = [];
  for (const nos of pack.nos) {
    const group = items.filter((i) => i.nosRefs.includes(nos.code));
    const groupScored = group.filter((i) => i.score !== null);
    if (groupScored.length === 0) continue;
    const w = groupScored.reduce((a, i) => a + i.weight, 0);
    const score = w > 0 ? clamp(groupScored.reduce((a, i) => a + i.weight * (i.score as number), 0) / w) : 0;
    const criticalSafety =
      nos.category === 'critical' || nos.category === 'safety' || group.some((i) => i.criticalSafety);
    const result: SkillResult = {
      nosRef: nos.code,
      title: nos.title,
      score,
      passed: score >= perTaskPass,
      criticalSafety,
    };
    (result.passed ? skillsPassed : skillsNeedingImprovement).push(result);
  }

  const declAnswers = (input.declaration?.answers ?? {}) as Record<string, unknown>;
  const years = typeof declAnswers.yearsExperience === 'number' ? declAnswers.yearsExperience : 0;
  const can = Array.isArray(declAnswers.tasksCanPerform) ? declAnswers.tasksCanPerform.length : 0;
  const self = clamp(Math.min(1, (years / 8) * 0.6 + (Math.min(can, 10) / 10) * 0.4));
  const consistencyScore = clamp(1 - Math.abs(self - normalized));

  const assessorOverrides = (input.review?.items ?? []).filter((i) => i.status === 'overridden').length;

  const suggestedNsqfLevel = pickLevel(pack.thresholds.levelBands, normalized) ?? input.nsqfLevel;

  const recommendation = recommend({
    normalized,
    criticalSafetyPassed,
    needsImprovement: skillsNeedingImprovement.length > 0,
    overallPass: pack.thresholds.overallPass,
    bridgeMin: pack.thresholds.bridgeBand.minScore,
  });

  return {
    overallScore: round2(normalized * 100),
    normalizedScore: normalized,
    coverage: round2(coverage),
    skillsPassed,
    skillsNeedingImprovement,
    criticalSafetyPassed,
    consistencyScore: round2(consistencyScore),
    assessorOverrides,
    currentNsqfLevel: input.nsqfLevel,
    suggestedNsqfLevel,
    recommendation,
    items,
  };
}

/** Load the current round's docs and compute the summary. */
export async function computeScoreSummary(assessmentId: string): Promise<ScoreSummary> {
  const assessment = await Assessment.findById(assessmentId).lean();
  if (!assessment) throw notFound('Assessment not found');
  const round = assessment.round;

  const [plan, analysis, review, declaration] = await Promise.all([
    AssessmentPlan.findOne({ assessmentId }).lean(),
    AIAnalysis.findOne({ assessmentId, round }).lean(),
    AssessorReview.findOne({ assessmentId, round }).lean(),
    Declaration.findOne({ assessmentId }).lean(),
  ]);
  if (!plan) throw notFound('Assessment plan not found — nothing to score');

  const pack = await getTradePack(plan.tradePackId);
  return buildScoreSummary({
    tradePackId: plan.tradePackId,
    nsqfLevel: plan.nsqfLevel,
    totalWeight: plan.totalWeight,
    tasks: (plan.tasks ?? []) as unknown as Task[],
    pack,
    analysis: analysis ? { items: analysis.items as AIItemScore[] } : null,
    review: review ? { items: review.items as ReviewItem[] } : null,
    declaration: declaration ? { answers: declaration.answers } : null,
  });
}
