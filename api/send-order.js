'use strict';
// =============================================================================
// Order Submission API — /api/send-order (yamahasac / ORVA Store)
// =============================================================================

const https = require('https');
const { saveOrderToDb, checkAndRecordRateLimit, findOrCreateCustomer, updateCustomerStats } = require('../lib/db');
const { evaluateRequest, recordRiskEvent, hashIp } = require('../lib/riskEngine');
const { sendMetaPurchaseEvent } = require('../lib/metaCAPI');

function getCookieValue(cookieHeader, name) {
    if (!cookieHeader) return null;
    const match = cookieHeader.match(new RegExp('(?:^|;\\s*)' + name.replace(/([.*+?^=!:${}()|[\]/\\])/g, '\\$1') + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed. Please send a POST request.' });
    }

    try {
        const clientIp = (
            req.headers['x-forwarded-for'] ||
            req.headers['x-real-ip'] ||
            (req.socket && req.socket.remoteAddress) ||
            '127.0.0.1'
        ).split(',')[0].trim();

        const {
            fullName, phone, wilaya, commune,
            deliveryType, deliveryTime,
            quantity, productTotal, shippingFee, grandTotal,
            orderId, deviceId,
            honeypot, formDurationMs,
            fbp, fbc,
            productName,
            eventId, event_id,
            testEventCode, test_event_code
        } = req.body || {};

        // ── Robust Pack & Bundle Identification ──────────────────────────────
        const reqPackId   = String(req.body.packId || '').trim().toLowerCase();
        const reqOrderId  = String(orderId || '').trim().toLowerCase();
        const pLow        = String(productName || '').trim().toLowerCase();
        const rawPriceStr = String(req.body.priceNum || grandTotal || productTotal || '').replace(/[^\d]/g, '');
        const parsedPrice = parseInt(rawPriceStr, 10) || 0;

        // Pack 2 Detection (13,390 DA - Crown 5 in 1)
        const isPack2 = (
            reqPackId === 'pack2' ||
            reqOrderId.startsWith('pack2') ||
            parsedPrice >= 10000 ||
            rawPriceStr.includes('13390') ||
            rawPriceStr.includes('12950') ||
            pLow.includes('13390') ||
            pLow.includes('12950') ||
            pLow.includes('pack2') ||
            pLow.includes('5en1') ||
            pLow.includes('5 في 1') ||
            pLow.includes('crown')
        );

        const resolvedProductName = isPack2 ? 'PACK 5EN1 13390' : 'PACK 4EN1 4950';
        const packShortTitle      = isPack2 ? 'عرض 5 في 1 الفاخر (PACK 5EN1)' : 'عرض 4 في 1 (PACK 4EN1)';
        const packItemsDesc       = isPack2
            ? 'ماكينة CROWN 20V ببطاريتين + طقم مفكات 6 قطع + علبة مفاتيح 46 قطعة + مفك مرن + قفازات'
            : 'منفاخ عجلات TOYOTA الأصلي + طقم مفاتيح 46 قطعة + مفك مرن 11 قطعة + طقم 6 مفكات';
        const defaultBasePrice    = isPack2 ? 13390 : 4950;
        const numPrice            = parsedPrice || defaultBasePrice;
        if (!fullName || !phone || !wilaya) {
            return res.status(400).json({ error: 'Missing required order fields (fullName, phone, wilaya)' });
        }

        const clientIpHash  = hashIp(clientIp);
        const cleanOrderId  = orderId || ('ORVA-' + Math.floor(10000 + Math.random() * 90000));
        const finalEventId  = eventId || event_id || `order_${cleanOrderId}_${Date.now()}`;
        const activeTestCode = testEventCode || test_event_code || process.env.META_TEST_EVENT_CODE || null;

        // Clean Location without duplicating commune
        let cleanLocation = String(wilaya || '').trim();
        if (commune && !cleanLocation.includes(commune)) {
            cleanLocation += ' — ' + commune;
        }

        const dateFormatted = new Date().toLocaleString('ar-DZ', { timeZone: 'Africa/Algiers' });

        // ── Risk Evaluation ───────────────────────────────────────────────────
        const riskCtx = {
            storeId:        'yamahasac',
            orderId:        cleanOrderId,
            requestType:    'order',
            actorPhone:     phone,
            actorIpHash:    clientIpHash,
            deviceId:       deviceId || null,
            honeypotValue:  honeypot || '',
            formDurationMs: formDurationMs ? Number(formDurationMs) : null
        };

        const riskResult = await evaluateRequest(riskCtx);

        if (riskResult.decision === 'BLOCK') {
            console.warn('[send-order/yamahasac] BLOCKED:', cleanOrderId, riskResult.reasons);
            await recordRiskEvent(riskCtx, riskResult);
            return res.status(429).json({
                success: false,
                error: 'REQUEST_BLOCKED',
                message: 'عذراً، لا يمكن معالجة طلبك في الوقت الحالي. يرجى التحقق من معلوماتك والمحاولة مرة أخرى.'
            });
        }

        // ── Rate limit enforcement ──
        try {
            const rl = await checkAndRecordRateLimit(clientIp, deviceId, phone);
            if (!rl.allowed) {
                console.warn('[send-order/yamahasac] RATE_LIMIT_HIT:', cleanOrderId, phone);
                return res.status(429).json({
                    success: false,
                    error: 'RATE_LIMIT_EXCEEDED',
                    message: rl.message || 'عذراً، لقد تم تسجيل طلبك مسبقاً (الحد الأقصى محاولتين). سيتصل بك فريقنا لتأكيد طلبك.'
                });
            }
        } catch (e) {
            console.warn('[send-order] Rate limit check skipped:', e.message);
        }

        // ── Save Order to Supabase Database ───────────────────────────────────
        await saveOrderToDb({
            orderId:             cleanOrderId,
            storeId:             'orvastore',
            fullName,
            phone,
            wilaya:              cleanLocation,
            commune:             commune || 'الجزائر',
            deliveryType:        deliveryType || 'توصيل للمنزل',
            deliveryTime:        deliveryTime || '24 - 48 H',
            quantity:            quantity || 1,
            productName:         resolvedProductName,
            productTotal:        productTotal || (numPrice + ' د.ج'),
            shippingFee:         shippingFee || '500 د.ج',
            priceNum:            numPrice,
            grandTotal:          grandTotal || (numPrice + ' د.ج'),
            status:              riskResult.decision === 'REVIEW' ? 'review' : 'pending',
            in_redex:            false,
            redex_tracking_code: null,
            clientIpHash,
            deviceId
        }, {
            riskScore:    riskResult.score,
            riskLevel:    riskResult.level,
            riskDecision: riskResult.decision,
            riskReasons:  riskResult.reasons
        });

        await recordRiskEvent({ ...riskCtx, orderId: cleanOrderId }, riskResult);
        await findOrCreateCustomer(phone, fullName);
        await updateCustomerStats(phone, 'ordered');

        // ── Meta Conversions API (CAPI) Server-side Purchase Event ─────────────
        const cookieHeader = req.headers['cookie'] || '';
        const userFbp = fbp || getCookieValue(cookieHeader, '_fbp') || undefined;
        const userFbc = fbc || getCookieValue(cookieHeader, '_fbc') || undefined;

        try {
            const singlePixelId = process.env.META_PIXEL_ID || '2340414976777036';
            const packContentName = isPack2 ? 'pack2' : 'pack1';

            console.log(`[Meta CAPI] Dispatching Purchase event: event_id=${finalEventId}, value=${numPrice} DZD, pack=${packContentName}, test_code=${activeTestCode || 'NONE'}`);

            sendMetaPurchaseEvent({
                pixelId:        singlePixelId,
                eventId:        finalEventId,
                value:          numPrice,
                currency:       'DZD',
                orderId:        cleanOrderId,
                fullName:       fullName,
                phone:          phone,
                wilaya:         cleanLocation,
                commune:        commune,
                clientIp:       clientIp,
                userAgent:      req.headers['user-agent'],
                eventSourceUrl: req.headers['referer'] || req.headers['origin'] || 'https://orvastore.vercel.app',
                fbp:            userFbp,
                fbc:            userFbc,
                quantity:       quantity || 1,
                productName:    resolvedProductName,
                contentName:    packContentName,
                contentIds:     [packContentName],
                testEventCode:  activeTestCode
            }).then(capiRes => {
                if (capiRes && capiRes.success) {
                    console.log(`[Meta CAPI Deduplication] Server Purchase sent with event_id=${finalEventId}`);
                }
            }).catch(capiErr => {
                console.warn('[Meta CAPI Async Error]:', capiErr ? capiErr.message : capiErr);
            });
        } catch (capiDispatchErr) {
            console.warn('[Meta CAPI Dispatch Catch]:', capiDispatchErr ? capiDispatchErr.message : capiDispatchErr);
        }

        // ── Telegram Notification ─────────────────────────────────────────────
        const telegramToken  = process.env.TELEGRAM_BOT_TOKEN || '';
        const telegramChatId = process.env.TELEGRAM_CHAT_ID   || '';

        if (telegramToken && telegramChatId) {
            try {
                const adminLink = `https://orvastore.vercel.app/admin.html?orderId=${encodeURIComponent(cleanOrderId)}`;
                const riskBadge = riskResult.decision === 'REVIEW'
                    ? `\n⚠️ <b>REVIEW</b> — نقاط الخطر: ${riskResult.score}/100`
                    : riskResult.score > 0 ? `\n🟡 خطر: ${riskResult.score}/100 (${riskResult.level})` : '';

                const tgHeader = isPack2
                    ? `👑 <b>طلب جديد: عرض 5 في 1 الفاخر (PACK 5EN1 — 13,390 د.ج)</b>`
                    : `📦 <b>طلب جديد: عرض 4 في 1 (PACK 4EN1 — 4,950 د.ج)</b>`;

                const tgMsg = `
${tgHeader}
━━━━━━━━━━━━━━━━━━
<b>🆔 رقم الطلب:</b> <code>${cleanOrderId}</code>
<b>👤 الاسم الكامل:</b> ${fullName}
<b>📱 رقم الهاتف:</b> <code>${phone}</code>
<b>📍 الولاية والبلدية:</b> ${cleanLocation}
<b>🚚 نوع التوصيل:</b> ${deliveryType || 'توصيل للمنزل'}
<b>⚡ مدة التوصيل:</b> ${deliveryTime || '24 - 48 H'}
<b>📦 العرض والكمية:</b> ${quantity || 1} قطعة — <b>${packShortTitle}</b>
<i>(${packItemsDesc})</i>
<b>💵 سعر العرض:</b> ${productTotal || (defaultBasePrice + ' د.ج')}
<b>🚚 مصاريف التوصيل:</b> ${shippingFee || '500 د.ج'}
━━━━━━━━━━━━━━━━━━
<b>💰 المجموع الكلي (COD):</b> <b>${grandTotal || (numPrice + ' د.ج')}</b>
<b>📅 التاريخ:</b> ${dateFormatted}${riskBadge}
━━━━━━━━━━━━━━━━━━
📌 <b>الطلبية محفوظة في Supabase (لم تُرسل لشركة التوصيل بعد).</b>
👉 <a href="${adminLink}">لوحة التحكم (Admin Dashboard)</a>
${adminLink}`.trim();

                const tgPayload = JSON.stringify({ chat_id: telegramChatId, text: tgMsg, parse_mode: 'HTML' });
                const options = {
                    hostname: 'api.telegram.org', port: 443,
                    path: `/bot${telegramToken}/sendMessage`, method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(tgPayload) }
                };
                await new Promise((resolve) => {
                    const tgReq = https.request(options, (tgRes) => {
                        let d = ''; tgRes.on('data', c => { d += c; }); tgRes.on('end', () => { console.log('Telegram:', d); resolve(); });
                    });
                    tgReq.on('error', e => { console.error('Telegram error:', e); resolve(); });
                    tgReq.write(tgPayload); tgReq.end();
                });
            } catch (tgErr) { console.warn('Telegram dispatch catch:', tgErr); }
        }

        if (process.env.RESEND_API_KEY) {
            try {
                const { Resend } = require('resend');
                const resend = new Resend(process.env.RESEND_API_KEY);
                await resend.emails.send({
                    from: process.env.FROM_EMAIL || 'ORVA Store <onboarding@resend.dev>',
                    to: [process.env.TO_EMAIL || 'admin@example.com'],
                    subject: `🎒 [طلب جديد ${cleanOrderId}] ${resolvedProductName} - ${fullName} (${wilaya})`,
                    html: `<p>طلب جديد: ${cleanOrderId} — ${fullName} — ${phone} — ${wilaya} — ${resolvedProductName} — ${grandTotal}</p>`
                });
            } catch (emailErr) { console.warn('Email dispatch warning:', emailErr); }
        }

        return res.status(200).json({
            success: true,
            message: riskResult.decision === 'REVIEW' ? 'تم استلام طلبك وسيتم مراجعته قريباً.' : 'تم استلام طلبك بنجاح!',
            orderId: cleanOrderId,
            eventId: finalEventId,
            review:  riskResult.decision === 'REVIEW'
        });

    } catch (error) {
        console.error('Order dispatch error:', error);
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
};
