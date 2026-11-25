'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const TABS = [
  { href: '/', label: 'Accueil', ico: '🏠' },
  { href: '/operations', label: 'Opérations', ico: '🧾' },
  { href: '/bilan', label: 'Bilan', ico: '⚖️' },
  { href: '/reglages', label: 'Réglages', ico: '⚙️' },
];

/** Affiche la barre de navigation uniquement quand on est connecté. */
export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [logged, setLogged] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setLogged(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setLogged(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <>
      <main className="shell">{children}</main>
      {logged && (
        <nav className="nav">
          <div className="nav-inner">
            {TABS.map((t) => {
              const active = t.href === '/' ? pathname === '/' : pathname.startsWith(t.href);
              return (
                <Link key={t.href} href={t.href} className={active ? 'active' : ''}>
                  <span className="ico">{t.ico}</span>
                  {t.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </>
  );
}
