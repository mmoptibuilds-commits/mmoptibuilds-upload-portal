# QA checklist

Run `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` before deployment. Then test with real credentials:

1. Sign in as each initial user and verify their histories are isolated.
2. Try normal user access to `/admin`; it must redirect to `/upload`.
3. Upload one file, several files, and a nested folder. Check original hierarchy in Drive.
4. Pause during a large upload, resume, disconnect the network, reconnect, then retry.
5. Disable a user and verify their existing session can no longer access protected routes.
6. Change a password and verify the old session is revoked.
7. Confirm a completed upload records one notification attempt, and temporarily bad SMTP does not mark the batch as failed. Treat SMTP delivery as best-effort rather than exactly-once: a provider or process crash can require an operational retry.
8. Check keyboard-only login, visible focus, 320px layout, Android Chrome file picker, and reduced-motion mode.
