# CODEX MASTER PROMPT — Build a Pastly-Inspired File & Text Sharing Application

## ROLE

Act as a senior full-stack engineer, software architect, UI/UX designer, and security engineer.

Build a complete, production-ready web application inspired by https://pastly.in/.

The application allows anyone to share files, text, code snippets, and documents through short, memorable, custom URLs.

The application must be extremely simple to use, fast, mobile-friendly, secure, and visually polished.

**IMPORTANT: Implement the application inside my existing Next.js project.**

First inspect the entire repository, understand the current technology stack, folder structure, authentication, database, APIs, environment variables, and existing functionality.

Reuse existing working components and integrations wherever possible.

Do not overwrite working code, remove existing functionality, or unnecessarily recreate the project.

Do not simply create mock screens. Implement the actual backend, database, file storage, authentication, access controls, cleanup jobs, and tested application flows.

---

# 1. CORE APPLICATION CONCEPT

Users can create shareable links using unique names.

Example:

- `https://yourdomain.com/college-notes`
- `https://yourdomain.com/project-files`
- `https://yourdomain.com/interview`
- `https://yourdomain.com/my-code`

When someone enters a custom name:

**Scenario A: The name already exists**

Open the existing shared content page.

Depending on the creator's settings, the visitor may:

- Read shared text
- Copy text
- Download files
- Preview supported content safely
- Enter a password to unlock content

**Scenario B: The name does not exist**

Display the creation interface with that name already populated.

Allow the visitor to add files and/or text, choose permissions and expiration, and publish the link.

Ensure uniqueness with an atomic database constraint.

Never overwrite existing content when another user chooses the same name.

Use clean URLs whenever technically possible.

Reserve application routes such as `/dashboard`, `/api`, `/sign-in`, `/sign-up`, `/settings`, and administrative routes.

---

# 2. AUTHENTICATION — SUPABASE

Use Supabase Auth for authentication.

Authentication must be **optional** for creating and viewing content.

Support:

- Anonymous clip creation
- Anonymous public viewing
- Google sign-in
- Email sign-in
- Logged-in user dashboard
- Secure account ownership
- Sign-out

### Ownership rules

When a logged-in user creates a clip, store their verified Supabase user ID as the owner.

When an anonymous visitor creates a clip, store `ownerUserId = null`.

Only the authenticated owner can permanently delete an individually owned clip.

An anonymous creator cannot claim ownership merely by signing in later.

Another authenticated user cannot delete someone else's clip.

All authorization must happen on the server.

Never trust an owner ID submitted by the browser.

For anonymous clips, use automatic expiration and administrative moderation for cleanup.

Do not expose deletion functionality to anonymous visitors.

---

# 3. HOMEPAGE DESIGN

Create a modern, minimalist homepage inspired by Pastly's simplicity, without copying its branding.

Design direction:

- Clean typography
- Soft neutral background
- Attractive accent color
- Smooth micro-interactions
- Rounded input fields
- Subtle animations
- Excellent spacing
- Mobile-first responsive design
- Accessible keyboard navigation
- Beautiful light and dark modes

Hero heading:

**Share anything, instantly.**

Subtitle:

**Choose a name. Add files or text. Share one simple link.**

Main input:

`yourdomain.com/ [your-custom-name]`

Primary button:

**Open / Continue →**

Show immediate name validation and availability feedback.

Use debouncing to avoid excessive API requests.

If the name already exists, navigate to its content.

If the name is available, navigate to the creation interface.

Support direct navigation to custom URLs.

Provide a header containing the app logo, optional sign-in button, and dashboard link for authenticated users.

---

# 4. FILE UPLOAD SYSTEM

Create a drag-and-drop file upload area.

Users should be able to:

- Drag and drop multiple files
- Browse files from their device
- Upload documents
- Upload images
- Upload videos
- Upload PDF files
- Upload ZIP archives
- Upload code files
- Upload other allowed file formats

Default maximum size: **50 MB total per clip**, configurable via environment variables.

Show:

- Selected filenames
- File sizes
- File type icons
- Remove-file option
- Individual upload progress
- Overall upload progress
- Clear error messages
- Upload success confirmation

Allow files and text in the same clip.

At least one file or non-empty text entry is required.

Prevent invalid, oversized, or unauthorized uploads both client-side and server-side.

Validate actual file content where practical, rather than trusting extensions or MIME types.

Prevent path traversal and unsafe filenames.

Do not hold large uploads entirely in server memory.

Implement streaming or resumable uploads compatible with the selected storage backend and deployment environment.

Do not assume Vercel serverless request handling supports arbitrary 50 MB upload bodies.

---

# 5. TEXT AND CODE SHARING

Provide a modern text editor.

Support:

- Plain text
- Markdown
- JSON
- JavaScript
- TypeScript
- Python
- Java
- C
- C++
- HTML
- CSS
- SQL
- Bash
- Other common languages

Implement language selection and syntax highlighting.

Use a lightweight editor such as CodeMirror or Monaco according to project compatibility and bundle-size considerations.

Allow users to:

- Paste text
- Write text
- Share code
- Copy content with one click
- Download text as a file
- View line numbers
- Toggle line wrapping

Store text in the database with the correct encoding.

Render user-supplied text safely.

Never execute arbitrary uploaded code or HTML.

---

# 6. VIEW PERMISSIONS

Add a section:

**WHO CAN OPEN IT?**

Options:

1. Anyone with the link
2. Password protected

Default: Anyone with the link.

If password protection is selected, show:

- Password input
- Show/hide password toggle
- Password confirmation where appropriate

Store passwords using a secure password hashing algorithm such as Argon2id.

Never store plaintext passwords.

Rate-limit unsuccessful unlock attempts.

Protected clip metadata, text, file names, previews, and download URLs must not leak before successful authorization.

---

# 7. EDIT PERMISSIONS

Add a section:

**WHO CAN CHANGE IT?**

Options:

1. No one
2. Anyone
3. Password protected

Default: No one.

For authenticated owners, retain their ability to edit their own clips regardless of public edit settings.

Implement server-side edit authorization for every modification.

Never allow public edit permissions to grant ownership or deletion rights.

For password-protected editing, store a separate edit-password hash.

Support updating text and permitted file attachments while enforcing storage quotas, upload validation, version checks, and rate limits.

Provide safe handling of simultaneous edits to avoid accidental overwrites.

---

# 8. EXPIRATION AND ONE-TIME VIEW

Add a section:

**HOW LONG SHOULD THIS CLIP LAST?**

Provide six selectable options:

- One-time view
- 1 hour
- 24 hours
- 7 days
- 30 days
- Forever

Default: 24 hours.

Only one option can be active at a time.

### One-time view behavior

This feature is essential.

A one-time clip can be revealed successfully only once.

Implement an explicit **Reveal content** action.

Do not consume the clip when the landing page loads.

Do not consume it through:

- Link previews
- Search engine crawlers
- HEAD requests
- Password validation
- Preloading
- Metadata requests

When an authorized viewer explicitly reveals the clip:

1. Atomically claim the clip using a database transaction or conditional update.
2. Allow only the first successful claimant.
3. Create a short-lived secure viewer session.
4. Reveal the text and associated files to that session.
5. Reject all subsequent independent viewing attempts.

For clips containing multiple files, the initial viewer session should allow downloading all attachments for a limited period (for example, 10 minutes).

Avoid consuming the clip separately for each attachment.

Protect against simultaneous requests successfully revealing the same one-time clip.

After the viewing session expires, the content must no longer be available.

### Time-based expiration

Set expiration timestamps on the backend.

Use UTC internally.

Expired content must immediately become inaccessible, regardless of whether a background cleanup job has already run.

### Forever

Store `expiresAt = null`.

Allow the Forever setting subject to configurable storage quotas and anti-abuse policies.

### Cleanup

Create a scheduled cleanup worker to remove:

- Expired clips
- Expired file attachments
- Consumed one-time content after its allowed session ends
- Orphaned incomplete uploads

Ensure database records and external storage remain consistent when cleanup partially fails.

Do not accidentally delete another clip's files.

Reserve names only while a clip is active or uploading. Expired or deleted names may be claimed again; creation retires expired rows atomically before publishing the replacement.

---

# 9. GOOGLE DRIVE FILE STORAGE

Use Google Drive as the file storage backend where it is already configured or selected for this project.

All file access must go through the application's authorization layer.

**Do not use a publicly writable Google Drive folder.**

Support a private application-managed storage structure.

Example:

`UseMe Storage/Storage{1|2|3}/{clipId}/{fileId}`

Assign each clip deterministically to one of the three storage folders. Keep editable text and metadata in PostgreSQL; use Drive for binary attachments so there is only one authoritative copy of text.

Use stable internal identifiers, not user-supplied filenames, as storage object identifiers.

Store file metadata in PostgreSQL, including:

- File ID
- Clip ID
- Original filename
- MIME type
- Size
- Storage provider
- Google Drive file ID
- Upload status
- Creation timestamp

Keep OAuth refresh tokens and credentials securely on the server.

Support an authorized OAuth-based Drive connection for My Drive or an appropriately configured Google Workspace Shared Drive setup.

Do not assume a service account can freely store files in a personal Gmail account's My Drive.

Never expose Drive OAuth tokens to browser clients.

Never make the underlying files publicly accessible.

Implement secure server-mediated downloads.

Include an abstract storage interface so a different storage backend can be added later.

For local development, provide a configurable local storage adapter.

For production, fail clearly if the selected storage backend is not configured rather than silently falling back to ephemeral local disk.

Handle Drive API rate limits, errors, resumable uploads, and quota failures.

---

# 10. DATABASE DESIGN

Use the existing database and ORM if suitable.

Otherwise use PostgreSQL with Prisma or Drizzle.

Create appropriate tables for:

**Users / Profiles**

- Supabase user ID
- Display name
- Email metadata
- Created timestamp

**Clips**

- ID
- Unique slug
- Owner user ID (nullable)
- Text content
- Language
- View access policy
- View password hash
- Edit access policy
- Edit password hash
- Expiration mode
- Expiration timestamp
- One-time consumed timestamp
- Created timestamp
- Updated timestamp
- Version number
- Status

**Attachments**

- ID
- Clip ID
- Filename
- File size
- MIME type
- Storage provider
- Storage object ID
- Upload/scan status
- Created timestamp

**One-time sessions**

- ID
- Clip ID
- Hashed session token
- Expiration timestamp
- Created timestamp

**Upload sessions**

- ID
- Clip ID or draft ID
- Reserved bytes
- Status
- Expiration timestamp

Add useful indexes and foreign keys.

Enforce unique slugs at the database level.

Use atomic operations for one-time viewing and concurrent creation.

Do not permit unauthorized access through direct database or storage APIs.

---

# 11. VIEWER EXPERIENCE

When a visitor opens an existing clip, show an elegant read-only content page.

Display:

- Custom clip name
- Shared text
- Syntax-highlighted code
- List of attachments
- File sizes
- Download buttons
- Copy text button
- Copy share link button
- Expiration information
- Password prompt when needed

Support preview for safe file types where practical.

Force risky file formats to download as attachments rather than executing them.

Use secure response headers and content-type handling.

For expired or consumed links, show a helpful message such as:

**This link has expired or is no longer available.**

Avoid exposing private metadata in error messages.

---

# 12. AUTHENTICATED USER DASHBOARD

Create `/dashboard`.

Only authenticated users can access it.

Display clips owned by the currently authenticated user.

Features:

- View my clips
- Search my clips
- Copy share link
- Open clip
- Edit clip
- Delete clip
- View expiration date
- See current status
- Sort by newest/oldest
- Pagination
- Basic storage usage information

Show statuses such as:

- Active
- Expired
- Consumed
- Forever

On deletion:

1. Verify authentication.
2. Verify clip ownership.
3. Request confirmation.
4. Mark the clip inaccessible.
5. Remove stored files safely.
6. Remove or tombstone the associated records as appropriate.
7. Return a clear success or failure response.

Use retryable cleanup if external storage deletion fails.

Never allow users to delete clips they do not own.

---

# 13. BACKEND AND API ENDPOINTS

Design a clean REST API using Next.js route handlers.

Suggested operations:

- Check custom slug availability
- Create clip
- Read public clip metadata
- Unlock password-protected clip
- Reveal one-time clip
- Upload file
- Finalize upload
- Download authorized attachment
- Edit clip
- Delete owned clip
- List current user's clips
- Run authorized expiration cleanup

Select route names that avoid collisions with existing project routes.

Validate all request bodies using Zod.

Implement consistent error responses.

Protect privileged actions with Supabase server-side authentication.

Add rate limiting to:

- Clip creation
- Upload initiation
- Password attempts
- Clip editing
- Expensive downloads

Enforce quotas and protect against abuse.

Do not expose cleanup endpoints publicly without secure authentication.

---

# 14. MODERN UI/UX REQUIREMENTS

Use Tailwind CSS and existing UI dependencies wherever possible.

Prefer reusable components.

Create polished responsive layouts for:

- Desktop
- Tablet
- Mobile

Implement:

- Drag-and-drop animations
- Upload progress indicators
- Beautiful toast notifications
- Loading skeletons
- Empty states
- Smooth transitions
- Confirmation dialogs
- Accessible dropdowns
- Keyboard shortcuts where helpful
- Consistent focus states
- Light/dark themes
- Copy-to-clipboard feedback

Do not sacrifice performance for unnecessary animations.

Keep the homepage remarkably simple.

The application should feel like a fast utility, not a complicated cloud storage dashboard.

Use original branding instead of copying Pastly's logo or assets.

---

# 15. PROGRESSIVE WEB APPLICATION

Make the Next.js application installable as a PWA.

Implement:

- Valid web app manifest
- Application icons
- Standalone display mode
- Appropriate service worker
- Installability requirements
- Mobile home-screen support
- Offline fallback for safe, non-sensitive pages

Do not cache password-protected content, private attachments, or one-time-view content in shared browser/service-worker caches.

Ensure PWA caching does not accidentally reveal previously expired or deleted content.

Preserve normal browser functionality when the PWA is not installed.

---

# 16. SECURITY REQUIREMENTS

Treat this as a public-facing file-sharing service.

Implement:

- Server-side authorization
- Secure password hashing
- Input validation
- Safe HTML escaping
- File type validation
- Content Security Policy
- Rate limiting
- Upload quotas
- Abuse reporting mechanism
- Safe attachment delivery
- Proper cookie handling
- Protection against path traversal
- Protection against unauthorized deletion
- Atomic one-time-view consumption
- Upload size enforcement
- Strict storage permission checks
- Secure secret management
- CSRF protections appropriate for authenticated mutations

Use no publicly exposed Google Drive credentials.

Provide an optional malware scanning integration or a documented quarantine workflow appropriate to the deployment.

Never treat client-side checks as a security boundary.

---

# 17. TESTING

Implement unit tests and integration tests for critical behavior.

Test at least the following:

1. Guest creates a public clip.
2. Authenticated user creates a clip.
3. Another user cannot delete it.
4. The owner can delete it.
5. A guest cannot delete a clip.
6. Duplicate names are rejected safely.
7. Concurrent creation cannot create duplicate slugs.
8. Public clips open without login.
9. Protected clips reject incorrect passwords.
10. Protected attachments cannot be fetched directly.
11. One-time clips cannot be independently revealed twice.
12. Concurrent reveal requests allow only one claimant.
13. Link previews do not consume clips.
14. Files remain available during the valid one-time session.
15. Expired clips cannot be opened.
16. Expired files cannot be downloaded.
17. Forever clips do not receive an expiry timestamp.
18. Oversized uploads are rejected.
19. Upload failures do not leave permanent orphaned files.
20. Mobile UI remains functional.

Use Playwright where practical for end-to-end testing.

---

# 18. ENVIRONMENT CONFIGURATION

Reuse existing environment variables where possible.

Create `.env.example` with documented placeholders for required configuration.

Typical settings may include:

- Supabase project URL and publishable key
- Database connection URL
- Google OAuth client ID
- Google OAuth client secret
- Secure Google refresh token
- Google Drive root folder ID
- Selected storage provider
- Maximum clip upload size
- Rate-limit configuration
- Cleanup job authentication secret
- Application base URL
- Optional malware scanning configuration

Do not overwrite my existing `.env`.

Do not hardcode secrets.

Never commit real credentials.

---

# 19. DOCUMENTATION AND DEPLOYMENT

Provide:

- Updated README
- Local setup instructions
- Database migration instructions
- Supabase Auth and Google-provider configuration instructions
- Google Drive storage configuration
- Environment variable documentation
- Development commands
- Production build commands
- Cleanup worker setup
- Deployment guidance
- Troubleshooting section

Document hosting-specific constraints for file uploads, background cleanup, persistent connections, and Google Drive OAuth.

---

# 20. IMPLEMENTATION WORKFLOW

Follow these stages:

**Phase 1 — Repository audit**

Inspect the repository and identify existing components, authentication, database, storage integrations, and relevant routes.

**Phase 2 — Architecture**

Select the simplest compatible architecture.

Identify any genuinely missing credentials or external configuration.

**Phase 3 — Database and backend**

Implement migrations, models, storage abstractions, business logic, authorization, and APIs.

**Phase 4 — User interface**

Build the homepage, creation form, clip viewer, password flows, and authenticated dashboard.

**Phase 5 — Storage and expiration**

Implement uploads, secure downloads, Google Drive integration, one-time sessions, and scheduled cleanup.

**Phase 6 — Security and testing**

Implement security controls and execute automated tests.

**Phase 7 — Production readiness**

Run linting, type checks, tests, and production build.

Fix discovered issues.

Update project documentation.

---

# 21. FINAL EXPECTATIONS

Do not stop after planning.

Actually modify the project, create the required files, integrate working APIs, apply database migrations where possible, and implement the application end to end.

Do not use fake upload functionality, hardcoded sample clips, or simulated authentication as substitutes for real behavior.

If external credentials are unavailable, complete all independent implementation work, provide a safe development adapter where appropriate, and document the exact remaining setup.

At completion, provide:

1. Summary of implemented features
2. Files created and modified
3. Database changes
4. API endpoints
5. Environment variables needed
6. Commands to run locally
7. Tests executed and their results
8. Any remaining deployment prerequisites

**PRIMARY GOAL:**

Create an extremely simple, attractive, secure, production-ready platform where visitors can share files and text using custom URLs without logging in, while authenticated creators have full ownership and deletion control.

The experience should be at least as convenient as Pastly, with the added benefits of secure ownership, automatic expiration, one-time viewing, a user dashboard, and optional Google Drive-backed storage.
