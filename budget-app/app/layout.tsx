import './globals.css';
import type { Metadata, Viewport } from 'next';
import AuthGate from '@/components/AuthGate';
import Shell from '@/components/Shell';

export const metadata: Metadata = {
  title: 'Budget',
  description: 'Mon budget, tout simple',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Budget', statusBarStyle: 'default' },
  icons: { icon: '/icon.svg', apple: '/icon-192.png' },
};

export const viewport: Viewport = {
  themeColor: '#0f766e',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <AuthGate>
          <Shell>{children}</Shell>
        </AuthGate>
      </body>
    </html>
  );
}
