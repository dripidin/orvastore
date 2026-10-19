<?php
// ==============================================================================
// ORVA STORE — Admin Delivery & Orders Gateway (/api/delivery)
// Queries Supabase REST API directly for Hostinger LiteSpeed + PHP 8.3
// ==============================================================================

define('ORVA_API', true);
$config = require __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$action = $_GET['action'] ?? '';
$supabaseUrl = rtrim($config['supabase']['url'], '/');
$supabaseKey = $config['supabase']['anon_key'];

// ── 1. Login Action (Fallback) ────────────────────────────────────────────────
if ($action === 'login') {
    $rawInput = file_get_contents('php://input');
    $body = json_decode($rawInput, true) ?? [];
    $inputPassword = trim($body['password'] ?? '');
    $expectedPassword = trim($config['admin']['password'] ?? 'orva2026');
    $expectedToken    = trim($config['admin']['token'] ?? 'orva-admin-2026-secure');

    if ($inputPassword === $expectedPassword || $inputPassword === $expectedToken) {
        echo json_encode(['success' => true, 'token' => $expectedToken]);
    } else {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'INVALID_PASSWORD']);
    }
    exit;
}

// ── 1.8. Update Order Status (Direct Admin Control) ───────────────────────────
if ($action === 'update_status' || $action === 'status' || $action === 'change_status') {
    $rawInput = file_get_contents('php://input');
    $body = json_decode($rawInput, true) ?? [];
    $targetId = trim($body['orderId'] ?? $body['id'] ?? $_GET['orderId'] ?? $_GET['id'] ?? '');
    $newStatus = trim($body['status'] ?? $_GET['status'] ?? '');

    if (empty($targetId) || empty($newStatus)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Missing orderId or status']);
        exit;
    }

    $patchUrl = "{$supabaseUrl}/rest/v1/orders?order_id=eq." . urlencode($targetId);
    $ch = curl_init($patchUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PATCH');
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
        'status' => $newStatus,
        'updated_at' => date('c')
    ]));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'apikey: ' . $supabaseKey,
        'Authorization: Bearer ' . $supabaseKey,
        'Content-Type: application/json',
        'Prefer: return=minimal'
    ]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 6);
    $patchResp = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    echo json_encode([
        'success' => true,
        'message' => "Order {$targetId} status updated to {$newStatus}",
        'orderId' => $targetId,
        'status'  => $newStatus
    ]);
    exit;
}

// ── 2. Get All Orders ─────────────────────────────────────────────────────────
if ($action === 'get_all_orders' || $action === 'orders') {
    $ch = curl_init("{$supabaseUrl}/rest/v1/orders?select=*&order=created_at.desc&limit=500");
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'apikey: ' . $supabaseKey,
        'Authorization: Bearer ' . $supabaseKey,
        'Content-Type: application/json'
    ]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 6);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $rows = json_decode($response, true) ?? [];
    $normalized = [];

    foreach ($rows as $r) {
        $normalized[] = [
            'orderId'            => $r['order_id'] ?? '',
            'storeId'            => $r['store_id'] ?? 'orvastore',
            'fullName'           => $r['full_name'] ?? '',
            'phone'              => $r['phone'] ?? '',
            'wilaya'             => $r['wilaya'] ?? '',
            'commune'            => $r['commune'] ?? '',
            'deliveryType'       => $r['delivery_type'] ?? 'توصيل للمنزل',
            'deliveryTime'       => $r['delivery_time'] ?? '24 - 48 H',
            'quantity'           => (int)($r['quantity'] ?? 1),
            'productName'        => $r['product_name'] ?? 'PACK 4EN1 4950',
            'productTotal'       => $r['product_total'] ?? '',
            'shippingFee'        => $r['shipping_fee'] ?? '500 د.ج',
            'priceNum'           => (int)($r['price_num'] ?? 4950),
            'grandTotal'         => $r['grand_total'] ?? '',
            'status'             => $r['status'] ?? 'pending',
            'in_redex'           => (bool)($r['in_redex'] ?? false),
            'redex_tracking_code'=> $r['redex_tracking_code'] ?? null,
            'created_at'         => $r['created_at'] ?? date('c'),
            'riskScore'          => (int)($r['risk_score'] ?? 0),
            'riskLevel'          => $r['risk_level'] ?? 'LOW'
        ];
    }

    echo json_encode([
        'success' => true,
        'count'   => count($normalized),
        'data'    => $normalized
    ]);
    exit;
}

// ── 3. Basic Analytics ────────────────────────────────────────────────────────
if ($action === 'analytics') {
    $ch = curl_init("{$supabaseUrl}/rest/v1/orders?select=status,price_num,created_at&limit=500");
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'apikey: ' . $supabaseKey,
        'Authorization: Bearer ' . $supabaseKey
    ]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 6);
    $response = curl_exec($ch);
    curl_close($ch);

    $rows = json_decode($response, true) ?? [];
    $totalOrders = count($rows);
    $totalRevenue = 0;
    $delivered = 0;
    $pending = 0;

    foreach ($rows as $r) {
        $st = strtolower($r['status'] ?? '');
        if ($st === 'delivered') $delivered++;
        if ($st === 'pending') $pending++;
        $totalRevenue += (int)($r['price_num'] ?? 0);
    }

    echo json_encode([
        'success' => true,
        'data' => [
            'totalOrders'   => $totalOrders,
            'totalRevenue'  => $totalRevenue,
            'deliveredCount'=> $delivered,
            'pendingCount'  => $pending
        ]
    ]);
    exit;
}

// Default response
echo json_encode(['success' => true, 'message' => 'ORVA Logistics Gateway Active']);
