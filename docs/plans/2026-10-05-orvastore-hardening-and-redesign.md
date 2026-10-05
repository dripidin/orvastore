# ORVA Store Hardening, Privacy, Admin Password & Multi-Pack Hub Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the website to the official "ORVA Store" identity, hide the legacy Yamaha backpack page, make Pack 1 and Pack 2 the primary storefront, fix the Algerian communes dropdown, secure the Admin Dashboard with password protection and a mobile-optimized view, and sanitize all secrets from Git while documenting the Vercel environment variables.

**Architecture:**
- **Storefront & Navigation:** The root `/` (`index.html`) becomes a modern **ORVA Store Hub** highlighting Pack 1 (4,950 DA) and Pack 2 (12,950 DA) with direct ordering pathways. The legacy Yamaha page is archived to `yamaha-archive.html` and removed from public navigation.
- **Communes Resolution:** Export `window.algeriaCommunes` globally in `algeria-communes.js` and update `packs-client.js` with string/number key fallbacks, ensuring 100% reliable commune loading for all 58 wilayas.
- **Admin Dashboard Security & Mobile UX:** `admin.html` is secured with a password protection gateway (`ADMIN_PASSWORD: orva2026`) with persistent session auth. On mobile devices (< 768px), it presents a concise, high-speed summary (KPIs, quick call/WhatsApp buttons, order status toggles, and navigation links to all pages).
- **Security & Secret Sanitization:** Remove all hardcoded API tokens from `api/delivery.js`, `api/send-order.js`, `admin.html`, and `.env.example`. Provide the user with a ready-to-copy list of variables for Vercel Project Settings.

**Tech Stack:**
- **Frontend:** Vanilla HTML5/CSS3, responsive design, CSS variables
- **Backend:** Node.js Vercel Serverless Functions (`/api/send-order`, `/api/delivery`, `/api/orders`)
- **Security & Config:** Vercel Environment Variables, Session Authentication

---

### Task 1: Fix Commune Dropdown in `algeria-communes.js` & `packs-client.js`

**Files:**
- Modify: `d:/Websites On Line/yamahasac/algeria-communes.js`
- Modify: `d:/Websites On Line/yamahasac/packs-client.js`
- Test: `d:/Websites On Line/yamahasac/scripts/verify-communes.js`

**Step 1: Write test script to verify commune lookup**

```javascript
// scripts/verify-communes.js
const assert = require('assert');
const communes = require('../algeria-communes');

// Test wilaya 16 (Alger), 07 (Biskra), 31 (Oran)
assert(Array.isArray(communes['16']) && communes['16'].length > 0, 'Wilaya 16 communes must exist');
assert(Array.isArray(communes['7']) && communes['7'].length > 0, 'Wilaya 7 communes must exist');
assert(Array.isArray(communes['31']) && communes['31'].length > 0, 'Wilaya 31 communes must exist');
console.log('✅ Communes data integrity verified. Alger has', communes['16'].length, 'communes.');
```

**Step 2: Update `algeria-communes.js` to attach to `window` and `module.exports`**

Change line 1:
```javascript
var algeriaCommunes = {
```
And add at the end of the file:
```javascript
if (typeof window !== 'undefined') {
    window.algeriaCommunes = algeriaCommunes;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = algeriaCommunes;
}
```

**Step 3: Update `packs-client.js` `updateCommunes` method**

```javascript
        function updateCommunes(wilayaId) {
            if (!communeSelect) return;
            communeSelect.innerHTML = '';
            
            const defOpt = document.createElement('option');
            defOpt.value = '';
            defOpt.disabled = true;
            defOpt.selected = true;
            defOpt.textContent = '-- اختر البلدية / الدائرة --';
            communeSelect.appendChild(defOpt);

            const communesData = (typeof window !== 'undefined' && window.algeriaCommunes) 
                ? window.algeriaCommunes 
                : (typeof algeriaCommunes !== 'undefined' ? algeriaCommunes : {});

            const list = communesData[wilayaId] || communesData[String(wilayaId)] || [];

            if (!list || list.length === 0) {
                defOpt.textContent = '-- اكتب البلدية يدوياً --';
                return;
            }

            list.forEach(cName => {
                const opt = document.createElement('option');
                opt.value = cName;
                opt.textContent = cName;
                communeSelect.appendChild(opt);
            });
        }
```

**Step 4: Run test script and verify**

Run: `cmd.exe /c "node scripts/verify-communes.js"`  
Expected: `✅ Communes data integrity verified.`

---

### Task 2: Sanitize All Secrets Across Codebase

**Files:**
- Modify: `d:/Websites On Line/yamahasac/api/send-order.js`
- Modify: `d:/Websites On Line/yamahasac/api/delivery.js`
- Modify: `d:/Websites On Line/yamahasac/admin.html`
- Modify: `d:/Websites On Line/yamahasac/.env.example`

**Step 1: Sanitize `api/send-order.js`**
Remove hardcoded fallbacks for `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`:
```javascript
const telegramToken  = process.env.TELEGRAM_BOT_TOKEN;
const telegramChatId = process.env.TELEGRAM_CHAT_ID;
```

**Step 2: Sanitize `api/delivery.js`**
Remove hardcoded Ecotrack token from lines 20 and 104:
```javascript
defaultToken: process.env.ECOTRACK_API_TOKEN || '',
```
and:
```javascript
const token = customToken || courier.defaultToken || process.env.ECOTRACK_API_TOKEN || '';
```

**Step 3: Sanitize `admin.html`**
Change line 767:
```html
<input type="password" id="settingsApiToken" class="app-input" placeholder="Token API Ecotrack / Redex (depuis variables d'environnement)">
```

**Step 4: Sanitize `.env.example`**
Replace live tokens with clean placeholders:
```env
TELEGRAM_BOT_TOKEN=your-telegram-bot-token-here
TELEGRAM_CHAT_ID=your-telegram-chat-id-here
ECOTRACK_API_TOKEN=your-ecotrack-api-token-here
ADMIN_PASSWORD=orva2026
```

---

### Task 3: Secure Admin Dashboard with Password & Mobile Optimization

**Files:**
- Modify: `d:/Websites On Line/yamahasac/admin.html`
- Modify: `d:/Websites On Line/yamahasac/admin.css`
- Modify: `d:/Websites On Line/yamahasac/admin.js`

**Step 1: Add Password Protection Modal / Screen in `admin.html`**
- Screen asks for password: `orva2026` (or `ADMIN_PASSWORD`).
- Remembers authentication in `sessionStorage.setItem('orva_admin_auth', 'true')` and `localStorage`.
- Includes a Logout button in the header.

**Step 2: Add Mobile Quick-Links Bar in `admin.html`**
Direct access to all website pages:
- 📦 **باك 1 (4,950 د.ج)** ➡️ `/pack1`
- ⚡ **باك 2 (12,950 د.ج)** ➡️ `/pack2`
- 🏠 **المتجر الرئيسي** ➡️ `/`

**Step 3: Add Mobile-Concise Responsive Styles in `admin.css`**
- When on screen width < 768px:
  - Hide complex multi-tab tables, desktop charts, and redundant widgets.
  - Present a high-speed, compact order card list with direct one-touch Phone (`tel:`) and WhatsApp (`wa.me`) buttons.
  - Show key metrics prominently: Total Orders, Revenue, Pending.

---

### Task 4: Rebrand to `orvastore`, Hide Yamaha Page & Build Official Store Hub

**Files:**
- Rename: `d:/Websites On Line/yamahasac/index.html` ➡️ `d:/Websites On Line/yamahasac/yamaha-archive.html`
- Create: `d:/Websites On Line/yamahasac/index.html` (New ORVA Store Hub)
- Modify: `d:/Websites On Line/yamahasac/package.json`
- Modify: `d:/Websites On Line/yamahasac/lib/db.js`
- Modify: `d:/Websites On Line/yamahasac/vercel.json`

**Step 1: Rename `package.json`**
```json
{
  "name": "orvastore",
  "version": "1.0.0",
  "description": "ORVA Store — Algeria Multi-Pack & Pro Tools Storefront",
  ...
```

**Step 2: Update `lib/db.js` storeId**
Change default `STORE_ID` to `'orvastore'`.

**Step 3: Create modern `index.html` (ORVA Store Showcase)**
A stunning, responsive Algerian storefront showcasing:
- Header with ORVA Store branding, customer service phone, and Wilayas delivery badge.
- Featured Hero Section: "متجر ORVA Store — أفضل باقات الصيانة والورشة في الجزائر".
- Grid of the 2 primary live packs:
  - **Pack 1:** باك الصيانة 4 في 1 (4,950 د.ج) مع صورة الغلاف والمواصفات وزر [اطلب الآن].
  - **Pack 2:** باك الورشة كراون 20V 5 في 1 (12,950 د.ج) مع صورة الغلاف والمواصفات وزر [اطلب الآن].
- Customer reassurance badges (الدفع عند الاستلام، الضمان والمعاينة، توصيل لجميع الولايات).

**Step 4: Update `vercel.json`**
Ensure clean routing for `/`, `/pack1`, `/pack2`, and `/admin`.

---

### Task 5: Verification & Vercel Environment Variables Documentation

**Files:**
- Test all pages locally on `dev-server.js`:
  - `http://localhost:3000/` (ORVA Store Hub)
  - `http://localhost:3000/pack1` (Pack 1 with working 58 wilayas and communes)
  - `http://localhost:3000/pack2` (Pack 2 with working 58 wilayas and communes)
  - `http://localhost:3000/admin.html` (Password protected + mobile view)
- Document the exact Vercel Environment Variables table for the user.
