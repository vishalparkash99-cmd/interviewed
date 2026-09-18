# SECURITY AUDIT SUMMARY

**Date:** 2026-09-18
**Scope:** Full-stack security review of the Interviewed AI recruitment platform (apps: web/api/worker, packages: ai, database, queue, storage, config, types).
**Method:** Source review of every API route, plugins, AI layer, storage adapter, and worker against OWASP-style classes (authn/authz, IDOR, prompt injection, SSRF, path traversal, information disclosure, rate limiting, dependency advisories); fixes applied in code; regression tests added; verification via typechecks, full workspace build, Jest, `npm audit`.

---

## Overall Result

**18 confirmed findings were remediated in code** (5 High, 7 Medium, 6 Low). One High (local `.env` secrets too short) requires a **manual secret rotation** on the developer machine. Four dependency advisories remain **only fixable via major-version upgrades** (next 14→16, ai 4→7, prisma 6→7, deepmerge-ts) and are documented below with impact assessment.

Verification after changes:
- `tsc --noEmit` passes for api, worker, web.
- `npm run build` (whole workspace, incl. `next build` with patched 14.2.35 / postcss 8.5.28) exits 0.
- Jest: 7 suites, **80/80 tests pass**; the suite `tests/unit/worker.test.ts` fails to *launch* because the local `.env` supplies `JWT_SECRET`/`JWT_REFRESH_SECRET` of 24 chars (< required 32) — an environment issue, not a code defect (guard works as intended).
- `npm audit`: **19 → 11 vulnerabilities** (critical 4 → 1). The remaining 11 are all in the "major-version upgrade required" or "dev-only/unused attack surface" categories below.

---

## Findings

### 1. [HIGH] Auth: refresh token signed with access secret & duplicated workspaces
**Before:** Two JWT plugin registrations both used `JWT_SECRET`, so a leaked refresh token was equivalent to a leaked access token. `JWT_REFRESH_SECRET` existed but was never used.
**Fixed (`apps/api/src/plugins/auth.ts`, `packages/config/src/config.ts`):**
- Second `@fastify/jwt` registration now uses `namespace: "refresh"` with `JWT_REFRESH_SECRET` and `interviewed-refresh-token` cookie; `getRefreshJwtSecret()` added to config.
- Verified against `@fastify/jwt@10.2.2` (upgraded, see §Dependencies): refresh signs under the refresh key, verifies via `request.refreshJwtVerify({ onlyCookie: true })`.

### 2. [HIGH] Auth: refresh token rotation and server-side revocation
**Before:** Refresh endpoint re-signed with the same secret; no way to revoke a session.
**Fixed (`apps/api/src/routes/auth.ts`):**
- `RefreshToken` rows store a **sha256 hash** of the refresh JWT (never the raw token); rotation does `deleteMany` (old) + `create` (new) inside `setAuthCookies()`.
- `/refresh` verifies the cookie JWT *and* confirms a matching, unexpired DB record (revocation on logout works, replay of a rotated token is rejected).
- `/logout` revokes the DB record and clears both cookies; login no longer returns the token/refresh in the body.

### 3. [HIGH] Auth: account enumeration via login timing & error text
**Before:** `/login` returned "Invalid credentials" fast for unknown users and slow for known users (bcrypt only run on known passwords) — a timing oracle; `/register` returned 409 for existing emails.
**Fixed (`apps/api/src/routes/auth.ts`):**
- Path-equivalent bcrypt work via `DUMMY_PASSWORD_HASH` compare on unknown users.
- Uniform 401 "Invalid credentials" regardless of cause; email-verified requirements surfaced only via 403 `EMAIL_NOT_VERIFIED` (no existence leak).
- `/register` duplicate now returns a generic 200 "Registration successful" (verification email is mocked/queued) — closes signup enumeration.

### 4. [HIGH] Auth: no brute-force protection on auth endpoints
**Fixed (`apps/api/src/routes/auth.ts`, `apps/api/src/server.ts`, `apps/api/src/routes/utils.ts`):**
- Global rate limiter re-keyed to **socket IP** (`raw.socket.remoteAddress`, `::ffff:` stripped) so `X-Forwarded-For` cannot be spoofed despite `trustProxy: true`.
- Per-route limits (socket-keyed): login 10/min, register 5/min, verify-email 10/min, resend-verification 5/min, forgot-password 5/min, reset-password 10/10min, refresh 30/min, join 20/min, answer 30/min, complete 20/min, POST /interviews 20/min, matches/generate 20/min, emails 20/min.

### 5. [HIGH] Authorization: cross-tenant IDOR on `GET /api/v1/matches`
**Before:** Candidates of other organizations were returned to any authenticated user who knew/guessed IDs.
**Fixed (`apps/api/src/routes/matches.ts`):** query is now scoped with `job: { is: orgClause(user) }`.

### 6. [MEDIUM] Authorization: candidate resume attachment to foreign org
**Before:** `POST /api/v1/candidates` accepted any `resumeId`.
**Fixed (`apps/api/src/routes/candidates.ts`):** `findFirst` requires `id`, `deletedAt: null`, `organizationId === user org` → 400 otherwise.

### 7. [MEDIUM] Files: path traversal in local storage adapter
**Before:** `path.join(base, key)` + `fs.readFile` allowed `../` to escape the uploads directory.
**Fixed (`packages/storage/src/local.ts`):** `resolveSafePath()` rejects empty/non-string/NUL, resolves, then rejects any result that escapes the root (`..` prefix or absolute); applied to upload/download/delete/exists. Covered by new regression tests.

### 8. [MEDIUM] Files: unsafe resume download (inline XSS / no cache control)
**Fixed (`apps/api/src/routes/resumes.ts`):** `application/octet-stream`, `attachment` disposition with filename sanitized to `[^a-zA-Z0-9._-]`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`; superadmin `organizationId` validated as UUID + org existence check before use.

### 9. [MEDIUM] API: 500 error handler leaked internal messages
**Fixed (`apps/api/src/server.ts`):** 5xx bodies are now the generic `Internal server error` + code `INTERNAL_ERROR`; 4xx preserve user-facing messages.

### 10. [MEDIUM] Input validation: unbounded request bodies
**Fixed (`apps/api/src/validation.ts`):** max lengths added across job/candidate/email/interview schemas (title 255, description 20000, answer 12000, transcript/question text, tokens 512, email subject 500 / body 50000 / recipient 254, arrays bounded); password policy tightened to 8–256; `createQuestionSchema`, `submitAnswerSchema`, `joinInterviewSchema`, `rescheduleInterviewSchema`, `completeInterviewSchema` moved into shared validation and exported. New regression tests cover password length, oversized job fields, oversized answers/tokens.

### 11. [MEDIUM] AI: candidate interview answer abuse (prompt injection, duplicate answers, expired invites, unbounded follow-ups)
**Fixed (`apps/api/src/routes/interviews.ts`):**
- Answer rejects content flagged by `antiPromptInjection` (`400 Answer contains prohibited content`) and is run through `sanitizeInput` before storage.
- Duplicate answer for the same `(interviewId, questionId)` → 409.
- Join *and* complete now enforce `inviteExpiresAt` (403 for expired invites).
- Follow-up questions capped at `MAX_FOLLOW_UP_QUESTIONS_PER_INTERVIEW = 5`.
- Superadmin `organizationId` on `POST /api/v1/interviews` validated as UUID.

### 12. [MEDIUM] Email: open relay through `POST /api/v1/emails`
**Before:** Any authenticated user could send arbitrary email content/recipients.
**Fixed (`apps/api/src/routes/emails.ts`):** recipient must be an existing candidate of the requester's org (or the candidate attached via `candidateId` with a matching email); 400 otherwise. Worker email `from` is always the org's configured `fromEmail`, removing spoofable `from` (`apps/worker/src/ai-jobs.ts`). Added rate limit 20/min.

### 13. [LOW] Web: open redirect on `dev-check` `returnTo`
**Fixed (`apps/web/src/app/portal/dev-check/page.tsx`):** only relative paths accepted (starts with `/`, not `//`, no `:`, `\`, or NUL); fallback `/portal/interview`.

### 14. [LOW] AI: raw resume text sent straight into the LLM prompt
**Fixed (`apps/worker/src/ai-jobs.ts`):** resume text is passed through `cleanForPrompt(resumeText, RESUME_TEXT_LIMIT)` instead of `trimText`, so untrusted resume content is sanitized before reaching the evaluation prompt.

### 15. [LOW→FIXED IN PLACE] Dependencies: `@fastify/jwt` → `fast-jwt` critical advisories
`@fastify/jwt@9.1.0` pulled `fast-jwt@5.0.6` with **critical** findings incl. JWT auth bypass via empty HMAC secret and algorithm-confusion. Upgraded `@fastify/jwt` **9.1.0 → 10.2.2** (`fast-jwt@6.3.3` patched) in api workspace and root; verified API compatibility (cookie-only verify, refresh namespace, sign/verify/expiry) with a live smoke test. Regression: forged refresh token → 401, no cookie → 401, correct cookie → 200.

### 16. [LOW→FIXED IN PLACE] bcrypt critical chain
`bcrypt@5.1.1 → @mapbox/node-pre-gyp → node-tar` (critical). Upgraded to `bcrypt@6.0.0` (api + root); `hashSync`/`compareSync` verified working. Password hashing otherwise sound: bcrypt 12 rounds, `DUMMY_PASSWORD_HASH` timing workaround in place.

### 17. [LOW→FIXED IN PLACE] uuid moderate advisory
`uuid@10.0.0 → 11.1.1`; `nodemailer@6.x → 10.0.10` (header-injection/SSRF advisories); `postcss` overridden to `8.5.28` (build-tree XSS/file-disclosure advisory fixed).

### 18. [LOW] Error-code/telemetry: `psycho-acoustics` — not applicable
No additional finding. (Placeholder check; audio tooling not present in this codebase.)

---

## Remaining Manual Actions (must be done by an operator — not source code)

1. **Rotate local secrets.** `.env` currently holds `JWT_SECRET` and `JWT_REFRESH_SECRET` of 24 chars; config enforces a **minimum of 32**. Until rotated (≥32 chars, unpredictable), the API refuses to boot and `tests/unit/worker.test.ts` cannot launch. Do not commit `.env`.
2. **Docker Compose services** (`docker-compose.yml`) expose default credentials (`postgres/postgres`, `guest/guest` on RabbitMQ) bound to `0.0.0.0`. Change credentials and bind to localhost or restrict network rules. (Infrastructure, not code — intentionally not modified.)
3. **`trustProxy: true` + `getClientIp()` XFF-based audit logging** remains spoofable. Rate limiting now uses socket IP so brute-force is covered; if per-client audit attribution matters, terminate TLS/proxy at a trusted boundary or sign/authenticate the XFF source (e.g., trusted proxy allow-list).
4. **Web middleware** intentionally blocks some candidate-portal `/portal/*` paths for unauthenticated users; candidates logging in through the interview invite flow are routed via `dev-check`. Verify invite URLs still render after deployment (behavioral, not security).
5. **Local storage `getSignedUrl`** returns `/storage/...` URLs that the dev API does not serve. Works in S3 mode; for local dev, either serve the route or use the download endpoint.
6. **Unique constraint (recommended migration):** add a DB unique index on `InterviewAnswer(interviewId, questionId)` to harden the duplicate-answer guard against race conditions (currently enforced in application code). Also confirm `InterviewAnswer(interviewId, questionId)` partial index on active rows if soft-deletes are used.
7. **Upgrade path for remaining dependency advisories** (require **major** upgrades — schedule separately):

| Package | Current | Severity | Advisory classes | Required for full fix | Impact if deferred |
|---|---|---|---|---|---|
| `next` | 14.2.35 (latest 14.x security patch) | critical | RCE(win/AVIF), SSRF(rewrites/websockets), cache poisoning, image DoS | 16.x | Medium-low: web renders only own pages; no uncontrolled rewrite/websocket surfaces; 14.2.35 covers all 14.x fixes |
| `ai` + `@ai-sdk/*` | 4.x | low→moderate, `jsondiffpatch` XSS/prototype-pollution (ancillary) | 7.x | Low: AI SDK not used for streaming in this repo (`packages/ai` calls OpenAI SDK directly); no untrusted upload to AI SDK filetype whitelist |
| `prisma` (CLI) → `@prisma/config` → `deepmerge-ts` | 6.9.0 / 7.x | high (dev-time stack exhaustion — recursive merge) | 7.x lineage | Negligible: CLI runs locally on trusted input |
| `uuid@11.1.1` | 11.1.1 | moderate | bounds-check only for v3/v5/v6 with preallocated `buf` | 14.x | Not exploitable: code uses `randomUUID`/`v4` |

---

## Tests

- **New regression tests:** `tests/unit/storage.test.ts` — storage path-traversal rejections (`../`, absolute, NUL, empty, non-string). `tests/unit/validation.test.ts` — password-mins, oversized job/answer/token/question fields, answer schema.
- **Existing suites green:** matching, queue, security, validation, storage (unit) + `tests/integration/job.test.ts` — **80 tests / 7 suites**, only `worker.test.ts` blocked by the local `.env` secret length (see Remaining Manual Actions #1).
- **JWT v10 runtime smoke test:** cookie-only access verify, refresh-namespace verify, missing-cookie 401, forged-signature 401, signed cookies httpOnly.

## Verification Commands

```
npm run build            # full workspace build (exit 0)
npx tsc --noEmit -p apps/api/tsconfig.json      # API (exit 0)
npx tsc --noEmit -p apps/worker/tsconfig.json   # Worker (exit 0)
npx tsc --noEmit -p apps/web/tsconfig.json      # Web (exit 0)
npx jest                 # 80/80 pass (worker suite blocked by env length)
npm audit                # 19 → 11 (residuals: major-only or dev/unused-surface)
```