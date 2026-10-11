import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { PublicTask } from '@sih/contracts';
import { getPlan, listAnswers, submitAnswers, submitAssessment } from '../../lib/client';
import { useLang, useToast } from '../../store/providers';
import { AppShell } from '../../components/layout';
import { Alert, Button, Card, ErrorBox, Loading, StatusBadge } from '../../components/ui';
import { EvidenceCapture } from '../../components/EvidenceCapture';
import { useLocalized } from '../../components/helpers';

export default function TaskRunner() {
  const { id = '' } = useParams();
  const { t, lang } = useLang();
  const toast = useToast().toast;
  const qc = useQueryClient();
  const loc = useLocalized();
  const navigate = useNavigate();
  const [current, setCurrent] = useState(0);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const pq = useQuery({ queryKey: ['plan', id], queryFn: () => getPlan(id), retry: false });
  const aq = useQuery({ queryKey: ['answers', id], queryFn: () => listAnswers(id), retry: false });

  const tasks = pq.data?.tasks ?? [];
  const answered = useMemo(() => new Set((aq.data?.items ?? []).map((r) => r.taskId)), [aq.data]);

  useEffect(() => {
    if (tasks.length && current >= tasks.length) setCurrent(0);
  }, [tasks.length, current]);

  const task: PublicTask | undefined = tasks[current];
  const allDone = tasks.length > 0 && tasks.every((tk) => answered.has(tk.id));

  if (pq.isLoading) return <AppShell><Loading /></AppShell>;
  if (pq.isError) return <AppShell><ErrorBox error={pq.error} retry={() => pq.refetch()} /></AppShell>;

  async function saveAnswer(taskId: string, answers: { selectedOptionIds?: string[]; checkedItemIds?: string[]; textAnswer?: string }) {
    setSaving(true);
    try {
      await submitAnswers(id, taskId, answers);
      await qc.invalidateQueries({ queryKey: ['answers', id] });
      toast(t('taskSaved'), 'ok');
      const next = tasks.findIndex((tk, i) => i > current && !answered.has(tk.id));
      if (next >= 0) setCurrent(next);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err');
    } finally {
      setSaving(false);
    }
  }

  async function finish() {
    setSubmitting(true);
    try {
      await submitAssessment(id);
      toast(t('submittedYes'), 'ok');
      navigate(`/worker/a/${id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <div className="digi-toolbar justify-between">
        <div>
          <h1 className="mt-0 mb-0">{t('planTitle')}</h1>
          <p className="text-muted text-sm mt-0">{pq.data ? loc(pq.data.qpTitle) : ''} | NSQF {pq.data?.nsqfLevel}</p>
        </div>
        <Link className="digi-btn digi-btn-ghost digi-btn-sm digi-btn-inline" to={`/worker/a/${id}`} style={{ textDecoration: 'none' }}>{t('back')}</Link>
      </div>

      {/* Task navigation - horizontal scrollable pills on mobile */}
      <Card>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8 }}>
          {tasks.map((tk, i) => (
            <button
              key={tk.id}
              onClick={() => setCurrent(i)}
              className={`digi-btn digi-btn-sm digi-btn-inline ${i === current ? 'digi-btn-primary' : 'digi-btn-outline'}`}
              style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              {answered.has(tk.id) ? '[done] ' : `${i + 1}. `}
              {loc(tk.title).slice(0, 20)}
              {tk.criticalSafety && ' [!]'}
            </button>
          ))}
        </div>
        <hr className="digi-divider" />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="text-sm text-muted">{answered.size} / {tasks.length} {t('finishTask')}</span>
          <Button
            variant="saffron"
            className="digi-btn-sm digi-btn-inline"
            disabled={!allDone || submitting}
            onClick={finish}
          >
            {submitting ? '...' : t('submitAssessment')}
          </Button>
        </div>
        {!allDone && <p className="text-sm text-muted mt-8">{t('allTasksDone')}: {answered.size}/{tasks.length}</p>}
      </Card>

      {/* Current Task */}
      <Card
        title={t('taskOf', { i: current + 1, n: tasks.length })}
        actions={task?.criticalSafety ? <span className="digi-pill digi-pill-red">[!] Critical safety</span> : undefined}
      >
        {task && <TaskForm
          key={task.id}
          task={task}
          lang={lang}
          busy={saving}
          onSave={(answers) => saveAnswer(task.id, answers)}
          assessmentId={id}
        />}
      </Card>
    </AppShell>
  );
}

function TaskForm({
  task, lang, busy, onSave, assessmentId,
}: {
  task: PublicTask;
  lang: string;
  busy: boolean;
  onSave: (a: { selectedOptionIds?: string[]; checkedItemIds?: string[]; textAnswer?: string }) => void;
  assessmentId: string;
}) {
  const { t } = useLang();
  const loc = useLocalized();
  const [sel, setSel] = useState<string[]>([]);
  const [checked, setChecked] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [narrated, setNarrated] = useState('');

  const toggle = (arr: string[], set: (v: string[]) => void, id: string) =>
    set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

  return (
    <div>
      <h3 className="mb-4">{loc(task.title)}</h3>
      {task.brief && <p className="text-muted">{loc(task.brief)}</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <span className="digi-chip">{task.type.replace(/_/g, ' ')}</span>
        <span className="digi-chip">{t('weight')}: {task.weight}%</span>
        {task.nosRefs.map((n) => <span key={n} className="digi-chip">{n}</span>)}
      </div>

      {(task.type === 'mcq' || task.type === 'tool_identification') && (
        <div className="digi-check-group">
          <label className="digi-label">{task.type === 'mcq' ? t('mcqTitle') : t('toolPickTitle')}</label>
          {task.presentedOptions.map((o) => (
            <label key={o.id} className={`digi-check-item${sel.includes(o.id) ? ' selected' : ''}`}>
              <input
                type="checkbox"
                checked={sel.includes(o.id)}
                onChange={() => toggle(sel, setSel, o.id)}
              />
              <span>{loc(o.text)}</span>
            </label>
          ))}
        </div>
      )}

      {task.type === 'checklist' && (
        <div className="digi-check-group">
          <label className="digi-label">{t('checklistTitle')}</label>
          {task.checklistItems.map((ci) => (
            <label key={ci.id} className={`digi-check-item${checked.includes(ci.id) ? ' selected' : ''}`}>
              <input type="checkbox" checked={checked.includes(ci.id)} onChange={() => toggle(checked, setChecked, ci.id)} />
              <span>
                {loc(ci.text)} {ci.criticalSafety && <span className="digi-pill digi-pill-red" style={{ marginLeft: 6 }}>safety</span>}
              </span>
            </label>
          ))}
          {task.checklistItems.length === 0 && <p className="text-muted text-sm">No checklist items.</p>}
        </div>
      )}

      {task.type === 'narration' && (
        <div className="digi-form-group">
          <label className="digi-label">{t('narrationTranscript')}</label>
          <textarea className="digi-textarea" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
      )}

      {task.evidenceSpec && (
        <div className="mt-12">
          <EvidenceCapture
            assessmentId={assessmentId}
            taskId={task.id}
            spec={task.evidenceSpec}
            language={lang as never}
            onNarration={(txt) => setText((prev) => (prev ? prev : txt))}
          />
          {narrated && <span className="text-muted text-sm">{narrated}</span>}
        </div>
      )}

      <hr className="digi-divider" />
      <div className="digi-toolbar">
        <Button
          variant="primary"
          className="digi-btn-inline"
          disabled={busy}
          onClick={() =>
            onSave({
              selectedOptionIds: sel,
              checkedItemIds: checked,
              textAnswer: text.trim() || undefined,
            })
          }
        >
          {busy ? '...' : t('finishTask')}
        </Button>
        <StatusBadge status="IN_PROGRESS" />
      </div>
    </div>
  );
}