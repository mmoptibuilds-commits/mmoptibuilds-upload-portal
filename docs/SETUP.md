# Production setup

This portal is a small Next.js service with three server-side integrations:

- Supabase Postgres stores users, opaque sessions, batch metadata, file metadata, notification events, and audit events.
- Google Drive stores the uploaded bytes in a private folder hierarchy.
- Vercel runs the Next.js app and its server routes.

The portal does **not** use Supabase Auth or Supabase Storage. Never put a database password, Google private key, or seed password in browser code or GitHub.

## What is already prepared

The configured Supabase project is:

- Project name: `client upload portal`
- Project ref: `ldjxwsjwtthynxzkzrdw`
- Region: `ap-south-1`

The Drive root folder is already created:

- Folder: `CLIENT UPLOADS`
- Folder ID: `1Ok4FuEf1cfwkt-hkibgadWUeD-0YSXgB`

The Google Cloud project shown for this deployment is `mmoptibuilds`. The service account still needs to be created or confirmed. Before production, choose one of the two supported Drive credential models below.

## 1. Create the Google Drive credential

In [Google Cloud Console](https://console.cloud.google.com/), select project `mmoptibuilds`.

1. Open **APIs & Services → Library** and enable **Google Drive API**.
2. Open **IAM & Admin → Service Accounts** and create a service account, for example `upload-portal-drive`.
3. Create a JSON key for that service account and download it once. Store it in a password manager; do not commit it.
4. Choose exactly one production model:

   **Recommended: Google Workspace Shared Drive.** Create a Shared Drive, move or recreate `CLIENT UPLOADS` inside it, add the service account as a **Content manager**, and set `GOOGLE_DRIVE_SHARED_DRIVE_ID` to the Shared Drive ID. The root folder ID in `GOOGLE_DRIVE_ROOT_FOLDER_ID` must be the folder inside that Shared Drive. Shared Drives avoid the storage-quota problem that can affect service-account uploads in My Drive. See [Google's Shared Drive guide](https://developers.google.com/workspace/drive/api/guides/about-shareddrives) and [Shared Drive setup requirements](https://developers.google.com/workspace/drive/api/guides/enable-shareddrives).

   **Alternative: Workspace domain-wide delegation.** If the folder must remain in a user's My Drive, configure domain-wide delegation in the Workspace Admin console for the service account's client ID with the scope `https://www.googleapis.com/auth/drive`. Set `GOOGLE_IMPERSONATE_EMAIL` to the Workspace user who owns or can edit the root folder. Leave `GOOGLE_DRIVE_SHARED_DRIVE_ID` blank. This option requires a Google Workspace administrator; consumer Gmail accounts do not support domain-wide delegation.

5. From the JSON key, copy `project_id`, `client_email`, and `private_key` into the environment variables below. The private key remains server-only.

Only the root folder hierarchy needs to be accessible. The app creates:

`CLIENT UPLOADS/<username>/<timestamp_batch-id>/<relative folders>/<file>`

Uploaded files are not made public. The app sends `supportsAllDrives=true` on Drive operations and scopes Shared Drive searches when `GOOGLE_DRIVE_SHARED_DRIVE_ID` is set. Do not rely on a service account owning files in My Drive; Google may reject uploads when that account has no storage quota.

## 2. Get the Supabase connection URI

In [Supabase](https://supabase.com/dashboard/project/ldjxwsjwtthynxzkzrdw/settings/database), open **Connect** and copy the **Transaction pooler** URI. It should use the pooler hostname and normally port `6543`; use the exact host and password shown by Supabase rather than guessing the region hostname.

The runtime uses one connection per warm serverless instance, disables prepared statements, and requires TLS. The direct `db.<ref>.supabase.co` endpoint is IPv6-only on many free projects and is not the right Vercel default.

The portal tables have RLS enabled and the `anon`/`authenticated` roles have been revoked from them because this app talks to Postgres only from server routes. Keep those tables out of any future public Data API policy.

## 3. Configure local environment

From the repository root:

```bash
cp .env.example .env.local
npm ci
```

Edit `.env.local` and fill in every required value:

```dotenv
DATABASE_URL=the exact Supabase transaction-pooler URI
AUTH_SECRET=generate a random value of at least 32 characters
GOOGLE_PROJECT_ID=mmoptibuilds
GOOGLE_CLIENT_EMAIL=the service-account email
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_DRIVE_ROOT_FOLDER_ID=1Ok4FuEf1cfwkt-hkibgadWUeD-0YSXgB
```

Generate the auth secret with either:

```bash
openssl rand -base64 48
```

or:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64'))"
```

SMTP is optional. Leave `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` blank if you do not want completion emails; blank optional values are accepted.

## 4. Seed the first accounts

Add strong temporary passwords to `.env.local`:

```dotenv
INITIAL_MMOPTIBUILDS_PASSWORD=...
INITIAL_TWAHA_PASSWORD=...
INITIAL_ADMIN_PASSWORD=...
```

Then run:

```bash
npm run db:seed
npm run typecheck
npm test
npm run build
```

The seed is safe to repeat: existing usernames are skipped. Remove the three `INITIAL_*_PASSWORD` values from the environment after seeding and change the passwords before sharing access.

If an existing account says “username or password is incorrect,” remember that repeating the seed does not replace an existing password. For a deliberate one-time reset, put the values in `.env.local`, run the command, then remove them:

```dotenv
RESET_USERNAME=admin
RESET_PASSWORD=use-a-new-10-character-or-longer-password
```

```bash
npm run db:reset-password
```

The command revokes that account's active sessions. Never add `RESET_PASSWORD` to Vercel.

The live Supabase schema has already been provisioned. Do **not** run `npm run db:migrate` against it unless you have checked the Drizzle migration state and reviewed the SQL. Future migrations must be applied to Supabase before the matching application deploy.

## 5. Local smoke test

```bash
npm run dev
```

Open [http://127.0.0.1:3000/login](http://127.0.0.1:3000/login), sign in, and check:

1. `/api/health` reports `application: "ok"`, `database: "ok"`, and `driveConfiguration: "configured"`.
2. A one-byte text file uploads successfully.
3. A zero-byte file uploads successfully.
4. A folder with nested files keeps its hierarchy in Drive.
5. Pause/resume and a temporary offline event preserve the queue.

## 6. Deploy to Vercel — click-by-click

1. Open [Vercel New Project](https://vercel.com/new).
2. Choose the `Mmoptibuilds` team.
3. Import `mmoptibuilds-commits/mmoptibuilds-upload-portal` from GitHub.
4. Keep **Framework Preset: Next.js**, **Root Directory: `.`**, and **Build Command: `npm run build`**.
5. Add these variables for **Preview** and **Production**:

   - `DATABASE_URL`
   - `AUTH_SECRET`
   - `GOOGLE_PROJECT_ID`
   - `GOOGLE_CLIENT_EMAIL`
   - `GOOGLE_PRIVATE_KEY`
   - `GOOGLE_DRIVE_ROOT_FOLDER_ID`
   - `GOOGLE_DRIVE_SHARED_DRIVE_ID` for the recommended Shared Drive model, or `GOOGLE_IMPERSONATE_EMAIL` for the Workspace delegation model
   - optional `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `NOTIFICATION_EMAIL`

   Do not add the `INITIAL_*_PASSWORD` variables to Vercel unless you intentionally want seed credentials present there. Seed from a trusted local shell instead.

6. Click **Deploy**.
7. Open the deployment URL and check `/api/health`.
8. Sign in and perform one small real upload. Confirm the file appears in the correct Drive folder.

If Vercel shows a database connection error, replace `DATABASE_URL` with the exact Supabase **Transaction pooler** URI from Connect. Do not paste the direct IPv6 `db.*` URI.

## 7. Add the production domain

In Vercel **Project → Settings → Domains**, add the chosen hostname, for example `upload.mmoptibuilds.com`. Vercel will show the exact DNS record for your domain. Add that record at your DNS provider, wait for verification, and leave proxying disabled until Vercel issues the certificate. Then test the custom URL in a private browser window.

## 8. Production acceptance checklist

- `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` are green.
- `npm audit --omit=dev --audit-level=moderate` reports zero vulnerabilities.
- `/api/health` is green without exposing secrets.
- The browser sees `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff`.
- A normal user cannot open `/admin`.
- Disabling a user revokes active sessions.
- There is always at least one enabled admin.
- A batch with more than three files completes only after every declared file completes.
- A notification attempt is recorded once per completed batch. SMTP is best-effort; the upload remains authoritative if the mail provider is unavailable.
- Drive files remain private and the service account has access only to the root folder hierarchy.
