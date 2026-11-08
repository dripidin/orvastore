# Rebranding & Deployment Checklist
> **Step-by-Step Runbook to Launch a New Store in Under 60 Minutes**

---

## ⏱️ Timeline Overview

| Phase | Task | Duration |
| :--- | :--- | :--- |
| **Phase 1** | Supabase Database & Storage Setup | 10 mins |
| **Phase 2** | Environment Variables & Secrets Configuration | 5 mins |
| **Phase 3** | Visual Branding, Logos & Theme Customization | 15 mins |
| **Phase 4** | Product Catalog Seeding | 10 mins |
| **Phase 5** | Logistics & Courier Credentials | 10 mins |
| **Phase 6** | Telegram Alerts & Vercel Deployment | 10 mins |

---

## Phase 1: Supabase Database & Storage Setup

1. [ ] **Create New Project:** Go to [Supabase](https://supabase.com) and create a new project.
2. [ ] **Execute Schema:**
   - Open the **SQL Editor** in the Supabase Dashboard.
   - Copy the entire contents of [`template/DATABASE_SCHEMA.sql`](./DATABASE_SCHEMA.sql).
   - Click **Run** to create all tables, indexes, and Row Level Security (RLS) policies.
3. [ ] **Create Storage Buckets:**
   - Navigate to **Storage** in the Supabase Dashboard.
   - Create two public buckets:
     - `products` (Public: Yes) — for product photos and variant gallery.
     - `cms` (Public: Yes) — for hero banners, brand logos, and marketing imagery.
4. [ ] **Create Admin User:**
   - Navigate to **Authentication > Users**.
   - Click **Add User** (Create user with email & password) for your store manager.

---

## Phase 2: Environment Variables Configuration

Copy `.env.example` to `.env.local` and populate the values:

```ini
# Storefront Public URLs & Keys
NEXT_PUBLIC_SITE_URL=https://your-domain.dz
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>

# Backend Security (Never expose to client browser)
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# Active Courier Provider (MOCK_EXPRESS | YALIDINE | ZR_EXPRESS | ECOTRACK)
COURIER_PROVIDER=YALIDINE
YALIDINE_API_ID=your_yalidine_api_id
YALIDINE_API_KEY=your_yalidine_api_token

# Telegram Order Alerts (Optional but recommended)
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_telegram_group_chat_id
```

---

## Phase 3: Visual Branding, Logos & Theme Customization

1. [ ] **Brand Identity Configuration:**
   - Open `src/config/store.config.ts` (or copy from [`template/store.config.template.ts`](./store.config.template.ts)).
   - Set `brand.name`, `brand.nameAr`, `contact.phone`, `contact.whatsapp`, and social links.
2. [ ] **Replace Logo & Favicon:**
   - Place your SVG/PNG logo in `public/images/logo.svg` or `public/images/logo.png`.
   - Update `public/favicon.ico`.
3. [ ] **Theme Colors & Typography (Tailwind v4):**
   - Adjust theme color tokens in `src/app/globals.css`.
   - If changing font families (e.g. from Luxury Serif to Streetwear Sans), configure Google Fonts in `src/app/layout.tsx`.
4. [ ] **SEO Metadata:**
   - Update title, description, and OpenGraph metadata in `src/app/layout.tsx` and `src/app/manifest.ts`.

---

## Phase 4: Product Catalog Seeding

1. [ ] **Categories & Collections:**
   - Open `/admin/products` or use the seed file [`template/seed-data.template.json`](./seed-data.template.json).
   - Create your main product categories (e.g. Rings, Necklaces, Bracelets, Apparel).
2. [ ] **Upload Initial Products:**
   - Add product title, slug, description, price (DZD), and variants (sizes/colors).
   - Upload high-resolution images to the Supabase `products` storage bucket.
   - Set status to `PUBLISHED`.

---

## Phase 5: Logistics & Courier Credentials

1. [ ] **Courier Account:**
   - Sign up with Yalidine, ZR Express, or your chosen regional courier.
   - Request API credentials for e-commerce dispatch.
2. [ ] **Admin Courier Settings:**
   - Log into `/admin/settings`.
   - Select active courier provider.
   - Enter API tokens and set your default origin Wilaya (e.g., Wilaya 16 - Alger).
3. [ ] **Verify Delivery Fees:**
   - Review default shipping fees in `src/lib/algeria-cities.ts` or set custom Wilaya overrides via `/admin/settings`.

---

## Phase 6: Telegram Alerts & Production Deployment

1. [ ] **Telegram Bot Setup:**
   - Create a bot with [@BotFather](https://t.me/botfather) and copy the HTTP API token.
   - Create a private management group for store operators, add the bot, and get the `chat_id`.
   - Add `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` to `.env.local`.
2. [ ] **Deploy to Vercel:**
   - Push repository to GitHub/GitLab.
   - Import project into [Vercel](https://vercel.com).
   - Add all environment variables in Vercel Project Settings.
   - Click **Deploy**.
3. [ ] **Custom Domain & DNS:**
   - In Vercel, navigate to **Settings > Domains**.
   - Add your custom domain (e.g. `store.dz` or `www.store.dz`).
   - Configure DNS A/CNAME records with your domain registrar.
4. [ ] **End-to-End Test:**
   - Visit storefront on mobile.
   - Add an item to cart and complete 1-page COD checkout.
   - Verify order appears in `/admin/orders` and instant Telegram notification arrives.

