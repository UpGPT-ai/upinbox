import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { QueryProvider } from '@/components/providers/query-provider';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'UpInbox — Your email. Your AI. Your rules.',
  description:
    'Open-source email intelligence layer. Connect Gmail, Outlook, or any IMAP server. BYOK AI. Zero-knowledge encryption. Self-hostable.',
  metadataBase: new URL('https://upinbox.ai'),
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
      <body className={inter.className}>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
