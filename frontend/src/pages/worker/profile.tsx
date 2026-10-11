import { useEffect, useState } from 'react';
import { ApiError } from '../../lib/api';
import { getProfile, updateProfile } from '../../lib/client';
import { enqueue, onlineOrQueue } from '../../lib/sync';
import { useAuth, useLang, useToast } from '../../store/providers';
import { AppShell } from '../../components/layout';
import { Alert, Button, Card, Field } from '../../components/ui';
import { nowIso } from '../../lib/uuid';
import type { Lang } from '../../i18n/strings';

export default function WorkerProfilePage() {
  const { t, lang, setLang } = useLang();
  const { profile, setProfile } = useAuth();
  const { toast } = useToast();

  const [fullName, setFullName] = useState(profile?.fullName ?? '');
  const [years, setYears] = useState(profile?.yearsExperience ?? 0);
  const [gender, setGender] = useState(profile?.gender ?? '');
  const [dob, setDob] = useState(profile?.dateOfBirth ?? '');
  const [state, setState] = useState(profile?.region?.state ?? '');
  const [district, setDistrict] = useState(profile?.region?.district ?? '');
  const [pin, setPin] = useState(profile?.region?.pin ?? '');
  const [trades, setTrades] = useState((profile?.trades ?? []).join(', '));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);

  useEffect(() => {
    if (profile) {
      setFullName(profile.fullName);
      setYears(profile.yearsExperience);
      setGender(profile.gender ?? '');
      setDob(profile.dateOfBirth ?? '');
      setState(profile.region?.state ?? '');
      setDistrict(profile.region?.district ?? '');
      setPin(profile.region?.pin ?? '');
      setTrades((profile.trades ?? []).join(', '));
    }
  }, [profile]);

  async function save() {
    if (!profile) return;
    setBusy(true);
    setMsg(null);
    const patch = {
      fullName: fullName.trim() || profile.fullName,
      yearsExperience: Number(years) || 0,
      gender: gender || undefined,
      dateOfBirth: dob || undefined,
      language: lang,
      region: { state: state || undefined, district: district || undefined, pin: pin || undefined },
      trades: trades.split(',').map((s) => s.trim()).filter(Boolean),
    };
    try {
      const version = profile.version;
      const result = await onlineOrQueue(
        async () => {
          const updated = await updateProfile(version, nowIso(), patch as never);
          setProfile(updated);
          return updated;
        },
        async () => {
          await enqueue({
            kind: 'sync', entity: 'profile', action: 'update', version,
            payload: { ...patch, version: version + 1, clientUpdatedAt: nowIso() },
          });
        },
      );
      if (result.applied) {
        setMsg({ kind: 'ok', text: t('save') });
        toast(t('save'), 'ok');
      } else {
        setMsg({ kind: 'info', text: t('offline') });
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setMsg({ kind: 'err', text: 'This profile was updated elsewhere. Reloading latest version…' });
        const server = await getProfile();
        setProfile(server);
      } else {
        setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1>{t('displayName')}</h1>
        <Card>
          <div className="grid grid-2">
            <Field label={t('displayName')}>
              <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </Field>
            <Field label={t('yearsExperience')}>
              <input className="input" type="number" min={0} max={60} value={years} onChange={(e) => setYears(Number(e.target.value))} />
            </Field>
            <Field label="Gender" optional>
              <select className="select" value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="">—</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </Field>
            <Field label="Date of birth" optional>
              <input className="input" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
            </Field>
            <Field label="State" optional>
              <input className="input" value={state} onChange={(e) => setState(e.target.value)} />
            </Field>
            <Field label="District" optional>
              <input className="input" value={district} onChange={(e) => setDistrict(e.target.value)} />
            </Field>
            <Field label="PIN code" optional>
              <input className="input" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} />
            </Field>
            <Field label={t('language')} optional>
              <select className="select" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
                <option value="en">English</option>
                <option value="hi">हिन्दी</option>
                <option value="mr">मराठी</option>
              </select>
            </Field>
          </div>
          <Field label="Trades" hint="Comma separated (e.g. electrician, solar installer)" optional>
            <input className="input" value={trades} onChange={(e) => setTrades(e.target.value)} />
          </Field>
          {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
          <div className="toolbar">
            <Button variant="primary" onClick={save} disabled={busy || !profile}>{busy ? '…' : t('save')}</Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}