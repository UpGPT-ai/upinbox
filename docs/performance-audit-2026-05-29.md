# UpInbox Performance Audit — 2026-05-29

## Static Asset Audit (`public/`)

### Inventory

| File | Size | Type | Dimensions |
|------|------|------|------------|
| `public/icon-192.png` | 546 B | PNG (8-bit RGB, non-interlaced) | 192x192 |
| `public/icon-512.png` | 1,880 B | PNG (8-bit RGB, non-interlaced) | 512x512 |
| `public/manifest.json` | 444 B | JSON | — |
| `public/offline.html` | 1,794 B | HTML | — |
| `public/sw.js` | 6,242 B | JS (service worker) | — |

**Total image payload: 2,426 bytes (~2.4 KB).**

### Findings

#### Images > 100 KB
None. Both PNG icons are trivially small (<2 KB each). No optimization needed.

#### Multiple sizes of same logo
Two icon sizes (192 / 512) — both required by the PWA manifest (`maskable` purpose at both densities). Not waste; this is the minimum recommended pair per Web App Manifest spec. No retina/duplicate sources detected.

#### Missing webp/avif alternatives
**Not applicable.** WebP/AVIF gains are negligible at these file sizes; PNG is required for PWA manifest icons (manifest spec lists `image/png` and the SW caches `.png` URLs explicitly). Converting would break manifest compliance and save <1 KB combined.

#### Unused assets
All assets are referenced:
- `icon-192.png` — referenced in `public/manifest.json` and `public/sw.js` (lines 10, 144)
- `icon-512.png` — referenced in `public/manifest.json` and `public/sw.js` (line 11)
- `manifest.json` — referenced in `src/app/layout.tsx:14` and precached by `sw.js:9`
- `offline.html` — precached by `sw.js:8`, served on navigation failure (sw.js:114)
- `sw.js` — service worker entry

No orphaned assets.

### Path mismatch (real issue found)

`public/sw.js` precaches icons at `/icons/icon-192.png` and `/icons/icon-512.png` (lines 10–11, 144), but the actual files live at `/icon-192.png` and `/icon-512.png` (no `icons/` subdirectory). The manifest correctly points at `/icon-192.png`, `/icon-512.png`.

**Impact:** Service worker `install` event will fail on `cache.addAll([...])` because two URLs return 404 — which on most browsers rejects the entire `addAll` promise and aborts install. The SW never activates, so the offline fallback (`/offline.html`), API caching, and push-notification icon are all broken.

**Fix options (pick one):**
1. Change `sw.js` lines 10, 11, 144 from `/icons/icon-192.png` → `/icon-192.png` (and 512 equivalent).
2. Move the PNGs into `public/icons/` and update `manifest.json` to match.

Option 1 is the minimal change.

### Recommendations

| Priority | Item | Action |
|----------|------|--------|
| P0 | SW precache 404 on icon paths | Fix `/icons/icon-*.png` → `/icon-*.png` in `public/sw.js` (lines 10, 11, 144) |
| — | Image optimization | None needed; total image payload is 2.4 KB |
| — | WebP/AVIF | Skip; required-PNG by PWA spec, savings <1 KB |
| — | Unused assets | None to remove |

### Notes on scope

UpInbox at this sprint is a near-static PWA shell — no marketing imagery, hero photos, or product screenshots in `public/`. As marketing pages, blog imagery, or in-app screenshots are added, re-run this audit with these thresholds:
- Hero images > 100 KB → require WebP + AVIF + responsive `srcset`
- Any PNG > 50 KB → check if it can be SVG
- Duplicate logo sizes → consolidate to SVG + one fallback PNG

---

## Unused Dependencies & Dead Code Scan

### Dependencies Summary

Total top-level deps: **42** (production + dev combined via `npm ls --depth=0`).

Notable groups:
- **UI / editor:** `@tiptap/*` (8 packages), `@dnd-kit/*` (3), `lucide-react`, `cmdk`, `virtua`, `react-hotkeys-hook`
- **State / data:** `@tanstack/react-query`, `jotai`, `nuqs`, `zod`
- **Supabase:** `@supabase/ssr@0.10.3`, `@supabase/supabase-js@2.106.2`
- **Email / crypto:** `imapflow`, `nodemailer`, `openpgp`, `web-push`
- **Workspace:** `@upgpt-ai/email-classifier@0.1.0` (local package)
- **Build / test:** `next@15.5.18`, `vitest`, `@playwright/test`, `@vitejs/plugin-react`, `tailwindcss`, `postcss`, `autoprefixer`, `typescript`

No obvious zombie deps from the top-level list — every package maps to a known feature (editor, IMAP, push, crypto, kanban DnD, list virtualization, command palette, hotkeys). Recommend a follow-up `depcheck` / `knip` pass for definitive reachability analysis.

### Heavy Library Imports

| Library | `from 'X'` count | Notes |
|---|---|---|
| `moment` | **0** | Not used (good — native `Intl` / date-fns preferred) |
| `lodash` (full) | **0** | Not used |
| `lodash/*` (deep) | **0** | Not used |
| `import * as ...` | 5 hits | 4 are idiomatic `import * as React` in forwardRef component files; 1 is `import * as openpgp from 'openpgp'` in `src/lib/encryption/keys.ts` |

**Verdict:** No heavy-library red flags. The only namespace import of consequence is `openpgp`, which is unavoidable for the PGP key module and already tree-shakes poorly by design.

### Tech Debt: TODO / FIXME / HACK

**Total markers (excluding tests):** **12**

Distribution:
- `src/app/api/upinbox/deep-clean/route.ts` — 2 (stub IMAP scan + undo vault flow)
- `src/app/api/upinbox/subscriptions/route.ts` — 2 (join with `email_classifications` pending)
- `src/app/api/upinbox/analytics/response-rate/route.ts` — 2 (placeholder data, real IMAP thread analysis pending)
- `src/app/api/upinbox/analytics/needs-reply/route.ts` — 2 (real `scheduled_sends` + thread analysis pending)
- `src/components/analytics/response-insights.tsx` — 1 (wire to real follow-up creation endpoint)
- `src/lib/billing/upinbox-entitlement.ts` — 3 (upgpt-sync canonical mirror table + capabilities expansion)

**Theme:** Debt is concentrated in two areas — (a) **analytics / deep-clean stubs awaiting real IMAP-side implementations**, and (b) **billing entitlement reads from `user_metadata` until the canonical upgpt-sync mirror table lands**. No `HACK` or `FIXME` markers — all are forward-looking `TODO`s tied to known follow-up work.

### Recommended Follow-ups

1. Run `npx depcheck` or `npx knip` to confirm zero unused declared deps (the scan above catches heavy-lib import patterns, not full reachability).
2. Track the 3 `TODO(upgpt-sync)` markers as a single ticket — they all unblock on the same mirror-table migration.
3. The 6 analytics + deep-clean stubs share an IMAP thread-analysis dependency — group into one workstream.

---

## Bundle Size Analysis — 2026-05-29 (build dated 2026-05-28 23:55)

### Build Footprint

| Metric | Value |
|---|---|
| `.next/static/` (total) | **2.2 MB** |
| `.next/static/chunks/` | **1.9 MB** |
| Source LOC (`src/`) | 33,822 |

Total static payload is healthy by Next.js norms.

### Largest JS Chunks

| Size | Chunk | Notes |
|---|---|---|
| **254.2 KB** | `chunks/243-*.js` | **Only chunk crossing the 200 KB threshold.** Shared vendor bundle — likely React Query + Jotai + Supabase SSR + portions of TipTap. First candidate for split inspection via `@next/bundle-analyzer`. |
| 182.0 KB | `chunks/1613-*.js` | Vendor split. |
| 169.3 KB | `chunks/1255-*.js` | Vendor split. |
| 169.0 KB | `chunks/4bd1b696-*.js` | Vendor split (framework-adjacent hash). |
| **157.6 KB** | `app/(app)/inbox/page-*.js` | **Largest route chunk.** Hot path — every signed-in user. |
| 136.6 KB | `framework-*.js` | React + Next runtime. Fixed cost. |
| 123.5 KB | `main-*.js` | Next client runtime. Fixed cost. |
| 110.0 KB | `polyfills-*.js` | Standard. |
| 93.9 KB | `chunks/70e0d97a-*.js` | Vendor split. |
| 79.6 KB | `app/(app)/settings/page-*.js` | Settings route chunk. |
| 62.6 KB | `chunks/54a60aa6-*.js` | Vendor split. |
| 57.7 KB | `chunks/44530001-*.js` | Vendor split. |
| 18.9 KB | `app/(app)/inbox/mcp/page-*.js` | MCP page chunk. |

Combined `/inbox` first-paint JS (framework + main + polyfills + top 4 vendor splits + inbox page) ≈ **1.1 MB uncompressed**. Investigate compression-on-wire and which vendor splits are actually loaded on `/inbox`.

### Source File Hotspots (> 500 lines)

| LOC | File | Risk |
|---|---|---|
| **935** | `src/components/mail/email-list.tsx` | **Critical.** Renders on every inbox view. Already uses `virtua` (good). Split into list / row / header / selection store. |
| 740 | `src/components/mail/signature-manager.tsx` | Settings-only — should be `next/dynamic`. |
| 655 | `src/components/mail/email-detail.tsx` | Hot path. Likely pulls TipTap (editor). |
| 653 | `src/components/analytics/sender-view.tsx` | Analytics route — should chunk cleanly. |
| 652 | `src/app/(app)/inbox/mcp/page.tsx` | 652-line single-file page — extract subcomponents. |
| 640 | `src/components/analytics/newsletter-audit.tsx` | Analytics route. |
| 628 | `src/lib/mail/providers/imap.ts` | **Server-only.** Verify it does not leak into client bundles. |
| 557 | `src/components/mail/auto-archive-rules.tsx` | Settings-only — lazy-load. |
| 511 | `src/app/(app)/inbox/inbox-layout.tsx` | Layout. Review for split opportunities. |

### Heavy / External Imports

No `lodash` (full or namespaced), no `moment`, no `date-fns` — clean.

| Pkg | Uses | Concern |
|---|---|---|
| `react` | 56 | Expected. |
| `next/server` | 52 | Server-side. No bundle impact. |
| `jotai` | 22 | Expected. |
| `zod` | 20 | Watch — ~50 KB. Verify only client-needed schemas reach client. |
| `@tanstack/react-query` | 15 | Expected. |
| `lucide-react` | 5 | Tree-shakes when using named imports. Audited mail/ — both imports correct. |
| `virtua` | 3 | Good — virtualization. |
| `@tiptap/*` | 7 pkgs | **Largest single feature cost.** ~150 KB+. Used in `compose-window.tsx`. Should be `next/dynamic({ ssr: false })`. |
| `openpgp` | 1 | **~200 KB.** Used for zero-knowledge encryption. Must be lazy-loaded only on encrypted message open. Already namespace-imported (`import * as openpgp`) in `src/lib/encryption/keys.ts` — unavoidable for PGP but the load itself should be deferred. |
| `@upgpt-ai/email-classifier` | 1 | In-house. Size unmeasured — confirm bundle weight. |
| `imapflow`, `nodemailer` | server | Must never appear in client bundles. Verify. |

### Current Code-Splitting Status

`next/dynamic` usage is minimal:

- `src/components/layout/sidebar.tsx` — `MailboxListDnd` is dynamic (defers `@dnd-kit`). Good.
- `src/components/pwa/PwaShell.tsx` — `SwRegister` + `PwaInstallPrompt` dynamic with `ssr: false`. Good.

**Missing dynamic imports (highest leverage):**

1. **TipTap editor** in `compose-window.tsx` — only load on Compose click. ~150 KB savings on `/inbox` cold load.
2. **OpenPGP** — only load on encrypted-message open. ~200 KB savings on cold load.
3. `signature-manager.tsx` (740 LOC) — settings-only.
4. `auto-archive-rules.tsx` (557 LOC) — settings-only.
5. `deep-clean-wizard.tsx` (418 LOC) — one-shot wizard.
6. Analytics components (`sender-view`, `newsletter-audit` — 1,293 LOC combined) — route-level dynamic.

### Threshold Check Summary

| Threshold | Status |
|---|---|
| Any chunk > 200 KB | **1 chunk** at 254 KB (`chunks/243-*.js`). Borderline; investigate contents. |
| Any source file > 500 lines | **9 files**. Largest: `email-list.tsx` at 935 LOC. |
| Heavy imports (lodash full, moment, etc.) | **None.** Clean. |
| TipTap / OpenPGP code-split | **Failing.** Both currently static-imported. Highest-leverage fix. |

### Recommendations (ranked)

#### P0 — Measure before optimizing
- [ ] Run `ANALYZE=true npm run build` with `@next/bundle-analyzer` to confirm contents of `chunks/243-*.js` (254 KB).
- [ ] Verify `imapflow` and `nodemailer` are absent from all client chunks.
- [ ] Measure `@upgpt-ai/email-classifier` runtime bundle weight.

#### P1 — High-leverage code splits
- [ ] Lazy-load TipTap editor in `compose-window.tsx` via `next/dynamic`. Est. ~150 KB savings on `/inbox` first paint.
- [ ] Lazy-load `openpgp` only on encrypted-message open. Est. ~200 KB savings on cold load.
- [ ] Lazy-load settings sub-components (`signature-manager`, `auto-archive-rules`, `subscriptions-manager`, `deep-clean-wizard`).

#### P2 — Refactor
- [ ] Split `email-list.tsx` (935 LOC) into list / row / header / selection-store modules.
- [ ] Split `inbox/mcp/page.tsx` (652 LOC) into subcomponents.
- [ ] Audit `zod` schema imports — server-only schemas should not reach client.

#### P3 — Monitoring
- [ ] CI bundle-size budget (per-route chunks ≤ 200 KB gzipped).
- [ ] Track `/inbox` first-paint JS in production via Web Vitals.

*Bundle analysis run: 2026-05-29.*
