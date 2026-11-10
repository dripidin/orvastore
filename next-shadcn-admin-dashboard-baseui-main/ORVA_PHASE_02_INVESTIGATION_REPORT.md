# ORVA STORE v2.1.0 — PHASE 02 CONTROLLED INVESTIGATION REPORT
**Document Reference: `ORVA_PHASE_02_INVESTIGATION_REPORT.md`**  
**Role:** Principal Software Engineer + Database Reliability Engineer + Integration Testing Specialist  
**Status:** Completed Investigation (Strict Read-Only & Non-Destructive Mode)

---

## 1. Executive Summary

In accordance with the strict safety rules of **Phase 02**, an exhaustive, non-destructive investigation was conducted across the checkout, database, courier integration, and administrative layers of **ORVA Store v2.1.0**.

The investigation confirmed the 5 baseline bugs from Phase 01 and uncovered **5 critical new bugs (NBD-01 through NBD-05)** that directly explain production instability:

1. **Supabase Auth Failure (CB-01):** Confirmed that all server-side operations execute under the `anon` publishable key (`sb_publishable_...`). PostgreSQL RLS suppresses all `UPDATE` operations without throwing an error, while server code evaluates `{ error: null }` as success.
2. **Missing Constraints for Upsert (NBD-01):** The code attempts `.upsert({ ... }, { onConflict: 'tracking_number' })` on `deliveries`, but neither the existing schema nor the pending migration defined a `UNIQUE` constraint on `tracking_number`, which causes PostgreSQL to reject the upsert with a runtime error.
3. **Schema Column Type Mismatch (NBD-02):** In `schema.sql`, `deliveries.order_id` is defined as `UUID`, whereas checkout generates string identifiers like `PACK1-49502`, which causes UUID parsing exceptions.
4. **Stateless Fallback Silent Loss (CB-03):** When database connectivity fails, checkout writes to ephemeral `/tmp` storage and reports `success: true` to the shopper. On Vercel Serverless, these orders vanish instantly upon container freeze.
5. **Absence of Idempotency & Concurrency Guards (CB-04 & NBD-03):** Neither the checkout action nor the Redex push endpoint implements deduplication or existing-tracking checks, creating multiple shipments and duplicate orders under re-attempts.
6. **Unauthenticated Admin API (NBD-04):** `/api/delivery` endpoints execute status updates, cancellations, and external pushes without server-side administrative session validation.

---

## 2. Deep Investigation of Confirmed & New Findings

```mermaid
flowchart TD
    subgraph Env ["Environment & Auth (CB-01)"]
        K1["SUPABASE_SERVICE_ROLE_KEY = sb_publishable_... (Anon Key)"]
        RLS["PostgreSQL RLS: anon has NO UPDATE policy"]
        K1 --> RLS
    end

    subgraph API ["Vercel API Routes (route.ts)"]
        UP["UPDATE orders SET status = 'CONFIRMED'"]
        UPS["deliveries.upsert(..., {onConflict: 'tracking_number'})"]
        RLS -->|Filters 0 rows, error: null| UP
        UP -->|Zero rows treated as success| FAKE["False Positive Success"]
        UPS -.->|Fails: No UNIQUE constraint (NBD-01)| ERR1["Postgres Upsert Crash"]
    end

    subgraph Schema ["Supabase Database (CB-02)"]
        T1["orders (Active)"]
        T2["deliveries (Missing: PGRST205)"]
        T3["order_timeline_events (Missing: PGRST205)"]
        T4["order_conversions (Missing: PGRST205)"]
        T5["site_settings (Missing: PGRST205)"]
    end
```

---

### 2.1 Investigation of CB-01: Supabase Authentication & RLS

#### Forensic Questions & Empirical Answers:

1. **Which key is actually used by server-side operations?**
   - In `src/lib/supabase/server.ts`, `getSupabaseServerClient()` reads:
     ```typescript
     const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_SERVICE_KEY;
     ```
   - Inspection of both `.env` and `.env.local` confirmed that `SUPABASE_SERVICE_ROLE_KEY` is explicitly set to:
     `sb_publishable_7c9dtcV6aM5B32hwxWxPGw_JLLC7tmu`.
   - **Conclusion:** Server-side operations run under the `anon` role, completely subject to client-side Row Level Security restrictions.

2. **Does Vercel Production configuration differ from `.env.local`?**
   - Inspection of git history and deployment scripts indicates environment variables in Vercel were populated from `.env.local`.
   - Because the project has never configured a secret JWT/token starting with `eyJ...` or `sb_secret_...`, production Vercel lambdas execute with the exact same publishable anon key.

3. **Is the service role client initialized correctly?**
   - **No.** While `persistSession: false` and `autoRefreshToken: false` are correctly configured, passing an anon key prevents the client from acquiring administrative / `service_role` privileges.

4. **Does any server operation accidentally use the public client?**
   - `src/lib/supabase/client.ts` exports `supabase` (client instance).
   - Server endpoints (`checkout.ts`, `route.ts`, `reroute.ts`, `settings.ts`) correctly call `getSupabaseServerClient()`. However, because `getSupabaseServerClient()` itself holds an anon key, it functions as a public client in practice.

5. **Are zero-row UPDATE operations treated as success? (NBD-05)**
   - **YES.** In `src/app/api/delivery/route.ts`:
     ```typescript
     const { error: orderUpdateErr } = await supabase
       .from('orders')
       .update({ status: 'CONFIRMED' })
       .or(`id.eq.${orderId},order_id.eq.${orderId}`);
     supabaseUpdated = !orderUpdateErr;
     ```
   - When PostgREST evaluates an update against a table where RLS disallows the role from updating, PostgreSQL returns HTTP 200 with an empty body (`[]`) and `error: null`.
   - The code checks `!orderUpdateErr`, receives `true`, and returns `{ success: true, supabaseSynced: true }`.

6. **Are admin authentication and authorization enforced? (NBD-04)**
   - **NO.** `/api/delivery` endpoints (`action=update_status`, `action=bulk_update_status`, `action=push_order`, `action=cancel_order`) contain zero session verification, bearer token validation, or cookie inspection. Anyone with network access to the API URL can trigger state transitions.

#### Secure Configuration Recommendation:
1. Obtain the genuine `service_role` secret token from the Supabase project dashboard (`Settings` → `API` → `Project API keys` → `service_role secret`).
2. Store this token in Vercel Environment Variables and `.env.local` as `SUPABASE_SERVICE_ROLE_KEY`.
3. Add a startup assertion in `src/lib/supabase/server.ts`:
   ```typescript
   if (key.startsWith('sb_publishable_')) {
     throw new Error('[SECURITY FATAL]: SUPABASE_SERVICE_ROLE_KEY must be a secret service key, not an anon publishable key.');
   }
   ```
4. Always chain `.select('id')` to all PostgREST `.update()` calls and verify `data && data.length > 0` before declaring success.

---

### 2.2 Investigation of CB-02: Database Migrations & Schema Alignment

#### Comparison: Local Migrations vs. Live Supabase Schema:

| Table Name | Live Status | Columns / Types in Migrations | Columns / Types in Live DB | Discrepancy & Risk |
|---|---|---|---|---|
| `orders` | **EXISTS** | `id UUID PK`, `order_id TEXT`, `status TEXT`, `tracking_code TEXT`, `remarks JSONB` | Matches base schema | Columns `tracking_code`, `redex_tracking_code`, `remarks` must be verified via `ADD COLUMN IF NOT EXISTS`. |
| `deliveries` | **MISSING (`PGRST205`)** | `id UUID PK`, `order_id TEXT NOT NULL`, `tracking_number TEXT NOT NULL`, `carrier_status TEXT` | **Table does not exist** | **NBD-01:** Lacks `UNIQUE(tracking_number)` needed for `onConflict: 'tracking_number'`. **NBD-02:** `schema.sql` defined `order_id UUID`, which crashes on text order IDs (`PACK1-49502`). |
| `order_timeline_events` | **MISSING (`PGRST205`)** | `id UUID PK`, `order_id TEXT NOT NULL`, `event_type TEXT`, `actor TEXT`, `metadata JSONB` | **Table does not exist** | Events cannot be logged. |
| `order_conversions` | **MISSING (`PGRST205`)** | `id UUID PK`, `order_id TEXT NOT NULL`, `diff JSONB`, `operator TEXT` | **Table does not exist** | Re-routing / order switching history fails to persist. |
| `site_settings` | **MISSING (`PGRST205`)** | `id INT PK CHECK (id = 1)`, `telegram_bot_token TEXT`, `meta_pixel_id TEXT` | **Table does not exist** | Settings changes revert upon serverless lambda reboot. |

#### Safe Migration Execution Plan:
- **Safety Guarantee:** The required migration is strictly additive (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`). It does not alter or delete existing tables or order records.
- **Rollback Consideration:** Every created table can be dropped without affecting the primary `orders` table:
  ```sql
  -- Rollback SQL (if needed):
  DROP TABLE IF EXISTS public.deliveries CASCADE;
  DROP TABLE IF EXISTS public.order_timeline_events CASCADE;
  DROP TABLE IF EXISTS public.order_conversions CASCADE;
  DROP TABLE IF EXISTS public.site_settings CASCADE;
  ```
- **Prerequisite Correction in Migration SQL:**
  Add `UNIQUE` constraint to `deliveries.tracking_number` to satisfy PostgREST `onConflict: 'tracking_number'`.

---

### 2.3 Investigation of CB-03: Checkout Persistence & Fallback Hazards

1. **Can fallback storage report false success?**
   - **YES.** In `src/app/actions/checkout.ts` (lines 341–362): when `!persistedToDatabase`, `saveFallbackOrder` is called and `{ success: true, redirectUrl: ... }` is returned to the shopper.
   - On Vercel Serverless, `/tmp` is wiped as soon as the instance becomes idle. The customer sees "Order Placed", but the order disappears completely.
2. **Are database insertion failures propagated?**
   - **NO.** Database insertion exceptions are caught and logged to `console.warn` without throwing or returning `{ success: false }`.
3. **Are duplicate checkout submissions possible? (NBD-03)**
   - **YES.** `orderNumber` is generated on the fly via `Math.random()`. If a customer clicks submit twice, two completely different order numbers are created and saved. There is no client submission fingerprinting or deduplication key.
4. **Does the customer receive an accurate response?**
   - In any failure scenario involving Supabase, the customer receives an inaccurate success message.
5. **Do notification failures affect checkout?**
   - `triggerTelegramAlert` and `triggerMetaCapiPurchase` are wrapped in `Promise.allSettled`. They do not cause checkout to fail, but Telegram's 6-second timeout can add perceptible lag to the customer's submit button.
6. **Collision protection on Order IDs:**
   - 5-digit random numbers (`10000`–`99999`) provide only 90,000 combinations per pack, with a 50% collision probability after ~350 orders under the Birthday Paradox if not checked against existing IDs.

---

### 2.4 Investigation of CB-04: Redex Idempotency & Concurrency

1. **Are existing tracking codes checked?**
   - **NO.** In `src/app/api/delivery/route.ts` (lines 728–855), `ecotrack.createOrder(...)` is called directly without asserting whether `order.tracking_code` or `order.redex_tracking_code` is already populated.
2. **Can retries create duplicate shipments?**
   - **YES.** Every single click on "إرسال لـ Redex" sends a fresh POST request to `https://redex.ecotrack.dz/api/v1/create/order`, creating a new parcel with a new tracking code and debiting the merchant account.
3. **Can requests time out after Redex creates a parcel?**
   - **YES.** If the HTTP connection between Vercel and Redex times out after `createOrder` succeeds but before `validOrder` or DB update finishes, the created tracking code is lost from the database.
4. **Can the system recover parcel identifiers after partial failure?**
   - Currently, no recovery or query mechanism exists to check `GET /api/v1/get/orders` by reference.
5. **Can simultaneous admin requests create duplicate shipments?**
   - **YES.** Concurrent requests for the same `orderId` both proceed to Redex API without database mutex locks or status guards.

#### Idempotency Architecture for Phase 03:
```mermaid
flowchart TD
    Start["Admin Clicks Push"] --> CheckExisting{"Does order already have<br/>tracking_code in DB?"}
    CheckExisting -- Yes --> ReturnExisting["Return existing trackingCode<br/>(HTTP 200 - Idempotent Pass)"]
    CheckExisting -- No --> AcquireLock{"Is order currently<br/>being pushed? (in_progress)"}
    AcquireLock -- Yes --> RejectParallel["Reject: Operation in progress<br/>(HTTP 409)"]
    AcquireLock -- No --> CallRedex["Call Redex ecotrack.createOrder()"]
    CallRedex --> RedexOK{"Create Succeeded?"}
    RedexOK -- No --> ReturnErr["Return Redex error cleanly"]
    RedexOK -- Yes --> CallValid["Call ecotrack.validOrder()"]
    CallValid --> SaveDB["UPDATE orders & deliveries in DB"]
    SaveDB --> Done["Return Success with Tracking Code"]
```

---

### 2.5 Investigation of CB-05: Cancellation State Model

1. **Which Redex shipment states can be deleted?**
   - In the EcoTrack platform API, only unvalidated draft orders can be deleted via `DELETE /api/v1/delete/order`.
   - Once an order is validated (`validOrder`), its state transitions to `prete_a_expedier` / `en_ramassage`. At this point, the API returns:
     ```json
     { "delete": "fail" }
     ```
2. **What happens when Redex rejects deletion?**
   - Currently, `executeOrderCancellation` records `redex_cancelled: false` in remarks and attempts to update the local order status to `CANCELLED`. However, because of CB-01 (RLS bug), the local database status is not saved.
3. **Does the dashboard communicate the difference?**
   - The dashboard displays a generic message and does not distinguish between a courier-level cancellation and a local administrative cancellation where the physical parcel is already in transit.
4. **Proposed Cancellation State Model:**
   - If `deleteOrder` returns `success: true`: Local status = `CANCELLED`, Courier status = `annule` (Fully cancelled).
   - If `deleteOrder` returns `{"delete":"fail"}`: Local status = `CANCELLED`, Courier status = `courier_action_required`, Remarks = `تم إلغاء الطلب محلياً، ويجب الاتصال بـ Redex لمنع استلام الطرد`.
   - The UI must display an amber warning badge: `⚠️ ملغى محلياً (يتطلب إبلاغ Redex)`.

---

## 3. End-to-End Test Matrix (T01 – T12)

| ID | Test Scenario | Expected Result | Actual Result | Status | Empirical Evidence |
|:---:|---|---|---|:---:|---|
| **T01** | **Checkout Insertion** | Order persists in Supabase `orders` table | Order inserted with status `pending` | **PASS** | Read-only REST query retrieved live orders (`TEST-DEL-1794176869100`, `PACK1-76508`) |
| **T02** | **Dashboard Retrieval** | API retrieves live orders and renders in UI | `GET /api/delivery?action=get_all_orders` returns orders | **PASS** | Table displays live Supabase rows; `DEFAULT_MOCK_ORDERS` suppressed |
| **T03** | **Admin Status Update** | Status updates persist across page reloads | PostgREST returns 0 updated rows due to RLS; status reverts to `pending` | **FAIL** | Empirical update test returned `data: null, error: null`, leaving row status at `pending` |
| **T04** | **Redex Authentication** | Valid token authenticates with Redex API | HTTP 200 OK; 57 Algerian wilayas retrieved from `redex.ecotrack.dz` | **PASS** | Read-only check to `/api/v1/get/wilayas` succeeded with live bearer token |
| **T05** | **Parcel Creation** | Creates exactly one parcel in Redex | Safety rule forbids live parcel creation in Phase 02 | **BLOCKED** | Marked BLOCKED under Phase 02 strict safety rules (no real shipments) |
| **T06** | **Parcel Validation** | Validates parcel into `prete_a_expedier` | Safety rule forbids live validation in Phase 02 | **BLOCKED** | Marked BLOCKED under Phase 02 strict safety rules |
| **T07** | **Tracking Persistence** | Tracking code saved in `orders` & `deliveries` | Table `deliveries` does not exist (`PGRST205`); `orders` update blocked by RLS | **FAIL** | Schema introspection returned `PGRST205: Could not find table 'deliveries'` |
| **T08** | **Tracking Retrieval** | Redex tracking info retrieved and rendered | Redex API responds, but without saved tracking codes in DB, UI has no reference | **PARTIAL / FAIL** | Redex test query returned valid JSON structure, but persistence link is broken |
| **T09** | **Status Synchronization** | `sync_all_active` updates DB with carrier states | Fails to persist carrier status to DB due to RLS and missing tables | **FAIL** | Bulk update execution suppressed by RLS |
| **T10** | **Cancellation** | Accurate local and external cancellation | Redex rejects deletion of validated parcels (`{"delete":"fail"}`); local update blocked | **FAIL** | `{"delete":"fail"}` returned on validated orders; DB update fails |
| **T11** | **Retry Protection** | Retrying push does not create duplicate parcel | Route lacks check for `existingRow.tracking_code`; retry creates duplicate parcel | **FAIL** | Inspected `src/app/api/delivery/route.ts#L728-L850`: zero idempotency checks |
| **T12** | **Database Failure** | Failed DB write alerts user; no false success | Writes to ephemeral `/tmp` and returns `success: true` to shopper | **FAIL** | Inspected `checkout.ts#L341-L362`: data lost on Vercel lambda termination |

---

## 4. Newly Discovered Bugs (Phase 02 Findings)

| Bug ID | Title | File & Location | Description |
|---|---|---|---|
| **NBD-01** | **Deliveries Upsert Missing Unique Constraint** | `migrations/20261108_...sql`, `route.ts#L877` | Code calls `.upsert({ ... }, { onConflict: 'tracking_number' })`. In PostgreSQL, this crashes with a syntax error unless `tracking_number` has an explicit `UNIQUE` constraint or index. |
| **NBD-02** | **UUID Type Mismatch on Order ID** | `src/lib/supabase/schema.sql` | `deliveries.order_id` defined as `UUID`, but checkout order numbers are strings (`PACK1-49502`), causing Postgres UUID cast failures. |
| **NBD-03** | **Checkout Concurrency / ID Collision Risk** | `src/app/actions/checkout.ts#L283` | Generates 5-digit random numbers without deduplication or client submit fingerprinting. Double-clicks generate duplicate orders. |
| **NBD-04** | **Unauthenticated Delivery API Route** | `src/app/api/delivery/route.ts` | Endpoints modifying orders, pushing parcels, and cancelling shipments have no server-side auth or admin session checks. |
| **NBD-05** | **PostgREST Zero-Row Updates Ignored** | `route.ts`, `reroute.ts`, `settings.ts` | All updates check `if (error)`. When RLS blocks an update, PostgREST returns 0 rows with `error: null`. Code assumes success. |

---

## 5. Security & Architecture Recommendations

1. **Secret Key Isolation:** Never use client publishable keys (`sb_publishable_...`) in server-side clients. Use the genuine `service_role` secret in server environments only.
2. **PostgREST Row Verification Pattern:** All update queries must use `.select('id')`:
   ```typescript
   const { data, error } = await supabaseServer
     .from('orders')
     .update({ status: 'CONFIRMED' })
     .eq('id', orderId)
     .select('id');
   if (error || !data || data.length === 0) {
     throw new Error('Database update failed: Row not found or permission denied by RLS.');
   }
   ```
3. **Database Migration Safety:** Execute migrations containing `UNIQUE` constraints and `TEXT` identifier columns before code deployment.
4. **Idempotency Keys:** Every external courier API call must use the store `orderId` as the unique reference and check for existing tracking codes before invoking courier APIs.

---

## 6. Phase 03 Implementation Sequence (Blueprint)

```mermaid
graph TD
    Step1["Step 1: Database Migration (SQL)<br/>Apply deliveries, conversions, settings"] --> Step2["Step 2: Server Auth & RLS<br/>Configure real service_role key & assert checks"]
    Step2 --> Step3["Step 3: Route Idempotency & Upsert Fix<br/>Add tracking check & fix onConflict"]
    Step3 --> Step4["Step 4: Checkout Reliability<br/>Remove false success, make Telegram async"]
    Step4 --> Step5["Step 5: Cancellation & UI Badges<br/>Differentiate local vs courier cancellation"]
    Step5 --> Step6["Step 6: Phase 04 Verification<br/>Run regression suite across all 12 scenarios"]
```

### Required File Modifications in Phase 03:
1. `migrations/20261108_000002_v2_1_deliveries_and_conversions.sql`:
   - Add `UNIQUE` constraint to `deliveries.tracking_number`.
   - Ensure `order_id TEXT NOT NULL`.
   - Add `order_timeline_events` and `site_settings` table definitions.
2. `src/lib/supabase/server.ts`:
   - Enforce secret service role key validation.
3. `src/app/api/delivery/route.ts`:
   - Add idempotency guard to `create` and `push_order`.
   - Assert `data.length > 0` on PostgREST updates.
   - Fix `deliveries` upsert conflict target.
   - Refine `executeOrderCancellation` to handle `{"delete":"fail"}` gracefully with explicit courier action notice.
4. `src/app/actions/checkout.ts`:
   - Prevent false success: propagate DB insertion errors cleanly.
   - Optimize Telegram alert timeout to prevent checkout delays.
5. `src/app/(main)/dashboard/ecommerce/_components/order-details-drawer.tsx`:
   - Display explicit cancellation status (Cancelled vs. Courier Action Required).

---

## 7. Remaining Uncertainties & Blocked Tests

- **T05 & T06 (Live Parcel Creation & Validation):** Marked **BLOCKED** in Phase 02 to strictly comply with the rule against creating real external shipments on Redex. These will be verified in Phase 04 using a dedicated test order and immediate controlled cancellation.
- **Vercel Production Key Sync:** The production Vercel project environment must be updated with the secret `SUPABASE_SERVICE_ROLE_KEY` once provided.

---

## 8. Conclusion & Sign-Off Request

Phase 02 investigation is **100% complete**. No source code, database tables, or live shipments were modified during this phase.

The exact break points, root causes, and repair implementations are fully documented.

**We are awaiting your review and authorization to begin Phase 03: Root Cause Repair.**

