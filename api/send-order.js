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
            productName
        } = req.body || {};

        let resolvedProductName = 'PACK 4EN1 4950';
        if (productName) {
            const pLow = String(productName).toLowerCase();
            if (pLow.includes('12950') || pLow.includes('pack2') || pLow.includes('5') || pLow.includes('crown')) {
                resolvedProductName = 'PACK 5EN1 12950';
            } else {
                resolvedProductName = 'PACK 4EN1 4950';
            }
        }

        if (!fullName || !phone || !wilaya) {
            return res.status(400).json({ error: 'Missing required order fields (fullName, phone, wilaya)' });
        }

        const clientIpHash  = hashIp(clientIp);
        const cleanOrderId  = orderId || ('ORVA-' + Math.floor(10000 + Math.random() * 90000));
        
        // Accurate digits extraction avoiding comma/space truncation (e.g. "5,450 د.ج" -> 5450)
        const rawPriceStr   = String(req.body.priceNum || grandTotal || productTotal || '').replace(/[^\d]/g, '');
        const defaultPrice  = resolvedProductName.includes('12950') ? 12950 : 4950;
        const numPrice      = parseInt(rawPriceStr, 10) || defaultPrice;
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

        // ── Rate limit (Temporarily relaxed while risk system is disabled) ──
        try {
            await checkAndRecordRateLimit(clientIp, deviceId, phone);
        } catch (e) {
            console.warn('[send-order] Rate limit check skipped:', e.message);
        }

        // ── Save to Google Sheets ─────────────────────────────────────────────
        await saveOrderToDb({
            orderId:             cleanOrderId,
            storeId:             'yamahasac',
            fullName,
            phone,
            wilaya,
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
            const isPack2 = (resolvedProductName.includes('12950') || resolvedProductName.includes('2') || (req.body.packId && String(req.body.packId).toLowerCase().includes('2')));
            const singlePixelId = '2340414976777036';
            const packContentName = isPack2 ? 'pack2' : 'pack1';

            sendMetaPurchaseEvent({
                pixelId:        singlePixelId,
                eventId:        cleanOrderId,
                value:          numPrice,
                currency:       'DZD',
                orderId:        cleanOrderId,
                fullName:       fullName,
                phone:          phone,
                wilaya:         wilaya,
                commune:        commune,
                clientIp:       clientIp,
                userAgent:      req.headers['user-agent'],
                eventSourceUrl: req.headers['referer'] || req.headers['origin'] || 'https://orvastore.vercel.app',
                fbp:            userFbp,
                fbc:            userFbc,
                quantity:       quantity || 1,
                productName:    resolvedProductName,
                contentName:    packContentName,
                contentIds:     [packContentName]
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

                const tgMsg = `
<b>📦 طلب جديد — ORVA Store (${resolvedProductName})</b>
━━━━━━━━━━━━━━━━━━
<b>🆔 رقم الطلب:</b> <code>${cleanOrderId}</code>
<b>👤 الاسم الكامل:</b> ${fullName}
<b>📱 رقم الهاتف:</b> <code>${phone}</code>
<b>📍 الولاية والبلدية:</b> ${wilaya}${commune ? ' - ' + commune : ''}
<b>🚚 نوع التوصيل:</b> ${deliveryType || 'توصيل للمنزل'}
<b>⚡ مدة التوصيل:</b> ${deliveryTime || '24 - 48 H'}
<b>📦 الكمية:</b> ${quantity} قطعة (${resolvedProductName})
<b>💵 سعر العرض:</b> ${productTotal}
<b>🚚 مصاريف التوصيل:</b> ${shippingFee}
━━━━━━━━━━━━━━━━━━
<b>💰 المجموع الكلي (COD):</b> <b>${grandTotal}</b>
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
            review:  riskResult.decision === 'REVIEW'
        });

    } catch (error) {
        console.error('Order dispatch error:', error);
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
};
