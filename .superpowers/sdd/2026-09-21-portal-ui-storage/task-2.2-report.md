# Task 2.2 report — signed Supabase upload initialization

## Status

PASS. The upload initialization route now reserves storage-backed manifest rows and returns the verified Supabase signed-upload browser contract. Google Drive initialization, folder caching, resumable-session polling, Drive response fields, and Drive-specific errors were removed from this route.

## Implementation

### Request and ownership boundary

- `POST /api/uploads/init` still requires the portal session before parsing or processing file metadata.
- The request accepts only `batchId`, `relativePath`, `size`, and optional `mimeType`. The schema is strict, so legacy `sessionUrl`, `driveFileId`, and other undeclared authorization fields are rejected rather than silently used or propagated.
- Relative paths continue through the shared canonical path validator. The route derives `<userId>/<batchId>/<relativePath>` server-side with `deriveStorageObjectPath`; no bucket or object path is accepted from the browser.
- The owned batch lookup occurs under the batch advisory lock. Missing, foreign-owned, cancelled, completed, or failed batches return the existing unavailable result, which the route maps to 404. `requireUser()` continues to map authentication failures to the corresponding `AuthError` status.

### Advisory-lock manifest reservation

- Batch ownership, existing-row classification, manifest count/byte checks, and row creation remain serialized with `pg_advisory_xact_lock(hashtext('batch:<id>'))`.
- A new row persists only immutable manifest metadata, `status: "preparing"`, and the server-derived `storagePath`. It does not write `driveParentId`, `driveFileId`, or `resumableSessionUrl`.
- A retry with the same batch/path/file name/size/MIME and matching (or not-yet-populated) storage path reuses the existing row. It does not insert another row and does not re-count the existing file against manifest limits.
- Changed immutable metadata or a conflicting non-null persisted path returns 409.
- A completed row returns 409 and is never moved back to an upload state.

### Signed authorization and renewal

- `createSignedUploadAuthorization({ userId, batchId, relativePath })` is called exactly after the reservation transaction has ended. The Task 1.3 helper performs one bounded `createSignedUploadUrl(path, { upsert: false })` call, derives the path again, validates the provider-returned path, and drops the signed URL.
- Successful authorization is finalized in a second short transaction under the same batch advisory lock. The route re-reads the reserved row, rechecks immutable metadata and completion state, and persists only `status: "uploading"`, `storagePath`, and a cleared storage-neutral error category.
- Authorization renewal for an existing non-completed row issues a fresh short-lived token for the same path. It does not reset `completedBytes` or `completedAt`, does not persist the token, and does not persist a signed URL.
- If initial authorization for a newly created row fails, the row is marked `failed` with `errorCategory: "storage_authorization"`. The conditional update only changes a row still in `preparing`, so a concurrent successful authorization cannot be moved backward. Renewal failure for an existing row leaves its existing state intact.
- The response is exactly `{ fileId, path, token }`. It contains no signed URL, service-role credential, Drive id, or resumable session URL.

## Focused tests and TDD evidence

Added `tests/upload-init-contract.test.ts` and the route-used pure contracts in `src/lib/upload-initialization.ts`.

The first RED run failed because `src/lib/upload-initialization.ts` did not exist. The first GREEN run passed six contract tests. During self-review, a second RED test proved the request contract did not yet expose a strict schema; it failed because `uploadInitializationRequestSchema` was absent. The second GREEN run passed all seven focused tests.

Coverage includes:

- strict rejection of legacy Drive authorization request fields;
- exact new-row values with no legacy provider fields;
- same-metadata retry classification as authorization renewal;
- size/MIME/path conflict classification;
- completed-row non-regression;
- authorization finalization without completion-field or secret persistence;
- exact minimal browser response shape.

The existing Task 1.3 tests continue to cover non-upsert authorization, exact server-derived path use, signed URL omission, provider-path mismatch rejection, bounded timeouts, and normalized provider errors without token leakage.

## Self-review

- **Transaction boundary:** both database transactions end before/after the external Storage call; no provider request runs while a transaction or advisory transaction lock is held.
- **Concurrency:** same-path requests serialize row creation, then may independently receive short-lived tokens for the same immutable path. Finalization rechecks the row under the lock. A completed row cannot regress, and a failed first request cannot overwrite a concurrent successful finalization because failure marking requires `status = 'preparing'`.
- **Idempotency and limits:** the existing row is classified before manifest totals are checked, so a retry neither duplicates nor consumes another file slot/byte allowance. New rows retain the existing count and total-byte boundaries.
- **Secrets:** the route never handles `signedUrl` or the service-role value. Only the Task 1.3 helper's `{ path, token }` result reaches the response, and neither value is logged. Only `storagePath` is persisted.
- **Legacy isolation:** the route imports no Drive module and neither reads nor writes nullable legacy Drive columns. The transitional legacy null guards are not used for storage rows.
- **Scope:** completion and browser transfer code remain unchanged for Tasks 2.3 and 2.4.

No Critical, Important, or Minor implementation finding remained after the strict-request fix.

## Verification

Commands were run from `/workspace/scratch/de06732e200d/portal-clean`:

```text
node --import tsx --test tests/upload-init-contract.test.ts
7 tests, 1 suite, 7 pass, 0 fail

npm test
60 tests, 8 suites, 60 pass, 0 fail

npm run typecheck
exit 0

npm run lint
exit 0

git diff --check
exit 0
```

The first `npm run build` compiled and typechecked, then correctly stopped during page-data collection because the worktree has no required server environment variables. It was rerun with non-secret validation-only placeholder values for `DATABASE_URL`, `AUTH_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_STORAGE_BUCKET`; the complete Next.js production build passed and generated all routes.

No live Supabase upload was attempted because no test-bucket credentials or explicit object plan were provided.

## Concerns and handoff

1. The repository still has no API-route/database integration harness. The focused tests exercise the exact pure schema/value/classification/response helpers used by the route, while SQL ownership, 401/404 mapping, advisory locking, and transaction timing were self-reviewed and typechecked rather than executed against Postgres.
2. `src/components/upload-workspace.tsx` still sends the legacy `resetSession` field and expects `sessionUrl`/`driveFileId`. The strict new route contract intentionally makes the current browser worker incompatible until Task 2.4 replaces it; no browser UI was changed in this task.
3. `src/app/api/uploads/complete/route.ts` remains on the legacy Drive completion flow until Task 2.3. This task does not claim an end-to-end browser upload/complete flow yet.
4. `next-env.d.ts` and `tsconfig.tsbuildinfo` were pre-existing generated worktree modifications and are excluded from the task commit.

## Fix round 1 — review findings addressed

### 1. Revalidate the authenticated active batch during finalization

Root cause: the first implementation reacquired the advisory lock and selected the file row, but did not reselect the batch before updating the file to `uploading`. A request could therefore finalize after the batch was no longer available, and the finalization query did not independently enforce the authenticated batch owner.

Fix:

- `finalizeReservedUpload` now reacquires the batch row after taking `pg_advisory_xact_lock(hashtext('batch:<id>'))`.
- The batch query requires both `batchId` and `input.userId`.
- `isUploadBatchActiveStatus` rejects `cancelled`, `completed`, and `failed`; an absent, foreign, or terminal batch returns `{ kind: "unavailable" }` before any file update.
- The route-used orchestration contract carries the authenticated `userId` and `batchId` into finalization, with focused coverage for active/terminal statuses and ownership context.

### 2. Close the route-testing gap with a production orchestration seam

Added `createUploadInitializationOrchestrator` in `src/lib/upload-initialization.ts`. The real POST route constructs this orchestrator with its actual Drizzle reservation/finalization functions, the actual bounded Supabase authorization helper, and its actual failure-marking function. Tests inject only those external boundaries; they do not import or simulate a separate route implementation.

Added route-used contract mapping and parsing helpers:

- `mapUploadInitializationResult` centralizes the real route’s 200/404/409 response contract;
- `parseUploadInitializationRequest` is called by the real route and converts both `request.json()` failures and schema failures to `{ kind: "invalid" }`;
- orchestration tests cover reservation/finalization success and ordering, unavailable ownership, conflict/limit mapping, terminal-batch handling, authenticated ownership context, provider authorization failure, renewal failure, finalization failure, malformed JSON, and the minimal success response.

### 3. Malformed JSON response

Malformed request bodies are now caught by `parseUploadInitializationRequest` and use the same `400` response as invalid metadata: `This file metadata is invalid.` They no longer reach the generic `502` handler.

### 4. Separate provider authorization and database finalization failures

The orchestrator now has distinct fixed-code `UploadInitializationError` outcomes:

- `authorization_failed`: only a newly reserved row is conditionally marked `storage_authorization`; existing-row renewal failures leave the row state untouched;
- `finalization_failed`: the database finalization exception is surfaced as a distinct safe `502` response and never marks the row as a provider authorization failure.

The provider call remains outside the database transactions. The finalization transaction still rechecks batch ownership/status, file identity, immutable metadata, completion state, and provider path before writing `uploading`.

### Fix-round TDD and verification

The first fix-round orchestration test run failed because the new production seam exports did not exist. After implementation, the focused suite passed 11 tests. A second RED run for the active-batch policy failed because `isUploadBatchActiveStatus` did not yet exist; after wiring that policy into the real finalization path, the focused suite passed 11 tests.

Final commands from `/workspace/scratch/de06732e200d/portal-clean`:

```text
node --import tsx --test tests/upload-init-orchestration.test.ts
11 tests, 1 suite, 11 pass, 0 fail

node --import tsx --test tests/upload-init-contract.test.ts tests/upload-init-orchestration.test.ts
18 tests, 2 suites, 18 pass, 0 fail

npm test
71 tests, 9 suites, 71 pass, 0 fail

npm run typecheck
exit 0

npm run lint
exit 0

git diff --check
exit 0

DATABASE_URL=<non-secret placeholder> AUTH_SECRET=<non-secret placeholder> SUPABASE_URL=<non-secret placeholder> SUPABASE_SERVICE_ROLE_KEY=<non-secret placeholder> SUPABASE_STORAGE_BUCKET=<non-secret placeholder> npm run build
exit 0; production build compiled, typechecked, generated all pages, and listed /api/uploads/init
```

No live Supabase or Postgres operation was performed. Self-review found no further Critical, Important, or Minor findings. The only remaining handoff constraints are the previously recorded Task 2.3/2.4 legacy completion/browser consumers and the pre-existing generated-file modifications, which remain outside this fix commit.
