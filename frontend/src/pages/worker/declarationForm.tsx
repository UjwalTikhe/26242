import { useState } from 'react';
import type { DeclarationAnswers } from '@sih/contracts';
import { Button, Card, Field } from '../../components/ui';
import { TagList } from '../../components/inputs';
import { useLang } from '../../store/providers';

const WORK_SUGGESTIONS = ['wiring', 'panel installation', 'conduit work', 'motor repair', 'welding', 'fabrication', 'pipe fitting', 'plumbing', 'masonry', 'tiling', 'plastering'];
const TOOL_SUGGESTIONS = ['multimeter', 'clamp meter', 'screwdriver set', 'pliers', 'drill machine', 'pipe wrench', 'welding machine', 'trowel', 'spirit level', 'hammer', 'measuring tape'];
const TASK_SUGGESTIONS = ['house wiring', 'MCB/RCCB fitting', 'earthing', 'machine maintenance', 'arc welding', 'gas welding', 'pipe threading', 'drainage fitting', 'brickwork', 'concrete mixing'];
const SECTOR_SUGGESTIONS = ['construction', 'manufacturing', 'power & utilities', 'real estate', 'repair services', 'fabrication shop'];
const EMPLOYMENT_SUGGESTIONS = ['self-employed', 'daily wage', 'contractor', 'factory employee', 'apprentice'];

export function DeclarationForm({
  initial, onSubmit, busy,
}: {
  initial?: Partial<DeclarationAnswers>;
  onSubmit: (answers: DeclarationAnswers) => Promise<void> | void;
  busy?: boolean;
}) {
  const { t } = useLang();
  const [years, setYears] = useState<number>(initial?.yearsExperience ?? 0);
  const [workTypes, setWorkTypes] = useState<string[]>(initial?.workTypes ?? []);
  const [toolsUsed, setToolsUsed] = useState<string[]>(initial?.toolsUsed ?? []);
  const [tasksCanPerform, setTasks] = useState<string[]>(initial?.tasksCanPerform ?? []);
  const [sectors, setSectors] = useState<string[]>(initial?.sectors ?? []);
  const [employmentTypes, setEmployment] = useState<string[]>(initial?.employmentTypes ?? []);
  const [notes, setNotes] = useState(initial?.notes ?? '');

  return (
    <Card title={t('declarationTitle')}>
      <p className="text-muted text-sm">{t('declarationTitle')} | {t('govt')}</p>

      <Field label={t('yearsExperience')}>
        <input className="digi-input" type="number" min={0} max={60} value={years} onChange={(e) => setYears(Number(e.target.value))} />
      </Field>

      <Field label={t('workTypes')}>
        <TagList value={workTypes} onChange={setWorkTypes} placeholder="Add type of work..." suggestions={WORK_SUGGESTIONS} />
      </Field>

      <Field label={t('toolsUsed')}>
        <TagList value={toolsUsed} onChange={setToolsUsed} placeholder="Add a tool..." suggestions={TOOL_SUGGESTIONS} />
      </Field>

      <Field label={t('tasksCanPerform')}>
        <TagList value={tasksCanPerform} onChange={setTasks} placeholder="Add a task..." suggestions={TASK_SUGGESTIONS} />
      </Field>

      <Field label={t('sectors')} optional>
        <TagList value={sectors} onChange={setSectors} placeholder="Add a sector..." suggestions={SECTOR_SUGGESTIONS} />
      </Field>

      <Field label={t('employment')} optional>
        <TagList value={employmentTypes} onChange={setEmployment} placeholder="Add employment type..." suggestions={EMPLOYMENT_SUGGESTIONS} />
      </Field>

      <Field label={t('notes')} optional>
        <textarea className="digi-textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <Button
        variant="saffron"
        disabled={busy || workTypes.length === 0}
        onClick={() =>
          onSubmit({
            yearsExperience: Number(years) || 0,
            workTypes,
            toolsUsed,
            tasksCanPerform,
            sectors,
            employmentTypes,
            notes: notes.trim() || undefined,
          })
        }
      >
        {busy ? '...' : t('submitDeclaration')}
      </Button>
    </Card>
  );
}