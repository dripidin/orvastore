# E2E Test Infra: ORVA COD E-Commerce Platform

## Test Philosophy
- **Opaque-box, requirement-driven**: Tests derive directly from `ORIGINAL_REQUEST.md` and user-facing specifications, exercising the storefront, checkout, admin operations, re-routing, and integrations as real end users and couriers would.
- **Methodology**: Systematic 4-tier methodology (Category-Partition, Boundary Value Analysis, Pairwise Combinatorial Testing, and Real-World Workload Scenarios).
- **Progressive Testability**: Verification mechanisms use standard Node.js / TypeScript runners without circular dependencies on complex runtime features.

## Feature Inventory & Test Matrix
| # | Feature | Source | Tier 1 (Coverage) | Tier 2 (Boundary) | Tier 3 (Cross-Feature) | Tier 4 (Real-World) |
|---|---------|--------|:-----------------:|:-----------------:|:----------------------:|:-------------------:|
| 1 | Baseline Compilation & Build | Acceptance Criteria | 5 | 5 | ✓ | ✓ |
| 2 | Storefront Branding & Tajawal Font | R1 / Survey | 5 | 5 | ✓ | ✓ |
| 3 | Cascading Wilayas (58) & Communes (1541) | R1 / Survey | 5 | 5 | ✓ | ✓ |
| 4 | Delivery Mode Toggle (Home vs Stop-Desk) | R1 / Survey | 5 | 5 | ✓ | ✓ |
| 5 | Single-Page COD Checkout Form | R1 / Survey | 5 | 5 | ✓ | ✓ |
| 6 | Algerian Phone Regex (05/06/07) | R1 / Survey | 5 | 5 | ✓ | ✓ |
| 7 | Dynamic Real-Time Price Breakdown | R1 / Survey | 5 | 5 | ✓ | ✓ |
| 8 | Pack 1 Page (4,950 DZD) & 4 items | R2 / Survey | 5 | 5 | ✓ | ✓ |
| 9 | Pack 2 Page (12,950 DZD) & 5 items | R2 / Survey | 5 | 5 | ✓ | ✓ |
| 10 | Pack 3 Page (15,950 DZD) & 6 items | R2 / Survey | 5 | 5 | ✓ | ✓ |
| 11 | Buyer Reassurance Grid (4 Pillars) | R2 / Survey | 5 | 5 | ✓ | ✓ |
| 12 | Inter-Pack Cross-Sells | R2 / Survey | 5 | 5 | ✓ | ✓ |
| 13 | Admin Dashboard & Order Management | R3 / Survey | 5 | 5 | ✓ | ✓ |
| 14 | Order Re-routing (تحويل الطلبية) | R3 / Survey | 5 | 5 | ✓ | ✓ |
| 15 | Copyable Courier Instruction Note | R3 / Survey | 5 | 5 | ✓ | ✓ |
| 16 | Meta Pixel & CAPI Deduplication | R4 / Survey | 5 | 5 | ✓ | ✓ |
| 17 | Telegram Bot Instant Order Alerts | R4 / Survey | 5 | 5 | ✓ | ✓ |
| 18 | Courier Abstraction (Yalidine, ZR Express) | R5 / Survey | 5 | 5 | ✓ | ✓ |
| 19 | Admin Courier Provider Switching | R5 / Survey | 5 | 5 | ✓ | ✓ |
| 20 | Database Schema & Supabase RLS | R6 / Survey | 5 | 5 | ✓ | ✓ |

## Test Architecture
- **Location**: `tests/e2e/` (within `next-shadcn-admin-dashboard-baseui-main`)
- **Runner**: Node.js test runner / TypeScript test execution (`npm run test:e2e` or `npx tsx tests/e2e/runner.ts`)
- **Structure**:
  - `tests/e2e/tier1-features/`: Unit and component level verification of each inventoried feature in isolation.
  - `tests/e2e/tier2-boundaries/`: Wilaya 49-58 stop-desk block, phone number formatting (+213, invalid prefixes), zero/negative price handling, terminal status re-routing barriers.
  - `tests/e2e/tier3-cross-feature/`: Checkout -> Order Creation -> Telegram Alert -> Admin Order Table -> Courier Note Generation.
  - `tests/e2e/tier4-scenarios/`: End-to-end customer purchasing journey, cancelled stop-desk re-routing to new Biskra-origin destination, multi-carrier parcel dispatch.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Expected Outcome |
|---|----------|--------------------|------------------|
| 1 | Customer in Algiers buys Pack 1 (Home Delivery) | F2, F3, F4, F5, F6, F7, F8, F17 | Order created with total 5,450 DZD; Telegram alert triggered |
| 2 | Customer in Oran orders Pack 2 (Stop-Desk) | F4, F9, F11, F13, F14, F18 | Stop-desk accepted, order appears in admin with Stop-Desk tag |
| 3 | Customer in In Guezzam (Wilaya 54) attempts Stop-Desk | F4, F6, F14 | System blocks Stop-Desk selection; requires Home Delivery |
| 4 | Order refused at courier desk -> Re-routed (تحويل الطلبية) | F14, F15, F18 | Order status updated; formatted note generated with new buyer & tariff diff |
| 5 | Merchant toggles courier from Yalidine to ZR Express | F18, F19 | Provider switched in settings; new shipments use ZR Express payload format |

## Coverage Minimum Thresholds
- **Tier 1 (Feature Coverage)**: ≥ 100 test cases (≥5 per feature across 20 features)
- **Tier 2 (Boundary & Corner)**: ≥ 100 test cases
- **Tier 3 (Cross-Feature Pairwise)**: ≥ 25 test cases
- **Tier 4 (Real-World Scenarios)**: ≥ 10 end-to-end workload scenarios
- **Total Suite**: ≥ 235 test cases

