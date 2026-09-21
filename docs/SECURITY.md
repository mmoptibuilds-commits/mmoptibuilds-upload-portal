# Security review

- Argon2id hashes all passwords. Initial passwords are injected only through
  environment variables during seeding.
- Session cookies are HTTP-only, SameSite Lax, Secure in production, opaque,
  and revocable.
- `requireUser` and `requireAdmin` enforce server-side authorization.
- User-specific batch lookups include the authenticated user ID, preventing
  IDOR through user-supplied IDs.
- Relative paths reject traversal segments and control characters. Unicode and
  normal filenames remain supported.
- Query inputs use Drizzle parameterization. Upload metadata uses Zod
  validation.
- Login uses a fixed dummy Argon2 verification for unknown usernames and a
  bounded IP/account failure limiter.
- The limiter is an in-memory defense in depth for each warm runtime; use
  Vercel WAF/rate limiting for a distributed production limit.
- Supabase `anon` and `authenticated` table grants are revoked; the app uses
  direct server-side Postgres access only.
- Supabase Storage remains private. Browser uploads use short-lived signed
  upload tokens and an immutable server-derived object path.
- Production responses include baseline clickjacking, MIME-sniffing, referrer,
  and permissions headers.
- Content is not downloaded, previewed, or executed by the portal.
- Health and diagnostics expose only safe readiness state, never secret values.

Before production: set a strong `AUTH_SECRET`, use HTTPS, rotate all initial
passwords, keep repository/environment access private, never expose the
service-role key through a `NEXT_PUBLIC_` variable, and keep Supabase API
roles denied on the application tables.
