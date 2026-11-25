'use client';

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { BudgetProvider } from '@/lib/data';

function Login() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { data, error } =
      mode === 'in'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) setMsg(error.message);
    else if (mode === 'up' && !data.session) setMsg('Compte créé ! Vérifie tes mails pour confirmer, puis connecte-toi.');
  }

  return (
    <div className="shell">
      <div className="center" style={{ minHeight: '30vh' }}>
        <div style={{ fontSize: '3rem' }}>💶</div>
        <h1>Mon budget</h1>
      </div>
      <form className="card" onSubmit={submit}>
        <label className="field">
          E-mail
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          Mot de passe
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {msg && <p className="error-text">{msg}</p>}
        <button className="btn block" disabled={busy}>
          {mode === 'in' ? 'Me connecter' : 'Créer mon compte'}
        </button>
        <p className="small muted" style={{ textAlign: 'center', marginBottom: 0 }}>
          {mode === 'in' ? 'Première fois ? ' : 'Déjà un compte ? '}
          <a href="#" onClick={(e) => { e.preventDefault(); setMode(mode === 'in' ? 'up' : 'in'); setMsg(null); }}>
            {mode === 'in' ? 'Créer mon compte' : 'Me connecter'}
          </a>
        </p>
      </form>
    </div>
  );
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  if (loading) return <div className="center">Chargement…</div>;
  if (!session) return <Login />;
  return <BudgetProvider userId={session.user.id}>{children}</BudgetProvider>;
}
