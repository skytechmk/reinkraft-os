import { useState, type FormEvent } from 'react';
import { useI18n } from '../../i18n';
import { supabase } from '../../lib/supabase';
import { btnPrimary, card, input, label } from '../../ui';

export function LoginScreen() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) setError(t('shell.login.error'));
    setBusy(false);
  };

  return (
    <main className="mx-auto mt-16 max-w-sm px-4">
      <h1 className="mb-4 text-2xl font-bold text-signal">{t('shell.login.title')}</h1>
      <form onSubmit={submit} className={card}>
        <label className={label} htmlFor="email">{t('shell.login.email')}</label>
        <input id="email" className={`${input} mb-3`} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label className={label} htmlFor="pw">{t('shell.login.password')}</label>
        <input id="pw" className={`${input} mb-4`} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p className="mb-3 text-sm text-crit">{error}</p>}
        <button className={`${btnPrimary} w-full`} disabled={busy}>{t('shell.login.submit')}</button>
      </form>
    </main>
  );
}
