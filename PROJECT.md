# Project: ORVA Store Operational & Testing Fixes

## Architecture
- **Framework**: Next.js 16.3.2 with React 19.2.8, Turbopack, Tailwind CSS, Base UI (`@base-ui/react`), Lucide React.
- **Storefront App Router Group**: `src/app/(storefront)` containing `/`, `/pack1`, `/pack2`, `/pack3`, `/checkout/confirmation`.
- **Admin App Router Group**: `src/app/(main)/dashboard` containing settings, products, demand, pages, analytics, logistics, ecommerce.
- **Data & Repositories**: Mock repository layer in `src/lib/repository/`, fallback orders in `src/lib/orders-store.ts` and `src/data/fallback-orders.json`.
- **E2E Test Suite**: Node.js test runner covering Tiers 1–4 across E2E test cases (`npm run test:e2e`).

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | R1 Storefront Order Persistence | COD checkout submission reliably saves to Supabase and persistent fallback (`src/data/fallback-orders.json`) | M1 | ORIGINAL_REQUEST §R1 |
| 2 | R1 Admin Dashboard Immediate Sync | Instant reflection in `/dashboard/ecommerce` via `BroadcastChannel` and `orva:orders-updated` event | M1 | ORIGINAL_REQUEST §R1 |
| 3 | R1 Checkout Route Fallback | Graceful redirect for direct `/checkout` requests to `/pack1` | M1 | Survey Finding |
| 4 | R5 Telegram Settings Binding | Load bot token, chat ID, and enabled flag from admin settings (`getAdminSettingsAction()`) | M1 | ORIGINAL_REQUEST §R5 |
| 5 | R5 Telegram Channel -100 Normalization | Normalize 10–14 digit channel IDs to `-100` prefix for supergroups/channels | M1 | ORIGINAL_REQUEST §R5 |
| 6 | R5 Telegram Safe HTML Payload | HTML-formatted message with entity escaping to prevent HTTP 400 parsing crashes | M1 | ORIGINAL_REQUEST §R5 |
| 7 | R5 Telegram Error Logging | Inspect response status and JSON, log success/warnings without failing checkout | M1 | ORIGINAL_REQUEST §R5 |
| 8 | R2 Designer & Storefront Sync | Storefront pack pages load configuration from `MockLayoutRepository`, subscribe to `orva_layout_sync_v1` | M2 | ORIGINAL_REQUEST §R2 |
| 9 | R2 Layout Reordering & Visibility | Live reflection of section reordering, visibility toggles, and split/stacked modes on `/pack1`, `/pack2`, `/pack3` | M2 | ORIGINAL_REQUEST §R2 |
| 10 | R3 Storefront Clean Light Theme | Modern light theme with neutral white / soft slate-50 surfaces and high-contrast text | M2 | ORIGINAL_REQUEST §R3 |
| 11 | R3 Dark-Mode Artifact Purge | Remove dark background overrides (`bg-[#101418]`), arbitrary dark child selectors, and dark card styling | M2 | ORIGINAL_REQUEST §R3 |
| 12 | R3 Designer Preview Alignment | Update designer preview canvas to match clean light theme | M2 | Survey Finding |
| 13 | R4 Catalog Repository Unification | Wire `/dashboard/products` to `getMockProductsRepository()`, restoring full product list and CRUD | M3 | ORIGINAL_REQUEST §R4 |
| 14 | R4 Core Products Definition | Define Pack 1, Pack 2, and Pack 3 with exact Arabic names, active status, and prices (4,950, 12,950, 15,950 DZD) | M3 | ORIGINAL_REQUEST §R4 |
| 15 | R4 Inventory & Mapping Alignment | Align `KNOWN_PRODUCT_MAPPINGS` in `product-types.ts` and `storefront-packs.ts` for order linking | M3 | Survey Finding |
| 16 | R6 Meta Pixel Script Injection | Inject client-side `fbq` script (`fbevents.js`, `fbq('init', pixelId)`, `fbq('track', 'PageView')`) in storefront DOM | M3 | ORIGINAL_REQUEST §R6 |
| 17 | R6 Meta Pixel Localhost Detection | Ensure Meta Pixel is detectable by Meta Ads Data Advisor and standard inspection tools on localhost | M3 | ORIGINAL_REQUEST §R6 |
| 18 | R6 CAPI Deduplication & Settings Sync | Align server-side CAPI pixel ID with client-side pixel ID from settings store | M3 | ORIGINAL_REQUEST §R6 |
| 19 | Production Build & E2E Validation | Pass TypeScript typecheck (`tsc --noEmit`), Next.js build (`npm run build`), and E2E tests | M4 | ORIGINAL_REQUEST Acceptance Criteria |
| 20 | Forensic Integrity Audit | Independent verification of zero hardcoding, zero facade implementations, genuine operational logic | M4 | Integrity Protocol |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Storefront Order Persistence & Telegram Alerts | R1 & R5: Persistent order fallback, immediate dashboard sync, Telegram settings binding, -100 prefix, safe HTML, non-blocking dispatch | none | DONE |
| M2 | Product Page Designer Sync & Storefront Light Theme | R2 & R3: Pack pages layout sync with `MockLayoutRepository`, real-time updates, clean light theme, dark artifacts removal | none | DONE |
| M3 | Core Products Catalog & Meta Pixel Injection | R4 & R6: `/dashboard/products` repository fix, Pack 1/2/3 Arabic names & pricing, active status, Meta Pixel client script DOM injection | none | DONE |
| M4 | Final Verification, Build & Forensic Audit | Verification across all requirements, full Next.js production build, E2E tests, review, adversarial challenge, forensic audit | M1, M2, M3 | DONE |

---

## Code Layout & Ownership Boundaries

| Milestone | Owned Files |
|-----------|-------------|
| **M1** | `next-shadcn-admin-dashboard-baseui-main/src/lib/orders-store.ts`<br>`next-shadcn-admin-dashboard-baseui-main/src/data/fallback-orders.json`<br>`next-shadcn-admin-dashboard-baseui-main/src/app/actions/checkout.ts`<br>`next-shadcn-admin-dashboard-baseui-main/src/app/api/delivery/route.ts`<br>`next-shadcn-admin-dashboard-baseui-main/src/components/storefront/checkout/embedded-cod-order-form.tsx`<br>`next-shadcn-admin-dashboard-baseui-main/src/app/(main)/dashboard/ecommerce/_components/recent-orders.tsx`<br>`next-shadcn-admin-dashboard-baseui-main/src/app/(storefront)/checkout/page.tsx` |
| **M2** | `next-shadcn-admin-dashboard-baseui-main/src/app/(storefront)/pack1/page.tsx`<br>`next-shadcn-admin-dashboard-baseui-main/src/app/(storefront)/pack2/page.tsx`<br>`next-shadcn-admin-dashboard-baseui-main/src/app/(storefront)/pack3/page.tsx`<br>`next-shadcn-admin-dashboard-baseui-main/src/components/storefront/pack/dynamic-pack-layout.tsx`<br>`next-shadcn-admin-dashboard-baseui-main/src/components/storefront/pack/pack-gallery.tsx`<br>`next-shadcn-admin-dashboard-baseui-main/src/components/storefront/pack/sticky-mobile-order-bar.tsx`<br>`next-shadcn-admin-dashboard-baseui-main/src/app/(main)/dashboard/products/designer/page.tsx` |
| **M3** | `next-shadcn-admin-dashboard-baseui-main/src/lib/repository/mock-products-dataset.ts`<br>`next-shadcn-admin-dashboard-baseui-main/src/lib/repository/product-types.ts`<br>`next-shadcn-admin-dashboard-baseui-main/src/data/storefront-packs.ts`<br>`next-shadcn-admin-dashboard-baseui-main/src/app/(main)/dashboard/products/page.tsx`<br>`next-shadcn-admin-dashboard-baseui-main/src/components/storefront/analytics/meta-pixel.tsx`<br>`next-shadcn-admin-dashboard-baseui-main/src/app/(storefront)/layout.tsx` |
| **M4** | Read-only across entire project; build commands (`npm run build`, `npm run test:e2e`, `tsc --noEmit`) |
