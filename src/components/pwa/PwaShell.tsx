'use client';

import dynamic from 'next/dynamic';

const SwRegister = dynamic(() => import('./SwRegister'), { ssr: false });
const PwaInstallPrompt = dynamic(() => import('./PwaInstallPrompt'), { ssr: false });

/**
 * PwaShell — client component wrapper that loads PWA components dynamically.
 * Must be used inside a Server Component layout (e.g. app/layout.tsx).
 */
export function PwaShell() {
  return (
    <>
      <SwRegister />
      <PwaInstallPrompt />
    </>
  );
}
