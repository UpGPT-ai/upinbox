# Contributing to UpInbox

Thanks for your interest in contributing! UpInbox is built on a few strong principles —
understanding them will help your PR land faster.

## What's Open vs. Proprietary

The client code in this repo is MIT licensed. The UpInbox intelligence API is proprietary.

**You can contribute to:**
- JMAP and IMAP provider adapters (`src/lib/mail/providers/`)
- Encryption layer (`src/lib/mail/crypto/`)
- USX protocol implementation (`src/lib/mail/usx/`)
- MCP server tools
- UI components
- Documentation
- Tests

**What's NOT in this repo (and we won't accept PRs that embed it):**
- The trained intelligence classifier (`api.upinbox.ai`)
- Skills resolver and AI prompt library
- Platform-specific billing or license enforcement

If you find a security vulnerability, email [security@upinbox.ai](mailto:security@upinbox.ai) — do not open a public issue.

## Getting Started

```bash
git clone https://github.com/UpGPT-ai/upinbox.git
cd upinbox
npm install
cp env.example .env.local
# Fill in your Supabase URL + keys (free tier is fine for local dev)
npm run dev
```

## Development Guidelines

### TypeScript

- Strict mode is on — no `any` escapes unless genuinely unavoidable
- Export interfaces from `src/lib/mail/types.ts` — don't define duplicate types
- Never import `@/lib/mail/providers` in client components — use API routes

### Database Changes

- All migrations in `supabase/migrations/` — numbered sequentially
- Use `CREATE TABLE IF NOT EXISTS` — always
- Every new table needs RLS enabled + at least one policy
- Never modify an applied migration — add a new one

### The Provider Abstraction

Every mail backend implements `MailProvider`. If you're adding Exchange or Yahoo support:

1. Create `src/lib/mail/providers/exchange.ts` implementing `MailProvider`
2. Add the case to `src/lib/mail/providers/index.ts`
3. Add the credential type to `ProviderCredentials` in `src/lib/mail/types.ts`
4. Add tests in `src/__tests__/mail/providers/exchange.test.ts`

### Intelligence / Classification

The `@upgpt/email-classifier` package is the correct place to improve heuristic accuracy.
See [`UpGPT-ai/email-classifier`](https://github.com/UpGPT-ai/email-classifier) — contributions welcome there.

The BYOK router in `src/lib/mail/ai/router.ts` should remain provider-agnostic — don't hardcode prompt templates for specific providers.

## Pull Request Checklist

- [ ] `npx tsc --noEmit` — 0 errors
- [ ] `npm run test` — all tests pass
- [ ] New public functions have JSDoc comments
- [ ] New DB tables have RLS enabled + policy
- [ ] No hardcoded API keys, URLs, or credentials
- [ ] Added/updated tests for changed logic

## Commit Style

```
type(scope): short description

feat(providers): add Exchange EWS adapter
fix(imap): handle Gmail 'Too many simultaneous connections' error
docs(self-hosting): add nginx reverse proxy example
test(encryption): add Ed25519 key generation roundtrip test
```

Types: `feat`, `fix`, `docs`, `test`, `chore`, `refactor`, `perf`

## License

By submitting a PR, you agree your contribution is licensed under MIT.
