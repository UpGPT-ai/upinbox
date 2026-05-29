import type { ReactNode } from 'react';
import Link from 'next/link';

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-semibold text-lg flex items-center gap-2">
            <span>📬</span>
            <span>UpInbox</span>
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            <Link href="/pricing" className="hover:text-primary transition-colors">Pricing</Link>
            <Link href="https://github.com/UpGPT-ai/upinbox" className="hover:text-primary transition-colors">GitHub</Link>
            <Link href="/inbox" className="px-4 py-2 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 transition-colors">Sign in</Link>
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <footer className="border-t mt-24">
        <div className="max-w-5xl mx-auto px-6 py-8 text-sm text-muted-foreground flex items-center justify-between flex-wrap gap-4">
          <div>© 2026 UpGPT.ai — Privacy-first email</div>
          <div className="flex gap-4">
            <Link href="https://upgpt.ai" className="hover:text-foreground">UpGPT.ai</Link>
            <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
            <Link href="https://github.com/UpGPT-ai/upinbox/blob/main/SELF-HOSTING.md" className="hover:text-foreground">Self-host</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
