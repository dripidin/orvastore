# Original User Request

## Initial Request — 2026-11-07T22:38:59Z

Clean up, unify, and customize the ORVA store and administrative dashboard to eliminate duplication, purge legacy template artifacts, and align features with operational specifications.

Integrity mode: development

## Requirements

### R1. Implementation Plan & Execution Guide
- Provide a comprehensive execution plan and step-by-step instructions before executing code modifications.
- Directly implement all approved code changes across the codebase.

### R2. Dashboard Settings Consolidation (/dashboard/settings)
- Unify settings under a consistent layout and merge duplicate controls.
- Delivery logistics: Adopt Redex Express DZ as the primary shipping gateway, eliminating redundant Ecotrack and Yalidine / ZR Express integrations.
- Telegram alerts: Retain "Telegram Bot Order Alerts" (إشعارات تيليجرام اللحظية) as the sole alert configuration, removing duplicates.
- Campaign tracking: Consolidate Meta Pixel and Conversions API (CAPI) v19.0 Graph API into a single unified card allowing easy configuration of Pixel ID and CAPI token.
- Remove redundant sections from `/dashboard/settings`:
  * Remove Database & Supabase settings.
  * Remove backend health and API status ("حالة واتصالات النظام الخلفي / API & Backend Health").
  * Remove dashboard appearance and preferences ("Dashboard Appearance & Preferences: Theme, typography, layout, sidebar").

### R3. Products & Inventory Management Redesign (/dashboard/products)
- Redesign the products management view to be clean, streamlined, and intuitive for store administrators.
- Remove the product page layout preview ("معاينة تخطيط صفحة المنتج (قالب المتجر)").

### R4. Store Pages & Sitemap Alignment (/dashboard/products/pages)
- Align the pages management view with actual ORVA store routes (/, /pack1, /pack2, /pack3, etc.).
- Remove separation rules and legacy text ("معمارية الفصل وحماية صفحات المتجر / Phase 8A Separation Rules").

### R5. Analytics & Visitor Reporting (/dashboard/analytics or visitors-and-reports)
- Format analytics and reporting data to be clear, easily readable, filterable, and comparable, representing realistic store metrics.

### R6. Sidebar, Navigation, and Workspace Streamlining
- Remove "Customers & Delivery" from the navigation and sidebar.
- Remove "Risk & Fraud Shield" from `/dashboard/ecommerce#risk` sidebar navigation.
- In the Store Workspace, remove "API Integrations (Connections and service health)".
- Remove the language selector from the dashboard top navbar while preserving underlying Arabic and English language support in the application.

### R7. Regional Demand Breakdown (/dashboard/products/demand)
- Restructure the page layout and eliminate the duplicate entry for "Sac Banane" in the products list.

### R8. Storefront Pack Pages Modernization (/pack1, /pack2, /pack3)
- Remove cluttered badge spans (e.g., "الأكثر طلباً للسيارة والمنزل • عتاد 4 في 1", "أصلي 100% مع حق المعاينة قبل الدفع").
- Align product pages styling with the standards defined in the Product Page Designer.

## Acceptance Criteria

### Execution & Documentation
- [ ] A clear implementation plan with actionable step-by-step instructions is produced before applying code changes.
- [ ] Code modifications are applied and verified across all target files.

### Settings & Integrations (/dashboard/settings)
- [ ] Redex Express DZ is the active shipping provider configuration; Ecotrack and Yalidine / ZR Express options are completely removed.
- [ ] "Telegram Bot Order Alerts" is the sole Telegram notification configuration on the settings page.
- [ ] Meta Pixel ID and Conversions API (CAPI) v19.0 token are editable within a single unified settings card.
- [ ] Database & Supabase settings, Backend/API Health status, and Appearance & Preferences sections are absent from `/dashboard/settings`.

### Navigation & Workspace
- [ ] "Customers & Delivery" is absent from the dashboard navigation and sidebar.
- [ ] "Risk & Fraud Shield" is absent from the sidebar in `/dashboard/ecommerce#risk`.
- [ ] "API Integrations" is absent from the Store Workspace view.
- [ ] The dashboard top navbar does not render a language selector element, while bilingual support (Arabic and English) remains intact in application code.

### Products, Pages & Demand
- [ ] The `/dashboard/products` page presents a simplified layout without the "معاينة تخطيط صفحة المنتج" preview component.
- [ ] The `/dashboard/products/pages` view lists actual ORVA store routes (/, /pack1, /pack2, /pack3, etc.) and contains no Phase 8A Separation Rules text or components.
- [ ] The `/dashboard/products/demand` page contains exactly one unique listing for "Sac Banane" without duplication.

### Analytics & Storefront
- [ ] The analytics page displays clear metrics with functional date/category filtering and comparison views reflecting realistic store data.
- [ ] Pages `/pack1`, `/pack2`, and `/pack3` do not display promotional badge spans such as "الأكثر طلباً للسيارة والمنزل • عتاد 4 في 1" or "أصلي 100% مع حق المعاينة قبل الدفع".
- [ ] Pages `/pack1`, `/pack2`, and `/pack3` conform to the visual styling standards of the Product Page Designer.
- [ ] The project builds successfully (`npm run build` or equivalent) with no TypeScript, linting, or runtime syntax errors introduced by the changes.
