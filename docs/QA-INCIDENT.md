# Incident regression QA

These checks cover browser-only incident surfaces that are not safe to
exercise with the current Node test slice without refactoring application
source. The upload retry/abort functions are local to
`src/components/upload-workspace.tsx`, and logout navigation is local to
`src/components/app-shell.tsx`; neither has an exported seam or an existing
React component test harness.

## Automated coverage

Run:

```bash
npm test
```

The Node tests cover the provider-neutral upload protocol:

- invalid TUS configuration is rejected before a transfer starts;
- malformed storage verification data cannot complete a manifest;
- retry backoff remains bounded;
- signed upload options contain only the short-lived upload token;
- uploads resume from a previous TUS URL;
- pause/offline behavior aborts without terminating a resumable URL;
- full-size transport retries probe completion before sending duplicate data;
- duplicate paths are removed from one queue; and
- the concurrency limit is respected.

## Local RSC fallback during incident diagnosis

Keep `npm run dev` as the normal Turbopack path. If protected-route RSC
streams fail while diagnosing an incident locally, run `npm run dev:webpack` to
start the same app with Next's webpack dev-server fallback. The shell also
disables protected-route link prefetching so local navigation does not
concurrently warm every authenticated route while database/Storage timeouts
are under test.

## Manual or future Playwright checks

Run these against a disposable environment with a test account and a test
Supabase bucket. Do not use a production client bucket.

### Logout failure still navigates to login

1. Sign in as a test user.
2. Force `POST /api/auth/logout` to return `500` or abort the request.
3. Click **Log out**.
4. Expected result: the browser navigates to `/login` and refreshes the route
   even though the logout request failed.

### Upload pause and offline abort stay bounded

1. Sign in as a test user.
2. Queue a file large enough to produce multiple TUS chunks.
3. Start the transfer and click **Pause** while it is active.
4. Expected result: the row changes to `paused`, speed drops to zero, and a
   **Retry** action appears.
5. Click **Retry**.
6. Expected result: the upload resumes from the TUS checkpoint or safely
   starts a fresh signed upload authorization.
7. Repeat with browser offline mode.
8. Expected result: the page reports that uploads are paused safely and no row
   remains permanently in `uploading`.

### Storage verification and expired upload URLs

1. Force a Storage object metadata mismatch before completion.
2. Expected result: the file does not become `completed` and the UI offers a
   retryable error.
3. Let a resumable URL expire or return an upload-session error.
4. Expected result: retry obtains fresh signed authorization and does not
   change another user's object or manifest.
