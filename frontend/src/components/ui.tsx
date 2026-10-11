import React from 'react';
import type { AssessmentStatus } from '@sih/contracts';
import { STATUS_LABELS } from '../i18n/strings';
import { useLang } from '../store/providers';

export function Button({
  children, variant = 'primary', className = '', ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'saffron' | 'outline' | 'ghost' | 'danger' | 'success' }) {
  return (
    <button className={`btn btn-${variant} ${className}`} {...rest}>{children}</button>
  );
}

export function Card({ children, className = '', title, actions }: { children: React.ReactNode; className?: string; title?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className={`card ${className}`}>
      {(title || actions) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
          {title && <h3 style={{ margin: 0 }}>{title}</h3>}
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

export function Field({ label, hint, optional, children }: { label: React.ReactNode; hint?: React.ReactNode; optional?: boolean; children: React.ReactNode }) {
  return (
    <div className="field">
      <label className="field-label">{label} {optional && <span className="muted small">({useLang().t('optional')})</span>}</label>
      {children}
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

export function StatusBadge({ status }: { status: AssessmentStatus }) {
  const cls = `badge bg-${status.toLowerCase()}`;
  return <span className={cls}>{STATUS_LABELS[status] ?? status}</span>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span className="spinner" aria-hidden />
      {label && <span className="muted small">{label}</span>}
    </span>
  );
}

export function Alert({ kind = 'info', children }: { kind?: 'ok' | 'err' | 'info'; children: React.ReactNode }) {
  return <div className={`alert alert-${kind}`}>{children}</div>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  const { t } = useLang();
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <Alert kind="err">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
        <span>{t('error', { m: msg })}</span>
        {retry && <Button variant="ghost" className="btn-sm" onClick={retry}>{t('retry')}</Button>}
      </div>
    </Alert>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="section-title"><h2 style={{ margin: 0 }}>{children}</h2></div>;
}

export function Loading() {
  const { t } = useLang();
  return <div className="center"><Spinner label={t('loading')} /></div>;
}