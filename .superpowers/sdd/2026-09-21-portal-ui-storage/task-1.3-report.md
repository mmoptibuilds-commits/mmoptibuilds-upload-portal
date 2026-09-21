# Task 1.3 report — storage path and object verification helpers

## Status

PASS. Implemented the storage security boundary without changing API routes or UI. The implementation follows the exact Supabase methods and response fields recorded in `task-0.2-report.md`: `createSignedUploadUrl(path, { upsert: false })` with `data.path`/`data.token`, and `info(path)` with `data.size`, `data.contentType`, and `data.lastModified`.

## Implementation

### Pure path boundary

Added `src/lib/storage-path.ts` with:

- `normalizeStorageRelativePath(input)` for NFC normalization and Windows-to-provider separator conversion;
- `deriveStorageObjectPath(userId, batchId, relativePath)` for the exact `<userId>/<batchId>/<safeRelativePath>` object key;
- identifier-segment validation so a caller cannot inject another prefix through `userId` or `batchId`;
- rejection of POSIX absolute paths, Windows rooted/drive paths, `.` and `..`, duplicate/leading/trailing separators, empty paths, Unicode control characters, and keys longer than 1024 UTF-8 bytes.

`src/lib/security.ts` now delegates its existing `safeRelativePath` behavior to the same canonical normalizer, so current callers and the storage boundary cannot disagree about accepted paths.

### Bounded provider operations

Added `src/lib/storage-operations.ts` with a dependency-injected, network-independent boundary:

- `createSignedUploadAuthorization` derives the owned path internally, calls `createSignedUploadUrl(path, { upsert: false })`, requires the provider response path to equal the derived path, and returns only `{ path, token }`;
- `verifyStorageObject` derives the owned path internally before calling `info(path)`, so no caller-supplied arbitrary object path can be inspected;
- object verification returns only `{ path, size, contentType, lastModified }`, excluding provider object IDs, bucket IDs, versions, etags, and raw metadata;
- both operations have a 10,000 ms default bound through the existing timeout helper;
- provider failures and timeouts become fixed `StorageOperationError` codes/messages. Raw provider errors are not attached as causes, logged, or returned, preventing provider details or embedded tokens from escaping.

Added `src/lib/storage.ts` as the server-only adapter. It imports `server-only`, reads `SUPABASE_STORAGE_BUCKET` through validated `getEnv()`, binds `supabaseServer.storage.from(SUPABASE_STORAGE_BUCKET)`, and exports the two operations. The service-role client remains in the existing server-only module.

The per-object signed-upload token is intentionally returned transiently because the approved direct-browser upload flow requires it. The helper drops the token-bearing `signedUrl`, never writes either value to Postgres, and never includes either value in an error or log.

## Focused security matrix

Added `tests/storage.test.ts` covering:

- exact user/batch/relative path derivation;
- Windows separators;
- valid Unicode names and NFC normalization;
- leading and nested traversal segments;
- POSIX, UNC/rooted Windows, and drive-letter absolute paths;
- duplicate separators, trailing separators, empty input/file names;
- NUL, C0, DEL, and C1 controls;
- overlong multibyte names against the full 1024-byte key;
- malicious user/batch identifier segments;
- non-upsert signed authorization and exact provider path matching;
- omission of signed URLs and provider-only metadata from helper results;
- rejection before `info()` for an out-of-prefix path;
- bounded signed authorization and metadata calls;
- normalized provider errors without provider messages or tokens.

The RED run failed because the two new modules did not exist. The focused GREEN run passed all 29 new cases.

## Self-review

- Requirements coverage: every Task 1.3 change and acceptance item maps to implementation and focused coverage above.
- Ownership: both network methods accept only `{ userId, batchId, relativePath }` and derive the provider path internally.
- Server boundary: only `src/lib/storage.ts` binds the validated bucket and service-role client, and both it and `src/lib/supabase-server.ts` import `server-only`.
- Secret handling: no service-role value is returned; no logs or persistence were added; raw provider errors, signed URL, and provider metadata are discarded.
- Scope: no API route, UI, schema, migration, dependency, or package-lock change was made.
- Mutation review: tests fail for separator drift, omitted traversal/control/absolute/length checks, wrong prefix construction, upsert enablement, arbitrary verification paths, missing timeout wrappers, leaked response fields, raw provider errors, or acceptance of a mismatched signed response path.

## Verification

All commands ran from `/workspace/scratch/de06732e200d/portal-clean`:

```text
npm test
52 tests, 6 suites, 52 pass, 0 fail

npm run typecheck
exit 0

npm run lint
exit 0

npm run build
Next.js production build compiled, typechecked, and generated all pages; exit 0
```

## Concerns / handoff

1. Task 2.2 must send the returned short-lived per-object token directly to the authenticated browser response and must not log or persist it.
2. Task 2.3 must compare returned `size` and normalized `contentType` against immutable manifest values before marking a file complete; this task intentionally provides metadata without changing the completion route.
3. The 1024-byte limit applies to the full UTF-8 object key, including user and batch prefixes. Future validation must not relax the API route to a larger key without revisiting provider compatibility.
4. `next-env.d.ts` and `tsconfig.tsbuildinfo` were pre-existing generated worktree modifications and are intentionally excluded from the task commit.
