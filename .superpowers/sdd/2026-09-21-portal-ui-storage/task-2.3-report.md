# Task 2.3 report — private Storage completion and notifications

## Status

PASS. `POST /api/uploads/complete` now accepts only the owned database `fileId`, verifies the server-derived private Supabase Storage object through the approved Task 1.3 `verifyStorageObject` helper, compares immutable path/size/content type, finalizes idempotently under the existing batch advisory lock, and preserves claimed notification delivery without exposing a provider URL.

Implementation commit: `2a7b536` (`feat: verify storage upload completion`).

## Request and ownership boundary

- The strict completion request schema is exactly `{ fileId: UUID }`. Extra paths, bucket names, provider object IDs, Drive IDs, and other undeclared fields are rejected with the existing invalid-completion `400` response.
- The initial lookup joins the file to its batch and requires the authenticated `upload_batches.user_id`. A foreign or missing file is represented by the same `404` response.
- Storage verification receives only `{ userId, batchId, relativePath }`. The approved Task 1.3 helper derives `<userId>/<batchId>/<relativePath>` internally and calls `info(derivedPath)`; the route never passes a client path to Storage.

## External verification and immutable metadata

- The route performs the bounded `verifyStorageObject` call after the initial ownership query has ended and before opening the finalization transaction.
- The verification result must contain the exact persisted/server-derived path, exact byte size, and a content type matching the immutable manifest MIME type after media-type normalization (case and optional `;` parameters). Missing size or content type is a mismatch.
- The finalization transaction derives the owned path again and repeats the path/size/MIME comparison against the current row. A stale pre-verification snapshot therefore cannot authorize a changed row.
- Storage errors and timeouts remain bounded by the Task 1.3 helper and are normalized to a storage-neutral retry-safe `502`; provider messages, IDs, URLs, and tokens are not returned.

## Transaction, idempotency, and retry behavior

- Finalization takes `pg_advisory_xact_lock(hashtext('batch:<batchId>'))`, then re-reads the batch by authenticated owner and re-reads the file by batch/file identity before any update.
- Cancelled/failed batches and missing/currently foreign rows cannot be updated.
- The file update is conditional on `status != 'completed'` and writes only `status`, exact completed bytes, completion time, and a cleared storage-neutral error category. It does not read or write Drive IDs, Drive parent IDs, resumable session URLs, or provider URLs.
- Completed-file retries skip the external Storage call, re-read current state under the lock, and continue manifest accounting without moving the row backward.
- File completion, manifest counts, and the conditional batch transition remain in one transaction. The batch transition is conditional on `status != 'completed'`, so concurrent final-file requests serialize and only one can transition it.
- Database finalization exceptions are normalized separately from Storage verification failures. Either can be retried safely because the transaction is atomic and completed rows are monotonic.

## Notification behavior

- The two-minute pending-claim TTL, notification advisory lock, terminal `sent`/`not_configured` skips, pending event creation, and event/batch status updates are retained.
- SMTP delivery still occurs outside database transactions and remains bounded by the existing timeout helper and transport timeouts.
- Notification delivery is advisory: any claim, SMTP, or notification-status persistence error is converted to `notificationStatus: "failed"` after durable upload completion and cannot turn the valid upload into a failed completion response.
- Email content includes client, batch ID, completion time, file count, byte total, and status. It contains no Drive/Supabase URL or other storage-provider link.

## Focused TDD coverage

Added route-used contracts in `src/lib/upload-completion.ts` and focused tests in:

- `tests/upload-completion-contract.test.ts`
- `tests/upload-completion-orchestration.test.ts`

The RED run failed because the new route-used completion module did not exist. After implementation, the focused suite passed 13 tests. Coverage includes:

- strict `{ fileId }` parsing and rejection of arbitrary paths/provider IDs;
- malformed JSON;
- exact path/size/MIME verification and missing metadata;
- storage-neutral completion writes;
- provider-neutral email text;
- ownership lookup → Storage verification → database finalization → notification ordering;
- no Storage inspection for unavailable rows;
- no finalization after metadata mismatch or provider failure;
- completed-row retry behavior;
- optional notification failure preserving a successful completion;
- normalized database finalization failure;
- storage-neutral success/error response mapping.

## Verification

Commands run from `/workspace/scratch/de06732e200d/portal-clean`:

```text
node --import tsx --test tests/upload-completion-contract.test.ts tests/upload-completion-orchestration.test.ts
13 tests, 2 suites, 13 pass, 0 fail

npm test
84 tests, 11 suites, 84 pass, 0 fail

npm run typecheck
exit 0

npm run lint
exit 0

git diff --check
exit 0

DATABASE_URL=<non-secret placeholder> AUTH_SECRET=<non-secret placeholder> SUPABASE_URL=<non-secret placeholder> SUPABASE_SERVICE_ROLE_KEY=<non-secret placeholder> SUPABASE_STORAGE_BUCKET=<non-secret placeholder> npm run build
exit 0; production compilation/typechecking/static generation succeeded and listed /api/uploads/complete
```

No live Supabase Storage or Postgres operation was performed.

## Self-review

Performed as a separate read-only pass because the task explicitly prohibited subagents. No Critical, Important, or Minor finding remained.

- **Security:** client-controlled provider coordinates are rejected; ownership gates both reads; current ownership and immutable metadata are re-read under the lock; provider details do not escape.
- **Transaction boundaries:** Storage verification and SMTP delivery are outside transactions. File accounting and the batch transition are inside one batch-locked transaction.
- **Concurrency:** concurrent completion requests serialize; a completed row never regresses; notification claims serialize separately and preserve the existing TTL behavior.
- **Response/privacy:** route responses and notification text contain no object URL, signed URL, token, provider ID, or Drive-specific text.

## Concerns and handoff

1. Task 2.4 still owns the browser worker conversion. The current browser UI continues to send the legacy Drive completion field and will receive `400` from this strict route until Task 2.4 changes it to `{ fileId }`; this task intentionally did not modify the browser UI or init route.
2. Verification used deterministic unit/orchestration tests and a production build, not a live private bucket or Postgres integration environment. A later integration/deployment task should exercise a real `info()` response and concurrent final-file requests.
3. The pre-existing generated-file modifications in `next-env.d.ts` and `tsconfig.tsbuildinfo` remain uncommitted and were excluded from the implementation commit.

## Fix round 1 — Important findings

Fix commit: `eb70be6` (`fix: harden completion decision contracts`).

### Finding 1 — raw notification provider errors

Root cause: `deliverCompletionNotification` copied `caught.message` into `notification_events.error`. That allowed SMTP/provider hostnames, URLs, IDs, recipient addresses, and arbitrary-length error text to become admin-visible database data.

Fix:

- Added the route-used `buildNotificationEventUpdate` contract with the fixed provider-neutral code `smtp_delivery_failed`.
- The catch block now retains the caught value only as an ignored input to that contract; no message, name, stack, or provider detail is persisted.
- Every notification event status update uses the contract. Failed events receive the fixed code; successful/non-failed statuses explicitly clear `error` to `null`.
- Added a regression test passing a long malicious error containing a hostname, URL, private ID, newline, and recipient address. The persisted update is fixed and bounded.

### Finding 2 — transactional decision coverage gap

Root cause: the first implementation had route-used orchestration tests, but the route still contained its SQL-adjacent ownership/status/metadata and notification-claim decisions inline. The tests therefore did not exercise those production decisions, and no test covered claim expiry or current-row transition classification.

Fix:

- Added route-used `decideUploadCompletionTransaction` in `src/lib/upload-completion.ts`. The production route calls it inside the existing batch advisory-locked transaction after re-reading the owned batch/current file and counts. It revalidates batch/file identity and ownership, terminal batch/file statuses, immutable relative path/storage path/size/MIME, and the server-derived storage path. It returns the idempotent `complete`, non-final `partial`, `terminal`, `unavailable`, or verification-mismatch decision plus the exact file update/transition timestamp the route applies.
- Added route-used `decideNotificationClaim` and moved the claim status/TTL branch into that contract. The production notification transaction calls it after the existing active-pending SQL filter and advisory lock. It preserves active pending skips, expired pending retries, and `sent`/`not_configured` skips.
- Preserved the existing SQL transaction boundaries: Storage `info()` verification happens before the finalization transaction, SMTP happens after the claim transaction, and file/batch writes remain under the batch advisory lock. The batch update now also requires the re-read owner and current batch status, and an unexpected zero-row transition aborts the transaction for a safe retry.
- Current file `failed`/`cancelled` rows are now terminal decisions and cannot be revived by a completion request.

### Fix-round TDD and focused coverage

The first RED run failed at module loading because the new production decision exports did not exist. A second RED run for server-derived path revalidation returned `complete` for a tampered persisted path; the implementation then re-derived the owned path and passed. A third RED run for failed/cancelled current-row status returned `verification_mismatch`; the implementation then returned `terminal` and passed.

Focused coverage now includes:

- malicious long provider error normalization and bounded fixed-code event updates;
- active pending notification claim within TTL;
- expired pending notification claim;
- `sent` and `not_configured` notification skips;
- current-row owner/batch/file identity revalidation;
- immutable path/size/MIME revalidation;
- server-derived path revalidation;
- failed/cancelled terminal row decisions;
- final-file transition and already-completed batch idempotency;
- existing orchestration guarantees for strict `{fileId}`, external-call ordering, safe retries, and optional notification failure.

The focused contracts are production functions imported and called by the completion route; they are not test-only duplicates. The tests do not claim to execute Drizzle SQL, advisory locks, or a real database. No live Postgres/Supabase integration environment was available, so SQL execution and lock behavior remain a deployment/integration verification concern.

### Fix-round verification

Commands run from `/workspace/scratch/de06732e200d/portal-clean`:

```text
node --import tsx --test tests/upload-completion-contract.test.ts tests/upload-completion-orchestration.test.ts
17 tests, 2 suites, 17 pass, 0 fail

npm test
88 tests, 11 suites, 88 pass, 0 fail

npm run typecheck
exit 0

npm run lint
exit 0

git diff --check
exit 0

DATABASE_URL=<non-secret placeholder> AUTH_SECRET=<non-secret placeholder> SUPABASE_URL=<non-secret placeholder> SUPABASE_SERVICE_ROLE_KEY=<non-secret placeholder> SUPABASE_STORAGE_BUCKET=<non-secret placeholder> npm run build
exit 0; production compilation/typechecking/static generation succeeded and listed /api/uploads/complete
```

### Fix-round self-review and remaining concerns

The separate self-review found no remaining Critical or Important finding. The only remaining concern is unchanged from the original handoff: the browser worker still belongs to Task 2.4 and must switch to `{ fileId }`; no browser/UI or init-route changes were made here. SQL/advisory-lock behavior was not exercised against a real database, and generated `next-env.d.ts`/`tsconfig.tsbuildinfo` changes remain uncommitted.

## Fix round 2 — production terminal notification claim path

Fix commit: `f719a90` (`fix: route notification terminal claims through contract`).

### Finding and correction

The first fix-round extraction covered `sent` and `not_configured` in direct contract tests, but the production notification transaction returned for those statuses before invoking `decideNotificationClaim`. That left the terminal branch outside the route-used decision contract.

The route now uses `decideNotificationClaimForTransaction`, a production helper that invokes `decideNotificationClaim` for the current status before requesting the active-pending SQL lookup. `sent` and `not_configured` therefore return their exact existing skip statuses through the contract and do not run the active-claim query. `pending` and `failed` continue to run the same locked active-pending query with the same two-minute TTL, then pass the result through the same contract before inserting a claim. The notification advisory lock, claim/event updates, external SMTP boundary, and fixed `smtp_delivery_failed` event error remain unchanged.

### Focused coverage

Added a route-used contract test that supplies an observing decision evaluator to `decideNotificationClaimForTransaction` and proves both `sent` and `not_configured` pass through the production helper, return the exact skip statuses, and do not load active claims. Existing focused assertions continue to cover an active pending claim inside the TTL, an expired claim retry, and the direct terminal decisions. The helper is imported by and called from the production completion route; the tests do not claim to execute Drizzle SQL, advisory locks, or a real database.

No browser/UI or init-route code changed. No Drive/provider links, IDs, or schema writes were added to the completion route or notification text.

### Fix-round 2 verification

Commands run from `/workspace/scratch/de06732e200d/portal-clean`:

```text
node --import tsx --test tests/upload-completion-contract.test.ts tests/upload-completion-orchestration.test.ts
18 tests, 2 suites, 18 pass, 0 fail

npm test
89 tests, 11 suites, 89 pass, 0 fail

npm run typecheck
exit 0

npm run lint
exit 0

git diff --check
exit 0

DATABASE_URL=<non-secret placeholder> AUTH_SECRET=<non-secret placeholder> SUPABASE_URL=<non-secret placeholder> SUPABASE_SERVICE_ROLE_KEY=<non-secret placeholder> SUPABASE_STORAGE_BUCKET=<non-secret placeholder> npm run build
exit 0; production compilation/typechecking/static generation succeeded and listed /api/uploads/complete
```

### Fix-round 2 self-review and concerns

The read-only self-review found no new Critical, Important, or Minor finding. The fixed provider-neutral notification error contract remains bounded and the malicious long provider-error regression test remains green. The remaining concerns are unchanged: no live Postgres/Supabase integration environment was available to exercise actual SQL/advisory-lock behavior, the browser worker remains deferred to Task 2.4, and generated `next-env.d.ts`/`tsconfig.tsbuildinfo` changes were intentionally left uncommitted.
