# mmoptibuilds upload portal: storage and interface redesign

## Status

Proposed design for review. This document is the boundary for the implementation work that follows.

## Goal

Replace the Google Drive handoff with a small, private Supabase Storage setup and replace the current custom “transfer ledger” interface with a complete, responsive portal UI that feels intentional on desktop and mobile.

The portal remains a controlled, send-only intake tool:

- clients sign in with credentials created by an administrator;
- clients can choose files or folders and submit a batch;
- clients can see progress, retry failed files, and inspect their own batch history;
- clients never receive storage-provider links and cannot browse, download, rename, or delete objects;
- administrators can inspect metadata, user accounts, configuration readiness, and notification events;
- large file bytes do not pass through a Vercel function.

The first production use case is one client in the near term, so the design favors a small operational surface and low configuration burden while preserving the existing upload safety properties.

## Current constraints and risks

The existing application already has working username/password sessions, Drizzle/Postgres metadata, upload manifests, notification claims, and reliability fixes for bounded network work. The current upload path is still coupled to Google Drive in the environment schema, database column names, API routes, email text, admin pages, and browser upload worker.

The remote `main` branch has not received the local reliability/UI work yet. A successful local build therefore does not change the live Vercel deployment. The release process must include a GitHub branch, pull request, merge to `main`, and a deployment check.

The local project uses a `src` alias (`@/*` maps to `src/*`) and does not currently have Tailwind or a `components/ui` directory. The canonical component location for this repository is therefore `src/components/ui`, not a new root-level directory.

## Approved architecture

### Storage

Use a private Supabase Storage bucket, configured once in the Supabase dashboard, with the server-only Supabase service-role client used only to issue upload authorization and verify completed objects.

Production environment variables will be:

```text
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<server-only service role key>
SUPABASE_STORAGE_BUCKET=client-uploads
```

`SUPABASE_SERVICE_ROLE_KEY` must never be prefixed with `NEXT_PUBLIC_`, returned by an API route, embedded in client JavaScript, or committed to Git. The browser receives only the short-lived upload authorization returned by the server for one validated object.

Objects use an application-owned path, not a user-controlled provider URL:

```text
<user-id>/<batch-id>/<validated-relative-path>
```

The server derives this path after validating the batch owner and normalizing the relative path. It does not accept an arbitrary bucket or object path from the browser. This preserves folder hierarchy without requiring provider-side folders.

The upload flow is:

1. Create a Postgres batch manifest without making an external storage call.
2. Reserve one file row under a batch-scoped advisory lock.
3. Generate a Supabase signed upload authorization for the derived object path.
4. Upload the bytes directly from the browser to Supabase Storage.
5. Call the completion endpoint with the database file id, never a provider id supplied by the client.
6. Server-side verification checks that the expected object exists at the expected path and that its metadata/size is consistent before marking the row complete.
7. When every manifest row is complete, transition the batch and deliver the existing claimed notification once.

The exact Supabase client method and resumability transport will be selected from the current official Storage API during implementation. The preferred path is the official signed-upload flow, with resumable TUS only where the current API supports the required signed authorization and browser progress reliably. A failed or expired upload authorization is recoverable by reissuing authorization for the same validated path; no long-lived upload secret is stored in Postgres.

The initial bucket is private. There will be no public object URLs, download links, storage browsing endpoint, or client-side Supabase service client. Supabase Storage RLS/policies and server-side ownership checks are defense in depth; the application API remains the authority for which user may initialize or complete a manifest row.

### Database migration

The current Drive-named columns will not be used by application behavior after the migration. To keep rollback possible and avoid deleting any existing metadata during the first release:

- add a nullable `storage_path` column to `upload_files`;
- alter `upload_batches.drive_folder_id` and `upload_files.drive_parent_id` to allow nulls, and update their Drizzle definitions to be nullable;
- write only the derived Supabase path for new files;
- leave existing Drive values intact but write null to the legacy fields for new Supabase-backed rows;
- remove Drive columns in a later cleanup migration only after production rows and rollback needs have been reviewed.

No existing upload rows are deleted by this release. User-facing pages, health output, email text, logs, and error messages must stop mentioning Google Drive. The batch schema continues to record file counts, byte totals, status, completion timestamps, notification state, and audit history.

The migration must be generated and reviewed with Drizzle. It must be safe to run once against the existing Supabase Postgres database and must not depend on a live Google credential.

### Environment validation and health

`src/lib/env.ts` will require `DATABASE_URL`, `AUTH_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_STORAGE_BUCKET`. Google variables will be removed from the required schema and from `.env.example`.

The health endpoint will report `storageConfiguration` as `configured` or `missing`, with no secret values. It will keep database and email readiness separate. Diagnostics will show “Supabase Storage” rather than “Google Drive.”

### Notifications

Completion email content will identify the client, batch id, file count, byte total, and completion time. It will not include a Drive URL or any storage-provider link. SMTP remains optional; a disabled SMTP configuration is represented as `not_configured`, not as a failed upload.

## Interface system

### Foundation

Adopt Tailwind CSS v4 and a shadcn-compatible component structure without installing several competing UI frameworks. The implementation will use:

- Tailwind v4 for layout and design tokens;
- copied, local shadcn-style primitives under `src/components/ui`;
- `src/lib/utils.ts` with the standard `cn` helper;
- the existing `motion` package only for purposeful transitions;
- a small icon package only if the existing icon layer cannot cover the redesigned controls.

MUI, Chakra, HeroUI, Semantic UI, Aceternity, and ReactBits will be treated as source references, not installed as parallel runtime systems. This avoids duplicated resets, CSS collisions, bundle cost, and inconsistent interaction semantics.

The visual language is a dark technical workspace: near-black canvas, deep blue/teal light, warm signal color for attention, cool white type, compact mono metadata, and strong spacing/rhythm. It must not read as a generic AI dashboard, a glassmorphism template, or a gaming UI.

Typography will be reworked at the root, with a display face for headings, a readable sans face for body copy, and a mono face for paths/status metadata. The final font loading approach must work in local development and Vercel builds without relying on an uncontrolled CSS `@import`.

### Local source components and backgrounds

The supplied Aurora component will be adapted into:

- `src/components/ui/aurora-background.tsx`;
- `src/components/ui/aurora-background-demo.tsx` only if a demo is useful for visual verification.

The Kokonut Beams background and any other selected copy-paste blocks will be brought into the same local component folder from their authoritative source, with attribution in code comments where the source requires it. Components will be adapted to the repository’s Tailwind v4 tokens and accessibility requirements rather than pasted with incompatible imports.

Background effects are route-specific and layered behind content:

- login: Aurora/beam atmosphere with a restrained focus frame;
- upload: low-contrast beams or dither texture behind the intake panel;
- admin: quieter grid/texture treatment so data tables remain dominant;
- reduced-motion users: static gradients/textures and no continuously animated backgrounds.

No background effect may reduce contrast, intercept pointer events, create a keyboard trap, or force a large canvas/WebGL dependency for a simple decorative result.

### Pages and components

The redesign covers every visible route, not only the login page.

Login:

- clear client-access framing and concise copy;
- redesigned credential fields with visible focus/error states;
- password visibility control with an accessible label;
- remember-device control;
- a calm, intentional submit/loading/error state;
- responsive composition that does not leave a blank “hero” column on small screens.

Authenticated shell:

- compact brand mark and workspace label;
- desktop side navigation and a usable mobile navigation pattern;
- active route state, user identity, role badge, and reliable logout;
- skip link, landmark labels, keyboard-visible focus, and reduced-motion behavior.

Client upload:

- dropzone and file/folder picker with clear supported behavior;
- selected-file manifest with path, size, status, progress, speed, retry, and remove controls;
- batch summary with total files/bytes and a single primary submission action;
- explicit storage/privacy note that does not mention Google Drive;
- resilient empty, preparing, uploading, paused, reconnecting, partial failure, complete, and error states.

Client history:

- batch list with readable status badges, dates, counts, and totals;
- mobile-friendly cards or responsive table;
- no object URLs and no accidental file download controls.

Admin:

- overview cards for users, batches, volume, and storage readiness;
- searchable/legible batch table with client, batch, state, size, notification state, and timestamp;
- user management with enabled/disabled and role states;
- diagnostics with database, auth, Supabase Storage, and email readiness;
- recent notification events and actionable empty/error states.

Every interactive component needs loading, disabled, error, empty, and success behavior appropriate to its operation. Tables must remain readable at narrow widths. Decorative effects must never compete with the primary transfer action.

## Reliability and security invariants

- No large file bytes are proxied through a Vercel route.
- Every upload initialization and completion checks the authenticated user and batch ownership.
- Relative paths are normalized and rejected if they escape the intended object prefix.
- Batch/file accounting remains serialized by the existing advisory-lock strategy.
- Retried initialization is idempotent for the same batch/path/immutable metadata.
- Completion is idempotent and cannot move a completed row backward.
- A browser cannot complete a file by submitting an arbitrary storage path or object id.
- Signed upload authorization is short-lived and scoped to one derived object path.
- No service-role credential is client-visible.
- Server logs contain identifiers and outcomes, not passwords, tokens, or private keys.
- Logout and navigation remain bounded even if a backend request is slow.

## Verification and release

Before release, run:

```text
npm ci
npm test
npm run typecheck
npm run lint
npm run build
npm audit --omit=dev --audit-level=high
```

Add focused tests for storage path derivation, environment readiness, upload initialization/completion validation, idempotent retries, and removal of Drive configuration from health/diagnostics. Run an HTTP smoke test against the production build. Run Playwright when the browser binary is available; if the environment cannot download it, report that limitation separately instead of claiming end-to-end coverage.

If Supabase credentials are available in a local environment, run one non-destructive storage readiness check against the configured private bucket and one small authenticated upload/complete round trip. Do not create, expose, or delete production client data during automated verification without an explicit test bucket/object plan.

Release through GitHub:

1. create a feature branch from the current local reliability branch;
2. commit the design, migration, storage/API changes, UI changes, tests, and setup documentation in reviewable commits;
3. push the branch using the GitHub integration;
4. open a pull request against `main` with verification results and required Vercel/Supabase environment variables;
5. merge only after the checks pass and the diff is reviewed;
6. verify that Vercel deployed the merge and run the live health/login/upload smoke checks.

Vercel production variables must be configured before the merged deployment is considered ready. Supabase must have the private bucket and the generated database migration applied before the first client upload.

## Rollback

If the new storage path fails before any production upload is accepted, revert the application deployment and keep the additive migration in place. Because legacy Drive columns are retained during the first release, database rollback does not require reconstructing deleted metadata. Do not automatically delete Supabase objects or old rows as part of rollback.

## Explicit non-goals

- Google Drive support after this migration;
- public registration or client self-service account creation;
- client downloads or storage browsing;
- a second storage provider;
- a full general-purpose design-system package;
- adding MUI, Chakra, HeroUI, Semantic UI, and other full UI frameworks simultaneously;
- passing large files through Vercel serverless functions;
- decorative animation that compromises performance or accessibility.
