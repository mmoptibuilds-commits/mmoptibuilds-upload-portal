# QA checklist

Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` before
deployment. Then test with real credentials in a disposable or low-risk
environment:

1. Sign in as each initial user and verify their histories are isolated.
2. Try normal-user access to `/admin`; it must redirect to `/upload`.
3. Upload one file, several files, and a nested folder. Confirm the objects
   appear inside the private Supabase Storage bucket and the manifest reaches
   `completed`.
4. Pause during a large upload, resume, disconnect the network, reconnect, and
   retry.
5. Disable a user and verify their existing session can no longer access
   protected routes.
6. Change a password and verify the old session is revoked.
7. Confirm a completed upload records one notification attempt. Temporarily
   bad SMTP must not mark the batch as failed; email is best-effort rather than
   exactly-once.
8. Check keyboard-only login, visible focus, 320px layout, Android Chrome file
   picker, and reduced-motion mode.
