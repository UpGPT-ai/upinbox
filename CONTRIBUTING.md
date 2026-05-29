# Contributing to UpInbox

Thanks for considering a contribution! UpInbox is MIT-licensed and welcomes pull requests.

## Setup

```bash
git clone https://github.com/UpGPT-ai/upinbox
cd upinbox
cp .env.example .env.local
# Fill in env vars (Supabase, encryption key, cron secret)
npm install
npm run dev
```

## Code Standards

- TypeScript strict mode
- React Server Components where possible
- All API routes in app/api/upinbox/
- Database migrations in supabase/migrations/ (append-only, never edit applied ones)
- New features ship with tests in src/__tests__/

## Architecture

- src/app/(app)/ — authenticated app routes (require Supabase session)
- src/app/api/upinbox/ — REST API
- src/lib/ — pure modules (mail providers, billing, intelligence)
- src/components/ — React UI
- supabase/migrations/ — schema changes (numbered, append-only)

## Capabilities Model

UpInbox features are gated on UpGPT capabilities (email, mcp, byok, native_mobile). The gate is in src/lib/billing/upinbox-entitlement.ts. Add new API routes that touch user data behind requireEmailEntitlement.

## Testing

```bash
npm test                  # Vitest unit/integration  
npm run test:coverage     # Coverage report
npx playwright test       # E2E (if dev server is running)
```

New features must include tests. Pure functions in src/lib/ get unit tests. UI components get component tests. API routes get integration tests (mock Supabase).

## Self-Hosted vs Hosted

UpInbox is run by UpGPT.ai at mail.upinbox.ai (requires UpGPT subscription) and as a self-hosted MIT project. PRs should preserve the dual-deployment property — don't bake in UpGPT.ai-specific URLs or assumptions.

## Pull Request Process

1. Fork, branch from main
2. Make changes with tests
3. Run `npm run lint` and `npm run type-check`
4. Open PR with clear description
5. CI must pass

## Security

Report vulnerabilities privately to security@upgpt.ai. Do NOT open public issues for security bugs.

## License

By contributing, you agree your contributions are licensed under MIT.
