# Beginner production release guide

This file is the short, exact checklist for putting this portal online.

## What this release uses

| Part | Service | Purpose |
| --- | --- | --- |
| Source code | GitHub | Stores the application code |
| Database and file storage | Supabase | Stores users, sessions, upload metadata, and private uploaded files |
| Web hosting | Vercel | Runs the Next.js application and API routes |

Google Drive, a Google service account, Vercel Blob, and Composio are **not**
runtime requirements for this version. Do not add them to the Vercel project.

The connected Supabase project is `client upload portal` in `ap-south-1`. Its
private bucket named `client-uploads` has been created and verified. The Vercel
account does not yet contain a project for this repository, so the Vercel
project must be created in the steps below.

## Important: rotate the credentials that were pasted earlier

The earlier conversation included live-looking database, application, Supabase,
Google, and initial-user credentials. Treat every one of those values as
compromised. Do this before production:

1. In Supabase, open **Project Settings → Database** and reset the database
   password. Then open **Connect** and copy a fresh **Transaction pooler** URI.
2. In Supabase, open **Project Settings → API Keys** (called **API** in some
   dashboard layouts). Create/copy a fresh server-only secret/service-role key
   and revoke the exposed one if the dashboard offers that action.
3. In Google Cloud, open **IAM & Admin → Service Accounts**, open
   `upload-portal-drive`, then **Keys**. Delete the exposed key. Because this
   portal no longer uses Drive, leave the service account disabled or delete it
   only after checking that no other project needs it.
4. Generate a new `AUTH_SECRET` using the command in the next section.
5. Change any initial user password that was shared outside your password
   manager.

Never commit these values to GitHub and never place a server secret in a
`NEXT_PUBLIC_*` variable.

## Step 1: clone and install on Windows

Open PowerShell and run:

```powershell
cd C:\Users\YOUR_WINDOWS_USERNAME\projects
git clone https://github.com/mmoptibuilds-commits/mmoptibuilds-upload-portal.git
cd mmoptibuilds-upload-portal
npm ci
Copy-Item .env.example .env.local
notepad .env.local
```

If the folder already exists, run only `cd` into it and `npm ci`.

## Step 2: fill in `.env.local`

Put these five required values in `.env.local`:

```dotenv
DATABASE_URL=paste-the-fresh-transaction-pooler-uri-here
AUTH_SECRET=paste-a-new-random-secret-here
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=paste-the-fresh-server-only-key-here
SUPABASE_STORAGE_BUCKET=client-uploads
```

Generate the application secret in PowerShell:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Use the **Transaction pooler** URI from Supabase **Connect**. It normally uses
port `6543`; do not use the direct `db.*` hostname on an IPv4-only runtime. If
the database password contains `@`, encode it as `%40` inside the URI. Do not
put quotes around `DATABASE_URL`.

For the first local seed only, add three strong temporary values:

```dotenv
INITIAL_MMOPTIBUILDS_PASSWORD=choose-a-unique-password
INITIAL_TWAHA_PASSWORD=choose-a-unique-password
INITIAL_ADMIN_PASSWORD=choose-a-unique-password
```

SMTP variables are optional. Leave them blank until you have an SMTP provider.
Email notifications are not required for uploads.

## Step 3: migrate the database and create users

Run these commands from the repository folder:

```powershell
npm run db:migrate
npm run db:seed
```

The seed command does not overwrite an existing user. If the users already
exist and you only need to change a password:

```powershell
$env:RESET_USERNAME = "admin"
$env:RESET_PASSWORD = "a-new-password-at-least-10-characters"
npm run db:reset-password
Remove-Item Env:RESET_USERNAME -ErrorAction SilentlyContinue
Remove-Item Env:RESET_PASSWORD -ErrorAction SilentlyContinue
```

The command should print its success line and return to the prompt by itself.
Do not press Ctrl+C unless it has been idle for several minutes. The scripts
now close their database connection before exiting.

After the first successful seed, remove the three `INITIAL_*_PASSWORD` lines
from `.env.local`. Never add them to Vercel.

## Step 4: test locally

Start the app:

```powershell
npm run dev
```

Open <http://127.0.0.1:3000/login>, sign in as `admin`, and check:

- `/admin`
- `/admin/users`
- `/admin/uploads`
- `/admin/diagnostics`
- `/upload`
- `/history`

Check health in another PowerShell window:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health | ConvertTo-Json
```

The response should say `application: "ok"`, `database: "ok"`, and
`storageConfiguration: "configured"`. `emailConfiguration: "not_configured"`
is fine when SMTP is blank.

Run the release checks:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

Optional browser tests require the Playwright browser once per machine:

```powershell
npx playwright install chromium
npm run test:e2e
```

## Step 5: push the code to GitHub

The repository must not contain `.env.local` or any secret. Check first:

```powershell
git status
git diff --check
```

If you made additional local edits, commit and push the branch:

```powershell
git add .
git commit -m "Prepare portal for production"
git push origin main
```

If the repository asks you to use a pull request, push the feature branch,
open the pull request on GitHub, and merge it into `main` after the checks
pass. Do not force-push `main`.

## Step 6: create the Vercel project

1. Open <https://vercel.com/new>.
2. Choose **Import Git Repository**.
3. Select `mmoptibuilds-upload-portal` from the `mmoptibuilds-commits` GitHub
   account.
4. Select the **Mmoptibuilds** Vercel team if Vercel asks for a team.
5. Keep **Next.js** as the framework and keep the project root at the
   repository root.
6. Before deploying, open **Environment Variables**.
7. Add these five variables to **Production** using the freshly rotated values:

   ```text
   DATABASE_URL
   AUTH_SECRET
   SUPABASE_URL
   SUPABASE_SERVICE_ROLE_KEY
   SUPABASE_STORAGE_BUCKET
   ```

   Set `SUPABASE_STORAGE_BUCKET` to exactly `client-uploads`.
8. Add the SMTP variables only if SMTP is configured.
9. Click **Deploy**.

For the first launch, Production is enough. If you later enable Preview
deployments, add the same storage/database variables to Preview only after
deciding whether preview should share the production Supabase project. Use a
different `AUTH_SECRET` for Preview when possible.

## Step 7: verify the live site

Replace `YOUR-VERCEL-DOMAIN` with the domain Vercel gives you:

1. Open `https://YOUR-VERCEL-DOMAIN/api/health`.
2. Confirm the application and database are `ok` and storage is configured.
3. Open `https://YOUR-VERCEL-DOMAIN/login` and sign in as `admin`.
4. In **Users**, create or enable a test client.
5. Use a private browser window to sign in as that client.
6. Upload one small test file.
7. Confirm the batch reaches **Completed**.
8. In Supabase **Storage → client-uploads**, confirm the object exists.
9. Delete the test object after checking it if it is not real client data.

Only add a custom domain after the Vercel URL passes this test. Use Vercel
**Project Settings → Domains**, follow the DNS records Vercel displays, then
repeat the health and login checks on the custom domain.

## What is already done in this repository

- Supabase Storage replaced the old Google Drive upload path.
- The private `client-uploads` bucket was created in the connected Supabase
  project.
- Database migrations, storage upload orchestration, auth, pagination,
  timeouts, same-origin checks, error/loading pages, and responsive UI are in
  the repository.
- Local lint, typecheck, unit/contract tests, production build, dependency
  audit, and production HTTP smoke checks passed.
- Playwright test discovery passed; the actual browser run only needs the local
  Chromium install described above.

## What still requires your browser or a fresh secret

- Rotate the credentials from the earlier conversation.
- Put the fresh values in local `.env.local` and Vercel Production variables.
- Run the first real login and small upload against the live Vercel URL.
- Choose a custom domain and configure its DNS if you want one.
- Configure SMTP if you want completion emails.

Do not delete the legacy nullable `drive_*` database columns yet. They are kept
for rollback compatibility and are not used by the current application.
