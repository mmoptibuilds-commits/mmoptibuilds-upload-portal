# Beginner deployment guide — Vercel

## The short answer

Do **not** deploy first.

You do **not** need to edit the application source code. The code is already in GitHub. First prepare Google Drive and Supabase, then add their secret values to Vercel, and only then deploy.

Your order is:

1. Prepare Google Drive.
2. Copy the Supabase database connection string.
3. Set or reset the first admin password from your computer.
4. Import the GitHub repository into Vercel.
5. Add the environment variables in Vercel.
6. Deploy and test one real upload.

Never put a database password, Google private key, `AUTH_SECRET`, or reset password in GitHub.

## What you need before starting

You need access to:

- GitHub repository: `mmoptibuilds-commits/mmoptibuilds-upload-portal`
- Google Cloud project: `mmoptibuilds` / project ID `mmoptibuilds`
- Google Drive folder: [CLIENT UPLOADS](https://drive.google.com/drive/folders/1Ok4FuEf1cfwkt-hkibgadWUeD-0YSXgB)
- Supabase project: [client upload portal](https://supabase.com/dashboard/project/ldjxwsjwtthynxzkzrdw)
- Vercel team: `Mmoptibuilds`

The Supabase project is already provisioned. Do not create another Supabase project and do not reset this one.

## Step 1 — Prepare Google Drive

The app uploads files into this structure:

```text
CLIENT UPLOADS/<username>/<batch>/<folders>/<file>
```

### 1A. Create the Google service account

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. At the top, click the project selector.
3. Select **Mmoptibuilds**. Confirm that the project ID is `mmoptibuilds`.
4. In the left menu, open **APIs & Services → Library**.
5. Search for **Google Drive API**.
6. Open it and click **Enable**. If it says **API enabled**, continue.
7. Open **IAM & Admin → Service Accounts**.
8. Click **Create service account**.
9. Use a name such as `upload-portal-drive`.
10. Click **Create and continue**. You do not need to give it any Google Cloud project role.
11. Click **Done**.
12. Click the new service account.
13. Open the **Keys** tab.
14. Click **Add key → Create new key → JSON → Create**.
15. A JSON file downloads. Keep it private. Do not upload it to GitHub or send it in chat.

Open the downloaded JSON file with a text editor. You will later need these three values:

- `project_id` — should be `mmoptibuilds`
- `client_email` — looks like `upload-portal-drive@mmoptibuilds.iam.gserviceaccount.com`
- `private_key` — starts with `-----BEGIN PRIVATE KEY-----`

### 1B. Recommended: put the folder in a Shared Drive

This is the easiest reliable production option for a service account. Google documents Shared Drive behavior [here](https://developers.google.com/workspace/drive/api/guides/about-shareddrives).

1. Open [Google Drive](https://drive.google.com/).
2. In the left menu, click **Shared drives**.
3. If you already have a Shared Drive for client uploads, open it. Otherwise click **New** and create one named `Mmoptibuilds Client Uploads`.
4. Move the `CLIENT UPLOADS` folder into that Shared Drive, or create a new folder with that exact name.
5. Open the Shared Drive and click its name at the top.
6. Choose **Manage members**.
7. Add the service account email from the JSON file.
8. Give it the role **Content manager**.
9. Copy the Shared Drive ID from the browser URL or the Shared Drive details.
10. Keep the folder ID as `1Ok4FuEf1cfwkt-hkibgadWUeD-0YSXgB` if that is the folder you moved. If you created a new folder, copy that new folder ID from its URL instead.

You will later enter:

```text
GOOGLE_DRIVE_SHARED_DRIVE_ID = the Shared Drive ID
GOOGLE_DRIVE_ROOT_FOLDER_ID  = the CLIENT UPLOADS folder ID
```

### 1C. Alternative: keep the folder in My Drive

Use this only if you have Google Workspace administrator access. Do not use this option with a normal consumer Gmail account.

1. Share the `CLIENT UPLOADS` folder with the service account email as **Editor**.
2. In the JSON file, copy the numeric `client_id`.
3. Open the Google Workspace Admin console.
4. Go to **Security → Access and data control → API controls → Manage domain-wide delegation**.
5. Click **Add new**.
6. Paste the service account `client_id`.
7. For OAuth scope, enter exactly:

   ```text
   https://www.googleapis.com/auth/drive
   ```

8. Save the delegation.
9. You will later set `GOOGLE_IMPERSONATE_EMAIL` to the Workspace user's email who owns or can edit the folder.
10. Leave `GOOGLE_DRIVE_SHARED_DRIVE_ID` blank.

Do not choose both models for your first setup. Shared Drive is recommended.

## Step 2 — Get the Supabase database connection string

1. Open the [Supabase database settings](https://supabase.com/dashboard/project/ldjxwsjwtthynxzkzrdw/settings/database).
2. Click **Connect** near the top of the page.
3. Find **Transaction pooler**. It may also be labelled **Pooler** with **Transaction** mode.
4. Copy the complete PostgreSQL connection string.
5. Use the string exactly as Supabase gives it to you. Do not build it manually.

It normally looks similar to this:

```text
postgresql://postgres.ldjxwsjwtthynxzkzrdw:YOUR_PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres?sslmode=require
```

The important parts are the pooler host and port `6543`. Do **not** use the direct `db.ldjxwsjwtthynxzkzrdw.supabase.co:5432` address. The direct address caused the original IPv6 `ENETUNREACH` error. Supabase explains its connection options [here](https://supabase.com/docs/guides/database/connecting-to-postgres).

If you do not know the database password, use **Database Settings → Database password → Reset database password**, then copy a newly generated connection string from **Connect**.

## Step 3 — Prepare your computer and set the admin password

This step is needed because the database already contains users, and repeating the seed does not replace an existing password.

### 3A. Install the tools

Install:

- [Node.js 22 or newer](https://nodejs.org/)
- [Git](https://git-scm.com/downloads)

### 3B. Download the project

Open **PowerShell** on Windows, or Terminal on macOS/Linux, and run:

```bash
git clone https://github.com/mmoptibuilds-commits/mmoptibuilds-upload-portal.git
cd mmoptibuilds-upload-portal
npm ci
```

### 3C. Create your private local environment file

On Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
notepad .env.local
```

On macOS/Linux:

```bash
cp .env.example .env.local
nano .env.local
```

Fill in these values in `.env.local`:

```dotenv
DATABASE_URL=paste-the-complete-Supabase-Transaction-pooler-string
AUTH_SECRET=paste-a-random-secret-at-least-32-characters-long
GOOGLE_PROJECT_ID=mmoptibuilds
GOOGLE_CLIENT_EMAIL=paste-client_email-from-the-JSON-file
GOOGLE_PRIVATE_KEY="paste-private_key-from-the-JSON-file"
GOOGLE_DRIVE_ROOT_FOLDER_ID=1Ok4FuEf1cfwkt-hkibgadWUeD-0YSXgB
GOOGLE_DRIVE_SHARED_DRIVE_ID=paste-your-Shared-Drive-ID
GOOGLE_IMPERSONATE_EMAIL=
```

If you selected the My Drive/domain-delegation option instead, leave `GOOGLE_DRIVE_SHARED_DRIVE_ID` blank and enter the Workspace user's email in `GOOGLE_IMPERSONATE_EMAIL`.

Generate `AUTH_SECRET` by running this command and copying its output into `.env.local`:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64'))"
```

For `GOOGLE_PRIVATE_KEY`, preserve the `\n` characters from the JSON value. Do not replace them with random spaces. Do not commit `.env.local`.

Leave the SMTP variables blank for now. Email notifications are optional.

### 3D. Reset the admin password

Open `.env.local` and temporarily add:

```dotenv
RESET_USERNAME=admin
RESET_PASSWORD=choose-a-new-password-with-at-least-10-characters
```

Run:

```bash
npm run db:reset-password
```

You should see a success message. Immediately remove `RESET_USERNAME` and `RESET_PASSWORD` from `.env.local` and save the file.

The live database currently has four users, all enabled, and one enabled admin. The reset command revokes old sessions for the account.

### 3E. Test locally before Vercel

Run:

```bash
npm run dev
```

Open [http://127.0.0.1:3000/login](http://127.0.0.1:3000/login).

Sign in as:

```text
Username: admin
Password: the-new-password-you-just-created
```

Then open [http://127.0.0.1:3000/api/health](http://127.0.0.1:3000/api/health). You want:

```json
{
  "application": "ok",
  "database": "ok",
  "driveConfiguration": "configured"
}
```

Stop the local server with `Ctrl+C` after testing.

## Step 4 — Deploy to Vercel

The repository's `main` branch is already ready. Vercel supports importing a Git repository and automatically deploying future merges to `main`; see [Vercel's Git deployment guide](https://vercel.com/docs/git).

1. Open [Vercel New Project](https://vercel.com/new).
2. Sign in with the GitHub account that can access the repository.
3. Select the `Mmoptibuilds` team.
4. Find `mmoptibuilds-commits/mmoptibuilds-upload-portal`.
5. Click **Import**.
6. On the configuration page, use:

   ```text
   Project name: mmoptibuilds-upload-portal
   Framework preset: Next.js
   Root directory: .
   Build command: npm run build
   ```

   Leave the output directory automatic/default. Do not add a `netlify.toml`, Vercel serverless-function folder, or custom adapter. This is already a Next.js App Router project.

7. Expand **Environment Variables**.
8. Add each variable below one at a time. For the real deployment, select **Production** for each variable:

   ```text
   DATABASE_URL
   AUTH_SECRET
   GOOGLE_PROJECT_ID
   GOOGLE_CLIENT_EMAIL
   GOOGLE_PRIVATE_KEY
   GOOGLE_DRIVE_ROOT_FOLDER_ID
   GOOGLE_DRIVE_SHARED_DRIVE_ID
   GOOGLE_IMPERSONATE_EMAIL
   SMTP_HOST                 optional
   SMTP_PORT                 optional
   SMTP_USER                 optional
   SMTP_PASSWORD             optional
   SMTP_FROM                 optional
   NOTIFICATION_EMAIL        optional
   ```

   Use **either** `GOOGLE_DRIVE_SHARED_DRIVE_ID` or `GOOGLE_IMPERSONATE_EMAIL` according to the Drive model you selected. Leave the other one empty.

   Do **not** add `INITIAL_*_PASSWORD`, `RESET_USERNAME`, or `RESET_PASSWORD` to Vercel.

9. Click **Deploy**.
10. Wait for the build to finish.
11. Click **Visit** to open the deployed site.

Vercel stores environment variables in the project settings and makes them available to the deployment; see [Vercel environment variables](https://vercel.com/docs/environment-variables).

## Step 5 — Test the live Vercel site

Replace `YOUR-VERCEL-DOMAIN` with the domain Vercel gives you.

1. Open `https://YOUR-VERCEL-DOMAIN/api/health`.
2. Confirm `application` is `ok`, `database` is `ok`, and `driveConfiguration` is `configured`.
3. Open `https://YOUR-VERCEL-DOMAIN/login`.
4. Sign in as `admin` with the password from Step 3.
5. Upload a tiny text file.
6. Confirm it appears inside `CLIENT UPLOADS/<username>/...` in Drive.
7. Test a zero-byte file.
8. Test a folder containing a file in a nested folder.
9. Test pause and resume with a larger file.

If `/api/health` says `database: "error"`, return to Vercel **Project → Settings → Environment Variables**, check `DATABASE_URL`, save it again, and redeploy. Use the exact Supabase Transaction pooler string.

If it says `driveConfiguration: "missing"`, one or more Google variables are absent. If it says configured but an upload returns 403, confirm the service account is a Shared Drive **Content manager**, or confirm Workspace domain-wide delegation.

## Step 6 — Add your real domain

1. Open the Vercel project.
2. Open **Settings → Domains**.
3. Click **Add**.
4. Enter your domain, for example `upload.mmoptibuilds.com`.
5. Vercel shows the DNS record to create.
6. Add that record at your domain registrar.
7. Wait for Vercel to verify it.
8. Test the new HTTPS URL in a private/incognito window.

## What not to do

- Do not deploy before adding the production environment variables.
- Do not use the direct Supabase `db.*:5432` URL.
- Do not paste secrets into GitHub, source files, or chat.
- Do not put the Google JSON file in the repository.
- Do not add reset or seed passwords to Vercel.
- Do not create a second Supabase project.
- Do not run `npm run db:migrate` on the live database unless a new migration has been reviewed first.

## Finished checklist

- [ ] Google Drive API enabled.
- [ ] Service account created and JSON key stored privately.
- [ ] Shared Drive selected and service account added as Content manager, or Workspace delegation configured.
- [ ] Supabase Transaction pooler URL copied.
- [ ] Local `.env.local` created and never committed.
- [ ] Admin password reset and reset variables removed.
- [ ] Local `/api/health` is healthy.
- [ ] Vercel project imported from GitHub.
- [ ] Production variables added to Vercel.
- [ ] Vercel deployment succeeded.
- [ ] Live `/api/health` is healthy.
- [ ] Real upload tested in Drive.
- [ ] Custom domain added, if needed.
