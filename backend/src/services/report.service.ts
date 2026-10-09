/**
 * Competency report generation.
 *
 * Wraps scoring.service's summary in the contract `CompetencyReport` shape and
 * derives bridge-training suggestions from the pack's `bridgeTraining` list for
 * every NOS the candidate fell below the per-task floor on. Idempotent per
 * (assessment, round): regenerating returns the existing report.
 */
import { randomUUID } from 'node:crypto';
import type { BridgeSuggestion, CompetencyReport, SkillResult } from '@sih/contracts';
import { notFound } from '../errors.js';
import type { AuthUser } from '../auth/jwt.js';
import { Assessment, AssessmentPlan } from '../models/assessment.models.js';
import { Report } from '../models/report.models.js';
import { toApi } from '../utils/toApi.js';
import { getAssessmentFor } from './assessment.service.js';
import { recordChange } from './changelog.service.js';
import { getTradePack } from './tradepack.service.js';
import { computeScoreSummary } from './scoring.service.js';

/** Map failed skills onto the pack's bridge-training catalogue (with fallback). */
export function buildBridgeTraining(
  pack: Awaited<ReturnType<typeof getTradePack>>,
  skillsNeedingImprovement: SkillResult[],
): BridgeSuggestion[] {
  const out: BridgeSuggestion[] = [];
  const seen = new Set<string>();

  for (const skill of skillsNeedingImprovement) {
    const matched = pack.bridgeTraining.filter(
      (b) =>
        b.nosRefs.includes(skill.nosRef) ||
        b.skillArea.toLowerCase() === skill.title.toLowerCase(),
    );
    if (matched.length > 0) {
      for (const m of matched) {
        if (seen.has(m.skillArea)) continue;
        seen.add(m.skillArea);
        out.push({ skillArea: m.skillArea, nosRefs: m.nosRefs, suggestion: m.suggestion });
      }
    } else {
      if (seen.has(skill.title)) continue;
      seen.add(skill.title);
      out.push({
        skillArea: skill.title,
        nosRefs: [skill.nosRef],
        suggestion: {
          en: `Bridge training and a targeted reassessment for ${skill.title}.`,
          hi: `${skill.title} के लिए पुल प्रशिक्षण और लक्षित पुनर्मूल्यांकन।`,
        },
      });
    }
  }
  return out;
}

export async function generateReport(assessmentId: string): Promise<CompetencyReport> {
  const assessment = await Assessment.findById(assessmentId).lean();
  if (!assessment) throw notFound('Assessment not found');
  const round = assessment.round;

  const existing = await Report.findOne({ assessmentId, round }).lean();
  if (existing) return toApi(existing);

  const [summary, plan] = await Promise.all([
    computeScoreSummary(assessmentId),
    AssessmentPlan.findOne({ assessmentId }).lean(),
  ]);
  if (!plan) throw notFound('Assessment plan not found — nothing to report');

  const pack = await getTradePack(plan.tradePackId);
  const bridgeTraining = buildBridgeTraining(pack, summary.skillsNeedingImprovement);

  const recommendationText: Record<typeof summary.recommendation, string> = {
    certify: 'Competency certified.',
    certify_with_bridge: 'Certified with bridge training recommended for weak areas.',
    reassess: 'Reassessment recommended before certification.',
    not_certified: 'Critical safety competencies were not met — not certified.',
  };

  const now = new Date();
  const doc = await Report.create({
    _id: randomUUID(),
    assessmentId,
    workerId: assessment.workerId,
    round,
    tradePackId: plan.tradePackId,
    qpTitle: plan.qpTitle,
    overallScore: summary.overallScore,
    skillsPassed: summary.skillsPassed,
    skillsNeedingImprovement: summary.skillsNeedingImprovement,
    currentNsqfLevel: summary.currentNsqfLevel,
    suggestedNsqfLevel: summary.suggestedNsqfLevel,
    recommendation: summary.recommendation,
    consistencyScore: summary.consistencyScore,
    assessorOverrides: summary.assessorOverrides,
    criticalSafetyPassed: summary.criticalSafetyPassed,
    bridgeTraining,
    summary: {
      en: `Overall ${summary.overallScore}/100. ${recommendationText[summary.recommendation]}`,
    },
    generatedAt: now,
  });

  await recordChange({
    entity: 'report',
    id: doc._id,
    ownerId: assessment.workerId,
    updatedAt: now,
    data: toApi(doc.toObject()),
  });
  return toApi(doc.toObject());
}

export async function getReportFor(assessmentId: string, user: AuthUser): Promise<unknown> {
  await getAssessmentFor(assessmentId, user);
  const doc = await Report.findOne({ assessmentId }).sort({ round: -1 }).lean();
  if (!doc) throw notFound('No competency report generated for this assessment yet');
  return toApi(doc);
}
