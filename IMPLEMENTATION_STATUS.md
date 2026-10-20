# Implementation status

The original repository contained only `implementation.md`, so this application was bootstrapped from an empty directory.

## Phase gates

- [x] Phase 1 — repository audit: no prior app, environment, or Git metadata existed.
- [x] Phase 2 — architecture: Next.js App Router, PostgreSQL/Drizzle, Supabase Auth, Argon2id, local/Drive storage adapters.
- [x] Phase 3 — database/backend source: schema, migration, transactional creation, streaming uploads, access policies, optimistic edits, dashboard queries.
- [x] Phase 4 — UI source: home, creation, viewer, one-time reveal, passwords, attachments, dashboard, auth pages, responsive styling.
- [x] Phase 5 — storage/expiration source: private local adapter, private Google Drive adapter, session-based one-time access, cleanup worker and protected endpoint.
- [x] Phase 6 — security/test source: CSP, same-origin mutation checks, rate limiting, input validation, attachment delivery headers, unit/integration/E2E suites.
- [ ] Phase 7 — live readiness gate: dependency installation, database migration, automated test execution, production build, and browser QA require registry/database access.

## Deliberate boundaries

- Local storage is rejected when `NODE_ENV=production`.
- Anonymous creators cannot select Forever; signing in later never claims their clips.
- Active and uploading names are reserved atomically; expired or deleted names can be published again while historical rows remain tombstoned.
- Uploads stream through the application. Do not deploy the upload routes to a platform with a request-body limit below `MAX_CLIP_BYTES`.
- The service worker caches only `/`, `/offline`, and the icon. It never handles clip or API paths.
- File previews are intentionally omitted in the first secure release. Downloads are forced as `application/octet-stream` with `Content-Disposition: attachment`.
- The optional malware scanning hook is documented but not enabled until an actual scanner is configured.
