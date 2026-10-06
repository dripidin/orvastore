'use strict';
// =============================================================================
// ORVA Store — Logistics Hub & Algerian Carriers API Gateway
// Supports: Ecotrack (Redex, DHD, Conexlog, MSM Go), Yalidine, ZR Express, Noest, Maystro, Anderson
// =============================================================================

const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const dzship = require('dzship');
const { resolveRedexCommune } = require('../lib/communesMapper');

// ── 1. Algerian Couriers Catalog ─────────────────────────────────────────────
const ALGERIAN_COURIERS = [
    {
        id: 'redex',
        name: 'Redex Delivery DZ',
        type: 'ecotrack',
        baseUrl: 'https://redex.ecotrack.dz',
        defaultToken: process.env.ECOTRACK_API_TOKEN || process.env.REDEX_API_TOKEN || '',
        active: true,
        logoText: 'REDEX'
    },
    {
        id: 'dhd',
        name: 'DHD Express',
        type: 'ecotrack',
        baseUrl: 'https://platform.dhd-dz.com',
        defaultToken: '',
        active: true,
        logoText: 'DHD'
    },
    {
        id: 'conexlog',
        name: 'Conexlog DZ',
        type: 'ecotrack',
        baseUrl: 'https://app.conexlog-dz.com',
        defaultToken: '',
        active: true,
        logoText: 'CONEXLOG'
    },
    {
        id: 'msmgo',
        name: 'MSM Go Express',
        type: 'ecotrack',
        baseUrl: 'https://app.msmgo.ecotrack.dz',
        defaultToken: '',
        active: true,
        logoText: 'MSM GO'
    },
    {
        id: 'yalidine',
        name: 'Yalidine Express',
        type: 'yalidine',
        baseUrl: 'https://api.yalidine.app',
        defaultToken: process.env.YALIDINE_API_TOKEN || '',
        apiId: process.env.YALIDINE_API_ID || '',
        fromWilaya: 16,
        active: true,
        logoText: 'YALIDINE'
    },
    {
        id: 'zrexpress',
        name: 'ZR Express (Procolis)',
        type: 'zrexpress',
        baseUrl: 'https://procolis.com/api',
        defaultToken: process.env.ZR_API_TOKEN || '',
        key: process.env.ZR_API_KEY || '',
        active: true,
        logoText: 'ZR EXPRESS'
    },
    {
        id: 'noest',
        name: 'Noest Delivery',
        type: 'noest',
        baseUrl: 'https://api.noest-dz.com',
        defaultToken: process.env.NOEST_API_TOKEN || '',
        active: true,
        logoText: 'NOEST'
    },
    {
        id: 'maystro',
        name: 'Maystro Delivery',
        type: 'maystro',
        baseUrl: 'https://api.maystro-delivery.com',
        defaultToken: process.env.MAYSTRO_API_TOKEN || '',
        active: true,
        logoText: 'MAYSTRO'
    },
    {
        id: 'anderson',
        name: 'Anderson Express',
        type: 'anderson',
        baseUrl: 'https://app.anderson-logistics.dz',
        defaultToken: process.env.ANDERSON_API_TOKEN || '',
        active: true,
        logoText: 'ANDERSON'
    }
];

// Active Courier Client Factory
function getCourierClient(courierId = 'redex', customToken = '', customBaseUrl = '') {
    const courier = ALGERIAN_COURIERS.find(c => c.id === courierId) || ALGERIAN_COURIERS[0];
    const token = customToken || courier.defaultToken || process.env.ECOTRACK_API_TOKEN || '';
    const baseUrl = customBaseUrl || courier.baseUrl;

    if (courier.type === 'yalidine') {
        return dzship({
            courier: 'yalidine',
            credentials: {
                apiId: courier.apiId || process.env.YALIDINE_API_ID || 'demo',
                apiToken: token
            },
            options: { fromWilaya: courier.fromWilaya || 16 }
        });
    }

    if (courier.type === 'zrexpress') {
        return dzship({
            courier: 'zrexpress',
            credentials: {
                token: token,
                key: courier.key || process.env.ZR_API_KEY || 'demo'
            }
        });
    }

    // Default Ecotrack Tenant
    return dzship({
        courier: 'ecotrack',
        credentials: { token: token },
        options: { baseUrl: baseUrl }
    });
}

// Direct Redex Ecotrack Order Creation Function
async function createRedexOrderDirect({ token, baseUrl, orderPayload }) {
    const carrierUrl = (baseUrl || 'https://redex.ecotrack.dz').replace(/\/+$/, '');
    const carrierToken = token || process.env.ECOTRACK_API_TOKEN || process.env.REDEX_API_TOKEN || '';

    const wilayaCode = parseInt(orderPayload.wilayaCode) || 16;
    const rawCommune = orderPayload.commune || 'Alger Centre';
    const resolvedCommune = resolveRedexCommune(wilayaCode, rawCommune);

    const isStopDesk = (
        orderPayload.deliveryType === 'stopdesk' ||
        orderPayload.deliveryType === 'desk' ||
        String(orderPayload.deliveryType || '').toLowerCase().includes('stop') ||
        String(orderPayload.deliveryType || '').includes('المكتب')
    );

    let resolvedProductName = 'PACK 4EN1 4950';
    const pSource = String(orderPayload.productList || orderPayload.productName || orderPayload.orderId || '').toLowerCase();
    if (pSource.includes('12950') || pSource.includes('pack 2') || pSource.includes('pack2') || pSource.includes('5') || pSource.includes('crown')) {
        resolvedProductName = 'PACK 5EN1 12950';
    } else {
        resolvedProductName = 'PACK 4EN1 4950';
    }

    const rawPriceStr = String(orderPayload.priceNum || orderPayload.price || orderPayload.grandTotal || '').replace(/[^\d]/g, '');
    const defaultPrice = resolvedProductName.includes('12950') ? 12950 : 4950;
    const finalPriceNum = parseInt(rawPriceStr, 10) || defaultPrice;

    const deliveryNote = isStopDesk ? 'Stop Desk (استلام من المكتب)' : 'Domicile (توصيل للمنزل)';

    const redexBody = {
        nom_client: orderPayload.fullName || 'Client',
        telephone: orderPayload.phone || '0555000000',
        telephone_2: orderPayload.phone2 || null,
        adresse: orderPayload.address || (isStopDesk ? 'Bureau Stop Desk' : 'Centre Ville'),
        code_wilaya: String(wilayaCode),
        commune: resolvedCommune,
        montant: finalPriceNum,
        remarque: `${deliveryNote} - ${resolvedProductName}`,
        produit: resolvedProductName,
        type: 1,
        stop_desk: isStopDesk ? 1 : 0,
        reference: orderPayload.orderId || ('ORVA-' + Date.now().toString().slice(-5))
    };

    console.log('[Redex API] Dispatching order to:', `${carrierUrl}/api/v1/create/order`, 'Commune:', resolvedCommune);

    const res = await fetch(`${carrierUrl}/api/v1/create/order`, {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + carrierToken,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(redexBody)
    });

    const resData = await res.json().catch(() => ({}));

    if (!res.ok) {
        let errDetail = resData.message || (`Erreur HTTP ${res.status}`);
        if (resData.errors) {
            const errList = Object.values(resData.errors).flat();
            errDetail += ' : ' + errList.join(' | ');
        }
        throw new Error(errDetail);
    }

    if (resData.success && resData.tracking) {
        return {
            trackingNumber: resData.tracking,
            reference: resData.reference,
            communeUsed: resolvedCommune,
            raw: resData
        };
    }

    throw new Error(resData.message || 'Réponse inattendue de Redex Delivery');
}

// Convert dashboard order format to dzship format
function convertToDzshipOrder(order) {
    let wilayaCode = 16;
    let communeName = 'الجزائر';
    let address = order.address || 'Centre Ville';

    if (order.wilayaCode) {
        wilayaCode = parseInt(order.wilayaCode);
    } else if (order.wilaya) {
        const wilayaMatch = order.wilaya.match(/^(\d+)/);
        wilayaCode = wilayaMatch ? parseInt(wilayaMatch[1]) : 16;
    }

    if (order.commune) {
        communeName = order.commune;
    } else if (order.wilaya) {
        const communeMatch = order.wilaya.match(/—\s*(.+)$/) || order.wilaya.match(/-\s*(.+)$/);
        communeName = communeMatch ? communeMatch[1].trim() : 'الجزائر';
    }

    const deliveryType = (order.deliveryType && (order.deliveryType.includes('Stop') || order.deliveryType.includes('المكتب') || order.deliveryType === 'desk' || order.deliveryType === 'stopdesk'))
        ? 'stopdesk'
        : 'home';

    return {
        reference: order.orderId || order.tracking_code || ('ORVA-' + Math.floor(10000 + Math.random() * 90000)),
        recipient: {
            fullName: order.fullName || 'Client Anonyme',
            phone: order.phone || '0555000000',
            wilayaCode: wilayaCode,
            communeName: communeName,
            address: address
        },
        deliveryType: deliveryType,
        productList: order.productList || order.productName || 'Sac Banane Moto Yamaha + Cadeaux',
        codAmount: order.priceNum || parseInt(String(order.grandTotal || '').replace(/\D/g, '')) || 4400
    };
}

function getStoredOrders() {
    try {
        const tmpFile = path.join(os.tmpdir(), 'orva_orders.json');
        if (fs.existsSync(tmpFile)) {
            return JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
        }
    } catch (e) {}
    return [];
}

function getBlacklistedOrders() {
    const defaultBlacklist = ['ECEOSK26081843163', 'ECEOSK26081842580', 'ECEOSK26081842574'];
    try {
        const tmpFile = path.join(os.tmpdir(), 'blacklisted_orders.json');
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
        const tmpFile = path.join(os.tmpdir(), 'blacklisted_orders.json');
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

    const { action, id, tracking, courierId, baseUrl, token } = req.query || {};
    const method = req.method;

    // Delivery Tariffs (58 Wilayas Standard Rate Card)
    const tariffs = [
        { wilaya_id: 1, name: "Adrar / أدرار", home_price: 1000, desk_price: 600, active: true },
        { wilaya_id: 2, name: "Chlef / الشلف", home_price: 700, desk_price: 400, active: true },
        { wilaya_id: 3, name: "Laghouat / الأغواط", home_price: 900, desk_price: 500, active: true },
        { wilaya_id: 4, name: "Oum El Bouaghi / أم البواقي", home_price: 800, desk_price: 450, active: true },
        { wilaya_id: 5, name: "Batna / باتنة", home_price: 800, desk_price: 450, active: true },
        { wilaya_id: 6, name: "Béjaïa / بجاية", home_price: 750, desk_price: 400, active: true },
        { wilaya_id: 7, name: "Biskra / بسكرة", home_price: 550, desk_price: 350, active: true },
        { wilaya_id: 8, name: "Béchar / بشار", home_price: 1000, desk_price: 600, active: true },
        { wilaya_id: 9, name: "Blida / البليدة", home_price: 600, desk_price: 350, active: true },
        { wilaya_id: 10, name: "Bouira / البويرة", home_price: 700, desk_price: 400, active: true },
        { wilaya_id: 11, name: "Tamanrasset / تمنراست", home_price: 1400, desk_price: 900, active: true },
        { wilaya_id: 12, name: "Tébessa / تبسة", home_price: 850, desk_price: 500, active: true },
        { wilaya_id: 13, name: "Tlemcen / تلمسان", home_price: 800, desk_price: 450, active: true },
        { wilaya_id: 14, name: "Tiaret / تيارت", home_price: 800, desk_price: 450, active: true },
        { wilaya_id: 15, name: "Tizi Ouzou / تيزي وزو", home_price: 700, desk_price: 400, active: true },
        { wilaya_id: 16, name: "Alger / الجزائر", home_price: 400, desk_price: 300, active: true },
        { wilaya_id: 17, name: "Djelfa / الجلفة", home_price: 900, desk_price: 500, active: true },
        { wilaya_id: 18, name: "Jijel / جيجل", home_price: 750, desk_price: 400, active: true },
        { wilaya_id: 19, name: "Sétif / سطيف", home_price: 750, desk_price: 400, active: true },
        { wilaya_id: 20, name: "Saïda / سعيدة", home_price: 850, desk_price: 500, active: true },
        { wilaya_id: 21, name: "Skikda / سكيكدة", home_price: 800, desk_price: 450, active: true },
        { wilaya_id: 22, name: "Sidi Bel Abbès / سيدي بلعباس", home_price: 800, desk_price: 450, active: true },
        { wilaya_id: 23, name: "Annaba / عنابة", home_price: 800, desk_price: 450, active: true },
        { wilaya_id: 24, name: "Guelma / قالمة", home_price: 800, desk_price: 450, active: true },
        { wilaya_id: 25, name: "Constantine / قسنطينة", home_price: 750, desk_price: 400, active: true },
        { wilaya_id: 26, name: "Médéa / المدية", home_price: 700, desk_price: 400, active: true },
        { wilaya_id: 27, name: "Mostaganem / مستغانم", home_price: 800, desk_price: 450, active: true },
        { wilaya_id: 28, name: "M'Sila / المسيلة", home_price: 800, desk_price: 450, active: true },
        { wilaya_id: 29, name: "Mascara / معسكر", home_price: 800, desk_price: 450, active: true },
        { wilaya_id: 30, name: "Ouargla / ورقلة", home_price: 950, desk_price: 550, active: true },
        { wilaya_id: 31, name: "Oran / وهران", home_price: 750, desk_price: 400, active: true },
        { wilaya_id: 32, name: "El Bayadh / البيض", home_price: 1000, desk_price: 600, active: true },
        { wilaya_id: 33, name: "Illizi / إليزي", home_price: 1400, desk_price: 900, active: true },
        { wilaya_id: 34, name: "Bordj Bou Arréridj / برج بوعريريج", home_price: 750, desk_price: 400, active: true },
        { wilaya_id: 35, name: "Boumerdès / بومرداس", home_price: 600, desk_price: 350, active: true },
        { wilaya_id: 36, name: "El Tarf / الطارف", home_price: 850, desk_price: 500, active: true },
        { wilaya_id: 37, name: "Tindouf / تندوف", home_price: 1500, desk_price: 1000, active: true },
        { wilaya_id: 38, name: "Tissemsilt / تيسمسيلت", home_price: 850, desk_price: 500, active: true },
        { wilaya_id: 39, name: "El Oued / الوادي", home_price: 950, desk_price: 550, active: true },
        { wilaya_id: 40, name: "Khenchela / خنشلة", home_price: 850, desk_price: 500, active: true },
        { wilaya_id: 41, name: "Souk Ahras / سوق أهراس", home_price: 850, desk_price: 500, active: true },
        { wilaya_id: 42, name: "Tipaza / تيبازة", home_price: 600, desk_price: 350, active: true },
        { wilaya_id: 43, name: "Mila / ميلة", home_price: 750, desk_price: 400, active: true },
        { wilaya_id: 44, name: "Aïn Defla / عين الدفلى", home_price: 700, desk_price: 400, active: true },
        { wilaya_id: 45, name: "Naâma / النعامة", home_price: 1000, desk_price: 600, active: true },
        { wilaya_id: 46, name: "Aïn Témouchent / عين تموشنت", home_price: 800, desk_price: 450, active: true },
        { wilaya_id: 47, name: "Ghardaïa / غرداية", home_price: 950, desk_price: 550, active: true },
        { wilaya_id: 48, name: "Relizane / غليزان", home_price: 800, desk_price: 450, active: true },
        { wilaya_id: 49, name: "Timimoun / تيميمون", home_price: 1100, desk_price: 700, active: true },
        { wilaya_id: 50, name: "Bordj Badji Mokhtar / برج باجي مختار", home_price: 1600, desk_price: 1100, active: true },
        { wilaya_id: 51, name: "Ouled Djellal / أولاد جلال", home_price: 900, desk_price: 500, active: true },
        { wilaya_id: 52, name: "Béni Abbès / بني عباس", home_price: 1100, desk_price: 700, active: true },
        { wilaya_id: 53, name: "In Salah / عين صالح", home_price: 1400, desk_price: 900, active: true },
        { wilaya_id: 54, name: "In Guezzam / عين قزام", home_price: 1600, desk_price: 1100, active: true },
        { wilaya_id: 55, name: "Touggourt / تقرت", home_price: 950, desk_price: 550, active: true },
        { wilaya_id: 56, name: "Djanet / جانت", home_price: 1500, desk_price: 1000, active: true },
        { wilaya_id: 57, name: "El M'Ghair / المغير", home_price: 950, desk_price: 550, active: true },
        { wilaya_id: 58, name: "El Meniaa / المنيعة", home_price: 1100, desk_price: 700, active: true }
    ];

    try {
        // ── 1. Fetch All Orders ───────────────────────────────────────────────
        if (action === 'get_all_orders' || action === 'orders') {
            const { getAllOrdersFromDb } = require('../lib/db');
            const dbOrders = await getAllOrdersFromDb();
            const stored = getStoredOrders();
            const blacklist = getBlacklistedOrders();

            const combinedMap = new Map();

            // 1. Add all Database orders (primary source)
            dbOrders.forEach(o => {
                // Normalize status
                let normalizedStatus = o.status || 'pending';
                const sLow = String(normalizedStatus).toLowerCase();
                if (sLow.includes('retour') || sLow.includes('مرتجع') || sLow.includes('echou') || sLow.includes('refus')) {
                    normalizedStatus = 'returned';
                } else if (sLow.includes('livr') || sLow.includes('تسليم') || sLow.includes('مستلم')) {
                    normalizedStatus = 'delivered';
                } else if (sLow.includes('shipped') || sLow.includes('exped') || sLow.includes('redex') || sLow.includes('ecotrack') || o.in_redex) {
                    normalizedStatus = 'shipped';
                }

                combinedMap.set(o.orderId, {
                    ...o,
                    status: normalizedStatus,
                    in_redex: o.in_redex || (o.redex_tracking_code && o.redex_tracking_code.length > 0)
                });
            });

            // 2. Add local stored orders
            stored.forEach(o => {
                if (!combinedMap.has(o.orderId)) {
                    combinedMap.set(o.orderId, { ...o, in_redex: o.in_redex || false });
                }
            });

            const finalOrders = Array.from(combinedMap.values()).filter(o =>
                !blacklist.includes(o.orderId) && !blacklist.includes(o.tracking_code) && o.status !== 'deleted'
            );

            return res.status(200).json({ success: true, count: finalOrders.length, data: finalOrders });
        }

        // ── 1.5. Admin Login Verification (against Vercel ADMIN_PASSWORD) ─────
        if (action === 'login' || action === 'auth') {
            const body = req.body || {};
            const inputPass = (body.password || req.query.password || '').toString().trim();
            const expectedPass = (process.env.ADMIN_PASSWORD || process.env.ADMIN_API_TOKEN || 'orva2026').toString().trim();

            if (!inputPass) {
                return res.status(400).json({ success: false, error: 'MISSING_PASSWORD' });
            }

            if (inputPass === expectedPass) {
                return res.status(200).json({
                    success: true,
                    message: 'AUTHENTICATED',
                    token: process.env.ADMIN_API_TOKEN || 'orva-admin-2026-secure'
                });
            } else {
                return res.status(401).json({
                    success: false,
                    error: 'INVALID_PASSWORD'
                });
            }
        }

        // ── 2. Couriers Directory & Configuration ─────────────────────────────
        if (action === 'couriers') {
            return res.status(200).json({
                success: true,
                count: ALGERIAN_COURIERS.length,
                data: ALGERIAN_COURIERS
            });
        }

        // ── 3. Test Courier Connection ─────────────────────────────────────────
        if (action === 'test_courier' || action === 'test_ecotrack') {
            const targetCourier = ALGERIAN_COURIERS.find(c => c.id === courierId) || ALGERIAN_COURIERS[0];
            const activeToken = token || req.query.token || req.body?.token || targetCourier.defaultToken || process.env.ECOTRACK_API_TOKEN || process.env.REDEX_API_TOKEN || '';
            const carrierUrl = (baseUrl || req.query.baseUrl || req.body?.baseUrl || targetCourier.baseUrl || 'https://redex.ecotrack.dz').replace(/\/+$/, '');

            if (targetCourier.type === 'ecotrack' || targetCourier.id === 'redex') {
                try {
                    const testRes = await fetch(`${carrierUrl}/api/v1/get/wilayas`, {
                        headers: {
                            'Authorization': 'Bearer ' + activeToken,
                            'Accept': 'application/json'
                        }
                    });

                    if (testRes.ok) {
                        return res.status(200).json({
                            success: true,
                            courier: targetCourier.name,
                            type: targetCourier.type,
                            baseUrl: carrierUrl,
                            status: 'CONNECTED_READY',
                            message: `✅ Connexion réussie avec ${targetCourier.name} (Jeton API vérifié et valide)`
                        });
                    } else if (testRes.status === 401) {
                        return res.status(401).json({
                            success: false,
                            courier: targetCourier.name,
                            error: 'Jeton API non autorisé (401 Unauthorized). Veuillez vérifier la clé saisie.'
                        });
                    } else {
                        return res.status(testRes.status).json({
                            success: false,
                            courier: targetCourier.name,
                            error: `Erreur HTTP ${testRes.status} reçue du serveur ${targetCourier.name}`
                        });
                    }
                } catch (e) {
                    return res.status(500).json({
                        success: false,
                        error: `Impossible de joindre le serveur ${carrierUrl} : ${e.message}`
                    });
                }
            }

            return res.status(200).json({
                success: true,
                courier: targetCourier.name,
                type: targetCourier.type,
                baseUrl: carrierUrl,
                status: 'CONNECTED_READY',
                message: `Passerelle ${targetCourier.name} prête.`
            });
        }

        // ── 4. Create & Dispatch Parcel to Carrier API ─────────────────────────
        if (action === 'create' && method === 'POST') {
            const body = req.body || {};
            const activeToken = body.token || req.query.token || token || process.env.ECOTRACK_API_TOKEN || process.env.REDEX_API_TOKEN || '';
            const activeBaseUrl = (body.baseUrl || req.query.baseUrl || baseUrl || 'https://redex.ecotrack.dz').replace(/\/+$/, '');
            const activeCourier = body.courierId || courierId || 'redex';

            const orderPayload = {
                orderId: body.orderId || ('ORVA-' + Math.floor(10000 + Math.random() * 90000)),
                fullName: body.fullName || 'Client',
                phone: body.phone || '0555000000',
                phone2: body.phone2 || null,
                wilaya: body.wilaya || '16 - Alger',
                wilayaCode: body.wilayaCode || 16,
                commune: body.commune || 'Alger Centre',
                address: body.address || '',
                deliveryType: body.deliveryType || 'home',
                grandTotal: `${body.price || 4400} DZD`,
                priceNum: parseInt(body.price) || 4400,
                productList: body.productList || 'Pack Commande ORVA Store'
            };

            let trackingNumber = null;
            let courierRes = null;
            let resolvedCommuneName = orderPayload.commune;

            if (activeCourier === 'redex' || activeCourier.includes('ecotrack')) {
                try {
                    const redexRes = await createRedexOrderDirect({
                        token: activeToken,
                        baseUrl: activeBaseUrl,
                        orderPayload: orderPayload
                    });
                    trackingNumber = redexRes.trackingNumber;
                    resolvedCommuneName = redexRes.communeUsed;
                    courierRes = { status: 200, data: redexRes };
                } catch (err) {
                    console.error('[Redex Direct Dispatch Error]:', err.message);
                    return res.status(422).json({
                        success: false,
                        error: `Échec d'expédition vers Redex : ${err.message}`,
                        orderId: orderPayload.orderId
                    });
                }
            } else {
                // Fallback for other carriers via dzship
                const dzshipOrder = convertToDzshipOrder(orderPayload);
                const client = getCourierClient(activeCourier, activeToken, activeBaseUrl);
                try {
                    const apiRes = await client.createOrder(dzshipOrder);
                    if (apiRes && apiRes.trackingNumber) {
                        trackingNumber = apiRes.trackingNumber;
                        courierRes = { status: 200, data: apiRes };
                    } else {
                        throw new Error('Aucun code de suivi retourné');
                    }
                } catch (err) {
                    return res.status(502).json({
                        success: false,
                        error: `Échec d'expédition vers ${activeCourier} : ${err.message}`
                    });
                }
            }

            // Sync with DB
            const { updateOrderInDb, saveOrderToDb } = require('../lib/db');
            try {
                await updateOrderInDb(orderPayload.orderId, {
                    in_redex: true,
                    redex_tracking_code: trackingNumber,
                    status: 'shipped',
                    commune: resolvedCommuneName
                });
            } catch (e) {
                await saveOrderToDb({
                    ...orderPayload,
                    in_redex: true,
                    redex_tracking_code: trackingNumber,
                    status: 'shipped',
                    commune: resolvedCommuneName
                });
            }

            return res.status(200).json({
                success: true,
                message: `Colis expédié avec succès vers Redex Delivery DZ (${trackingNumber})`,
                courierResponse: courierRes,
                data: {
                    tracking_code: trackingNumber,
                    order_id: orderPayload.orderId,
                    client_name: orderPayload.fullName,
                    phone: orderPayload.phone,
                    wilaya: orderPayload.wilaya,
                    commune: resolvedCommuneName,
                    price: orderPayload.priceNum,
                    delivery_type: orderPayload.deliveryType,
                    status: 'shipped',
                    in_redex: true,
                    created_at: new Date().toISOString()
                }
            });
        }

        // ── 5. Official Carrier Label (Stream Raw PDF or Return URL) ──────────
        if (action === 'label_pdf') {
            const trackingCode = tracking || id || req.query.code;
            if (!trackingCode) {
                return res.status(400).send('Numéro de suivi manquant');
            }
            const activeToken = token || req.query.token || process.env.ECOTRACK_API_TOKEN || process.env.REDEX_API_TOKEN || '';
            const carrierUrl = (baseUrl || req.query.baseUrl || 'https://redex.ecotrack.dz').replace(/\/+$/, '');

            try {
                const pdfRes = await fetch(`${carrierUrl}/api/v1/get/order/label?tracking=${encodeURIComponent(trackingCode)}`, {
                    headers: { 'Authorization': 'Bearer ' + activeToken }
                });

                if (!pdfRes.ok) {
                    return res.status(pdfRes.status).send(`Impossible de récupérer le bordereau Redex (${pdfRes.statusText})`);
                }

                const pdfBuffer = await pdfRes.arrayBuffer();
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `inline; filename="bordereau-${trackingCode}.pdf"`);
                return res.send(Buffer.from(pdfBuffer));
            } catch (err) {
                return res.status(500).send('Erreur lors du téléchargement du bordereau : ' + err.message);
            }
        }

        if (action === 'label') {
            const trackingCode = tracking || id;
            if (!trackingCode || trackingCode.length < 5) {
                return res.status(400).json({
                    success: false,
                    error: 'L\'étiquette officielle n\'est disponible qu\'après l\'envoi du colis au transporteur.'
                });
            }

            const activeToken = token || req.query.token || process.env.ECOTRACK_API_TOKEN || process.env.REDEX_API_TOKEN || '';
            const pdfDirectUrl = `/api/delivery?action=label_pdf&tracking=${encodeURIComponent(trackingCode)}${activeToken ? '&token=' + encodeURIComponent(activeToken) : ''}`;

            return res.status(200).json({
                success: true,
                trackingCode: trackingCode,
                labelUrl: pdfDirectUrl,
                courier: 'Redex Delivery DZ',
                message: 'Lien du bordereau officiel prêt pour impression.'
            });
        }

        // ── 5.5. Live Tracking Check ──────────────────────────────────────────
        if (action === 'track' || action === 'tracking') {
            const trackingCode = tracking || id || req.query.code;
            if (!trackingCode) {
                return res.status(400).json({ success: false, error: 'Numéro de suivi manquant' });
            }
            const activeToken = token || req.query.token || process.env.ECOTRACK_API_TOKEN || process.env.REDEX_API_TOKEN || '';
            const carrierUrl = (baseUrl || req.query.baseUrl || 'https://redex.ecotrack.dz').replace(/\/+$/, '');

            try {
                const trackRes = await fetch(`${carrierUrl}/api/v1/get/orders?tracking=${encodeURIComponent(trackingCode)}`, {
                    headers: { 'Authorization': 'Bearer ' + activeToken, 'Accept': 'application/json' }
                });
                const trackData = await trackRes.json();
                return res.status(200).json({
                    success: true,
                    trackingCode: trackingCode,
                    data: Array.isArray(trackData) ? trackData[0] : (trackData.data?.[0] || trackData)
                });
            } catch (err) {
                return res.status(500).json({ success: false, error: err.message });
            }
        }

        // ── 6. Website Analytics & Vercel Telemetry ───────────────────────────
        if (action === 'analytics') {
            const { getAllOrdersFromDb } = require('../lib/db');
            const { getAggregatedWebsiteAnalytics } = require('../lib/vercelAnalytics');
            const orders = await getAllOrdersFromDb();
            const analyticsData = await getAggregatedWebsiteAnalytics(orders);

            return res.status(200).json({
                success: true,
                ...analyticsData
            });
        }

        // ── 7. Delete / Archive Order ──────────────────────────────────────────
        if (action === 'delete' && (method === 'DELETE' || method === 'POST' || method === 'GET')) {
            const targetId = id || (req.body && (req.body.id || req.body.orderId));
            if (targetId) {
                addBlacklistedOrder(targetId);
                const { deleteOrderFromDb } = require('../lib/db');
                await deleteOrderFromDb(targetId);
            }
            return res.status(200).json({
                success: true,
                message: `Commande ${targetId} supprimée et synchronisée.`
            });
        }

        // ── 8. Tariffs List ───────────────────────────────────────────────────
        if (action === 'tariffs') {
            return res.status(200).json({ success: true, count: tariffs.length, data: tariffs });
        }

        return res.status(404).json({ success: false, error: `Action '${action}' non reconnue.` });
    } catch (err) {
        console.error('[Delivery API Error]:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
};
