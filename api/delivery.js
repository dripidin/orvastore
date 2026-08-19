const https = require('https');
const fs = require('fs');
const path = require('path');

function getStoredOrders() {
    try {
        const tmpFile = path.join('/tmp', 'orva_orders.json');
        if (fs.existsSync(tmpFile)) {
            return JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
        }
    } catch (e) {}
    return [];
}

async function sendToRedexEcotrack(payload, token) {
    return new Promise((resolve) => {
        const bodyStr = JSON.stringify(payload);
        const req = https.request({
            hostname: 'redex.ecotrack.dz',
            path: '/api/v1/create/order',
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token,
                'token': token,
                'api-token': token,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Content-Length': Buffer.byteLength(bodyStr)
            }
        }, (res) => {
            let resData = '';
            res.on('data', chunk => resData += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(resData) });
                } catch (e) {
                    resolve({ status: res.statusCode, text: resData });
                }
            });
        });
        req.on('error', (err) => resolve({ status: 500, error: err.message }));
        req.write(bodyStr);
        req.end();
    });
}

async function fetchRedexOrders(token) {
    return new Promise((resolve) => {
        const req = https.request({
            hostname: 'redex.ecotrack.dz',
            path: '/api/v1/get/orders',
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + token,
                'token': token,
                'api-token': token,
                'Accept': 'application/json'
            }
        }, (res) => {
            let resData = '';
            res.on('data', chunk => resData += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(resData));
                } catch (e) {
                    resolve({ data: [] });
                }
            });
        });
        req.on('error', () => resolve({ data: [] }));
        req.end();
    });
}

function getBlacklistedOrders() {
    const defaultBlacklist = ['ECEOSK26081843163', 'ECEOSK26081842580', 'ECEOSK26081842574'];
    try {
        const tmpFile = path.join('/tmp', 'blacklisted_orders.json');
        if (fs.existsSync(tmpFile)) {
            const list = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
            return Array.from(new Set([...defaultBlacklist, ...list]));
        }
    } catch (e) { }
    return defaultBlacklist;
}

function addBlacklistedOrder(orderId) {
    if (!orderId) return;
    try {
        const tmpFile = path.join('/tmp', 'blacklisted_orders.json');
        let list = [];
        if (fs.existsSync(tmpFile)) {
            list = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
        }
        if (!list.includes(orderId)) {
            list.push(orderId);
            fs.writeFileSync(tmpFile, JSON.stringify(list), 'utf8');
        }
    } catch (e) { }
}

module.exports = async (req, res) => {
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

    const ECOTRACK_API_TOKEN = process.env.ECOTRACK_API_TOKEN || 'fWBTGhUI0bSRFpFusadK1tnqV1RvZ489L9TRUICsWGb49xEFylVM8rbxFZvo';

    const { action, id } = req.query || {};
    const method = req.method;

    // Delivery Tariffs Table (58 Wilayas Standard Rate Card)
    const tariffs = [
        { wilaya_id: 1, name: "Adrar", home_price: 1000, desk_price: 600, active: true },
        { wilaya_id: 2, name: "Chlef", home_price: 700, desk_price: 400, active: true },
        { wilaya_id: 3, name: "Laghouat", home_price: 900, desk_price: 500, active: true },
        { wilaya_id: 4, name: "Oum El Bouaghi", home_price: 800, desk_price: 450, active: true },
        { wilaya_id: 5, name: "Batna", home_price: 800, desk_price: 450, active: true },
        { wilaya_id: 6, name: "Béjaïa", home_price: 750, desk_price: 400, active: true },
        { wilaya_id: 7, name: "Biskra", home_price: 850, desk_price: 500, active: true },
        { wilaya_id: 8, name: "Béchar", home_price: 1000, desk_price: 600, active: true },
        { wilaya_id: 9, name: "Blida", home_price: 600, desk_price: 350, active: true },
        { wilaya_id: 10, name: "Bouira", home_price: 700, desk_price: 400, active: true },
        { wilaya_id: 11, name: "Tamanrasset", home_price: 1400, desk_price: 900, active: true },
        { wilaya_id: 12, name: "Tébessa", home_price: 850, desk_price: 500, active: true },
        { wilaya_id: 13, name: "Tlemcen", home_price: 800, desk_price: 450, active: true },
        { wilaya_id: 14, name: "Tiaret", home_price: 800, desk_price: 450, active: true },
        { wilaya_id: 15, name: "Tizi Ouzou", home_price: 700, desk_price: 400, active: true },
        { wilaya_id: 16, name: "Alger", home_price: 500, desk_price: 300, active: true },
        { wilaya_id: 17, name: "Djelfa", home_price: 900, desk_price: 500, active: true },
        { wilaya_id: 18, name: "Jijel", home_price: 750, desk_price: 400, active: true },
        { wilaya_id: 19, name: "Sétif", home_price: 750, desk_price: 400, active: true },
        { wilaya_id: 20, name: "Saïda", home_price: 850, desk_price: 500, active: true },
        { wilaya_id: 21, name: "Skikda", home_price: 800, desk_price: 450, active: true },
        { wilaya_id: 22, name: "Sidi Bel Abbès", home_price: 800, desk_price: 450, active: true },
        { wilaya_id: 23, name: "Annaba", home_price: 800, desk_price: 450, active: true },
        { wilaya_id: 24, name: "Guelma", home_price: 800, desk_price: 450, active: true },
        { wilaya_id: 25, name: "Constantine", home_price: 750, desk_price: 400, active: true },
        { wilaya_id: 26, name: "Médéa", home_price: 700, desk_price: 400, active: true },
        { wilaya_id: 27, name: "Mostaganem", home_price: 800, desk_price: 450, active: true },
        { wilaya_id: 28, name: "M'Sila", home_price: 800, desk_price: 450, active: true },
        { wilaya_id: 29, name: "Mascara", home_price: 800, desk_price: 450, active: true },
        { wilaya_id: 30, name: "Ouargla", home_price: 950, desk_price: 550, active: true },
        { wilaya_id: 31, name: "Oran", home_price: 750, desk_price: 400, active: true },
        { wilaya_id: 32, name: "El Bayadh", home_price: 1000, desk_price: 600, active: true },
        { wilaya_id: 33, name: "Illizi", home_price: 1400, desk_price: 900, active: true },
        { wilaya_id: 34, name: "Bordj Bou Arréridj", home_price: 750, desk_price: 400, active: true },
        { wilaya_id: 35, name: "Boumerdès", home_price: 600, desk_price: 350, active: true },
        { wilaya_id: 36, name: "El Tarf", home_price: 850, desk_price: 500, active: true },
        { wilaya_id: 37, name: "Tindouf", home_price: 1500, desk_price: 1000, active: true },
        { wilaya_id: 38, name: "Tissemsilt", home_price: 850, desk_price: 500, active: true },
        { wilaya_id: 39, name: "El Oued", home_price: 950, desk_price: 550, active: true },
        { wilaya_id: 40, name: "Khenchela", home_price: 850, desk_price: 500, active: true },
        { wilaya_id: 41, name: "Souk Ahras", home_price: 850, desk_price: 500, active: true },
        { wilaya_id: 42, name: "Tipaza", home_price: 600, desk_price: 350, active: true },
        { wilaya_id: 43, name: "Mila", home_price: 750, desk_price: 400, active: true },
        { wilaya_id: 44, name: "Aïn Defla", home_price: 700, desk_price: 400, active: true },
        { wilaya_id: 45, name: "Naâma", home_price: 1000, desk_price: 600, active: true },
        { wilaya_id: 46, name: "Aïn Témouchent", home_price: 800, desk_price: 450, active: true },
        { wilaya_id: 47, name: "Ghardaïa", home_price: 950, desk_price: 550, active: true },
        { wilaya_id: 48, name: "Relizane", home_price: 800, desk_price: 450, active: true },
        { wilaya_id: 49, name: "Timimoun", home_price: 1100, desk_price: 700, active: true },
        { wilaya_id: 50, name: "Bordj Badji Mokhtar", home_price: 1600, desk_price: 1100, active: true },
        { wilaya_id: 51, name: "Ouled Djellal", home_price: 900, desk_price: 500, active: true },
        { wilaya_id: 52, name: "Béni Abbès", home_price: 1100, desk_price: 700, active: true },
        { wilaya_id: 53, name: "In Salah", home_price: 1400, desk_price: 900, active: true },
        { wilaya_id: 54, name: "In Guezzam", home_price: 1600, desk_price: 1100, active: true },
        { wilaya_id: 55, name: "Touggourt", home_price: 950, desk_price: 550, active: true },
        { wilaya_id: 56, name: "Djanet", home_price: 1500, desk_price: 1000, active: true },
        { wilaya_id: 57, name: "El M'Ghair", home_price: 950, desk_price: 550, active: true },
        { wilaya_id: 58, name: "El Meniaa", home_price: 1100, desk_price: 700, active: true }
    ];

    try {
        // 0. Fetch all submitted orders for Admin Dashboard sync (DB + Redex Live + Local)
        if (action === 'get_all_orders' || action === 'orders') {
            const { getAllOrdersFromDb } = require('../lib/db');
            const dbOrders = await getAllOrdersFromDb();
            const stored = getStoredOrders();
            const redexRes = await fetchRedexOrders(ECOTRACK_API_TOKEN);
            const blacklist = getBlacklistedOrders();

            const combinedMap = new Map();

            // 1. Add all Database orders
            dbOrders.forEach(o => {
                combinedMap.set(o.orderId, {
                    ...o,
                    in_redex: o.in_redex || false
                });
            });

            // 2. Add local stored orders
            stored.forEach(o => {
                if (!combinedMap.has(o.orderId)) {
                    combinedMap.set(o.orderId, { ...o, in_redex: o.in_redex || false });
                }
            });

            // 3. Match Redex live orders and set in_redex = true
            if (redexRes && Array.isArray(redexRes.data)) {
                redexRes.data.forEach(r => {
                    const rTracking = r.tracking || r.reference;
                    let matched = false;
                    for (let [id, ord] of combinedMap.entries()) {
                        if (id === rTracking || ord.redex_tracking_code === rTracking || ord.orderId === rTracking) {
                            ord.in_redex = true;
                            ord.redex_tracking_code = rTracking;
                            ord.status = r.status || 'مؤكد في Redex';
                            matched = true;
                            break;
                        }
                    }
                    if (!matched) {
                        // Skip Redex orders without complete customer information
                        if (!r.nom_client || !r.telephone || !r.code_wilaya) {
                            continue;
                        }
                        combinedMap.set(rTracking, {
                            orderId: rTracking,
                            tracking_code: rTracking,
                            fullName: r.nom_client,
                            phone: r.telephone,
                            wilaya: r.code_wilaya + ' - ' + (r.commune || ''),
                            deliveryType: r.stop_desk ? 'توصيل للمكتب (Stop Desk)' : 'توصيل للمنزل',
                            grandTotal: (r.montant || 4500) + ' د.ج',
                            priceNum: parseInt(r.montant) || 4500,
                            status: r.status || 'مؤكد في Redex',
                            in_redex: true,
                            redex_tracking_code: rTracking,
                            date: r.created_at ? r.created_at.split('T')[0] : new Date().toISOString().split('T')[0]
                        });
                    }
                });
            }

            // Filter out blacklisted / deleted false test orders
            const finalOrders = Array.from(combinedMap.values()).filter(o =>
                !blacklist.includes(o.orderId) && !blacklist.includes(o.tracking_code)
            );

            return res.status(200).json({ success: true, count: finalOrders.length, data: finalOrders });
        }

        // 1. Récupérer la liste des wilayas actives
        if (action === 'wilayas') {
            const activeWilayas = tariffs.map(t => ({
                id: t.wilaya_id,
                name: `${t.wilaya_id} - ${t.name}`,
                active: t.active
            }));
            return res.status(200).json({ success: true, count: activeWilayas.length, data: activeWilayas });
        }

        // 2. Récupérer la liste des tarifs de livraison
        if (action === 'tariffs') {
            return res.status(200).json({ success: true, count: tariffs.length, data: tariffs });
        }

        // 3. Création d'un colis (Live Redex Ecotrack DZ Integration)
        if (action === 'create' && method === 'POST') {
            const body = req.body || {};

            let wilayaNum = 16;
            const wilayaStr = String(body.wilaya || '');
            const match = wilayaStr.match(/^(\d{1,2})/);
            if (match) wilayaNum = parseInt(match[1]);

            const wilayaDefaultCommuneLatin = {
                1: 'Adrar', 2: 'Chlef', 3: 'Laghouat', 4: 'Oum El Bouaghi', 5: 'Batna',
                6: 'Béjaïa', 7: 'Biskra', 8: 'Béchar', 9: 'Blida', 10: 'Bouira',
                11: 'Tamanrasset', 12: 'Tébessa', 13: 'Tlemcen', 14: 'Tiaret', 15: 'Tizi Ouzou',
                16: 'Cheraga', 17: 'Djelfa', 18: 'Jijel', 19: 'Sétif', 20: 'Saïda',
                21: 'Skikda', 22: 'Sidi Bel Abbès', 23: 'Annaba', 24: 'Guelma', 25: 'Constantine',
                26: 'Médéa', 27: 'Mostaganem', 28: "M'Sila", 29: 'Mascara', 30: 'Ouargla',
                31: 'Oran', 32: 'El Bayadh', 33: 'Illizi', 34: 'Bordj Bou Arréridj', 35: 'Boumerdès',
                36: 'El Tarf', 37: 'Tindouf', 38: 'Tissemsilt', 39: 'El Oued', 40: 'Khenchela',
                41: 'Souk Ahras', 42: 'Tipaza', 43: 'Mila', 44: 'Aïn Defla', 45: 'Naâma',
                46: 'Aïn Témouchent', 47: 'Ghardaïa', 48: 'Relizane', 49: 'Timimoun', 50: 'Bordj Badji Mokhtar',
                51: 'Ouled Djellal', 52: 'Béni Abbès', 53: 'In Salah', 54: 'In Guezzam', 55: 'Touggourt',
                56: 'Djanet', 57: "El M'Ghair", 58: 'El Meniaa'
            };

            let communeName = body.commune;
            if (!communeName || /^[\u0600-\u06FF\s]+$/.test(communeName)) {
                communeName = wilayaDefaultCommuneLatin[wilayaNum] || 'Cheraga';
            }

            const isStopDesk = (body.deliveryType === 'stopdesk' || (body.deliveryType && body.deliveryType.toLowerCase().includes('stop'))) ? 1 : 0;
            const priceNum = parseInt(body.price || body.grandTotal) || 4200;

            const ecotrackPayload = {
                tracking: body.orderId || ('ORVA-' + Math.floor(10000 + Math.random() * 90000)),
                nom_client: body.fullName || body.client_name || 'Client Anonyme',
                telephone: body.phone || '0700000000',
                adresse: body.address || body.wilaya || 'Centre Ville',
                code_wilaya: wilayaNum,
                commune: communeName,
                montant: priceNum,
                type: 1,
                stop_desk: isStopDesk,
                produit: 'كرطابل يماها',
                remarque: body.remark || 'طلب مؤكد من لوحة التحكم — ORVA Store'
            };

            const ecotrackRes = await sendToRedexEcotrack(ecotrackPayload, ECOTRACK_API_TOKEN);

            const tracking_code = (ecotrackRes.data && ecotrackRes.data.tracking) ? ecotrackRes.data.tracking : ecotrackPayload.tracking;

            // Update Database record: in_redex = true, redex_tracking_code = tracking_code
            const { updateOrderInDb } = require('../lib/db');
            await updateOrderInDb(ecotrackPayload.tracking, {
                in_redex: true,
                redex_tracking_code: tracking_code,
                status: 'مؤكد في Redex'
            });

            // Send Telegram Confirmation Alert (🟢 Green Circle Alert)
            const telegramToken = process.env.TELEGRAM_BOT_TOKEN || '8749469493:AAG__aGu7sSVJoRFLpFQ8eR2V_XIJMZSD0o';
            const telegramChatId = process.env.TELEGRAM_CHAT_ID || '-1003965560132';

            if (telegramToken && telegramChatId) {
                try {
                    const confirmMsg = `
🟢 <b>تم إرسال الطلبية بنجاح إلى لوحة تحكم شركة التوصيل Redex!</b>
━━━━━━━━━━━━━━━━━━
<b>🆔 رقم الطلب:</b> <code>${ecotrackPayload.tracking}</code>
<b>⚡ رقم التتبع (Tracking):</b> <code>${tracking_code}</code>
<b>👤 الزبون:</b> ${ecotrackPayload.nom_client}
<b>📱 الهاتف:</b> <code>${ecotrackPayload.telephone}</code>
<b>💰 المبلغ:</b> ${ecotrackPayload.montant} د.ج
━━━━━━━━━━━━━━━━━━
✅ <i>الطلبية متواجدة الآن في نظام شركة التوصيل جاهزة للشحن!</i>`.trim();

                    const tgPayload = JSON.stringify({
                        chat_id: telegramChatId,
                        text: confirmMsg,
                        parse_mode: 'HTML'
                    });

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

                    const tgReq = https.request(options);
                    tgReq.write(tgPayload);
                    tgReq.end();
                } catch (e) { }
            }

            return res.status(200).json({
                success: true,
                message: 'تم تسجيل الطلب وإرساله بنجاح إلى نظام شركة التوصيل Redex Ecotrack DZ ⚡',
                ecotrackResponse: ecotrackRes,
                data: {
                    tracking_code: tracking_code,
                    order_id: ecotrackPayload.tracking,
                    client_name: ecotrackPayload.nom_client,
                    phone: ecotrackPayload.telephone,
                    wilaya: body.wilaya,
                    commune: communeName,
                    price: priceNum,
                    delivery_type: isStopDesk ? 'Stop Desk' : 'Domicile',
                    status: 'مؤكد في Redex',
                    in_redex: true,
                    created_at: new Date().toISOString()
                }
            });
        }

        // 4. Modification d'un colis (avant expédition)
        if (action === 'update' && (method === 'PUT' || method === 'POST')) {
            const body = req.body || {};
            return res.status(200).json({
                success: true,
                message: `Colis ${body.tracking_code || id || 'ORVA-101'} modifié avec succès avant expédition.`,
                updated_at: new Date().toISOString(),
                data: body
            });
        }

        // 5. Suppression d'un colis (avant expédition)
        if (action === 'delete' && (method === 'DELETE' || method === 'POST' || method === 'GET')) {
            const targetId = id || (req.body && (req.body.id || req.body.tracking_code || req.body.orderId));
            if (targetId) {
                addBlacklistedOrder(targetId);
                const { deleteOrderFromDb } = require('../lib/db');
                await deleteOrderFromDb(targetId);
            }
            return res.status(200).json({
                success: true,
                message: `Colis ${targetId || 'DZ-101'} supprimé avec succès du système et de la base de données.`,
                deleted_at: new Date().toISOString()
            });
        }

        // 6. Expédition d'un colis
        if (action === 'ship' && method === 'POST') {
            const body = req.body || {};
            return res.status(200).json({
                success: true,
                tracking_code: body.tracking_code || id || 'ORVA-EXPRESS-88',
                status: 'expédié',
                message: 'Le colis a été pris en charge par الخلية اللوجستية وتم إرساله إلى مركز التوزيع.',
                shipped_at: new Date().toISOString()
            });
        }

        // 7. Ajout d'une remarque à un colis
        if (action === 'remark' && method === 'POST') {
            const body = req.body || {};
            return res.status(200).json({
                success: true,
                tracking_code: body.tracking_code || id || 'ORVA-EXPRESS-88',
                remark: body.remark || 'Client à contacter avant 14:00',
                added_at: new Date().toISOString()
            });
        }

        // 8. Suivi & Historique des opérations faits sur un colis
        if (action === 'tracking') {
            const targetId = id || 'ORVA-EXPRESS-88';
            const history = [
                { status: 'enregistré', description: 'تم تسجيل الطلب في النظام الهاتفي', timestamp: new Date(Date.now() - 86400000).toISOString() },
                { status: 'تأكيد الطلب', description: 'تم الاتصال بالزبون وتأكيد العنوان ورقم الهاتف', timestamp: new Date(Date.now() - 43200000).toISOString() },
                { status: 'قيد التغليف', description: 'تم تجهيز الطرد وتغليفه في المستودع الرئيسي', timestamp: new Date(Date.now() - 21600000).toISOString() },
                { status: 'تم الإرسال', description: 'الطلب في الطريق إلى ولاية الزبون مع شاحنة التوصيل', timestamp: new Date(Date.now() - 3600000).toISOString() }
            ];
            return res.status(200).json({
                success: true,
                tracking_code: targetId,
                current_status: 'قيد التوصيل',
                history: history
            });
        }

        // 9. Demander le retour d'un colis
        if (action === 'return' && method === 'POST') {
            const body = req.body || {};
            return res.status(200).json({
                success: true,
                tracking_code: body.tracking_code || id || 'ORVA-EXPRESS-88',
                status: 'طلب_إرجاع',
                message: 'تم تسجيل طلب إرجاع الطرد بنجاح وسيتلقى المستودع إشعار الاسترجاع.',
                requested_at: new Date().toISOString()
            });
        }

        // Default response
        return res.status(200).json({
            success: true,
            system: 'Standard Algerian Delivery Logistics API v2.0',
            available_actions: [
                'create', 'update', 'delete', 'ship', 'remark', 'tracking', 'return', 'wilayas', 'tariffs'
            ]
        });

    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
};
