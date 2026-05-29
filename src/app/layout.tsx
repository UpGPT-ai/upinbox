import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { QueryProvider } from '@/components/providers/query-provider';
import { PwaShell } from '@/components/pwa/PwaShell';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'UpInbox — Your email. Your AI. Your rules.',
  description:
    'Open-source email intelligence layer. Connect Gmail, Outlook, or any IMAP server. BYOK AI. Zero-knowledge encryption. Self-hostable.',
  metadataBase: new URL('https://upinbox.ai'),
  manifest: '/manifest.json',
  openGraph: {
    type: 'website',
    url: 'https://upinbox.ai',
    title: 'UpInbox — Your email. Your AI. Your rules.',
    description: 'Connect Gmail or Outlook. Bring your own AI. Own your data.',
    images: ['/og-image.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'UpInbox',
    description: 'Open-source AI email client. BYOK. Zero-knowledge. Self-hostable.',
    images: ['/og-image.png'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#0f172a" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="UpInbox" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="apple-touch-startup-image" href="/icons/splash.png" />
      </head>
      <body className={inter.className}>
        <QueryProvider>{children}</QueryProvider>
        <PwaShell />
      </body>
    </html>
  );
}
