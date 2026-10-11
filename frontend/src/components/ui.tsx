import React from 'react';
import type { AssessmentStatus } from '@sih/contracts';
import { STATUS_LABELS } from '../i18n/strings';
import { useLang } from '../store/providers';

/* ========= Button ========= */
const VARIANT_MAP: Record<string, string> = {
  primary: 'digi-btn digi-btn-primary',
  saffron: 'digi-btn digi-btn-orange',
  orange: 'digi-btn digi-btn-orange',
  outline: 'digi-btn digi-btn-outline',
  ghost: 'digi-btn digi-btn-ghost',
  danger: 'digi-btn digi-btn-red',
  success: 'digi-btn digi-btn-green',
};

export function Button({
  children, variant = 'primary', className = '', ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'saffron' | 'outline' | 'ghost' | 'danger' | 'success' | 'orange';
}) {
  const base = VARIANT_MAP[variant] ?? VARIANT_MAP.primary;
  return (
    <button className={`${base} ${className}`} {...rest}>{children}</button>
  );
}

/* ========= Card ========= */
export function Card({ children, className = '', title, actions }: {
  children: React.ReactNode;
  className?: string;
  title?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className={`digi-card ${className}`}>
      {(title || actions) && (
        <div className="digi-card-header">
          {title && <h3>{title}</h3>}
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

/* ========= Field ========= */
export function Field({ label, hint, optional, children }: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="digi-form-group">
      <label className="digi-label">
        {label} {optional && <span className="text-muted text-sm">({useLang().t('optional')})</span>}
      </label>
      {children}
      {hint && <div className="digi-hint">{hint}</div>}
    </div>
  );
}

/* ========= StatusBadge ========= */
export function StatusBadge({ status }: { status: AssessmentStatus }) {
  const cls = `digi-status digi-status-${status.toLowerCase()}`;
  return <span className={cls}>{STATUS_LABELS[status] ?? status}</span>;
}

/* ========= Spinner ========= */
export function Spinner({ label }: { label?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span className="digi-spinner" aria-hidden />
      {label && <span className="text-muted text-sm">{label}</span>}
    </span>
  );
}

/* ========= Alert ========= */
export function Alert({ kind = 'info', children }: { kind?: 'ok' | 'err' | 'info' | 'warn'; children: React.ReactNode }) {
  return <div className={`digi-alert digi-alert-${kind}`}>{children}</div>;
}

/* ========= Empty ========= */
export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="digi-empty">{children}</div>;
}

/* ========= ErrorBox ========= */
export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  const { t } = useLang();
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <Alert kind="err">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <span>{t('error', { m: msg })}</span>
        {retry && <Button variant="ghost" className="digi-btn-sm digi-btn-inline" onClick={retry}>{t('retry')}</Button>}
      </div>
    </Alert>
  );
}

/* ========= SectionTitle ========= */
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="digi-section-title">{children}</div>;
}

/* ========= Loading ========= */
export function Loading() {
  const { t } = useLang();
  return <div className="digi-center"><Spinner label={t('loading')} /></div>;
}