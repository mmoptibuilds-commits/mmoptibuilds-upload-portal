# mmoptibuilds upload portal

Private client delivery portal for mmoptibuilds. Users sign in with an account
created by an administrator, upload files directly to a private Supabase
Storage bucket, and see the state of their own deliveries. Supabase Postgres
stores accounts, sessions, upload manifests, audit events, and notification
state. Vercel runs the Next.js application.

Google Drive is not required. The browser uses Supabase's resumable TUS upload
endpoint with a short-lived, server-issued upload token, so large files do not
pass through a Vercel function.

## Start here

Follow the beginner deployment guide: [docs/SETUP.md](docs/SETUP.md). The
short production checklist is in [docs/PRODUCTION-RELEASE.md](docs/PRODUCTION-RELEASE.md).

Useful commands:

```bash
npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

Before production, run `npm run lint`, `npm run typecheck`, `npm test`, and
`npm run build`.
