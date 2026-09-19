# Upload portal setup

This project uses:

- Supabase Postgres for users, sessions, batch metadata, file metadata, notifications, and audit events.
- Google Drive for the actual uploaded bytes.
- A Google Cloud service account for server-side Drive API access.
- Optional SMTP for completion notifications.

The project does **not** use Supabase Auth or Supabase Storage. Do not put a Google private key, database password, or `AUTH_SECRET` in browser code.

## 1. Supabase

The schema has already been provisioned in the Supabase project:

- Project: `client upload portal`
- Project ref: `ldjxwsjwtthynxzkzrdw`
- Region: `ap-south-1`

Copy the connection string from Supabase Dashboard → Connect into `DATABASE_URL`. The database password is intentionally not stored in this repository.

The live database includes the Drizzle tables and indexes. For this initial deployment, run `npm run db:seed` after setting the three `INITIAL_*_PASSWORD` variables. Do not run `npm run db:migrate` against this already-provisioned database unless you first confirm the Drizzle migration-history table and migration state; the schema was applied through Supabase’s migration runner.

For future schema changes, create a new versioned Drizzle migration and apply the reviewed SQL to Supabase before deploying the application.

## 2. Google Drive

The root folder has already been created:

`CLIENT UPLOADS` → `https://drive.google.com/drive/folders/1Ok4FuEf1cfwkt-hkibgadWUeD-0YSXgB`

Create or reuse a Google Cloud project, then:

1. Enable the **Google Drive API**.
2. Create a service account.
3. Create a JSON key for it and keep that key private.
4. Put its `project_id`, `client_email`, and `private_key` into the server environment variables.
5. Share the `CLIENT UPLOADS` folder with the service account’s `client_email` as **Editor**.
6. Set `GOOGLE_DRIVE_ROOT_FOLDER_ID` to `1Ok4FuEf1cfwkt-hkibgadWUeD-0YSXgB`.

The service account needs access to the folder, not just the human Google account that created it. The app will create this structure automatically:

`CLIENT UPLOADS/<username>/<timestamp_batch-id>/...`

Uploaded files are not made public by the app.

## 3. Local configuration and seed

```bash
cp .env.example .env.local
openssl rand -base64 48
npm ci
npm run db:seed
npm run typecheck
npm test
```

Fill in the environment values before running the commands. The seed creates:

- `mmoptibuilds` user
- `twaha` user
- `admin` administrator

Change those passwords before sharing the portal.

## 4. Verify the integrations

Start the app:

```bash
npm run dev
```

Open `/api/health`. A correctly configured deployment should report:

- `application: "ok"`
- `database: "ok"`
- `driveConfiguration: "configured"`

Then sign in as a seeded user, create a small test batch, and upload one small file. Confirm that the file appears under `CLIENT UPLOADS/<username>/...` in Drive.

## 5. Vercel deployment

Add the same server-only variables in Vercel Project Settings → Environment Variables for Preview and Production. Required variables are:

`DATABASE_URL`, `AUTH_SECRET`, `GOOGLE_PROJECT_ID`, `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_DRIVE_ROOT_FOLDER_ID`, `INITIAL_MMOPTIBUILDS_PASSWORD`, `INITIAL_TWAHA_PASSWORD`, and `INITIAL_ADMIN_PASSWORD`.

The SMTP variables are optional. If they are absent, uploads still work and completion notification status is `not_configured`.

After deployment, check `/api/health` and perform one small real upload. Do not expose the `.env.local` file or service-account JSON key in GitHub.
