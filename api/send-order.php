<?php
// ==============================================================================
// ORVA STORE — Native PHP 8.3 Order Dispatcher for Hostinger LiteSpeed
// Supports: Supabase Cloud Database + Telegram Bot Alerts + Meta Pixel CAPI
// ==============================================================================

define('ORVA_API', true);
$config = require __DIR__ . '/config.php';

// ── CORS & Output Headers ─────────────────────────────────────────────────────
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'success' => false,
        'error' => 'Method Not Allowed. Please send a POST request.'
    ]);
    exit;
}

// ── Read JSON Request Body ────────────────────────────────────────────────────
$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true);

if (!$data || !is_array($data)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => 'Invalid JSON payload received.'
    ]);
    exit;
}

// ── Anti-Spam / Honeypot Filter ───────────────────────────────────────────────
if (!empty($data['honeypot'])) {
    http_response_code(200);
    echo json_encode([
        'success' => true,
        'orderId' => 'BOT_DISCARDED',
        'message' => 'Order received.'
    ]);
    exit;
}

// ── Extract Fields ────────────────────────────────────────────────────────────
$fullName     = trim($data['fullName'] ?? '');
$phone        = trim($data['phone'] ?? '');
$wilaya       = trim($data['wilaya'] ?? '');
$commune      = trim($data['commune'] ?? 'الجزائر');
$deliveryType = trim($data['deliveryType'] ?? 'توصيل للمنزل');
$deliveryTime = trim($data['deliveryTime'] ?? '24 - 48 H');
$quantity     = max(1, (int)($data['quantity'] ?? 1));
$orderId      = trim($data['orderId'] ?? ('ORVA-' . rand(10000, 99999)));
$eventId      = trim($data['eventId'] ?? $data['event_id'] ?? ('order_' . $orderId . '_' . time()));
$shippingFee  = trim($data['shippingFee'] ?? '500 د.ج');

if (empty($fullName) || empty($phone) || empty($wilaya)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => 'Missing required fields (fullName, phone, wilaya)'
    ]);
    exit;
}

// ── Pack Detection & Pricing ──────────────────────────────────────────────────
$reqPackId   = strtolower(trim($data['packId'] ?? ''));
$reqOrderId  = strtolower($orderId);
$rawPriceStr = preg_replace('/[^\d]/', '', (string)($data['priceNum'] ?? $data['grandTotal'] ?? $data['productTotal'] ?? ''));
$parsedPrice = (int)$rawPriceStr;

$isPack2 = (
    $reqPackId === 'pack2' ||
    strpos($reqOrderId, 'pack2') === 0 ||
    $parsedPrice >= 10000 ||
    strpos($rawPriceStr, '13390') !== false ||
    strpos($rawPriceStr, '12950') !== false
);

$productName    = $isPack2 ? 'PACK 5EN1 13390' : 'PACK 4EN1 4950';
$packShortTitle = $isPack2 ? 'عرض 5 في 1 الفاخر (PACK 5EN1)' : 'عرض 4 في 1 (PACK 4EN1)';
$packDesc       = $isPack2
    ? 'ماكينة CROWN 20V ببطاريتين + طقم مفكات 6 قطع + علبة مفاتيح 46 قطعة + مفك مرن + قفازات'
    : 'منفاخ عجلات TOYOTA الأصلي + طقم مفاتيح 46 قطعة + مفك مرن 11 قطعة + طقم 6 مفكات';
$basePrice      = $isPack2 ? 13390 : 4950;
$productTotal   = $data['productTotal'] ?? ($basePrice . ' د.ج');
$grandTotal     = $data['grandTotal'] ?? ($basePrice . ' د.ج');

// Location string
$cleanLocation = $wilaya;
if (!empty($commune) && strpos($cleanLocation, $commune) === false) {
    $cleanLocation .= ' — ' . $commune;
}

// ── 1. Save Order to Supabase Database (REST API) ─────────────────────────────
$supabaseUrl = rtrim($config['supabase']['url'], '/') . '/rest/v1/orders';
$supabaseKey = $config['supabase']['anon_key'];

$supabasePayload = json_encode([
    'order_id'            => $orderId,
    'store_id'            => 'orvastore',
    'full_name'           => $fullName,
    'phone'               => $phone,
    'wilaya'              => $cleanLocation,
    'commune'             => $commune,
    'delivery_type'       => $deliveryType,
    'delivery_time'       => $deliveryTime,
    'quantity'            => $quantity,
    'product_name'        => $productName,
    'product_total'       => $productTotal,
    'shipping_fee'        => $shippingFee,
    'price_num'           => $basePrice,
    'grand_total'         => $grandTotal,
    'status'              => 'pending',
    'in_redex'            => false,
    'redex_tracking_code' => null
]);

$ch = curl_init($supabaseUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $supabasePayload);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'apikey: ' . $supabaseKey,
    'Authorization: Bearer ' . $supabaseKey,
    'Content-Type: application/json',
    'Prefer: return=minimal'
]);
curl_setopt($ch, CURLOPT_TIMEOUT, 6);
$supabaseResp = curl_exec($ch);
$supabaseHttp = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

// ── 2. Send Telegram Instant Order Alert ──────────────────────────────────────
$tgToken  = $config['telegram']['bot_token'];
$tgChatId = $config['telegram']['chat_id'];

if ($tgToken && $tgChatId) {
    $dateFormatted = date('Y-m-d H:i');
    $tgHeader = $isPack2
        ? '👑 <b>طلب جديد: عرض 5 في 1 الفاخر (PACK 5EN1 — 13,390 د.ج)</b>'
        : '📦 <b>طلب جديد: عرض 4 في 1 (PACK 4EN1 — 4,950 د.ج)</b>';

    $adminUrl = "https://orva-store.com/admin.html?orderId=" . urlencode($orderId);

    $tgMsg = "{$tgHeader}\n" .
             "━━━━━━━━━━━━━━━━━━\n" .
             "<b>🆔 رقم الطلب:</b> <code>{$orderId}</code>\n" .
             "<b>👤 الاسم الكامل:</b> {$fullName}\n" .
             "<b>📱 رقم الهاتف:</b> <code>{$phone}</code>\n" .
             "<b>📍 الولاية والبلدية:</b> {$cleanLocation}\n" .
             "<b>🚚 نوع التوصيل:</b> {$deliveryType}\n" .
             "<b>⚡ مدة التوصيل:</b> {$deliveryTime}\n" .
             "<b>📦 العرض والكمية:</b> {$quantity} قطعة — <b>{$packShortTitle}</b>\n" .
             "<i>({$packDesc})</i>\n" .
             "<b>💵 سعر العرض:</b> {$productTotal}\n" .
             "<b>🚚 مصاريف التوصيل:</b> {$shippingFee}\n" .
             "━━━━━━━━━━━━━━━━━━\n" .
             "<b>💰 المجموع الكلي (COD):</b> <b>{$grandTotal}</b>\n" .
             "<b>📅 التاريخ:</b> {$dateFormatted}\n" .
             "━━━━━━━━━━━━━━━━━━\n" .
             "📌 <b>الطلبية مسجلة في المتجر وجاهزة للتأكيد.</b>\n" .
             "👉 <a href=\"{$adminUrl}\">لوحة التحكم (Admin Dashboard)</a>";

    $tgCh = curl_init("https://api.telegram.org/bot{$tgToken}/sendMessage");
    curl_setopt($tgCh, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($tgCh, CURLOPT_POST, true);
    curl_setopt($tgCh, CURLOPT_POSTFIELDS, json_encode([
        'chat_id'    => $tgChatId,
        'text'       => $tgMsg,
        'parse_mode' => 'HTML'
    ]));
    curl_setopt($tgCh, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($tgCh, CURLOPT_TIMEOUT, 4);
    curl_exec($tgCh);
    curl_close($tgCh);
}

// ── 3. Meta Conversions API (CAPI) Server-Side Purchase ───────────────────────
$pixelId = $config['meta']['pixel_id'] ?? '2340414976777036';
$metaToken = $config['meta']['access_token'] ?? null;

if ($metaToken && $pixelId) {
    $clientIp = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
    $clientIp = trim(explode(',', $clientIp)[0]);

    $userData = [
        'fn' => hash('sha256', strtolower(trim($fullName))),
        'ph' => hash('sha256', preg_replace('/[^\d]/', '', $phone)),
        'client_ip_address' => $clientIp,
        'client_user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? ''
    ];

    if (!empty($data['fbp'])) { $userData['fbp'] = $data['fbp']; }
    if (!empty($data['fbc'])) { $userData['fbc'] = $data['fbc']; }

    $metaPayload = json_encode([
        'data' => [
            [
                'event_name'       => 'Purchase',
                'event_time'       => time(),
                'event_id'         => $eventId,
                'event_source_url' => $_SERVER['HTTP_REFERER'] ?? 'https://orva-store.com',
                'action_source'    => 'website',
                'user_data'        => $userData,
                'custom_data'      => [
                    'currency'     => 'DZD',
                    'value'        => $basePrice,
                    'content_name' => $isPack2 ? 'pack2' : 'pack1',
                    'content_ids'  => [$isPack2 ? 'pack2' : 'pack1'],
                    'order_id'     => $orderId
                ]
            ]
        ]
    ]);

    $metaCh = curl_init("https://graph.facebook.com/v19.0/{$pixelId}/events?access_token=" . urlencode($metaToken));
    curl_setopt($metaCh, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($metaCh, CURLOPT_POST, true);
    curl_setopt($metaCh, CURLOPT_POSTFIELDS, $metaPayload);
    curl_setopt($metaCh, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($metaCh, CURLOPT_TIMEOUT, 3);
    curl_exec($metaCh);
    curl_close($metaCh);
}

// ── 4. Response to Frontend ───────────────────────────────────────────────────
echo json_encode([
    'success' => true,
    'orderId' => $orderId,
    'eventId' => $eventId,
    'message' => 'تم استلام طلبكم بنجاح.'
]);
