# Architecture

The application is a Next.js App Router service deployed to Vercel.

- Supabase Postgres stores users, opaque sessions, upload batches, file
  manifests, notifications, and audit events.
- Supabase Storage stores the uploaded bytes in one private bucket named by
  `SUPABASE_STORAGE_BUCKET` (normally `client-uploads`).
- Vercel serves the UI and runs the authenticated server routes.

For each file, the server validates the authenticated user, batch, relative
path, size, and MIME type. It derives an immutable object path, reserves a
manifest row, and creates a short-lived signed upload token. The browser sends
the bytes directly to Supabase Storage through the resumable TUS endpoint in
6 MiB chunks. The server verifies the resulting object against the manifest
before marking the file complete.

The server never returns the Supabase service-role key to the browser. The
bucket remains private; the portal uses the service role only inside server
routes to create signed upload authorization and verify objects.

The database still contains nullable legacy Drive columns in the migration
history for safe rollback and old data compatibility. They are not populated,
read by the active upload flow, or required for setup.
