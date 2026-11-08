# ORVA Store — Algerian COD E-Commerce Platform & Admin Operations

**ORVA Store** is a production-ready Cash-on-Delivery (COD) e-commerce platform built for the Algerian market, specializing in high-demand utility tools and workshop equipment from leading brands such as **Crown**, **Starcle Pro**, and **Toyota**.

---

## 🌟 Key Features

### 🛒 Storefront & Checkout (High-Converting COD Flow)
- **Modern Clean Light Theme**: Elegant white & slate design with warm amber accents, optimized for fast mobile conversions.
- **Dedicated Product Pack Pages**:
  - `/pack1`: **باك منفاخ تويوتا وطقم المفاتيح 4 في 1** (4,950 DZD)
  - `/pack2`: **باك ماكينة كراون CROWN 20V الأصلية 5 في 1** (12,950 DZD)
  - `/pack3`: **باك الأشغال الشاقة والمقاولين CROWN و Starcle Pro 6 في 1** (15,950 DZD)
- **1-Page Cash on Delivery Checkout**:
  - Complete cascading selectors for all **58 Algerian Wilayas** and **1,541 Communes**.
  - Dynamic shipping tariff engine calculated from the Biskra distribution hub (Wilaya 07).
  - Support for Home Delivery (*À Domicile*) and Pickup Desk (*Stop-Desk*).
  - Built-in Honeypot anti-bot protection and server-side price tampering defense.
  - Sticky mobile order bar for seamless mobile purchasing.

### 📊 Admin Operations Dashboard (`/dashboard`)
- **Live Orders Workspace (`/dashboard/ecommerce`)**: Real-time order tracking, customer details, Wilaya distribution, and shipping status transitions (`PENDING` ➔ `CONFIRMED` ➔ `SHIPPED` ➔ `DELIVERED` / `RETURNED`).
- **Order Re-routing System (تحويل الطلبية)**:
  - Re-route returned or canceled packages held at courier stop-desks/hubs to new buyers without returning items to warehouse.
  - 1-click generation of formatted, courier-ready dispatch notes (Arabic/French).
- **Consolidated Settings (`/dashboard/settings`)**:
  - **Courier Logistics**: Active integration with **Redex Express DZ** with credential storage and live connection check.
  - **Campaign Tracking**: Unified **Meta Pixel** & **Conversions API (CAPI v19.0 Graph API)** with SHA-256 data hashing and client-side DOM injection.
  - **Telegram Bot Order Alerts**: Instant notification dispatch on new orders with support for `-100` supergroup/channel IDs and customer privacy masking.
- **Products & Inventory (`/dashboard/products`)**: Simplified catalog table managing Pack 1, Pack 2, and Pack 3 with active stock KPIs, search, and pricing controls.
- **Product Page Designer (`/dashboard/products/designer`)**: Visual section re-ordering and layout customizer synchronized in real-time with live storefront pages.

### 🔒 Database & Reliability Architecture
- **Supabase Integration**: Strongly-typed schema with Row Level Security (RLS) policies protecting sensitive courier and order records.
- **Local Fallback Storage**: Dual-write mechanism (`fallback-orders.json`) ensuring 0 order loss during network interruptions or offline localhost development.

---

## 📁 Repository Structure

```
Orvastore/
├── next-shadcn-admin-dashboard-baseui-main/   # Main Next.js 16 application
│   ├── src/
│   │   ├── app/                               # App Router (Storefront + Dashboard)
│   │   │   ├── (storefront)/                  # /, /pack1, /pack2, /pack3, /checkout
│   │   │   ├── (main)/dashboard/              # /dashboard/ecommerce, /settings, /products
│   │   │   └── actions/                       # Next.js Server Actions (Checkout, Settings, Reroute)
│   │   ├── components/                        # UI components (Base UI, Tailwind CSS v4, Lucide)
│   │   ├── lib/                               # Supabase client, Redex courier, Telegram, Zod types
│   │   └── data/                              # Store packs data, Wilayas matrix, fallback orders
│   ├── public/                                # Static pack images, icons, and media
│   ├── tests/                                 # 4-tier E2E automated test suite
│   └── package.json                           # Dependencies & scripts
│
├── template/                                  # Architectural specifications & SQL schemas
│   ├── ARCHITECTURE.md                        # Platform architecture & requirements
│   ├── CHECKOUT_AND_COD_GUIDE.md              # COD single-page checkout specification
│   ├── COURIER_INTEGRATION_GUIDE.md           # Courier integration guidelines
│   └── DATABASE_SCHEMA.sql                    # Production Supabase SQL migration
│
├── pack 1 4950/                               # Original Pack 1 assets & source images
├── pack2 12950/                               # Original Pack 2 assets & source images
├── pack3 15950/                               # Original Pack 3 assets & source images
├── pack1.html                                 # Original Pack 1 reference template
├── pack2.html                                 # Original Pack 2 reference template
├── pack3.html                                 # Original Pack 3 reference template
├── PROJECT.md                                 # Full technical implementation inventory
└── README.md                                  # Project documentation
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ (Node.js 20+ recommended)
- npm or pnpm

### Installation & Run

1. Navigate to the Next.js application directory:
   ```bash
   cd next-shadcn-admin-dashboard-baseui-main
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open your browser:
   - **Storefront Home**: [http://localhost:3000](http://localhost:3000)
   - **Pack 1**: [http://localhost:3000/pack1](http://localhost:3000/pack1)
   - **Pack 2**: [http://localhost:3000/pack2](http://localhost:3000/pack2)
   - **Pack 3**: [http://localhost:3000/pack3](http://localhost:3000/pack3)
   - **Admin Dashboard**: [http://localhost:3000/dashboard](http://localhost:3000/dashboard)
   - **Store Settings**: [http://localhost:3000/dashboard/settings](http://localhost:3000/dashboard/settings)

---

## 🧪 Testing & Quality Assurance

Run the automated 4-tier E2E test suite:
```bash
npm run test:e2e
```

Run TypeScript compiler validation:
```bash
npx tsc --noEmit
```

Build for production:
```bash
npm run build
```

---

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
