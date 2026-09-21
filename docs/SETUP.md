# Beginner setup: Supabase Storage + Vercel

For the shortest release path, read [PRODUCTION-RELEASE.md](PRODUCTION-RELEASE.md)
first. This file contains the longer setup and troubleshooting reference.

This is the complete setup path for the current application.

You do **not** need Google Drive, a Google service account, Vercel Blob, or
manual application-code edits. Supabase provides both the Postgres database and
private file storage. Vercel runs the Next.js application.

Follow the steps in this order:

1. Prepare Supabase.
2. Create your local environment file.
3. Run the database migration and create the first users.
4. Test the application locally.
5. Push the code to GitHub.
6. Import the repository into Vercel and add the same server variables.
7. Deploy and run one real upload test.

Do not deploy before the local migration and local smoke test are successful.

## What you need

- A Supabase account: <https://supabase.com/dashboard>
- A Vercel account: <https://vercel.com/>
- Access to the GitHub repository:
  <https://github.com/mmoptibuilds-commits/mmoptibuilds-upload-portal>
- Node.js 22 or newer on your computer.
- The repository cloned on your computer.

## 1. Prepare Supabase

### 1A. Create or open the project

1. Open <https://supabase.com/dashboard>.
2. Open the Supabase project you want to use. If you do not have one, click
   **New project** and create one.
3. Wait until the project reports that it is ready.
4. Keep this browser tab open; you will copy three values from it.

Use one Supabase project for this portal. Do not create a second project just
for Storage.

### 1B. Create the private storage bucket

1. In the Supabase project, open **Storage**.
2. Click **New bucket**.
3. Set the bucket name to exactly **client-uploads**.
4. Leave **Public bucket** turned **off**.
5. Create the bucket.

The bucket must stay private. The portal creates short-lived signed upload
authorization on the server, so you do not need to make the bucket public or
write Storage policies for browser users.

### 1C. Check the file-size limit

Supabase applies a global file-size limit and can apply a smaller bucket
limit. Open the Storage settings and make sure the limit is large enough for
the files you will actually send.

The current Supabase limits are plan-dependent: the Free plan allows up to
50 MB per file; paid plans can be configured up to 500 GB per file. The portal
uses resumable uploads, but resumable uploads do not bypass Supabase's plan
limit. If your client's files are larger than 50 MB, use a plan that supports
the required size and set the bucket limit accordingly.

References:

- [Create a Supabase Storage bucket](https://supabase.com/docs/guides/storage/buckets/creating-buckets)
- [Supabase Storage file limits](https://supabase.com/docs/guides/storage/uploads/file-limits)
- [Supabase resumable uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads)

### 1D. Copy the database connection string

1. In the Supabase dashboard, click **Connect** at the top of the project.
2. Choose the **Transaction pooler** connection.
3. Copy the complete URI.
4. Replace its password placeholder with the database password you chose when
   creating the project.
5. Keep the port 6543.
6. Keep sslmode=require if it is present. If the copied URI does not include
   it, append ?sslmode=require (or &sslmode=require if the URI already has
   query parameters).

Use the URI exactly as Supabase gives it. Do not manually invent the pooler
hostname. The transaction pooler is the right choice for Vercel's short-lived
serverless functions, and this project disables prepared statements for that
reason.

If your database password contains reserved URL characters such as @, #, ?,
/, or a space, percent-encode them in the URI. For example, @ becomes %40. Do
not put quotes around the URI value in .env.local.

Reference: [Supabase database connection methods](https://supabase.com/docs/guides/database/connecting-to-postgres)

### 1E. Copy the Supabase server values

In the Supabase dashboard, open **Project Settings → API Keys** (the exact
label may be **API** in older dashboard layouts). Copy:

- **Project URL** → SUPABASE_URL
- The server-only **service role/secret key** → SUPABASE_SERVICE_ROLE_KEY

Use the secret server key, not the public anon/publishable key. Never put this
value in a NEXT_PUBLIC_ variable, a client component, GitHub, or a public
screenshot.

## 2. Set up the project on Windows

Open PowerShell and run:

```powershell
cd C:\Users\YOUR_WINDOWS_USERNAME\projects
git clone https://github.com/mmoptibuilds-commits/mmoptibuilds-upload-portal.git
cd mmoptibuilds-upload-portal
npm ci
Copy-Item .env.example .env.local
notepad .env.local
```

If you already cloned the repository, only run cd into its folder, then run
npm ci and copy .env.example to .env.local if .env.local does not exist.

Open .env.local and fill in these required values:

```dotenv
DATABASE_URL=paste-the-complete-transaction-pooler-uri-here
AUTH_SECRET=paste-a-new-random-secret-here
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=paste-the-server-only-key-here
SUPABASE_STORAGE_BUCKET=client-uploads
```

Generate AUTH_SECRET in PowerShell with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Copy the printed value into AUTH_SECRET. It must be at least 32 characters.
Generate a new value for production; do not reuse a value from a tutorial.

For the first database seed, also fill in the three temporary seed passwords
in .env.local. Each must be at least 10 characters and unique:

```dotenv
INITIAL_MMOPTIBUILDS_PASSWORD=choose-a-strong-password
INITIAL_TWAHA_PASSWORD=choose-a-strong-password
INITIAL_ADMIN_PASSWORD=choose-a-strong-password
```

Leave the SMTP variables blank for now unless you already have an SMTP
provider. Email notifications are optional; uploads do not require SMTP.

Do not add any of these old Google variables:

- GOOGLE_PROJECT_ID
- GOOGLE_CLIENT_EMAIL
- GOOGLE_PRIVATE_KEY
- GOOGLE_DRIVE_ROOT_FOLDER_ID
- GOOGLE_DRIVE_SHARED_DRIVE_ID
- GOOGLE_IMPERSONATE_EMAIL

Also do not put INITIAL_*_PASSWORD, RESET_USERNAME, or RESET_PASSWORD into
Vercel later.

## 3. Create the database tables and first users

Still in the project folder, run:

```powershell
npm run db:migrate
npm run db:seed
```

Expected results:

- Database migrations completed.
- mmoptibuilds created.
- twaha created.
- admin created.

If a user already exists, the seed command prints already exists; skipped. It
does not overwrite that user's password.

Run npm run db:seed only after all three INITIAL_*_PASSWORD values are present.
The seed script checks each password before it checks whether that user already
exists.

### If the database already has users

Do not reset the whole database and do not run destructive SQL. Run the
migrations, then reset only the password you need:

```powershell
$env:RESET_USERNAME = "admin"
$env:RESET_PASSWORD = "a-new-password-with-at-least-10-characters"
npm run db:reset-password
Remove-Item Env:RESET_USERNAME -ErrorAction SilentlyContinue
Remove-Item Env:RESET_PASSWORD -ErrorAction SilentlyContinue
```

The command should print:

Password reset and active sessions revoked for admin.

It should then return you to the PowerShell prompt. The script closes its
database connection before exiting; if an old checkout stays open after the
success line, update the checkout before retrying this command.

## 4. Test locally before Vercel

Start the app:

```powershell
npm run dev
```

Open <http://127.0.0.1:3000/login>.

Sign in with:

- Username: admin
- Password: the password you set or reset

Then test these URLs:

- /admin — admin overview
- /admin/users — user management
- /admin/uploads — upload manifests
- /admin/diagnostics — safe configuration status
- /upload — client upload screen
- /history — the signed-in user's history

Check the health endpoint in PowerShell:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health | ConvertTo-Json
```

You want application and database to be ok, and storageConfiguration to be
configured. emailConfiguration may be not_configured; SMTP is optional.

Run the automated checks before pushing:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

Do not continue to Vercel if one of these fails.

## 5. Push the finished code to GitHub

If you made local changes, commit and push them:

```powershell
git status
git add .
git commit -m "Prepare Supabase Storage portal for production"
git push origin main
```

If your repository uses a different default branch, push that branch instead.
Confirm on GitHub that the latest commit contains the new Supabase Storage
implementation and does not contain .env.local.

## 6. Create the Vercel project

1. Open <https://vercel.com/new>.
2. Choose **Import Git Repository**.
3. Select mmoptibuilds-upload-portal.
4. Keep the detected framework as **Next.js**.
5. Keep the repository root as the project root.
6. Before clicking deploy, expand **Environment Variables**.
7. Add these variables for **Production**:

```text
DATABASE_URL
AUTH_SECRET
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_STORAGE_BUCKET
```

Use the exact values from your working .env.local, except do not copy
temporary seed or reset variables. Add these optional variables only if you
configured email:

```text
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASSWORD
SMTP_FROM
NOTIFICATION_EMAIL
```

For SUPABASE_STORAGE_BUCKET, enter exactly client-uploads.

8. Open Vercel **Project Settings → General** and choose Node.js 22.x or a
   newer supported version if the project does not already use it.
9. Click **Deploy**.

Vercel automatically runs the Next.js build. Do not add a Google integration
and do not add Vercel Blob for this project.

References:

- [Vercel environment variables](https://vercel.com/docs/environment-variables)
- [Deploying a Git repository with Vercel](https://vercel.com/docs/git)

## 7. Verify the live deployment

After Vercel finishes:

1. Open https://YOUR-VERCEL-DOMAIN/api/health.
2. Confirm application is ok.
3. Confirm database is ok.
4. Confirm storageConfiguration is configured.
5. Open https://YOUR-VERCEL-DOMAIN/login.
6. Sign in as admin.
7. Create or enable a test client account in **Users**.
8. Sign in as that client in a private/incognito window.
9. Upload one small test file.
10. Confirm the file reaches completed in the portal.
11. In Supabase **Storage → client-uploads**, confirm the object exists.
12. Delete the test object after verification if it is not a real client file.

Add your custom domain only after the Vercel URL works. In Vercel, open
**Project Settings → Domains**, add the domain, and follow the DNS records
Vercel displays. Test the health endpoint again on the custom domain.

## 8. Remove temporary secrets

After the first successful seed:

1. Delete all INITIAL_*_PASSWORD lines from your local .env.local.
2. Make sure RESET_USERNAME and RESET_PASSWORD are not set.
3. Confirm .env.local is ignored by Git with git status.
4. In Vercel, confirm none of those temporary variables were added.
5. Change the initial admin and client passwords if they were shared with
   anyone else.

## Troubleshooting

### Authentication credentials are invalid from Postgres

This means the database URI or password is wrong, not that the admin login
password is wrong.

1. In Supabase, open **Connect** and copy a fresh **Transaction pooler** URI.
2. Replace the password placeholder with the current database password.
3. Percent-encode reserved characters in the password, especially @ as %40.
4. Save .env.local.
5. In PowerShell, clear an inherited process-level value that can override the
   file:

   ```powershell
   Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
   ```

6. Run the command again.

If you forgot the database password, reset it in the Supabase project settings,
copy a fresh URI, and update .env.local.

### storageConfiguration says missing

Check that all three values are present and spelled exactly:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_STORAGE_BUCKET
```

The bucket name must exactly match the bucket in Supabase. Restart npm run dev
after editing .env.local.

### A file is rejected because it is too large

Check the Supabase global and bucket file-size limits and your Supabase plan.
The Free plan's documented maximum is 50 MB per file. Upgrade or lower the
file size if necessary.

### The login page works but navigation hangs

Check the terminal running Next.js. A database connection stall usually means
the wrong or unreachable DATABASE_URL. Use the transaction pooler URI and the
troubleshooting steps above. For a local bundler fallback, stop the server and
run:

```powershell
npm run dev:webpack
```

### You pasted an old Google private key

Google Drive is no longer used by this application. If a Google private key was
ever pasted into GitHub, Vercel, a chat, or another shared location, revoke
that service-account key in Google Cloud and create a new one only if you still
need it for a separate project. Do not add it to this portal.

## Production checklist

- [ ] Supabase project is ready.
- [ ] client-uploads bucket exists and is private.
- [ ] Supabase file-size limit is large enough for the client files.
- [ ] Transaction pooler URI works locally.
- [ ] npm run db:migrate completed.
- [ ] Initial users exist and passwords were tested.
- [ ] Local health endpoint reports database and storage as ready.
- [ ] Lint, typecheck, tests, and production build pass.
- [ ] GitHub contains no .env.local or secret values.
- [ ] Vercel has the five required production variables.
- [ ] Live health endpoint is healthy.
- [ ] A real upload was completed and checked in private Storage.
- [ ] Temporary seed/reset variables were removed.
- [ ] Initial passwords were rotated if they were shared.
