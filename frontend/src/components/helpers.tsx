import type { LocalizedText as LT } from '@sih/contracts';
import { useLang } from '../store/providers';

/** Render a contract LocalizedText in the current UI language (falls back en → hi → first). */
export function useLocalized(): (text: LT | string | undefined, fallback?: string) => string {
  const { lang } = useLang();
  return (text, fallback = '') => {
    if (typeof text === 'string') return text;
    if (!text) return fallback;
    const v = text[lang] || text.en || text.hi || text.mr || fallback;
    return v ?? fallback;
  };
}

export function fmtDate(iso: string | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

export function pct(x: number | null | undefined, digits = 0): string {
  if (x === null || x === undefined || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(digits)}%`;
}

export function classNames(...xs: Array<string | false | undefined>): string {
  return xs.filter(Boolean).join(' ');
}