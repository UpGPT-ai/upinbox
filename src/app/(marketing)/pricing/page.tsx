import Link from 'next/link';

export const metadata = {
  title: 'Pricing — UpInbox',
  description: 'Privacy-first AI email. Capabilities-based pricing. Self-host free or pay for convenience.',
};

const capabilities = [
  { name: 'email', unlocks: 'Full UpInbox email module', where: 'Hosted + native mobile' },
  { name: 'mcp', unlocks: 'MCP server access from Claude', where: 'Anywhere' },
  { name: 'byok', unlocks: 'BYOK AI configuration', where: 'Anywhere' },
  { name: 'native_mobile', unlocks: 'UpLink mobile gated features', where: 'iOS + Android' },
  { name: 'multi_account', unlocks: 'Connect more than 1 email account', where: 'Hosted' },
  { name: 'team', unlocks: 'Team management features', where: 'Hosted' },
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto max-w-4xl px-6 py-16 sm:px-8 sm:py-24">
        {/* Header */}
        <header className="mb-16">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Pricing
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-slate-600">
            UpInbox is part of your UpGPT subscription. One platform, one bill,
            multiple capabilities you turn on as you need them.
          </p>
        </header>

        {/* The Capabilities Model */}
        <section className="mb-20">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            The Capabilities Model
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-600">
            Instead of fixed tiers, UpGPT sells capabilities. You pay for what
            you actually use.
          </p>

          <div className="mt-8 overflow-hidden rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700"
                  >
                    Capability
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700"
                  >
                    What it unlocks
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700"
                  >
                    Where
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {capabilities.map((cap) => (
                  <tr key={cap.name}>
                    <td className="whitespace-nowrap px-6 py-4 font-mono text-sm text-indigo-600">
                      {cap.name}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-700">
                      {cap.unlocks}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {cap.where}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <hr className="my-16 border-slate-200" />

        {/* Three Ways to Use UpInbox */}
        <section className="mb-20">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Three Ways to Use UpInbox
          </h2>

          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {/* Self-Hosted */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">
                Self-Hosted
              </h3>
              <p className="mt-1 text-sm font-medium text-emerald-600">Free</p>
              <ul className="mt-4 space-y-2 text-sm text-slate-600">
                <li>Full web + PWA features</li>
                <li>Run on your own infra</li>
                <li>MIT licensed</li>
                <li>
                  Connect UpLink mobile (requires UpGPT subscription for the
                  mobile features)
                </li>
              </ul>
              <Link
                href="https://github.com/UpGPT-ai/upinbox/blob/main/SELF-HOSTING.md"
                className="mt-6 inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Self-hosting guide →
              </Link>
            </div>

            {/* Hosted */}
            <div className="rounded-xl border-2 border-indigo-600 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">
                Hosted at mail.upinbox.ai
              </h3>
              <p className="mt-1 text-sm font-medium text-indigo-600">
                UpGPT subscription required
              </p>
              <ul className="mt-4 space-y-2 text-sm text-slate-600">
                <li>Requires UpGPT subscription with &apos;email&apos; capability</li>
                <li>We run it. Auto-updates. Backups. Cron dispatch.</li>
                <li>All UpInbox features</li>
              </ul>
              <Link
                href="https://upgpt.ai/account/subscribe?product=upinbox"
                className="mt-6 inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Subscribe at UpGPT.ai →
              </Link>
            </div>

            {/* UpLink Mobile */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">
                UpLink Mobile
              </h3>
              <p className="mt-1 text-sm font-medium text-emerald-600">
                Free download
              </p>
              <ul className="mt-4 space-y-2 text-sm text-slate-600">
                <li>Free download (App Store, Play Store)</li>
                <li>Inbox tab requires &apos;email&apos; capability</li>
                <li>Voice assistant, on-device AI, BYOK — included</li>
              </ul>
              <Link
                href="https://upgpt.ai/uplink"
                className="mt-6 inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Get UpLink →
              </Link>
            </div>
          </div>
        </section>

        <hr className="my-16 border-slate-200" />

        {/* Why No Free Tier */}
        <section className="mb-20">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Why No Free Tier?
          </h2>
          <div className="mt-6 space-y-4 text-base leading-relaxed text-slate-600">
            <p>
              We don&apos;t run free hosted email. Email infrastructure has real
              costs and we don&apos;t want to be Gmail. The free path is
              self-hosting. The paid path is convenience.
            </p>
            <p>
              This keeps incentives aligned. We invest in product, not
              subsidizing free accounts.
            </p>
          </div>
        </section>

        <hr className="my-16 border-slate-200" />

        {/* Free vs Paid */}
        <section className="mb-20 grid gap-8 md:grid-cols-2">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-6">
            <h3 className="text-lg font-semibold text-slate-900">
              Self-Hosters Get These Free
            </h3>
            <ul className="mt-4 space-y-2 text-sm text-slate-700">
              <li>• All UpInbox web + PWA features</li>
              <li>• AI Screener, BYOK, MCP server, tracker stripper</li>
              <li>• Snooze, send later, follow-ups</li>
              <li>• Health score, communication pulse</li>
              <li>• Auto-archive, deep clean</li>
            </ul>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-6">
            <h3 className="text-lg font-semibold text-slate-900">
              What&apos;s NOT Free
            </h3>
            <ul className="mt-4 space-y-2 text-sm text-slate-700">
              <li>• Hosted convenience at mail.upinbox.ai</li>
              <li>
                • Native UpLink mobile Inbox tab (cryptographic paywall)
              </li>
            </ul>
          </div>
        </section>

        <hr className="my-16 border-slate-200" />

        {/* Manage Subscription */}
        <section className="mb-20">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Manage Your Subscription
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-600">
            Visit{' '}
            <Link
              href="https://upgpt.ai/account/billing"
              className="font-medium text-indigo-600 hover:text-indigo-700 hover:underline"
            >
              upgpt.ai/account/billing
            </Link>{' '}
            to manage capabilities, payment methods, and billing history.
          </p>
          <Link
            href="https://upgpt.ai/account/billing"
            className="mt-6 inline-flex items-center justify-center rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Manage billing →
          </Link>
        </section>

        <hr className="my-16 border-slate-200" />

        {/* FAQ */}
        <section>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            FAQ
          </h2>
          <dl className="mt-8 space-y-8">
            <div>
              <dt className="text-base font-semibold text-slate-900">
                Can I use UpInbox without UpLink?
              </dt>
              <dd className="mt-2 text-base leading-relaxed text-slate-600">
                Yes. The web app and PWA work standalone. UpLink mobile is a
                separate (free) download with the Inbox tab as one of many
                features.
              </dd>
            </div>
            <div>
              <dt className="text-base font-semibold text-slate-900">
                Can I self-host AND use UpLink mobile?
              </dt>
              <dd className="mt-2 text-base leading-relaxed text-slate-600">
                Yes. UpLink mobile can point at any UpInbox server (hosted or
                self-hosted). Mobile features still require UpGPT &apos;email&apos;
                capability.
              </dd>
            </div>
            <div>
              <dt className="text-base font-semibold text-slate-900">
                Can I move my data out?
              </dt>
              <dd className="mt-2 text-base leading-relaxed text-slate-600">
                Yes. UpInbox is a client — your email lives in your underlying
                IMAP server. We don&apos;t lock you in.
              </dd>
            </div>
            <div>
              <dt className="text-base font-semibold text-slate-900">
                What about email accounts (Gmail, Outlook)?
              </dt>
              <dd className="mt-2 text-base leading-relaxed text-slate-600">
                Those are your accounts. We connect via IMAP/JMAP/OAuth. We
                never see your password.
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </main>
  );
}
