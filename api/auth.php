<?php
// ==============================================================================
// ORVA STORE — Admin Authentication Gateway (/api/auth)
// ==============================================================================

define('ORVA_API', true);
$config = require __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'METHOD_NOT_ALLOWED']);
    exit;
}

$rawInput = file_get_contents('php://input');
$body = json_decode($rawInput, true) ?? [];
$inputPassword = trim($body['password'] ?? '');

$expectedPassword = trim($config['admin']['password'] ?? 'orva2026');
$expectedToken    = trim($config['admin']['token'] ?? 'orva-admin-2026-secure');

if (empty($inputPassword)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'MISSING_PASSWORD']);
    exit;
}

if ($inputPassword === $expectedPassword || $inputPassword === $expectedToken) {
    http_response_code(200);
    echo json_encode([
        'success' => true,
        'message' => 'AUTHENTICATED',
        'token'   => $expectedToken
    ]);
} else {
    http_response_code(401);
    echo json_encode([
        'success' => false,
        'error'   => 'INVALID_PASSWORD'
    ]);
}
