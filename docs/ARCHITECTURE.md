# Architecture

The application is a Next.js App Router service deployed to Vercel. Supabase Postgres stores identities, opaque sessions, upload-batch metadata, file metadata, notifications, and audit events. Google Drive owns the actual file bytes.

For each batch, the server creates `CLIENT UPLOADS/<username>/<timestamp_short-id>`. For each file it creates missing folders from the sanitized relative path, initializes a Drive v3 resumable session, and returns only that short-lived file session URL to the authenticated client. The browser uploads chunked bytes directly to Drive. It then asks the server to validate and finalize metadata. This avoids passing large bodies through serverless infrastructure.
