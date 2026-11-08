# Cash-on-Delivery (COD) High-Conversion E-Commerce Template
> **Engineered for Local & Regional Retail (Algeria & MENA Markets)**  
> Next.js 16 • React 19 • Supabase • Tailwind CSS v4 • Multi-Courier Abstraction • COD Reconciliation

---

## 🌟 Overview

This template blueprint defines a high-conversion, battle-tested e-commerce boutique architecture specifically engineered for **Cash-on-Delivery (COD)** markets. 

In COD-dominant markets (such as Algeria and the broader MENA region), e-commerce operates fundamentally differently from credit-card-first platforms like Shopify or standard WooCommerce:
- **Zero Friction Checkout:** Single-page checkout with no upfront card payments, tailored for fast mobile completion.
- **Regional Administrative Logistics:** Integrated 58-Wilayas and 1,500+ Communes delivery matrix with distinct pricing for Home Delivery (*À Domicile*) vs Courier Desk Pickup (*Stop-Desk*).
- **Courier Provider Abstraction:** Seamless adapter pattern supporting **Yalidine**, **ZR Express**, **Ecotrack**, **Maystro**, **Noest**, and local sandbox mocking.
- **COD Financial Lifecycle:** Built-in order timeline tracking, delivery state normalization, and cash collection reconciliation to prevent courier revenue leakage.
- **Instant Operator Alerts:** Automated Telegram bot dispatch notifications and Meta Pixel / CAPI tracking.

---

## 📐 Template Folder Contents

This `/template` folder provides everything needed to understand, fork, rebrand, and deploy a new store based on this architectural foundation:

| File | Purpose |
| :--- | :--- |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Full system design, data flows, security boundaries, and component layers. |
| [`DATABASE_SCHEMA.sql`](./DATABASE_SCHEMA.sql) | Turnkey PostgreSQL DDL script with tables, constraints, RLS security policies, and indexes. |
| [`store.config.template.ts`](./store.config.template.ts) | Centralized, typed TypeScript configuration template for branding, currency, fees, and logistics. |
| [`COURIER_INTEGRATION_GUIDE.md`](./COURIER_INTEGRATION_GUIDE.md) | Guide to configuring and extending Yalidine, ZR Express, Ecotrack, Maystro, Noest, or custom couriers. |
| [`CHECKOUT_AND_COD_GUIDE.md`](./CHECKOUT_AND_COD_GUIDE.md) | High-conversion COD checkout flow, phone validation, Wilaya tariffs, and order confirmation. |
| [`REBRANDING_DEPLOYMENT_CHECKLIST.md`](./REBRANDING_DEPLOYMENT_CHECKLIST.md) | 1-hour step-by-step checklist to rebrand, configure Supabase, seed catalog, and deploy to Vercel. |
| [`seed-data.template.json`](./seed-data.template.json) | Ready-to-import catalog seed data (categories, collections, products, variants). |

---

## 🛠️ Technology Stack

- **Storefront & Server:** Next.js 16+ (App Router, Turbopack, React Server Components & Server Actions)
- **UI & Animations:** React 19, Tailwind CSS v4, Lucide Icons, Framer Motion
- **Design System:** Accessible primitives based on shadcn/ui & Radix/Base UI
- **Backend & Database:** Supabase (PostgreSQL 15+, Row-Level Security, Server-Side SSR Auth, Storage)
- **Validation:** Zod schemas for orders, shipping addresses, phone formats, and admin forms
- **Integrations:**
  - Couriers: Yalidine API, ZR Express API, Ecotrack / RedEx, Maystro, Noest, Mock Adapter
  - Communications: Telegram Bot API for instant dispatch alerts
  - Analytics: Meta Pixel & Conversions API (CAPI)

---

## 🚀 Quick Evaluation & Getting Started

1. **Review System Architecture:** Read [`ARCHITECTURE.md`](./ARCHITECTURE.md) to understand the separation between public storefront and admin operations.
2. **Deploy Database:** Run [`DATABASE_SCHEMA.sql`](./DATABASE_SCHEMA.sql) in your Supabase SQL Editor.
3. **Follow the Checklist:** Follow [`REBRANDING_DEPLOYMENT_CHECKLIST.md`](./REBRANDING_DEPLOYMENT_CHECKLIST.md) to adapt the codebase for your target brand and product catalog.

