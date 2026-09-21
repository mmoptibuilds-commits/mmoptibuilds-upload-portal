# Task 1.1 Report — Replace environment contract

## Status

Complete. The server-only Supabase storage configuration contract is established without changing upload routes or UI.

## Commit(s)

- `7e5d7e7 feat: establish Supabase server storage config`
- Final documentation commit contains this report.

## Files changed

- `.env.example`: replaced Google credential examples with the required Supabase storage variables.
- `package.json`, `package-lock.json`: added `@supabase/supabase-js` and `server-only`.
- `src/lib/env.ts`: requires `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_STORAGE_BUCKET`; keeps database/auth validation and optional SMTP behavior; makes legacy Google values non-blocking for the existing Drive code; exposes masked `storage` readiness.
- `src/lib/supabase-server.ts`: server-only `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)` module.
- `tests/config-and-rate-limit.test.ts`: covers valid readiness, precise missing-storage errors, secret masking, and client-component isolation.

## Tests/output

- Focused configuration test: passed, 23 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- Full `npm test`: passed, 23 tests passed.
- `git diff --check`: passed.

## Security notes

- The service-role key is server-only and is not prefixed with `NEXT_PUBLIC_`.
- No client component imports the service-role module or references the service-role key.
- Diagnostics readiness exposes booleans only; secret values are not returned.
- `.env.example` contains only a placeholder service-role key.

## Concerns

- Existing Drive routes and diagnostics still reference the legacy `drive` readiness field and Google-backed behavior; route/UI renaming and storage route replacement are intentionally deferred to later tasks.
- The working tree already contained unrelated generated changes in `next-env.d.ts` and `tsconfig.tsbuildinfo`; they were not staged or committed.
