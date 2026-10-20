# UseMe

UseMe is a Next.js file-and-text sharing service built from `implementation.md`. Visitors choose a memorable name, publish text and/or files, and share one URL. Accounts are optional; signed-in Supabase users receive ownership and dashboard controls.

## What is implemented

- Atomic custom slugs that become reusable after expiry or deletion
- Anonymous or Supabase-authenticated creation
- Text/code editor with common language highlighting
- Multiple streamed file uploads with per-file and overall progress
- Public and Argon2id password-protected viewing
- Owner, public, or separate-password editing with optimistic version checks
- One-time reveal with an atomic claim and a 10-minute viewer session
- Server-enforced expiration, Forever links for authenticated owners, and retryable cleanup
- Private local-development and Google Drive storage adapters
- Server-mediated downloads with attachment-only response headers
- Authenticated dashboard with search, sorting, pagination, status, storage usage, and deletion
- PostgreSQL-backed rate limits, abuse reports, CSP/security headers, PWA shell, and offline fallback
- Unit, database-invariant, and Playwright mobile/desktop tests

See [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md) for the current verification gate.

## Local setup

Requirements: Node.js 22+, npm, and Docker (or another PostgreSQL 16+ server).

Recommended one-command setup:

```bash
python3 run.py
```

The launcher creates a private `.env.local` with fresh app secrets, installs missing dependencies, starts PostgreSQL, migrates it, and starts the development server. See [ENV_SETUP.md](./ENV_SETUP.md) for a step-by-step guide to Supabase Auth, Google Drive, and Vercel values.

Manual setup:

```bash
npm install
cp .env.example .env.local
docker compose up -d postgres
npm run db:migrate
npm run dev
```

Generate secrets without committing them:

```bash
openssl rand -base64 48
```

Use different random values for `APP_SECRET` and `CLEANUP_SECRET`. Open `http://localhost:3000` after the migration completes.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | yes | Exact public origin used for same-origin mutation checks |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `APP_SECRET` | yes | At least 32 characters; signs short-lived access cookies |
| `NEXT_PUBLIC_SUPABASE_URL` | for accounts | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | for accounts | Supabase browser-safe publishable key |
| `STORAGE_PROVIDER` | yes | `local` in development or `google-drive` in production |
| `LOCAL_STORAGE_PATH` | local only | Private development storage directory |
| `GOOGLE_CLIENT_ID` | Drive | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Drive | OAuth client secret |
| `GOOGLE_REFRESH_TOKEN` | Drive | Offline OAuth refresh token, server only |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | Drive | Private app-owned root folder ID or copied folder URL |
| `MAX_CLIP_BYTES` | optional | Total attachment reservation; defaults to 50 MB |
| `MAX_FILES_PER_CLIP` | optional | Defaults to 20 |
| `UPLOAD_SESSION_MINUTES` | optional | Incomplete upload lifetime; defaults to 60 |
| `ONE_TIME_SESSION_MINUTES` | optional | First viewer's download window; defaults to 10 |
| `ANONYMOUS_MAX_EXPIRY_DAYS` | optional | Maximum anonymous timed retention; defaults to 30 |
| `CLEANUP_SECRET` | yes | Bearer secret for the cleanup route |
| `TRUSTED_PROXY` | optional | Set `true` only behind a proxy that overwrites forwarding headers |
| `MALWARE_SCAN_WEBHOOK_URL` | optional | Reserved for the quarantine integration described below |
| `MALWARE_SCAN_WEBHOOK_SECRET` | optional | Scanner authentication secret |

Never put real values in `.env.example` or expose Drive refresh tokens to the client.

## Supabase Auth configuration

1. Create a Supabase project and copy its Project URL and publishable key into `.env.local`.
2. Under **Authentication → URL Configuration**, set the local Site URL to `http://localhost:3000` and allow `http://localhost:3000/auth/callback`.
3. Email/password auth works through the built-in `/sign-in` and `/sign-up` pages.
4. To enable Google, configure the Google provider in Supabase. In Google Cloud, use the Supabase callback URL shown on that provider page, not the UseMe callback URL.
5. Add `https://your-domain/auth/callback` to Supabase's redirect allow list before deploying.

Without Supabase values, anonymous creation and viewing still work and the UI clearly shows Guest mode. Anonymous clips are never retroactively claimed after sign-in.

## Google Drive setup

Use an OAuth client authorized for a dedicated application account's My Drive, or a Google Workspace identity with access to an appropriate Shared Drive. A service account generally cannot use a personal Gmail user's My Drive as arbitrary storage.

1. Enable the Google Drive API in Google Cloud.
2. Complete an OAuth consent flow requesting the least Drive scope that fits the dedicated storage account and obtain an offline refresh token.
3. Create a private root folder and set its ID as `GOOGLE_DRIVE_ROOT_FOLDER_ID`.
4. Set `STORAGE_PROVIDER=google-drive` and the four Drive credentials.
5. Do not share the root or child folders publicly. The application stores stable internal UUID names and mediates every download.

Uploads use the Drive resumable-upload protocol. New files are deterministically distributed below `root/Storage1`, `root/Storage2`, or `root/Storage3`, then `{clipId}/{attachmentId}`. The app creates the three storage folders when needed. Text remains in PostgreSQL so edits are transactional; Drive stores binary attachments. API errors and quota failures keep the clip unpublished. Cleanup can locate uncommitted Drive files by private `appProperties`.

After filling `.env.local`, verify Supabase Auth configuration plus a real Drive upload/download/delete cycle without exposing credentials:

```bash
npm run verify:integrations
```

This preserves `Storage1`, `Storage2`, and `Storage3` but removes its temporary demo file. Add `-- --keep-demo` if you want to retain `Storage1/.useme-verification-.../demo.txt` for visual inspection in Drive. The check confirms that the Supabase Google provider is enabled, but completing Google sign-in still requires one interactive browser redirect.

## Database and migrations

The initial migration is [drizzle/0000_initial.sql](./drizzle/0000_initial.sql). Apply it once with `npm run db:migrate`. Future schema changes should be generated as additional immutable migrations with `npm run db:generate`; do not edit a migration already applied to production.

Important invariants include:

- A partial unique index reserves `clips.slug` only while a clip is active or uploading; creation retires an expired row atomically before reusing its name.
- password policy and hash nullability must agree.
- Forever rows must have a null expiry; every other mode must have a timestamp.
- one-time reveal is a conditional update inside a transaction.
- attachment rows belong to one clip and storage objects use internal identifiers.

## API surface

- `GET /api/slugs/check?slug=` — validate and check a custom name
- `POST /api/clips` — atomically reserve a name and create/publish a clip draft
- `GET /api/clips/:slug` — return only content authorized for the current viewer
- `PATCH /api/clips/:slug` — optimistic, authorized text/code edit
- `DELETE /api/clips/:slug` — owner-only tombstone and storage cleanup
- `POST /api/clips/:slug/unlock` — rate-limited view-password session
- `POST /api/clips/:slug/edit-unlock` — rate-limited edit-password session
- `POST /api/clips/:slug/reveal` — atomic one-time claim
- `POST /api/clips/:slug/uploads` — authorized attachment-edit reservation
- `PUT /api/uploads/:sessionId/:attachmentId` — token-authorized streamed body
- `POST /api/uploads/:sessionId/finalize` — publish a completed upload set
- `GET /api/clips/:slug/attachments/:attachmentId` — authorized forced download
- `DELETE /api/clips/:slug/attachments/:attachmentId/manage` — authorized attachment removal
- `POST /api/clips/:slug/report` — rate-limited abuse report
- `GET /api/me/clips` — current owner's paginated clips
- `POST /api/internal/cleanup` — secret-protected expiration/cleanup job

## Cleanup

Run the worker at least every 10 minutes from a scheduler on the application host:

```bash
npm run cleanup
```

Or call the protected route:

```bash
curl -X POST -H "Authorization: Bearer $CLEANUP_SECRET" \
  "$NEXT_PUBLIC_APP_URL/api/internal/cleanup"
```

Cleanup first makes expired content inaccessible, then deletes external objects. Failures become `DELETE_FAILED` and are retried on later runs. Expired and deleted names can be claimed again, so a reused URL intentionally points to the newly published content.

## Malware scanning / quarantine

Downloads are always forced as attachments and HTML/SVG is never rendered inline, but this is not malware scanning. Before a public production launch, connect a real scanner (for example, a ClamAV worker or vendor API) at upload completion:

1. Leave the attachment `QUARANTINED` after storage upload.
2. Submit the private object ID to the scanner over an authenticated worker channel.
3. Change it to `READY` only on a clean verdict; delete and mark it `DELETED` on a malicious verdict.
4. Keep viewer and download queries restricted to `READY`, as they are now.
5. Alert and retry inconclusive results rather than publishing them.

The environment placeholders do not silently pretend that scanning occurred.

## Tests and production checks

```bash
npm run typecheck
npm test
TEST_DATABASE_URL=postgresql://... npm test
npm run test:e2e
npm run build
```

The database suite skips unless `TEST_DATABASE_URL` points to a migrated disposable database. It verifies duplicate-name and simultaneous one-time-claim behavior. Playwright runs desktop Chromium and an iPhone-sized project against the real Next.js application.

## Deployment guidance

- Vercel Functions limit request and response bodies to 4.5 MB. Use `MAX_CLIP_BYTES=4000000` on Vercel. Supporting larger Google Drive files requires a separate direct/chunked upload design.
- Set `NEXT_PUBLIC_APP_URL` to the exact HTTPS origin. Same-origin mutation checks intentionally reject a mismatch.
- Use the Supabase transaction-pooler `DATABASE_URL` for Vercel and a direct or session-pooler `MIGRATION_DATABASE_URL` when running migrations.
- Set `STORAGE_PROVIDER=google-drive`. Production intentionally fails instead of falling back to ephemeral local disk.
- Run one cleanup schedule; concurrent runs are safe but waste Drive quota.
- Place the service behind a WAF/CDN for network-level abuse controls, but do not cache `/api/*` or custom clip routes.
- Keep the database password, Drive OAuth values, `APP_SECRET`, and cleanup secret in the host's secret manager.

Copy the names from [.env.vercel.example](./.env.vercel.example) into **Vercel → Project Settings → Environment Variables**. Do not upload an environment file containing real secrets. Run `npm run db:migrate` against `MIGRATION_DATABASE_URL` before the first deployment, add the production `/auth/callback` URL to Supabase, and redeploy after changing any `NEXT_PUBLIC_*` variable.

## Troubleshooting

- **A name stays unavailable after deletion:** intentional tombstoning prevents stale links from resolving to unrelated future content.
- **`Invalid request origin`:** make `NEXT_PUBLIC_APP_URL` exactly match the browser origin, including scheme and port.
- **Uploads stop before 50 MB:** check the reverse proxy and host request-body/time limits; streaming cannot bypass an upstream hard cap.
- **Drive 401:** recreate the offline refresh token for the configured OAuth client; never send it to the browser.
- **Drive 403/quota errors:** verify root-folder access, Shared Drive membership, API enablement, and account quota.
- **Dashboard says authentication is not configured:** set the Supabase URL and publishable key, then restart the application.
- **A build fails on environment validation:** provide `DATABASE_URL`, `APP_SECRET`, `CLEANUP_SECRET`, and the selected storage configuration to the build/runtime environment.
