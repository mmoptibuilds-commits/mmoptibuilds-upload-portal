# Security review

- Argon2id hashes all passwords. Initial passwords are injected only through environment variables during seeding.
- Session cookies are HTTP-only, SameSite Lax, Secure in production, opaque and revocable.
- `requireUser` and `requireAdmin` enforce server-side authorization.
- User-specific batch lookups include `batch.userId = session.userId`, preventing IDOR through user-supplied IDs.
- Relative paths reject traversal segments and control characters. Unicode and normal filenames remain supported.
- Query inputs use Drizzle parameterization. Upload metadata uses Zod validation.
- Drive session URLs are capabilities: they are not logged and are cleared after completion.
- Content is not downloaded, previewed, or executed by the portal.
- Health and diagnostics expose only safe readiness state, never secret values.

Before production: set a strong `AUTH_SECRET`, use HTTPS, restrict service-account access to the root folder, rotate all initial passwords, and keep repository/environment access private.
