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
import { classNames } from '../../components/helpers';

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
      // advance to next unanswered task
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
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0 }}>{t('planTitle')}</h1>
          <p className="muted small" style={{ margin: 0 }}>{pq.data ? loc(pq.data.qpTitle) : ''} · NSQF {pq.data?.nsqfLevel}</p>
        </div>
        <Link className="btn btn-ghost btn-sm" to={`/worker/a/${id}`}>{t('back')}</Link>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(200px, 260px) 1fr', alignItems: 'start' }}>
        <Card>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {tasks.map((tk, i) => (
              <li key={tk.id}>
                <button
                  onClick={() => setCurrent(i)}
                  className="btn btn-ghost"
                  style={{
                    width: '100%', justifyContent: 'flex-start', textAlign: 'left', marginBottom: 4,
                    background: i === current ? 'var(--line-2)' : 'transparent',
                  }}
                >
                  <span style={{ flex: 'none', width: 22 }}>{answered.has(tk.id) ? '✓' : `${i + 1}.`}</span>
                  <span style={{ flex: 1, fontSize: '0.9rem' }}>{loc(tk.title)}</span>
                  {tk.criticalSafety && <span title="Critical safety">⚠️</span>}
                </button>
              </li>
            ))}
          </ol>
          <hr className="divider" />
          <div className="small muted">{answered.size} / {tasks.length} {t('finishTask')}</div>
          <Button
            variant="saffron"
            style={{ width: '100%', marginTop: 10 }}
            disabled={!allDone || submitting}
            onClick={finish}
          >
            {submitting ? '…' : t('submitAssessment')}
          </Button>
          {!allDone && <p className="small muted" style={{ marginTop: 8 }}>{t('allTasksDone')}: {answered.size}/{tasks.length}</p>}
        </Card>

        <div>
          <Card
            title={t('taskOf', { i: current + 1, n: tasks.length })}
            actions={task?.criticalSafety ? <span className="badge bg-reassess">⚠️ Critical safety</span> : undefined}
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
        </div>
      </div>
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
      <h3 style={{ marginBottom: 4 }}>{loc(task.title)}</h3>
      {task.brief && <p className="muted">{loc(task.brief)}</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <span className="chip">{task.type.replace(/_/g, ' ')}</span>
        <span className="chip">{t('weight')}: {task.weight}%</span>
        {task.nosRefs.map((n) => <span key={n} className="chip">{n}</span>)}
      </div>

      {(task.type === 'mcq' || task.type === 'tool_identification') && (
        <div className="radio-group">
          <p className="field-label">{task.type === 'mcq' ? t('mcqTitle') : t('toolPickTitle')}</p>
          {task.presentedOptions.map((o) => (
            <label key={o.id} className={classNames('radio', sel.includes(o.id) && 'selected')}>
              <input
                type="checkbox"
                checked={sel.includes(o.id)}
                onChange={() => toggle(sel, setSel, o.id)}
              />
              <span className="check-label">{loc(o.text)}</span>
            </label>
          ))}
        </div>
      )}

      {task.type === 'checklist' && (
        <div>
          <p className="field-label">{t('checklistTitle')}</p>
          {task.checklistItems.map((ci) => (
            <label key={ci.id} className="check">
              <input type="checkbox" checked={checked.includes(ci.id)} onChange={() => toggle(checked, setChecked, ci.id)} />
              <span className="check-label">
                {loc(ci.text)} {ci.criticalSafety && <span className="badge bg-reassess">safety</span>}
              </span>
            </label>
          ))}
          {task.checklistItems.length === 0 && <p className="muted small">No checklist items.</p>}
        </div>
      )}

      {task.type === 'narration' && (
        <div>
          <p className="field-label">{t('narrationTranscript')}</p>
          <textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
      )}

      {task.evidenceSpec && (
        <div style={{ marginTop: 14 }}>
          <EvidenceCapture
            assessmentId={assessmentId}
            taskId={task.id}
            spec={task.evidenceSpec}
            language={lang as never}
            onNarration={(txt) => setText((prev) => (prev ? prev : txt))}
          />
          {narrated && <span className="muted small">{narrated}</span>}
        </div>
      )}

      <hr className="divider" />
      <Button
        variant="primary"
        disabled={busy}
        onClick={() =>
          onSave({
            selectedOptionIds: sel,
            checkedItemIds: checked,
            textAnswer: text.trim() || undefined,
          })
        }
      >
        {busy ? '…' : t('finishTask')}
      </Button>
      <span style={{ marginLeft: 10 }} className="muted small">
        <StatusBadge status="IN_PROGRESS" />
      </span>
    </div>
  );
}