const https = require('https');
const fs = require('fs');
const path = require('path');

function saveOrderToStore(orderObj) {
    try {
        const tmpFile = path.join('/tmp', 'orva_orders.json');
        let list = [];
        if (fs.existsSync(tmpFile)) {
            list = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
        }
        const exists = list.some(o => o.orderId === orderObj.orderId);
        if (!exists) {
            list.unshift(orderObj);
            fs.writeFileSync(tmpFile, JSON.stringify(list), 'utf8');
        }
    } catch (e) {
        console.warn('File store warning:', e);
    }
}

function checkAndRecordRateLimit(ip, deviceId) {
    try {
        const tmpFile = path.join('/tmp', 'orva_rate_limit.json');
        let records = [];
        if (fs.existsSync(tmpFile)) {
            records = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
        }
        const now = Date.now();
        const WINDOW_MS = 6 * 60 * 60 * 1000; // 6 Hours

        // Filter out entries older than 6 hours
        records = records.filter(r => (now - r.timestamp) < WINDOW_MS);

        // Count attempts from same IP OR same Device ID
        const attempts = records.filter(r =>
            (ip && r.ip === ip) || (deviceId && r.deviceId === deviceId)
        );

        if (attempts.length >= 2) {
            return { allowed: false, count: attempts.length };
        }

        // Record new attempt
        records.push({ ip: ip || '', deviceId: deviceId || '', timestamp: now });
        fs.writeFileSync(tmpFile, JSON.stringify(records), 'utf8');

        return { allowed: true, count: attempts.length + 1 };
    } catch (e) {
        console.warn('Rate limit file store error:', e);
        return { allowed: true, count: 1 };
    }
}

module.exports = async (req, res) => {
    // Enable CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed. Please send a POST request.' });
    }

    try {
        const clientIp = (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || '127.0.0.1').split(',')[0].trim();
        const { fullName, phone, wilaya, deliveryType, quantity, productTotal, shippingFee, grandTotal, orderId, deliveryTime, deviceId } = req.body || {};

        if (!fullName || !phone || !wilaya) {
            return res.status(400).json({ error: 'Missing required order fields (fullName, phone, wilaya)' });
        }

        // Enforce IP + Device ID Rate Limit (Max 2 orders per 6 hours) with Supabase + Cache
        const { saveOrderToDb, checkAndRecordRateLimit } = require('../lib/db');
        const rateCheck = await checkAndRecordRateLimit(clientIp, deviceId);
        if (!rateCheck.allowed) {
            return res.status(429).json({
                success: false,
                error: 'RATE_LIMIT_EXCEEDED',
                message: 'عذراً، لقد تجاوزت الحد المسموح به لإرسال الطلبات (طلبين كل 6 ساعات).'
            });
        }

        const dateFormatted = new Date().toLocaleString('ar-DZ', { timeZone: 'Africa/Algiers' });
        const cleanOrderId = orderId || ('ORVA-' + Math.floor(10000 + Math.random() * 90000));
        const numPrice = parseInt(grandTotal) || 3900;

        // Save order to Supabase PostgreSQL Database Layer (in_redex: false)
        await saveOrderToDb({
            orderId: cleanOrderId,
            storeId: 'yamahasac',
            fullName: fullName,
            phone: phone,
            wilaya: wilaya,
            deliveryType: deliveryType || 'توصيل للمنزل',
            deliveryTime: deliveryTime || '24 - 48 H',
            quantity: quantity || 1,
            productName: 'Sac Banane Moto Yamaha',
            productTotal: productTotal || (numPrice + ' د.ج'),
            shippingFee: shippingFee || '500 د.ج',
            priceNum: numPrice,
            grandTotal: grandTotal || (numPrice + ' د.ج'),
            status: 'pending',
            in_redex: false,
            redex_tracking_code: null,
            clientIp: clientIp,
            deviceId: deviceId
        });

        // Also save to serverless store for Admin Dashboard compatibility
        saveOrderToStore({
            orderId: cleanOrderId,
            fullName: fullName,
            phone: phone,
            wilaya: wilaya,
            deliveryType: deliveryType || 'توصيل للمنزل',
            grandTotal: grandTotal || (numPrice + ' د.ج'),
            priceNum: numPrice,
            status: 'pending',
            date: new Date().toISOString().split('T')[0],
            remarks: []
        });

        // Telegram Bot Notification
        const telegramToken = process.env.TELEGRAM_BOT_TOKEN || '8749469493:AAG__aGu7sSVJoRFLpFQ8eR2V_XIJMZSD0o';
        const telegramChatId = process.env.TELEGRAM_CHAT_ID || '-1003965560132';

        if (telegramToken && telegramChatId) {
            try {
                const adminLink = `https://yamahasac.vercel.app/admin.html?orderId=${encodeURIComponent(cleanOrderId)}`;

                const tgMsg = `
<b>🎒 طلب جديد على الموقع — ORVA STORE</b>
━━━━━━━━━━━━━━━━━━
<b>🆔 رقم الطلب:</b> <code>${cleanOrderId}</code>
<b>👤 الاسم الكامل:</b> ${fullName}
<b>📱 رقم الهاتف:</b> <code>${phone}</code>
<b>📍 الولاية:</b> ${wilaya}
<b>🚚 نوع التوصيل:</b> ${deliveryType || 'توصيل للمنزل'}
<b>⚡ مدة التوصيل:</b> ${deliveryTime || '24 - 48 H'}
<b>📦 الكمية:</b> ${quantity} حقيبة (مع AirPods وساعة يد)
<b>💵 سعر العرض:</b> ${productTotal}
<b>🚚 مصاريف التوصيل:</b> ${shippingFee}
━━━━━━━━━━━━━━━━━━
<b>💰 المجموع الكلي (COD):</b> <b>${grandTotal}</b>
<b>📅 التاريخ:</b> ${dateFormatted}
━━━━━━━━━━━━━━━━━━
📌 <b>PS: الطلبية لم تُرسل لشركة التوصيل بعد (Redex).</b>
🔗 انقر على الرابط التالي لإضافتها إلى حساب شركة التوصيل:
👉 ${adminLink}`.trim();

                const tgPayload = JSON.stringify({
                    chat_id: telegramChatId,
                    text: tgMsg,
                    parse_mode: 'HTML'
                });

                // Post to Telegram using native HTTPS request for 100% serverless compatibility
                const options = {
                    hostname: 'api.telegram.org',
                    port: 443,
                    path: `/bot${telegramToken}/sendMessage`,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(tgPayload)
                    }
                };

                await new Promise((resolve) => {
                    const tgReq = https.request(options, (tgRes) => {
                        let resData = '';
                        tgRes.on('data', (chunk) => { resData += chunk; });
                        tgRes.on('end', () => {
                            console.log('Telegram API Response:', resData);
                            resolve();
                        });
                    });
                    tgReq.on('error', (e) => {
                        console.error('Telegram request error:', e);
                        resolve();
                    });
                    tgReq.write(tgPayload);
                    tgReq.end();
                });
            } catch (tgErr) {
                console.warn('Telegram dispatch catch:', tgErr);
            }
        }

        // Email Dispatch via Resend (Only if API Key is configured)
        if (process.env.RESEND_API_KEY) {
            try {
                const { Resend } = require('resend');
                const resend = new Resend(process.env.RESEND_API_KEY);
                const toEmail = process.env.TO_EMAIL || 'yourgmail@gmail.com';
                const fromEmail = process.env.FROM_EMAIL || 'Orva Store <onboarding@resend.dev>';

                const htmlContent = `
                <!DOCTYPE html>
                <html lang="ar" dir="rtl">
                <head>
                    <meta charset="UTF-8">
                    <style>
                        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa; color: #111; margin: 0; padding: 20px; text-align: right; }
                        .email-container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 0px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.1); border-top: 6px solid #0052FF; }
                        .header { background: #060A17; color: #ffffff; padding: 24px; text-align: center; }
                        .header h1 { margin: 0; font-size: 24px; color: #00D2FF; letter-spacing: 1px; }
                        .order-badge { background: #0052FF; color: #ffffff; padding: 4px 12px; border-radius: 0px; font-size: 14px; font-weight: bold; display: inline-block; margin-top: 8px; }
                        .body-content { padding: 24px; }
                        .info-table { width: 100%; border-collapse: collapse; margin-top: 16px; margin-bottom: 24px; }
                        .info-table td { padding: 12px; border-bottom: 1px solid #eeeeee; font-size: 15px; }
                        .info-table tr td:first-child { font-weight: bold; color: #555555; width: 35%; }
                        .gift-box { background: #EBF3FF; border: 1px solid #0052FF; padding: 12px; font-weight: bold; color: #0052FF; text-align: center; margin-bottom: 15px; }
                        .total-box { background: #060A17; border: 2px solid #00D2FF; border-radius: 0px; padding: 16px; text-align: center; margin-top: 20px; color: #fff; }
                        .total-price { font-size: 26px; font-weight: bold; color: #00D2FF; }
                        .footer { background: #f9f9fb; padding: 16px; text-align: center; font-size: 13px; color: #777777; border-top: 1px solid #eeeeee; }
                    </style>
                </head>
                <body>
                    <div class="email-container">
                        <div class="header">
                            <h1>🎒 طلب جديد — ORVA (Yamaha Sac à Dos)</h1>
                            <div class="order-badge">رقم الطلب: ${orderId}</div>
                        </div>
                        
                        <div class="body-content">
                            <div class="gift-box">🎁 العرض يشمل: حقيبة ياماها + سماعات AirPods لاسلكية + ساعة يد مجاناً!</div>
                            <p style="font-size: 16px; color: #222;">وصلك طلب جديد من متجر ORVA:</p>
                            
                            <table class="info-table">
                                <tr>
                                    <td>👤 الاسم الكامل:</td>
                                    <td><strong>${fullName}</strong></td>
                                </tr>
                                <tr>
                                    <td>📱 رقم الهاتف:</td>
                                    <td><a href="tel:${phone}" style="color: #0052FF; text-decoration: none; font-weight: bold; font-size: 17px;">${phone}</a></td>
                                </tr>
                                <tr>
                                    <td>📍 الولاية:</td>
                                    <td><strong>${wilaya}</strong></td>
                                </tr>
                                <tr>
                                    <td>🚚 نوع التوصيل:</td>
                                    <td><strong style="color: #0052FF;">${deliveryType || 'توصيل للمنزل'}</strong></td>
                                </tr>
                                <tr>
                                    <td>📦 الكمية المطلوبة:</td>
                                    <td><strong>${quantity} حقيبة (مع الهدايا)</strong></td>
                                </tr>
                                <tr>
                                    <td>⚡ مدة التوصيل:</td>
                                    <td><strong>${deliveryTime || '24 - 48 H'}</strong></td>
                                </tr>
                                <tr>
                                    <td>💵 سعر المنتجات:</td>
                                    <td>${productTotal}</td>
                                </tr>
                                <tr>
                                    <td>🚚 مصاريف التوصيل:</td>
                                    <td>${shippingFee || '0 د.ج'}</td>
                                </tr>
                                <tr>
                                    <td>📅 تاريخ الطلب:</td>
                                    <td>${dateFormatted}</td>
                                </tr>
                            </table>

                            <div class="total-box">
                                <div style="font-size: 14px; color: #ccc;">المبلغ الكلي المطلوب عند الاستلام (COD):</div>
                                <div class="total-price">${grandTotal}</div>
                            </div>
                        </div>

                        <div class="footer">
                            هذا الإشعار التلقائي مُرسل من موقع <strong>ORVA Algeria</strong> 🇩🇿
                        </div>
                    </div>
                </body>
                </html>
                `;

                await resend.emails.send({
                    from: fromEmail,
                    to: [toEmail],
                    subject: `🎒 [طلب جديد ${orderId}] حقيبة Yamaha Sac - ${fullName} (${wilaya})`,
                    html: htmlContent
                });
            } catch (emailErr) {
                console.warn('Email dispatch warning:', emailErr);
            }
        }

        return res.status(200).json({ success: true, message: 'Order processed successfully', orderId });
    } catch (error) {
        console.error('Order dispatch error:', error);
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
};
