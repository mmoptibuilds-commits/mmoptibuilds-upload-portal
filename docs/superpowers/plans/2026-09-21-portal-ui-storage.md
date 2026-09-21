# mmoptibuilds portal storage and UI implementation plan

> **Execution note:** This plan is intended for subagent-driven execution with focused reviews after each boundary. Keep the working tree clean between slices and do not merge a slice that has not passed its stated checks.

## Outcome

Ship a production-ready portal that uses private Supabase Storage instead of Google Drive, keeps Postgres as the metadata/auth system, and presents a complete responsive UI built on Tailwind v4 and local shadcn-style primitives. Push the verified branch through GitHub, merge it to `main`, and verify the Vercel deployment.

## Working rules

- Work from the current `backend-reliability-stalls` branch and preserve its bounded backend/network fixes.
- Do not edit or commit `tsconfig.tsbuildinfo`.
- Use `src/components/ui` because the repository alias maps `@/*` to `src/*`.
- Do not add MUI, Chakra, HeroUI, Semantic UI, or another full UI framework as runtime dependencies.
- Do not expose `SUPABASE_SERVICE_ROLE_KEY` to the browser or commit any secret.
- Do not proxy file bytes through a Next.js/Vercel route.
- Use `apply_patch` for source edits and review every generated migration before running it.
- Prefer small reviewable commits: storage contract, upload flow, UI foundation, route redesign, tests/docs, release.

## Phase 0: baseline and source verification

### Task 0.1 — Establish a clean baseline

Files/commands:

- inspect `git status`, branch, recent commits, package lock, and existing test layout;
- run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`;
- record failures separately from known environment limitations;
- remove only generated artifacts from the working tree if they are untracked/generated, never user source changes.

Acceptance:

- baseline result is recorded in the work log/PR body;
- current reliability tests remain green before storage changes begin.

### Task 0.2 — Verify authoritative APIs and component sources

Before implementing Supabase calls, read the current official Supabase Storage documentation/changelog and verify the exact server/client methods for:

- creating a signed upload authorization;
- uploading to that authorization from the browser;
- checking object metadata or existence server-side;
- any supported resumable/TUS path and its authorization requirements.

Fetch the authoritative Kokonut Beams source and inspect the supplied Aurora source. Confirm imports, Tailwind requirements, motion dependency, and licensing/attribution requirements. Do not invent an API shape from memory.

Acceptance:

- implementation notes name the exact methods and response fields that will be used;
- selected background sources have their imports, dependency requirements, source revision, and attribution/license recorded;
- no selected UI block is handed to implementation with an unresolved dependency or incompatible import; Tailwind compilation is verified in Task 3.2 after the foundation exists.

## Phase 1: storage contract and migration

### Task 1.1 — Replace environment contract

Files:

- `src/lib/env.ts`
- `.env.example`
- `src/lib/constants.ts` if storage limits/chunk constants need renaming
- package files for the official Supabase server SDK

Changes:

- add validated `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_STORAGE_BUCKET`;
- remove Google variables from required configuration and examples;
- add a server-only Supabase client module with no client import path;
- expose masked readiness through `getOptionalConfig()`;
- keep SMTP optional and preserve clear configuration errors.

Tests:

- valid/invalid environment readiness;
- ensure diagnostics do not contain secret values;
- ensure a client-bundle import cannot reach the service-role module through client components.

Acceptance:

- app startup no longer requires Google credentials;
- missing Supabase storage configuration produces a precise server error;
- no `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` convention exists.

### Task 1.2 — Add storage path and migrate schema

Files:

- `src/lib/db/schema.ts`
- generated Drizzle migration under the repository’s migration directory
- any schema/type fixtures

Changes:

- add nullable `storage_path` to `upload_files`;
- make `drive_folder_id` and `drive_parent_id` nullable for rollback compatibility;
- preserve the existing Drive route’s writes only until Task 2.1 replaces that route; add explicit null guards at current legacy call sites so the intermediate branch remains type-safe;
- retain existing rows and legacy values; do not drop columns in this release;
- add an index only if the implementation needs efficient path lookup, with a batch/path uniqueness invariant preserved.

Acceptance:

- migration is additive/non-destructive and reviewed against the current schema;
- `npm run db:generate` produces no unexpected second migration;
- typecheck passes with nullable legacy fields handled explicitly;
- Task 2.1 is the blocking follow-up that must remove all new Drive-field writes.

### Task 1.3 — Implement storage path and object verification helpers

Files:

- new `src/lib/storage.ts` or split server/client-safe path helpers as needed;
- `src/lib/security.ts` if path normalization belongs there;
- focused tests.

Changes:

- derive `<userId>/<batchId>/<safeRelativePath>` only on the server;
- reject traversal, absolute paths, NUL/control characters, empty segments, and overlong paths;
- use the bucket from validated server configuration;
- wrap the official signed-upload and metadata verification calls with bounded timeouts and normalized errors;
- keep provider tokens out of logs and Postgres.

Acceptance:

- path tests cover Windows separators, traversal, unicode names, duplicate separators, empty files, and long names;
- verification cannot inspect an object outside the batch/user prefix;
- service-role calls are server-only and bounded.

## Phase 2: upload API and browser transfer

### Task 2.1 — Convert batch creation to storage-neutral metadata

Files:

- `src/app/api/uploads/batches/route.ts`
- related logging/types/tests

Changes:

- create the batch row without creating an external folder;
- set status to `queued` after the manifest row is created;
- preserve file-count/byte-limit validation and user ownership;
- replace Drive-specific errors and log labels with storage-neutral wording.

Acceptance:

- batch creation requires no Google configuration or network call;
- a failed database insert does not leave a provider object behind;
- existing authorization and limits remain enforced.

### Task 2.2 — Convert initialization to signed Supabase authorization

Files:

- `src/app/api/uploads/init/route.ts`
- storage helpers and types

Changes:

- retain the current advisory-lock reservation/idempotency design;
- derive and persist `storagePath` for the row;
- reissue authorization safely for a retry of the same immutable file metadata;
- return only the minimum short-lived authorization payload required by the verified browser API;
- never accept or return a Drive id/session URL.

Acceptance:

- same batch/path/size/mime retries do not create duplicate manifest rows;
- conflicting metadata returns 409;
- unauthorized batch access returns 404/401 as appropriate;
- an expired authorization can be renewed without resetting completed metadata.

### Task 2.3 — Convert completion and notification delivery

Files:

- `src/app/api/uploads/complete/route.ts`
- `src/lib/email.ts`
- `src/lib/types.ts`

Changes:

- accept only the database `fileId` plus the expected completion signal required by the verified protocol;
- server-verify the derived Supabase object and immutable metadata;
- update completed bytes/status idempotently under the batch advisory lock;
- keep the existing notification claim/TTL behavior;
- remove storage-provider URLs from notification text and all response bodies.

Acceptance:

- browser-supplied arbitrary paths/object ids cannot finalize a row;
- a repeated completion request is safe;
- mismatched size/path/mime cannot mark a file complete;
- completion of the final file transitions the batch exactly once;
- email is optional and cannot make a valid upload fail.

### Task 2.4 — Replace the browser upload worker

Files:

- `src/components/upload-workspace.tsx`
- `src/lib/types.ts`
- any small client-side transfer utility

Changes:

- remove Drive resumable session/probe/final response handling;
- use the verified Supabase signed upload transport with progress reporting;
- preserve pause/cancel/retry behavior where the selected transport supports it;
- if a signed upload cannot resume byte-for-byte, make retry semantics explicit and restart only the affected file;
- show path, size, progress, speed, status, and actionable errors without provider jargon.

Acceptance:

- one file can initialize, upload, complete, retry, and complete again safely;
- file/folder selection still preserves relative paths;
- no client bundle contains service-role text or Google Drive strings;
- long requests do not freeze navigation or logout.

## Phase 3: Tailwind v4 and component foundation

### Task 3.1 — Install and configure the minimal UI foundation

Files:

- `package.json` and lockfile;
- `postcss.config.mjs` or the current Tailwind v4 PostCSS configuration;
- `src/lib/utils.ts`;
- `src/app/globals.css`;
- `src/app/layout.tsx`;
- `src/components/ui/*` primitives.

Changes:

- add Tailwind CSS v4 and its PostCSS integration;
- add `cn` and only the primitives actually used by this app;
- define semantic dark tokens, focus styles, motion preferences, surface/border/radius rules, and responsive containers;
- replace uncontrolled remote CSS font import with a deterministic root font strategy;
- retain the app’s security headers and Next configuration.

Acceptance:

- Tailwind utility classes compile in dev and production;
- no competing framework reset is installed;
- keyboard focus and reduced motion are globally usable;
- build output does not depend on an untracked generated file.

### Task 3.2 — Add sourced background/effect components

Files:

- `src/components/ui/aurora-background.tsx`;
- optional `src/components/ui/aurora-background-demo.tsx`;
- local Beams component from the authoritative Kokonut source;
- optional dither/grid/texture component only when it materially improves a route.

Changes:

- adapt imports to the repository alias and motion package;
- keep backgrounds pointer-transparent and SSR-safe;
- add static/reduced-motion variants;
- cap effect density and avoid unnecessary canvas/WebGL work;
- annotate source attribution where required.

Acceptance:

- components render with no hydration warnings;
- the selected sources compile under the repository’s Tailwind v4 setup in both typecheck and production build;
- content contrast remains readable;
- reduced-motion testing disables continuous animation;
- mobile layout and performance remain acceptable.

## Phase 4: complete route redesign

### Task 4.1 — Login and authenticated shell

Files:

- `src/app/login/page.tsx`;
- `src/components/app-shell.tsx`;
- new navigation/brand/status components under `src/components` or `src/components/ui`;
- relevant route CSS removed/replaced by tokens.

Changes:

- rework typography, hierarchy, fields, loading/error states, and remember-device control;
- add the approved Aurora/Beams atmosphere without a blank or unusable mobile hero;
- redesign sidebar/mobile navigation and logout fallback;
- preserve role-based navigation and protected route behavior.

Acceptance:

- login is usable at 320px through desktop widths;
- invalid credentials and slow requests are understandable;
- keyboard-only traversal reaches every control in a sensible order;
- logout always returns to login even if the network call fails.

### Task 4.2 — Upload intake and client history

Files:

- `src/app/upload/page.tsx`;
- `src/components/upload-workspace.tsx`;
- `src/app/history/page.tsx`;
- upload-specific UI components.

Changes:

- replace the old ledger UI with an intake-focused dropzone, manifest table/cards, summary, and transfer state system;
- use the selected route texture at low contrast;
- render all empty/loading/error/success states;
- keep no-download/no-provider-link privacy language.

Acceptance:

- file and folder selection is clear and accessible;
- a large manifest remains usable on mobile;
- progress and retry controls have visible state changes;
- history never leaks another user’s batch or object information.

### Task 4.3 — Admin overview, batches, users, diagnostics

Files:

- `src/app/admin/page.tsx`;
- `src/app/admin/uploads/page.tsx`;
- `src/app/admin/users/page.tsx`;
- `src/app/admin/diagnostics/page.tsx`;
- `src/components/admin-users.tsx` and shared admin components.

Changes:

- replace Drive links/labels with private-storage metadata and readiness;
- build readable metric cards, table/card responsive states, user controls, and diagnostics;
- retain role checks and server-side data filtering;
- avoid decorative animation inside dense data surfaces.

Acceptance:

- admin pages are useful with zero rows and with failure states;
- Supabase Storage readiness is visible without secret leakage;
- no route or copy mentions Google Drive;
- tables have mobile alternatives and no horizontal-layout failure.

### Task 4.4 — Root metadata and page consistency

Files:

- `src/app/layout.tsx`;
- `src/app/page.tsx`;
- route metadata as needed.

Changes:

- align title/description/theme color with mmoptibuilds;
- ensure redirects and protected routes remain correct;
- add a consistent skip link, page container, and background layering.

Acceptance:

- `/` redirects correctly;
- login/authenticated route navigation does not hang;
- no console hydration errors in the production build.

## Phase 5: tests, documentation, and verification

### Task 5.1 — Add focused automated coverage

Files:

- `tests/*.test.ts` additions;
- test helpers only where necessary.

Cover:

- storage path normalization and ownership prefix;
- env validation and masked readiness;
- batch initialization limits/idempotency/conflict behavior;
- completion validation and repeated completion;
- health/diagnostic response names;
- login/logout behavior if current tests need regression coverage;
- absence of Drive-specific configuration in active application files.

Acceptance:

- `npm test` passes with no network-dependent test required;
- tests do not use real production secrets or mutate a production bucket.

### Task 5.2 — Update beginner deployment/setup guide

Files:

- `setup.md` and any README/deployment docs;
- `.env.example`.

Document exact click-by-click steps for:

1. creating/configuring the Supabase private bucket;
2. applying the generated database migration;
3. setting local `.env.local` values;
4. seeding/resetting the first admin;
5. linking/importing the GitHub repo into Vercel;
6. adding production/preview environment variables;
7. deploying and checking `/api/health`;
8. creating the first client and testing a small upload;
9. rotating a leaked secret and rolling back a deployment.

Explicitly say which values come from Supabase, which are generated locally, which belong only in Vercel, and which fields must remain blank when SMTP is not used.

Acceptance:

- a beginner can follow the guide without Google Drive steps;
- the guide does not instruct the user to paste a service-role key into client code or GitHub;
- production readiness has a clear checklist.

### Task 5.3 — Run full verification

Run:

```text
npm ci
npm test
npm run typecheck
npm run lint
npm run build
npm audit --omit=dev --audit-level=high
```

Also run a production HTTP smoke test, inspect response security headers, and run Playwright if browser binaries are available. If the environment cannot download Playwright browsers, record that limitation and do not claim E2E coverage.

If explicitly configured with a safe test bucket/object plan, run one non-destructive Supabase readiness check and one small authenticated upload round trip. Otherwise, verify the storage contract with mocked/focused tests only.

Acceptance:

- all available checks pass;
- every exception is documented with cause and impact;
- no secret appears in logs, artifacts, diffs, or screenshots.

## Phase 6: GitHub and Vercel release

### Task 6.1 — Review and publish

Use the GitHub integration to:

- create a feature branch from the verified local commit;
- publish reviewable commits or the verified tree;
- open a PR to `main` with summary, migration instructions, environment variables, and verification output;
- inspect the diff and checks before merge.

Do not claim the live site changed before the merge and deployment are observable.

### Task 6.2 — Configure and verify Vercel

Before merging/deploying production:

- add `DATABASE_URL`, `AUTH_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, and optional SMTP variables to Vercel Production and Preview environments as appropriate;
- apply the database migration to the linked Supabase project;
- create the private bucket with the documented name;
- redeploy after variables are saved;
- verify the deployment URL, `/api/health`, login, protected navigation, and a small test upload;
- confirm no Google/Drive env requirement remains in Vercel.

Acceptance:

- merged `main` commit is the deployed commit;
- health reports database/auth/storage readiness without secret values;
- a real small test upload reaches the private bucket and completes in Postgres;
- live UI differs from the old deployment on login, upload, history, and admin routes.

## Completion checklist

- [ ] Spec approved and plan committed.
- [ ] Official Supabase upload API verified.
- [ ] Google Drive runtime dependency removed.
- [ ] Additive database migration generated, reviewed, and applied safely.
- [ ] Signed direct-to-storage upload and server verification work.
- [ ] Tailwind v4/shadcn foundation compiles.
- [ ] Aurora/Beams components are local, accessible, and performant.
- [ ] All visible routes are redesigned.
- [ ] Tests/typecheck/lint/build/audit results recorded.
- [ ] Beginner setup/deployment guide updated.
- [ ] GitHub PR reviewed and merged.
- [ ] Vercel deployment and live smoke checks verified.
