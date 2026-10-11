import { useState } from 'react';

/** Chip-style multi-value input: type and press Enter/comma to add. */
export function TagList({
  value, onChange, placeholder, suggestions,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
}) {
  const [draft, setDraft] = useState('');

  function add(raw: string) {
    const v = raw.trim();
    if (!v) return;
    if (!value.includes(v)) onChange([...value, v]);
    setDraft('');
  }
  function remove(v: string) {
    onChange(value.filter((x) => x !== v));
  }

  return (
    <div>
      <div className="pill-input">
        {value.map((v) => (
          <span key={v} className="chip">
            {v}
            <button
              type="button" aria-label={`remove ${v}`}
              onClick={() => remove(v)}
              style={{ border: 'none', background: 'none', cursor: 'pointer', marginLeft: 4, color: 'inherit' }}
            >×</button>
          </span>
        ))}
        <input
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add(draft);
            } else if (e.key === 'Backspace' && !draft && value.length) {
              remove(value[value.length - 1]);
            }
          }}
          onBlur={() => add(draft)}
        />
      </div>
      {suggestions && suggestions.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {suggestions.filter((s) => !value.includes(s)).slice(0, 12).map((s) => (
            <button key={s} type="button" className="chip chip-saffron" style={{ cursor: 'pointer' }} onClick={() => add(s)}>
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}