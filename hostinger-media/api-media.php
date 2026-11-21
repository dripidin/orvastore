<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, private');
header('X-Content-Type-Options: nosniff');

function respond(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$authFile = __DIR__ . '/bridge-auth.php';
if (!is_file($authFile)) {
    respond(503, ['success' => false, 'error' => 'Media bridge config missing']);
}

$config = require $authFile;
$expectedSecret = is_array($config) && isset($config['secret']) ? trim((string)$config['secret']) : '';
if (strlen($expectedSecret) < 32) {
    respond(503, ['success' => false, 'error' => 'Media bridge secret not configured']);
}

$providedToken = '';
$authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
if (is_string($authHeader) && preg_match('/^\s*Bearer\s+(.+)\s*$/i', $authHeader, $m)) {
    $providedToken = trim($m[1]);
} elseif (!empty($_SERVER['HTTP_X_MEDIA_SECRET'])) {
    $providedToken = trim((string)$_SERVER['HTTP_X_MEDIA_SECRET']);
}

if ($providedToken === '' || !hash_equals($expectedSecret, $providedToken)) {
    respond(401, ['success' => false, 'error' => 'Unauthorized']);
}

const ALLOWED_FOLDERS = ['products', 'branding'];
const ALLOWED_MIMES = [
    'image/jpeg' => 'jpg',
    'image/png' => 'png',
    'image/webp' => 'webp',
    'image/gif' => 'gif',
    'image/avif' => 'avif',
];
const MAX_HARD_BYTES = 100 * 1024 * 1024; // 100 MB ceiling

function sanitizeFolder(?string $folder): string
{
    $clean = trim((string)$folder);
    if (!in_array($clean, ALLOWED_FOLDERS, true)) {
        respond(400, ['success' => false, 'error' => 'Invalid folder']);
    }
    return $clean;
}

function sanitizeFilename(?string $filename): string
{
    $raw = trim((string)$filename);
    if ($raw === '' || str_contains($raw, '..') || str_contains($raw, '/') || str_contains($raw, '\\')) {
        respond(400, ['success' => false, 'error' => 'Invalid filename']);
    }
    if (!preg_match('/^[a-z0-9][a-z0-9._-]{0,115}\.(jpg|jpeg|png|webp|gif|avif)$/i', $raw)) {
        respond(400, ['success' => false, 'error' => 'Invalid filename']);
    }
    return $raw;
}

function publicBaseUrl(): string
{
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'https';
    $host = $_SERVER['HTTP_HOST'] ?? 'media.orva-store.com';
    return $scheme . '://' . $host;
}

function buildItem(string $folder, string $filename, string $fullPath): array
{
    $size = @filesize($fullPath);
    $mtime = @filemtime($fullPath);
    $imgInfo = @getimagesize($fullPath);
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->file($fullPath) ?: ($imgInfo['mime'] ?? 'application/octet-stream');

    return [
        'folder' => $folder,
        'filename' => $filename,
        'url' => publicBaseUrl() . '/' . $folder . '/' . rawurlencode($filename),
        'sizeBytes' => is_int($size) ? $size : 0,
        'width' => is_array($imgInfo) && isset($imgInfo[0]) ? (int)$imgInfo[0] : null,
        'height' => is_array($imgInfo) && isset($imgInfo[1]) ? (int)$imgInfo[1] : null,
        'mimeType' => $mime,
        'updatedAt' => $mtime ? gmdate('c', $mtime) : gmdate('c'),
    ];
}

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($action === 'health') {
    respond(200, ['success' => true, 'status' => 'ready', 'maxHardMb' => 100]);
}

if ($method === 'GET' && $action === 'list') {
    $items = [];
    foreach (ALLOWED_FOLDERS as $folder) {
        $dir = __DIR__ . '/' . $folder;
        if (!is_dir($dir)) {
            continue;
        }
        $entries = scandir($dir);
        if (!is_array($entries)) {
            continue;
        }
        foreach ($entries as $entry) {
            if ($entry === '.' || $entry === '..' || str_starts_with($entry, '.')) {
                continue;
            }
            if (!preg_match('/^[a-z0-9][a-z0-9._-]{0,115}\.(jpg|jpeg|png|webp|gif|avif)$/i', $entry)) {
                continue;
            }
            $fullPath = $dir . '/' . $entry;
            if (!is_file($fullPath)) {
                continue;
            }
            $items[] = buildItem($folder, $entry, $fullPath);
        }
    }
    usort($items, static fn(array $a, array $b): int => strcmp($b['updatedAt'], $a['updatedAt']));
    respond(200, ['success' => true, 'items' => $items]);
}

if ($method === 'POST' && $action === 'upload') {
    $folder = sanitizeFolder($_POST['folder'] ?? 'products');
    $requestedName = $_POST['filename'] ?? '';
    $maxBytes = isset($_POST['maxBytes']) ? (int)$_POST['maxBytes'] : MAX_HARD_BYTES;
    if ($maxBytes < 1024 || $maxBytes > MAX_HARD_BYTES) {
        $maxBytes = MAX_HARD_BYTES;
    }

    if (!isset($_FILES['file']) || !is_array($_FILES['file'])) {
        respond(400, ['success' => false, 'error' => 'No file provided']);
    }

    $file = $_FILES['file'];
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        respond(400, ['success' => false, 'error' => 'Upload error code ' . (string)($file['error'] ?? -1)]);
    }

    $tmpPath = (string)($file['tmp_name'] ?? '');
    $size = (int)($file['size'] ?? 0);
    if ($size <= 0 || $size > $maxBytes) {
        respond(413, ['success' => false, 'error' => 'File exceeds configured size limit']);
    }

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->file($tmpPath) ?: '';
    if (!isset(ALLOWED_MIMES[$mime])) {
        respond(400, ['success' => false, 'error' => 'Unsupported image format: ' . $mime]);
    }

    $filename = sanitizeFilename($requestedName ?: ($file['name'] ?? ('image.' . ALLOWED_MIMES[$mime])));
    $targetDir = __DIR__ . '/' . $folder;
    if (!is_dir($targetDir) && !mkdir($targetDir, 0755, true) && !is_dir($targetDir)) {
        respond(500, ['success' => false, 'error' => 'Cannot create target directory']);
    }

    $targetPath = $targetDir . '/' . $filename;
    $stagePath = $targetDir . '/.tmp-' . bin2hex(random_bytes(8)) . '-' . $filename;
    if (!move_uploaded_file($tmpPath, $stagePath)) {
        respond(500, ['success' => false, 'error' => 'Failed to stage uploaded file']);
    }
    @chmod($stagePath, 0644);
    if (!rename($stagePath, $targetPath)) {
        @unlink($stagePath);
        respond(500, ['success' => false, 'error' => 'Failed to finalize uploaded file']);
    }

    respond(200, ['success' => true, 'item' => buildItem($folder, $filename, $targetPath)]);
}

if ($method === 'POST' && $action === 'rename') {
    $raw = file_get_contents('php://input');
    $body = json_decode($raw ?: '{}', true);
    if (!is_array($body)) {
        respond(400, ['success' => false, 'error' => 'Invalid JSON']);
    }
    $folder = sanitizeFolder($body['folder'] ?? '');
    $oldName = sanitizeFilename($body['filename'] ?? '');
    $newName = sanitizeFilename($body['newName'] ?? '');

    $dir = __DIR__ . '/' . $folder;
    $oldPath = $dir . '/' . $oldName;
    $newPath = $dir . '/' . $newName;

    if (!is_file($oldPath)) {
        respond(404, ['success' => false, 'error' => 'Source file not found']);
    }
    if ($oldPath !== $newPath && file_exists($newPath)) {
        respond(409, ['success' => false, 'error' => 'Target filename already exists']);
    }
    if ($oldPath !== $newPath && !rename($oldPath, $newPath)) {
        respond(500, ['success' => false, 'error' => 'Failed to rename file']);
    }

    respond(200, [
        'success' => true,
        'oldUrl' => publicBaseUrl() . '/' . $folder . '/' . rawurlencode($oldName),
        'newUrl' => publicBaseUrl() . '/' . $folder . '/' . rawurlencode($newName),
        'item' => buildItem($folder, $newName, $newPath),
    ]);
}

if ($method === 'POST' && $action === 'delete') {
    $raw = file_get_contents('php://input');
    $body = json_decode($raw ?: '{}', true);
    if (!is_array($body)) {
        respond(400, ['success' => false, 'error' => 'Invalid JSON']);
    }
    $folder = sanitizeFolder($body['folder'] ?? '');
    $filename = sanitizeFilename($body['filename'] ?? '');
    $targetPath = __DIR__ . '/' . $folder . '/' . $filename;
    if (!is_file($targetPath)) {
        respond(404, ['success' => false, 'error' => 'File not found']);
    }
    if (!unlink($targetPath)) {
        respond(500, ['success' => false, 'error' => 'Failed to delete file']);
    }
    respond(200, ['success' => true, 'deleted' => true]);
}

respond(400, ['success' => false, 'error' => 'Unsupported action']);
