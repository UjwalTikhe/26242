/**
 * Deterministic objective grading (answer key) — NEVER AI.
 *
 * Only the three objective task types have a deterministic answer:
 *   - mcq / tool_identification → `correctIds` vs `selectedOptionIds`
 *   - checklist                 → `checklistItems[].id` vs `checkedItemIds`
 *
 * Evidence-based tasks (practical_photo/video, narration) are scored by the
 * AI pipeline (analysis.service) and are not handled here.
 *
 * The result is persisted on the TaskResponse as `autoScore`; changing the
 * answers unsets it (see answers.service), so a score always matches the
 * answers it graded.
 */
import type { AutoScore, Task, TaskAnswers } from '@sih/contracts';

export type ObjectiveTask = Pick<
  Task,
  'type' | 'correctIds' | 'criteriaRefs' | 'checklistItems' | 'criticalSafety'
>;

export const OBJECTIVE_TYPES = ['mcq', 'tool_identification', 'checklist'] as const;
export type ObjectiveType = (typeof OBJECTIVE_TYPES)[number];

export function isObjective(type: Task['type']): type is ObjectiveType {
  return (OBJECTIVE_TYPES as readonly string[]).includes(type);
}

const clamp = (x: number) => Math.max(0, Math.min(1, x));

/** Score one objective task against its answer key, or undefined if ungradeable. */
export function gradeObjective(task: ObjectiveTask, answers: TaskAnswers): AutoScore | undefined {
  const gradedAt = new Date().toISOString();
  const flat = (score: number) =>
    task.criteriaRefs.map((criterionRef) => ({ criterionRef, score: clamp(score) }));

  switch (task.type) {
    case 'mcq': {
      const key = task.correctIds ?? [];
      if (key.length === 0) return undefined;
      // single-answer MCQ: exact selection required (no partial credit)
      const selected = new Set(answers.selectedOptionIds ?? []);
      const exact = selected.size === 1 && selected.has(key[0]);
      const score = key.length === 1 ? (exact ? 1 : 0) : clamp(
        key.filter((id) => selected.has(id)).length / key.length,
      );
      return { score, perCriterion: flat(score), gradedAt };
    }

    case 'tool_identification': {
      const key = new Set(task.correctIds ?? []);
      if (key.size === 0) return undefined;
      const selected = new Set(answers.selectedOptionIds ?? []);
      let intersect = 0;
      for (const id of selected) if (key.has(id)) intersect += 1;
      const precision = selected.size > 0 ? intersect / selected.size : 0;
      const recall = intersect / key.size;
      // F1 balances picking wrong tools against missing required ones
      const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
      return { score: clamp(f1), perCriterion: flat(f1), gradedAt };
    }

    case 'checklist': {
      const items = task.checklistItems ?? [];
      if (items.length === 0) return undefined;
      const checked = new Set(answers.checkedItemIds ?? []);
      let hit = 0;
      const perCriterion: AutoScore['perCriterion'] = [];
      for (const item of items) {
        const score = checked.has(item.id) ? 1 : 0;
        hit += score;
        if (item.criterionRef) perCriterion.push({ criterionRef: item.criterionRef, score });
      }
      return { score: clamp(hit / items.length), perCriterion, gradedAt };
    }

    default:
      return undefined;
  }
}
