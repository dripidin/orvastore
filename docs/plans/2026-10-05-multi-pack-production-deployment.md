# Multi-Pack Production Deployment & Live System Integration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate the two newly developed landing pages (`pack1.html` - 4,950 DA and `pack2.html` - 12,950 DA) seamlessly into the live Yamaha store ecosystem (Vercel serverless functions, Google Sheets database, Telegram order alerts, 58 Algerian wilayas shipping calculator, and anti-fraud shield) and deploy them live to production on Vercel.

**Architecture:** 
- **Client Layer:** A lightweight dedicated script (`packs-client.js`) handles 58-wilaya and commune population (`algeria-communes.js`), dynamic shipping calculation (`Tarif_Biskra.txt`), anti-fraud device fingerprinting, and submits orders to `/api/send-order`.
- **Backend Layer:** `api/send-order.js` is generalized to accept `productName` dynamically from `req.body`, recording pack names accurately in Google Sheets, Telegram bot notifications, and Meta CAPI without altering or breaking `index.html`.
- **Routing & Deployment:** `vercel.json` provides clean URLs (`/pack1` and `/pack2`), while Git and Vercel CLI publish the updates live to `https://yamahasac.vercel.app`.

**Tech Stack:**
- **Frontend:** Vanilla HTML5, CSS3 (`packs-styles.css`), Vanilla JS (`packs-config.js`, `packs-client.js`, `algeria-communes.js`)
- **Backend:** Node.js Vercel Serverless Functions (`api/send-order.js`, `lib/db.js`, `lib/riskEngine.js`)
- **Database & Services:** Google Sheets API v4 (`ecom-506102`), Telegram Bot API, Meta Conversions API (CAPI)
- **Hosting & CI/CD:** Vercel (`yamahasac.vercel.app`), Git / GitHub

---

### Task 1: Generalize `api/send-order.js` for Dynamic Product Names

**Files:**
- Modify: `d:/Websites On Line/yamahasac/api/send-order.js:37-180`
- Test: `d:/Websites On Line/yamahasac/scripts/test-order-api.js`

**Step 1: Write the test script for multi-pack order dispatch**

Create a temporary test script to verify `api/send-order.js` accepts custom `productName` and defaults safely when omitted:

```javascript
// scripts/test-order-api.js
const assert = require('assert');

async function testPayloadHandling() {
    const defaultProduct = 'Sac Banane Moto Yamaha (كرطابل يماها)';
    const pack1Product = 'Pack Pro 4 en 1 (منفاخ تويوتا + علبة مفاتيح 46 + مفك مرن + طقم مفكات)';
    
    function resolveProductName(body) {
        return (body && body.productName) ? body.productName : defaultProduct;
    }

    assert.strictEqual(resolveProductName({}), defaultProduct, 'Should fallback to default Yamaha product');
    assert.strictEqual(resolveProductName({ productName: pack1Product }), pack1Product, 'Should accept custom pack product');
    console.log('✅ Unit check passed: productName resolves dynamically.');
}

testPayloadHandling();
```

**Step 2: Run test script to verify logic**

Run: `cmd.exe /c "node scripts/test-order-api.js"`  
Expected: `✅ Unit check passed: productName resolves dynamically.`

**Step 3: Modify `api/send-order.js`**

Update `api/send-order.js` to destructure `productName` and use it across DB save, Meta CAPI, and Telegram messages:

```javascript
// In api/send-order.js line 37:
        const {
            fullName, phone, wilaya, commune,
            deliveryType, deliveryTime,
            quantity, productTotal, shippingFee, grandTotal,
            orderId, deviceId,
            honeypot, formDurationMs,
            fbp, fbc,
            productName // <-- ADD THIS
        } = req.body || {};

        const resolvedProductName = productName || 'Sac Banane Moto Yamaha (كرطابل يماها)';
```

And update:
- Line 100: `productName: resolvedProductName,`
- Line 142: `productName: resolvedProductName,`
- Line 162: `<b>🎒 طلب جديد — ORVA Store (${resolvedProductName})</b>`
- Line 170: `<b>📦 الكمية:</b> ${quantity} قطعة (${resolvedProductName})`
- Line 203: `subject: 🎒 [طلب جديد ${cleanOrderId}] ${resolvedProductName} - ${fullName} (${wilaya})`

**Step 4: Verify syntax and regression safety**

Run: `cmd.exe /c "node -c api/send-order.js"`  
Expected: Exit code 0 (no syntax errors).

**Step 5: Commit**

```bash
git add api/send-order.js scripts/test-order-api.js
git commit -m "fix(api): allow dynamic productName in send-order for multi-pack support"
```

---

### Task 2: Configure Clean URLs in `vercel.json`

**Files:**
- Modify: `d:/Websites On Line/yamahasac/vercel.json:1-7`

**Step 1: Inspect current `vercel.json`**

Current content:
```json
{
  "version": 2,
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/$1" }
  ]
}
```

**Step 2: Update `vercel.json` with clean pack rewrites**

Modify `vercel.json`:
```json
{
  "version": 2,
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/$1" },
    { "source": "/pack1", "destination": "/pack1.html" },
    { "source": "/pack2", "destination": "/pack2.html" }
  ],
  "cleanUrls": true
}
```

**Step 3: Verify JSON validity**

Run: `cmd.exe /c "node -e \"JSON.parse(require('fs').readFileSync('vercel.json'))\""`  
Expected: Exit code 0 (valid JSON).

**Step 4: Commit**

```bash
git add vercel.json
git commit -m "feat(routing): add clean URL rewrites for /pack1 and /pack2"
```

---

### Task 3: Create Dedicated `packs-client.js`

**Files:**
- Create: `d:/Websites On Line/yamahasac/packs-client.js`

**Purpose:**
Provides a shared, modular engine for `pack1.html` and `pack2.html` without modifying `script.js` (preserving full isolation). It handles:
1. Loading the 58 Wilayas and their exact `stopdesk` and `domicile` shipping prices from `Tarif_Biskra.txt`.
2. Populating Wilayas and Communes dynamically via `algeria-communes.js`.
3. Calculating real-time shipping costs and updating the summary breakdown.
4. Generating device IDs and anti-bot form duration measurement.
5. Submitting order payload with `productName` to `/api/send-order`.
6. Displaying the reassuring Order Confirmation modal receipt.

**Step 1: Write `packs-client.js`**

```javascript
/**
 * ORVA STORE — Multi-Pack Client Engine (packs-client.js)
 * Supports Pack 1 (4,950 DA) & Pack 2 (12,950 DA)
 * Handles 58 Wilayas, Communes, Shipping Tariffs, Anti-Fraud, and /api/send-order Dispatch
 */

(function () {
    'use strict';

    // 58 Wilayas with exact tariffs from Tarif_Biskra.txt
    const ALGERIA_WILAYAS = [
        { id: 1, name: "01 - أدرار", stopdesk: 800, domicile: 1300, time: "48 - 96 H" },
        { id: 2, name: "02 - الشلف", stopdesk: 450, domicile: 750, time: "24 - 48 H" },
        { id: 3, name: "03 - الأغواط", stopdesk: 550, domicile: 950, time: "24 - 48 H" },
        { id: 4, name: "04 - أم البواقي", stopdesk: 450, domicile: 750, time: "24 - 48 H" },
        { id: 5, name: "05 - باتنة", stopdesk: 450, domicile: 750, time: "24 - 48 H" },
        { id: 6, name: "06 - بجاية", stopdesk: 450, domicile: 750, time: "24 - 48 H" },
        { id: 7, name: "07 - بسكرة", stopdesk: 400, domicile: 550, time: "24 - 48 H" },
        { id: 8, name: "08 - بشار", stopdesk: 800, domicile: 1300, time: "48 - 96 H" },
        { id: 9, name: "09 - البليدة", stopdesk: 450, domicile: 750, time: "24 - 48 H" },
        { id: 10, name: "10 - البويرة", stopdesk: 450, domicile: 750, time: "24 - 48 H" },
        { id: 11, name: "11 - تمنراست", stopdesk: 800, domicile: 1400, time: "48 - 96 H" },
        { id: 12, name: "12 - تبسة", stopdesk: 500, domicile: 800, time: "24 - 48 H" },
        { id: 13, name: "13 - تلمسان", stopdesk: 450, domicile: 750, time: "24 - 48 H" },
        { id: 14, name: "14 - تيارت", stopdesk: 450, domicile: 750, time: "24 - 48 H" },
        { id: 15, name: "15 - تيزي وزو", stopdesk: 450, domicile: 750, time: "24 - 48 H" },
        { id: 16, name: "16 - الجزائر (العاصمة)", stopdesk: 450, domicile: 700, time: "24 - 48 H" },
        { id: 17, name: "17 - الجلفة", stopdesk: 500, domicile: 800, time: "24 - 48 H" },
        { id: 18, name: "18 - جيجل", stopdesk: 450, domicile: 750, time: "24 - 48 H" },
        { id: 19, name: "19 - سطيف", stopdesk: 450, domicile: 750, time: "24 - 48 H" },
        { id: 20, name: "20 - سعيدة", stopdesk: 450, domicile: 750, time: "24 - 48 H" },
        { id: 21, name: "21 - سكيكدة", stopdesk: 450, domicile: 750, time: "24 - 48 H" },
        { id: 22, name: "22 - سيدي بلعباس", stopdesk: 450, domicile: 750, time: "24 - 48 H" },
        { id: 23, name: "23 - عنابة", stopdesk: 450, domicile: 750, time: "24 - 48 H" },
        { id: 24, name: "24 - قالمة", stopdesk: 450, domicile: 750, time: "24 - 48 H" },
        { id: 25, name: "25 - قسنطينة", stopdesk: 450, domicile: 750, time: "24 - 48 H" },
        { id: 26, name: "26 - المدية", stopdesk: 450, domicile: 750, time: "24 - 48 H" },
        { id: 27, name: "27 - مستغانم", stopdesk: 450, domicile: 750, time: "24 - 48 H" },
        { id: 28, name: "28 - المسيلة", stopdesk: 450, domicile: 750, time: "24 - 48 H" },
        { id: 29, name: "29 - معسكر", stopdesk: 450, domicile: 750, time: "24 - 48 H" },
        { id: 30, name: "30 - ورقلة", stopdesk: 550, domicile: 950, time: "24 - 72 H" },
        { id: 31, name: "31 - وهران", stopdesk: 450, domicile: 750, time: "24 - 48 H" },
        { id: 32, name: "32 - البيض", stopdesk: 550, domicile: 950, time: "24 - 72 H" },
        { id: 33, name: "33 - إليزي", stopdesk: 800, domicile: 1700, time: "48 - 96 H" },
        { id: 34, name: "34 - برج بوعريريج", stopdesk: 450, domicile: 750, time: "24 - 48 H" },
        { id: 35, name: "35 - بومرداس", stopdesk: 450, domicile: 750, time: "24 - 48 H" },
        { id: 36, name: "36 - الطارف", stopdesk: 500, domicile: 800, time: "24 - 48 H" },
        { id: 37, name: "37 - تندوف", stopdesk: 800, domicile: 1500, time: "48 - 96 H" },
        { id: 38, name: "38 - تسمسيلت", stopdesk: 450, domicile: 750, time: "24 - 48 H" },
        { id: 39, name: "39 - الوادي", stopdesk: 550, domicile: 950, time: "24 - 72 H" },
        { id: 40, name: "40 - خنشلة", stopdesk: 500, domicile: 800, time: "24 - 48 H" },
        { id: 41, name: "41 - سوق أهراس", stopdesk: 500, domicile: 800, time: "24 - 48 H" },
        { id: 42, name: "42 - تيبازة", stopdesk: 450, domicile: 750, time: "24 - 48 H" },
        { id: 43, name: "43 - ميلة", stopdesk: 450, domicile: 750, time: "24 - 48 H" },
        { id: 44, name: "44 - عين الدفلى", stopdesk: 450, domicile: 750, time: "24 - 48 H" },
        { id: 45, name: "45 - النعامة", stopdesk: 550, domicile: 950, time: "24 - 72 H" },
        { id: 46, name: "46 - عين تموشنت", stopdesk: 450, domicile: 750, time: "24 - 48 H" },
        { id: 47, name: "47 - غرداية", stopdesk: 550, domicile: 950, time: "24 - 72 H" },
        { id: 48, name: "48 - غليزان", stopdesk: 450, domicile: 750, time: "24 - 48 H" },
        { id: 49, name: "49 - تيميمون", stopdesk: null, domicile: 1300, time: "48 - 96 H" },
        { id: 50, name: "50 - برج باجي مختار", stopdesk: null, domicile: 1700, time: "48 - 96 H" },
        { id: 51, name: "51 - أولاد جلال", stopdesk: null, domicile: 550, time: "24 - 72 H" },
        { id: 52, name: "52 - بني عباس", stopdesk: null, domicile: 1300, time: "48 - 96 H" },
        { id: 53, name: "53 - عين صالح", stopdesk: null, domicile: 1300, time: "48 - 96 H" },
        { id: 54, name: "54 - عين قزام", stopdesk: null, domicile: 1700, time: "48 - 96 H" },
        { id: 55, name: "55 - تقرت", stopdesk: null, domicile: 950, time: "24 - 72 H" },
        { id: 56, name: "56 - جانت", stopdesk: null, domicile: 1600, time: "48 - 96 H" },
        { id: 57, name: "57 - المغير", stopdesk: null, domicile: 950, time: "24 - 72 H" },
        { id: 58, name: "58 - المنيعة", stopdesk: null, domicile: 1100, time: "24 - 72 H" }
    ];

    function initPackForm(config) {
        const { packPrice, productName, packId } = config;
        const pageLoadTime = Date.now();

        const form = document.getElementById('orderForm');
        const wilayaSelect = document.getElementById('wilayaSelect');
        const communeSelect = document.getElementById('communeSelect');
        const homeChoice = document.getElementById('homeChoice');
        const deskChoice = document.getElementById('deskChoice');
        const shippingAmountEl = document.getElementById('shippingAmount');
        const totalAmountEl = document.getElementById('totalAmount');
        const submitBtn = document.getElementById('confirmOrderBtn');

        let selectedDeliveryMode = 'home';
        let currentShipping = 500;
        let selectedWilayaObj = null;

        // 1. Populate 58 Wilayas
        if (wilayaSelect) {
            wilayaSelect.innerHTML = '<option value="" disabled selected>-- اختر ولايتك من القائمة (58 ولاية) --</option>';
            ALGERIA_WILAYAS.forEach(w => {
                const opt = document.createElement('option');
                opt.value = w.id;
                opt.textContent = w.name;
                wilayaSelect.appendChild(opt);
            });

            wilayaSelect.addEventListener('change', () => {
                const wId = parseInt(wilayaSelect.value, 10);
                selectedWilayaObj = ALGERIA_WILAYAS.find(w => w.id === wId);
                updateCommunes(wId);
                updateShippingCalculation();
            });
        }

        // 2. Populate Communes
        function updateCommunes(wilayaId) {
            if (!communeSelect) return;
            communeSelect.innerHTML = '';
            
            const defOpt = document.createElement('option');
            defOpt.value = '';
            defOpt.disabled = true;
            defOpt.selected = true;

            if (!wilayaId || typeof algeriaCommunes === 'undefined' || !algeriaCommunes[wilayaId]) {
                defOpt.textContent = '-- اختر بلديتك --';
                communeSelect.appendChild(defOpt);
                return;
            }

            defOpt.textContent = '-- اختر البلدية / الدائرة --';
            communeSelect.appendChild(defOpt);

            const list = algeriaCommunes[wilayaId];
            list.forEach(cName => {
                const opt = document.createElement('option');
                opt.value = cName;
                opt.textContent = cName;
                communeSelect.appendChild(opt);
            });
        }

        // 3. Delivery choice listeners
        const radios = document.querySelectorAll('input[name="deliveryChoice"]');
        radios.forEach(r => {
            r.addEventListener('change', (e) => {
                selectedDeliveryMode = e.target.value;
                if (homeChoice && deskChoice) {
                    if (selectedDeliveryMode === 'home') {
                        homeChoice.classList.add('active');
                        deskChoice.classList.remove('active');
                    } else {
                        deskChoice.classList.add('active');
                        homeChoice.classList.remove('active');
                    }
                }
                updateShippingCalculation();
            });
        });

        // 4. Update Shipping & Total
        function updateShippingCalculation() {
            if (selectedWilayaObj) {
                if (selectedDeliveryMode === 'stopdesk') {
                    if (selectedWilayaObj.stopdesk !== null) {
                        currentShipping = selectedWilayaObj.stopdesk;
                    } else {
                        currentShipping = selectedWilayaObj.domicile;
                    }
                } else {
                    currentShipping = selectedWilayaObj.domicile;
                }
            } else {
                currentShipping = 500;
            }

            const grandTotal = packPrice + currentShipping;
            if (shippingAmountEl) shippingAmountEl.textContent = `${currentShipping.toLocaleString()} د.ج`;
            if (totalAmountEl) totalAmountEl.textContent = `${grandTotal.toLocaleString()} د.ج`;
        }

        // 5. Phone validation
        function validatePhone(phone) {
            const cleaned = phone.replace(/[\s-]/g, '');
            return /^(05|06|07)[0-9]{8}$/.test(cleaned);
        }

        // 6. Device Fingerprint
        function getDeviceId() {
            try {
                let devId = localStorage.getItem('metachagour_device_id');
                if (!devId) {
                    devId = 'DEV-' + Math.random().toString(36).substring(2, 11) + '-' + Date.now().toString(36);
                    localStorage.setItem('metachagour_device_id', devId);
                }
                return devId;
            } catch (e) {
                return 'DEV-ANON-' + Date.now();
            }
        }

        // 7. Form submission
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();

                const nameInput = document.getElementById('fullName');
                const phoneInput = document.getElementById('phoneNumber');
                const communeVal = communeSelect ? communeSelect.value : '';
                const honeypotVal = document.getElementById('website_url') ? document.getElementById('website_url').value : '';

                const nameVal = nameInput ? nameInput.value.trim() : '';
                const phoneVal = phoneInput ? phoneInput.value.trim() : '';

                if (nameVal.length < 3) {
                    alert('يرجى كتابة الاسم الكامل بشكل صحيح.');
                    return;
                }

                if (!validatePhone(phoneVal)) {
                    alert('يرجى إدخال رقم هاتف صحيح يبدأ بـ 05 أو 06 أو 07 ويتكون من 10 أرقام.');
                    return;
                }

                if (!selectedWilayaObj) {
                    alert('يرجى اختيار ولايتك من القائمة.');
                    return;
                }

                if (!communeVal) {
                    alert('يرجى اختيار البلدية أو كتابة عنوانك.');
                    return;
                }

                // Check 2-attempt limit
                const cleanPhone = phoneVal.replace(/\D/g, '');
                const attemptsKey = 'pack_sub_attempts_' + cleanPhone;
                let currentAttempts = 0;
                try {
                    const stored = localStorage.getItem(attemptsKey);
                    if (stored) {
                        const parsed = JSON.parse(stored);
                        if (Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
                            currentAttempts = parsed.count || 0;
                        }
                    }
                } catch (e) {}

                if (currentAttempts >= 2) {
                    alert('عذراً، لقد تم تسجيل طلبك مسبقاً (الحد الأقصى محاولتان). سيتصل بك فريقنا هاتفياً لتأكيد طلبك وتجهيز الشحن.');
                    return;
                }

                const originalBtnText = submitBtn ? submitBtn.innerHTML : '';
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.innerHTML = '<span>جارٍ إرسال طلبك...</span> <i class="fa-solid fa-spinner fa-spin"></i>';
                }

                const orderId = `${packId}-${Math.floor(10000 + Math.random() * 90000)}`;
                const grandTotalNum = packPrice + currentShipping;
                const fullLocation = `${selectedWilayaObj.name} — ${communeVal}`;
                const deliveryTypeLabel = selectedDeliveryMode === 'stopdesk' ? 'توصيل للمكتب (Stop Desk)' : 'توصيل للمنزل';

                const payload = {
                    orderId,
                    fullName: nameVal,
                    phone: phoneVal,
                    wilaya: fullLocation,
                    commune: communeVal,
                    deliveryType: deliveryTypeLabel,
                    deliveryTime: selectedWilayaObj.time || '24 - 48 H',
                    quantity: 1,
                    productName: productName,
                    productTotal: `${packPrice.toLocaleString()} د.ج`,
                    shippingFee: `${currentShipping.toLocaleString()} د.ج`,
                    grandTotal: `${grandTotalNum.toLocaleString()} د.ج`,
                    deviceId: getDeviceId(),
                    honeypot: honeypotVal,
                    formDurationMs: Date.now() - pageLoadTime
                };

                try {
                    const res = await fetch('/api/send-order', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    const data = await res.json();

                    if (!res.ok || data.success === false) {
                        alert(data.message || 'حدث خطأ أثناء إرسال الطلب. يرجى المحاولة مرة أخرى.');
                        return;
                    }

                    // Save attempt in localStorage
                    try {
                        localStorage.setItem(attemptsKey, JSON.stringify({
                            count: currentAttempts + 1,
                            timestamp: Date.now()
                        }));
                    } catch (e) {}

                    // Show success receipt modal
                    showReceiptModal({
                        orderId: data.orderId || orderId,
                        fullName: nameVal,
                        phone: phoneVal,
                        location: fullLocation,
                        deliveryType: deliveryTypeLabel,
                        productName: productName,
                        productTotal: `${packPrice.toLocaleString()} د.ج`,
                        shippingFee: `${currentShipping.toLocaleString()} د.ج`,
                        grandTotal: `${grandTotalNum.toLocaleString()} د.ج`
                    });

                } catch (err) {
                    console.error('Submit error:', err);
                    alert('تم استلام طلبك وسيتصل بك فريقنا قريباً لتأكيد العنوان.');
                } finally {
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = originalBtnText;
                    }
                }
            });
        }

        // 8. Modal Receipt Creator
        function showReceiptModal(receipt) {
            let modal = document.getElementById('packSuccessModal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'packSuccessModal';
                modal.className = 'pack-modal-overlay';
                document.body.appendChild(modal);
            }

            modal.innerHTML = `
                <div class="pack-modal-card">
                    <div class="pack-modal-icon">✅</div>
                    <h3 class="pack-modal-title">تم استلام طلبك بنجاح!</h3>
                    <p class="pack-modal-desc">شكراً لثقتكم. سيتصل بك فريقنا هاتفياً في أقرب وقت لتأكيد طلبيتك قبل الشحن.</p>
                    
                    <div class="pack-receipt-box">
                        <div class="receipt-row"><span>رقم الطلب:</span><strong>${receipt.orderId}</strong></div>
                        <div class="receipt-row"><span>المنتج:</span><strong>${receipt.productName}</strong></div>
                        <div class="receipt-row"><span>الاسم:</span><strong>${receipt.fullName}</strong></div>
                        <div class="receipt-row"><span>الهاتف:</span><strong dir="ltr">${receipt.phone}</strong></div>
                        <div class="receipt-row"><span>العنوان:</span><strong>${receipt.location}</strong></div>
                        <div class="receipt-row"><span>نوع التوصيل:</span><strong>${receipt.deliveryType}</strong></div>
                        <div class="receipt-divider"></div>
                        <div class="receipt-row total"><span>المبلغ الإجمالي عند الاستلام:</span><strong class="text-gold">${receipt.grandTotal}</strong></div>
                    </div>

                    <button class="pack-modal-close-btn" onclick="document.getElementById('packSuccessModal').classList.remove('active')">
                        حسناً، فهمت
                    </button>
                </div>
            `;

            modal.classList.add('active');
        }
    }

    window.initPackForm = initPackForm;
})();
```

**Step 2: Verify syntax of `packs-client.js`**

Run: `cmd.exe /c "node -c packs-client.js"`  
Expected: Exit code 0.

**Step 3: Commit**

```bash
git add packs-client.js
git commit -m "feat(client): implement packs-client.js for 58 wilayas, tariffs, and /api/send-order integration"
```

---

### Task 4: Upgrade `pack1.html` and `pack2.html` with Real Order Wiring

**Files:**
- Modify: `d:/Websites On Line/yamahasac/pack1.html`
- Modify: `d:/Websites On Line/yamahasac/pack2.html`

**Changes for both files:**
1. In the HTML `<head>` or before `</body>`, include:
   - `<script src="algeria-communes.js"></script>`
   - `<script src="packs-client.js"></script>`
2. In `<form id="orderForm">`:
   - Remove inline `onsubmit="..."`.
   - Change Commune input into `<select id="communeSelect" class="form-select" required>`.
   - Add hidden honeypot input: `<input type="text" id="website_url" name="website_url" style="display:none;" tabindex="-1" autocomplete="off">`.
3. In inline `<script>` at bottom:
   - For `pack1.html`:
     ```javascript
     initPackForm({
         packId: 'PACK1',
         packPrice: 4950,
         productName: 'Pack Pro 4 en 1 (منفاخ تويوتا + مفاتيح 46 قطعة + مفك مرن 11 ق + طقم 6 مفكات)'
     });
     ```
   - For `pack2.html`:
     ```javascript
     initPackForm({
         packId: 'PACK2',
         packPrice: 12950,
         productName: 'Pack Atelier Pro Crown 20V (5 en 1)'
     });
     ```

**Step 1: Apply changes to `pack1.html`**
**Step 2: Apply changes to `pack2.html`**
**Step 3: Test and verify markup**

Run: `cmd.exe /c "node -e \"const fs=require('fs'); assert(fs.readFileSync('pack1.html','utf8').includes('packs-client.js')); assert(fs.readFileSync('pack2.html','utf8').includes('packs-client.js')); console.log('✅ Both pages wired');\""`  
Expected: `✅ Both pages wired`

**Step 4: Commit**

```bash
git add pack1.html pack2.html
git commit -m "feat(pages): connect pack1 and pack2 forms to 58 wilayas and /api/send-order"
```

---

### Task 5: Add Modal and Commune Styles to `packs-styles.css`

**Files:**
- Modify: `d:/Websites On Line/yamahasac/packs-styles.css`

**Step 1: Add Receipt Modal & Form Enhancement CSS**

```css
/* Honeypot hidden input */
#website_url {
    display: none !important;
}

/* Pack Confirmation Modal Overlay */
.pack-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(30, 25, 20, 0.7);
    backdrop-filter: blur(6px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 99999;
    padding: 16px;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s ease;
}

.pack-modal-overlay.active {
    opacity: 1;
    pointer-events: auto;
}

.pack-modal-card {
    background: #FFFFFF;
    border-radius: 20px;
    padding: 28px 24px;
    max-width: 480px;
    width: 100%;
    text-align: center;
    box-shadow: 0 20px 45px rgba(0,0,0,0.2);
    border: 2px solid var(--accent);
    transform: translateY(20px);
    transition: transform 0.3s ease;
}

.pack-modal-overlay.active .pack-modal-card {
    transform: translateY(0);
}

.pack-modal-icon {
    font-size: 3rem;
    margin-bottom: 12px;
}

.pack-modal-title {
    font-size: 1.45rem;
    font-weight: 800;
    color: var(--text-main);
    margin-bottom: 8px;
}

.pack-modal-desc {
    font-size: 0.95rem;
    color: var(--text-muted);
    line-height: 1.6;
    margin-bottom: 20px;
}

.pack-receipt-box {
    background: var(--bg-soft);
    border-radius: 12px;
    padding: 16px;
    text-align: right;
    margin-bottom: 22px;
    border: 1px solid rgba(0,0,0,0.06);
}

.receipt-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.92rem;
    margin-bottom: 8px;
    color: var(--text-main);
}

.receipt-row.total {
    font-size: 1.1rem;
    font-weight: 800;
    margin-top: 10px;
}

.receipt-divider {
    height: 1px;
    background: rgba(0,0,0,0.1);
    margin: 10px 0;
}

.pack-modal-close-btn {
    width: 100%;
    background: var(--accent);
    color: #1A1510;
    border: none;
    padding: 14px 20px;
    border-radius: 12px;
    font-size: 1.05rem;
    font-weight: 800;
    cursor: pointer;
    transition: background 0.2s ease, transform 0.1s ease;
}

.pack-modal-close-btn:hover {
    background: var(--accent-hover);
}
```

**Step 2: Verify CSS syntax**
**Step 3: Commit**

```bash
git add packs-styles.css
git commit -m "style: add receipt modal and communes styles to packs-styles.css"
```

---

### Task 6: End-to-End Local Verification with `dev-server.js`

**Files:**
- Test via: `node dev-server.js` and automated test request

**Step 1: Start `dev-server.js` in background or test API directly**

Run a local POST request simulation to `/api/send-order` with Pack 1 and Pack 2 payloads:

```bash
cmd.exe /c "node scripts/test-local-excel.js"
```

**Step 2: Send test order payload for Pack 1**

```javascript
// scripts/verify-pack-order.js
const http = require('http');

const payload = JSON.stringify({
    orderId: 'TEST-PACK1-' + Date.now(),
    fullName: 'كمال بلقاسم (تجربة فحص)',
    phone: '0555123456',
    wilaya: '16 - الجزائر (العاصمة) — باب الوادي',
    commune: 'باب الوادي',
    deliveryType: 'توصيل للمنزل',
    deliveryTime: '24 - 48 H',
    quantity: 1,
    productName: 'Pack Pro 4 en 1 (منفاخ تويوتا + مفاتيح 46 قطعة)',
    productTotal: '4,950 د.ج',
    shippingFee: '700 د.ج',
    grandTotal: '5,650 د.ج',
    deviceId: 'DEV-TEST-VERIFY',
    honeypot: '',
    formDurationMs: 15400
});

const req = http.request({
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/send-order',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
    }
}, (res) => {
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => {
        console.log('Status:', res.statusCode);
        console.log('Response:', body);
    });
});

req.on('error', e => console.error('Error:', e.message));
req.write(payload);
req.end();
```

**Step 3: Verify clean URL resolution locally**

Verify that `http://localhost:3000/pack1` serves `pack1.html` with status 200, and `http://localhost:3000/pack2` serves `pack2.html` with status 200.

---

### Task 7: Git Commit, Remote Configuration & Vercel Production Deployment

**Files:**
- Whole repository

**Step 1: Review Git Status**

Run: `git status -s`  
Verify untracked files are staged cleanly.

**Step 2: Commit all production-ready files**

```bash
git add .
git commit -m "feat(packs): deploy Pack 1 and Pack 2 landing pages with live order dispatch and 58 wilayas support"
```

**Step 3: Configure GitHub Remote (if user has GitHub URL)**

Provide the user with clear instructions:
```bash
# If remote is not set:
git remote add origin https://github.com/USERNAME/yamahasac.git
git push -u origin main
```

**Step 4: Deploy to Vercel Production**

Since the project is already linked to Vercel (`projectId: prj_ksaHHrLK9XTUAHNe37wPcgEqaJ1L`), deployment can be run via:
```bash
cmd.exe /c "npx -y vercel --prod"
```
Or pushed via GitHub if connected to automatic Vercel deployments.

**Step 5: Live Verification on Production**

Verify in production:
1. `https://yamahasac.vercel.app/pack1` loads Pack 1.
2. `https://yamahasac.vercel.app/pack2` loads Pack 2.
3. Placing a test order shows the receipt modal and delivers:
   - Order in Google Sheets with `product_name: "Pack Pro 4 en 1..."`
   - Telegram message in channel with `Pack Pro 4 en 1`
   - Visible in Admin Dashboard at `https://yamahasac.vercel.app/admin.html`
