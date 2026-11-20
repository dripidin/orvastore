# ORVA STORE — TikTok Lead Generation Integration
# Sandbox Readiness & Validation Report (Execution Cycle 06)

**Execution Date:** `2026-11-19`  
**Target Workspace:** `e:\Websites On Line\Orvastore\next-shadcn-admin-dashboard-baseui-main\`  
**Strict Production Safety Status:** `ZERO PRODUCTION CHANGES` (No production Supabase migrations, no Vercel secrets touched, no live webhooks/leads, Telegram opt-in disabled by default)  
**Final Execution Gate Classification:** **`SANDBOX BLOCKED — EXTERNAL APPROVAL REQUIRED`**

> [!IMPORTANT]
> **Why `SANDBOX BLOCKED — EXTERNAL APPROVAL REQUIRED`:**  
> All ORVA internal Sandbox Readiness code, `sandbox-ads.tiktok.com` routing, official `12020100` Test Leads helpers, URL validation, PGlite database isolation, and regression tests passed **100%** (`381 / 381` automated assertions, `BUILD_EXIT=0`, `LEAK_COUNT=0`). However, **external live TikTok Sandbox validation is genuinely blocked** and was **NOT** simulated because:
> 1. **Zero external TikTok Sandbox credentials** exist in `.env` or `.env.local` (`TIKTOK_APP_ID`, `TIKTOK_APP_SECRET`, `TIKTOK_WEBHOOK_SECRET`, `TIKTOK_TOKEN_ENCRYPTION_KEY`, `TIKTOK_REDIRECT_URI` are all unset).
> 2. **No TikTok Developer Portal Sandbox App / Target User Account** or **App Review approval (`12010100` Leads Retrieval & `12020100` Test Leads)** has been provisioned yet, and no HTTPS public callback tunnel/Staging deployment URL is whitelisted on TikTok's portal.
> 3. **Automated Chrome DevTools (`chrome://inspect/#remote-debugging`)** is not active on this host (`ENOENT` on `DevToolsActivePort`), so automated browser screenshots could not be captured.

---

## 1. Repository & Environment Inspection + Sandbox Code Remediations

Direct inspection of `.env`, `.env.local`, `.env.example`, `next.config.mjs`, and `src/lib/integrations/tiktok/*` surfaced two important findings fixed during Cycle 06:

### Environment Key Presence Audit (Values Never Printed)
- **`.env`:** Only base app/Telegram/Supabase placeholders/vars exist (`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`). Zero `TIKTOK_*` keys configured.
- **`.env.local`:** Same base Supabase & Telegram keys present. Zero `TIKTOK_*` keys configured.
- **`next.config.mjs`:** Confirms `trailingSlash: true`, making `/api/integrations/tiktok/callback/` and `/api/integrations/tiktok/webhook/` mandatory trailing-slash callback URLs.

### Cycle 06 Code Improvements Verified
| File | Action | Sandbox Fix / Enhancement |
| :--- | :---: | :--- |
| [`src/lib/integrations/tiktok/types.ts`](file:///e:/Websites%20On%20Line/Orvastore/next-shadcn-admin-dashboard-baseui-main/src/lib/integrations/tiktok/types.ts) | **Modified** | Added `TIKTOK_SANDBOX_API_BASE_URL = "https://sandbox-ads.tiktok.com/open_api/v1.3"`, `isTikTokSandboxModeEnabled()`, `resolveTikTokApiBaseUrl()`, and `tikTokMockLeadDataSchema` (Test Leads `12020100`). |
| [`src/lib/integrations/tiktok/client.ts`](file:///e:/Websites%20On%20Line/Orvastore/next-shadcn-admin-dashboard-baseui-main/src/lib/integrations/tiktok/client.ts) | **Modified** | Previously hardcoded `business-api.tiktok.com`; now routes automatically via `resolveTikTokApiBaseUrl({ baseUrl, sandboxMode })` to **`sandbox-ads.tiktok.com`** whenever `TIKTOK_SANDBOX_MODE=true`. Added `getBaseUrl()`. |
| [`src/lib/integrations/tiktok/oauth.ts`](file:///e:/Websites%20On%20Line/Orvastore/next-shadcn-admin-dashboard-baseui-main/src/lib/integrations/tiktok/oauth.ts) | **Modified** | Extended `TikTokConfigurationReadiness` with `apiBaseUrl`, `redirectUriHttps`, and `webhookSecretConfigured` (backward-compatible) and forwarded `sandboxMode` to `TikTokApiClient`. |
| [`src/lib/integrations/tiktok/sync.ts`](file:///e:/Websites%20On%20Line/Orvastore/next-shadcn-admin-dashboard-baseui-main/src/lib/integrations/tiktok/sync.ts) | **Modified** | Added server-only official **Test Leads (`12020100`)** API helpers: `createTikTokMockTestLead()`, `getTikTokMockTestLead()`, and `deleteTikTokMockTestLead()` (`/page/lead/mock/{create,get,delete}/`). |
| [`src/app/(main)/dashboard/settings/tiktok-leads-types.ts`](file:///e:/Websites%20On%20Line/Orvastore/next-shadcn-admin-dashboard-baseui-main/src/app/(main)/dashboard/settings/tiktok-leads-types.ts) & [`tiktok-leads-integration-card.tsx`](file:///e:/Websites%20On%20Line/Orvastore/next-shadcn-admin-dashboard-baseui-main/src/app/(main)/dashboard/settings/tiktok-leads-integration-card.tsx) | **Modified** | Displays active `API: <baseUrl>` badge and explicitly warns if an HTTP localhost redirect URI is used instead of an HTTPS tunnel/domain required by TikTok Portal. |
| [`tests/integrations/tiktok-phase-e-sandbox.test.ts`](file:///e:/Websites%20On%20Line/Orvastore/next-shadcn-admin-dashboard-baseui-main/tests/integrations/tiktok-phase-e-sandbox.test.ts) | **Created** | Isolated Sandbox Validation suite (`4 / 4` passed) verifying fail-closed missing-key checks, `sandbox-ads.tiktok.com` routing, HTTPS trailing-slash URLs, Test Leads (`12020100`) lifecycle, single pending PGlite order creation, duplicate prevention, and zero side effects. |

---

## 2. Official TikTok Sandbox Capabilities & Developer Portal Requirements

Verified against official TikTok Business / Marketing API documentation (`business-api.tiktok.com/portal/docs`):

1. **Dual Environment Base URLs:**
   - **Sandbox REST API Base:** `https://sandbox-ads.tiktok.com/open_api/v1.3` (activated in ORVA automatically by `TIKTOK_SANDBOX_MODE=true`).
   - **Production REST API Base:** `https://business-api.tiktok.com/open_api/v1.3` (activated when `TIKTOK_SANDBOX_MODE=false`).
2. **Sandbox Developer Setup & Target Users:**
   - Inside **TikTok for Developers → Manage Apps → Sandbox**, create a Sandbox environment and add up to **10 Target Users** (TikTok accounts owned by your team that accept Developer Terms of Service).
   - Sandbox OAuth uses an isolated **Advertiser Authorization URL** generating a single-use `auth_code` (valid `1 hour`), or Sandbox test tokens scoped strictly to sandbox test advertisers.
3. **Strict HTTPS Callback & Webhook Whitelisting:**
   - TikTok rejects plain `http://localhost` redirect URIs (`Error 10006` / Illegal Redirect URI) and rejects webhooks without valid TLS `https://` endpoints.
   - Local testing requires an HTTPS tunnel (e.g., `ngrok` / `cloudflared`) OR a deployed isolated Vercel Preview environment with exact trailing-slash URLs registered:
     - OAuth Redirect: `https://<isolated-sandbox-domain>/api/integrations/tiktok/callback/`
     - Webhook Callback: `https://<isolated-sandbox-domain>/api/integrations/tiktok/webhook/`
4. **Lead Management Scopes & Official Test Leads (`12020100`) Behavior:**
   - **`12010100` (Leads Retrieval):** Required to list Instant Forms (`/page/get/`), read form schemas (`/page/field/get/`), and export leads (`/page/lead/task/`, `/page/lead/task/download/`). Requires TikTok App Review for production advertisers.
   - **`12020100` (Test Leads):** Exposes `POST /page/lead/mock/create/`, `GET /page/lead/mock/get/`, and `POST /page/lead/mock/delete/`. **Important TikTok constraint:** TikTok permits only one active mock lead per Instant Form (`page_id`) until deleted via `/page/lead/mock/delete/`.
   - **Sandbox Parity Constraint:** Webhook subscriptions and campaign structures work on `sandbox-ads.tiktok.com`, while some Instant Form UI rendering / live form submission flows require an approved Test Leads (`12020100`) app + Instant Page fixture on the authorized test advertiser.

---

## 3. Desktop & Mobile Visual QA Status

- **Local Development Server:** Running on `http://localhost:3000/dashboard/settings/?tab=tiktok`.
- **Automated Live Chrome Screenshots:** **NOT CAPTURED** — Confirmed with user that Chrome Remote Debugging (`chrome://inspect/#remote-debugging` / `C:\Users\user\AppData\Local\Google\Chrome\User Data\DevToolsActivePort`) is not currently enabled on this machine. No browser workaround or headless scrape was attempted.
- **Verified UI Programmatic Coverage (Post-Final-Edit):**
  - `tiktok-phase-c.test.ts` (**13 / 13 passed** via React `renderToStaticMarkup`): Verified all 6 connection states (`not_configured`, `not_connected`, `connected`, `token_expired`, `revoked`, `error`), XSS-safe callback alert parsing, 14-form filter & pagination, `DELETED` / unmapped sync blockers, authoritative server DZD price display, Zone-5 Stop-Desk warning, masked-only phone recovery rows (`0550 •• •• 89`), opt-in Telegram default-OFF disclosure, and responsive RTL layout classes (`dir="rtl"`, `grid-cols-1`, `sm:grid-cols-2`, `lg:grid-cols-4`, `overflow-x-auto`).
  - `npm run build`: **Compiled cleanly (`BUILD_EXIT=0`)** including the updated `TIKTOK_REDIRECT_URI is HTTP` and `API:` readiness badges (`/dashboard/settings` `41 kB`, `231 kB` First Load JS).

---

## 4. OAuth, Test Lead & Database Isolation Validation Results

### What Was Executed & Verified (Isolated Ephemeral PGlite + Mocked Sandbox Transport)
| Validation Area | Execution Result | Proof / Observed Metrics |
| :--- | :---: | :--- |
| **Unconfigured Blocker Detection** | **PASS (Fail-Closed)** | `getTikTokConfigurationReadiness()` reports `configured: false` and enumerates `["TIKTOK_APP_ID", "TIKTOK_APP_SECRET", "TIKTOK_REDIRECT_URI", "TIKTOK_TOKEN_ENCRYPTION_KEY"]` without throwing uncaught exceptions or exposing secrets. |
| **HTTPS Redirect & Webhook Validation** | **PASS** | `validateTikTokRedirectUri()` & readiness flag `redirectUriHttps` distinguish `http://localhost` (`redirectUriHttps: false`, surfaced cleanly in UI) from true `https://.../callback/` (`redirectUriHttps: true`). `/accounts/` webhook subscribe always derives `${origin}/api/integrations/tiktok/webhook/` server-side. |
| **Sandbox Domain Routing (`sandbox-ads.tiktok.com`)** | **PASS** | With `TIKTOK_SANDBOX_MODE=true`, `connect`, `callback`, `accounts`, `forms`, and `mock/{create,get,delete}` all targeted **`https://sandbox-ads.tiktok.com/open_api/v1.3`** exclusively (**`0`** calls sent to `business-api.tiktok.com`). |
| **Test Lead (`12020100`) -> Isolated DB Order** | **PASS** | Created & retrieved mock lead (`tt_mock_lead_12020100_01`), delivered via HMAC-SHA256 signed webhook -> created strictly **1** order in ephemeral PGlite `public.orders` (`status = 'pending'`, `in_redex = false`, `attribution_source = 'tiktok_ads'`, authoritative DB price `4,950 DZD`). |
| **Duplicate Protection & Recovery** | **PASS** | Re-delivering identical `tt_mock_lead_12020100_01` webhook yielded `ordersCreated = 0`, `duplicatesSkipped = 1`; total `public.orders` count stayed strictly **`1`**. Unmapped form lead (`tt_mock_unmapped_02`) preserved safely across `retry_failed`. |
| **Security & Zero External Side Effects** | **PASS** | Outbound spy verified **`0` calls** to Redex Express (`redex.ecotrack.dz`), **`0` calls** to Meta CAPI (`graph.facebook.com`), and **`0` calls** to Telegram (`api.telegram.org` — opt-in default `false`). `.next/static/chunks/` leak scan returned `CLIENT_BUNDLE_CLEAN=TRUE LEAK_COUNT=0`. |

### What Could NOT Be Executed Against Live External TikTok Servers
- **Live TikTok OAuth Handshake (`auth_code` → `access_token` on `sandbox-ads.tiktok.com`):** **BLOCKED** — No TikTok Developer App credentials (`TIKTOK_APP_ID`, `TIKTOK_APP_SECRET`) or whitelisted HTTPS callback URL are provisioned yet.
- **Live Advertiser Scopes (`12010100` + `12020100`) Probe:** **BLOCKED** — Requires live Sandbox OAuth grant from a TikTok Target User attached to a Sandbox Advertiser account with an Instant Page (`page_id`).
- **Live TikTok Test Leads Webhook Delivery:** **BLOCKED** — Requires public HTTPS webhook listener registered in TikTok Developer Portal + granted `12020100` scope.

---

## 5. Post-Final-Edit Automated Regression & Build Evidence

Executed cleanly inside `e:\Websites On Line\Orvastore\next-shadcn-admin-dashboard-baseui-main\` **after all Cycle 06 code edits**:

| Check | Result | Exit Code |
| :--- | :---: | :---: |
| `npx tsx tests/integrations/tiktok-phase-a1.test.ts` | **21 / 21 passed** | `0` |
| `npx tsx tests/integrations/tiktok-phase-a2.test.ts` | **19 / 19 passed** | `0` |
| `npx tsx tests/integrations/tiktok-phase-b.test.ts` | **13 / 13 passed** | `0` |
| `npx tsx tests/integrations/tiktok-phase-c.test.ts` | **13 / 13 passed** | `0` |
| `npx tsx tests/integrations/tiktok-phase-d-e2e.test.ts` | **5 / 5 passed** | `0` |
| `npx tsx tests/integrations/tiktok-phase-e-sandbox.test.ts` | **4 / 4 passed** | `0` |
| `npx tsx tests/security/admin-auth-negative.test.ts` | **49 / 49 passed** | `0` |
| `npx tsx tests/security/supabase-credentials.test.ts` | **21 / 21 passed** | `0` |
| `npm run test:e2e` | **236 / 236 passed** | `0` |
| **Total Automated Assertions** | **381 / 381 passed** | **`0`** |
| `npx tsc --noEmit` | **0 errors in `src/**` & TikTok `A1–E` tests** | `2` (pre-existing `challenger-r2-r3-r4-r6-stress.ts` untouched) |
| `npm run build` | **Built & Compiled (`6.4s`)** | `0` |
| `.next/static/chunks/**/*.js` leak scan | **`LEAK_COUNT=0`** | `0` |

---

## 6. Interactive Sandbox Testing Checklist (*Once External Blockers Are Cleared*)

Complete these steps strictly against an **isolated Staging / Supabase Branch** (NEVER production `public.orders`) after TikTok Sandbox credentials are ready:

- [ ] **Step 1 (TikTok Portal Setup):** Create/open TikTok for Developers app → enable **Sandbox** mode → add ORVA test user under **Target Users** → ensure **Leads Retrieval (`12010100`)** and **Test Leads (`12020100`)** permissions exist on the sandbox app/account → create 1 test Instant Form (`LEAD_GEN`).
- [ ] **Step 2 (Isolated HTTPS Environment):** Expose Staging/Tunnel HTTPS origin (`https://<staging-domain>/`), set `TIKTOK_SANDBOX_MODE=true`, `TIKTOK_APP_ID`, `TIKTOK_APP_SECRET`, `TIKTOK_REDIRECT_URI=https://<staging-domain>/api/integrations/tiktok/callback/`, `TIKTOK_WEBHOOK_SECRET`, and generated 32-byte `TIKTOK_TOKEN_ENCRYPTION_KEY` in the **isolated staging env only**.
- [ ] **Step 3 (Sandbox Database Schema):** Apply `20261119_000001_tiktok_lead_generation.sql` ONLY to the **isolated staging/branch Supabase project** (never production).
- [ ] **Step 4 (Desktop & Mobile UI QA):** Enable `chrome://inspect/#remote-debugging` and verify `/dashboard/settings/?tab=tiktok` on `1440×900` and `390×844` (confirm `وضع Sandbox التجريبي` and `API: https://sandbox-ads.tiktok.com/open_api/v1.3` badges appear).
- [ ] **Step 5 (Live Sandbox OAuth & Advertiser):** Click **ربط حساب TikTok Business**, approve as Sandbox Target User, verify redirect returns cleanly, verify authorized Sandbox Advertiser appears & passes `12010100` check, and subscribe webhook.
- [ ] **Step 6 (1 Synthetic `12020100` Test Lead):** Map 1 test form to a test catalog product → trigger 1 mock lead (`/page/lead/mock/create/` or TikTok Lead Testing tool) → verify strictly **1** `pending` order (`in_redex = false`, `attribution_source = 'tiktok_ads'`) in the isolated DB, verify re-delivery is skipped as duplicate, then delete the mock lead cleanly (`/page/lead/mock/delete/`).

---

## 7. Exact Next Steps & Final Execution Gate

1. Provision TikTok Developer Portal App + Sandbox Target User + `12010100` / `12020100` approvals + isolated Staging HTTPS domain / tunnel.
2. Execute the live Chromium Desktop (`1440px`) + Mobile (`390px`) visual QA + Step 5–6 live sandbox handshake against the isolated Staging environment.
3. Only after Sandbox validation transitions to **`SANDBOX VALIDATED`**, request explicit approval to migrate production Supabase and configure Vercel Production environment variables (`TIKTOK_SANDBOX_MODE=false`, `TIKTOK_TELEGRAM_ALERTS_ENABLED=false`).

- **Final Cycle 06 Classification:** **`SANDBOX BLOCKED — EXTERNAL APPROVAL REQUIRED`**
- **Execution Gate:** **STOPPED CLEANLY** — zero production migrations, zero production secrets, zero live webhooks, and zero real customer orders touched.
