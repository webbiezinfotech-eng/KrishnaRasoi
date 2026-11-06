<?php
/**
 * Hostinger deployment self-check — browser me kholo:
 *   https://YOUR-DOMAIN/backend/install-check.php
 * Har cheez green honi chahiye. Red line = wahi block hai.
 */
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');

$rows = [];
function row(string $label, bool $ok, string $detail = ''): void {
    global $rows;
    $rows[] = ['label' => $label, 'ok' => $ok, 'detail' => $detail];
}

// ---- 1. PHP ----
row('PHP version (8.1+ chahiye)', version_compare(PHP_VERSION, '8.1.0', '>='), PHP_VERSION);
foreach (['pdo', 'pdo_mysql', 'mbstring', 'json', 'openssl'] as $ext) {
    row("PHP extension: {$ext}", extension_loaded($ext), extension_loaded($ext) ? 'loaded' : 'MISSING — hPanel → PHP Configuration se enable karein');
}

// ---- 2. Files ----
$root = dirname(__DIR__);
row('backend/index.php', is_file(__DIR__ . '/index.php'));
row('backend/config/database.php', is_file(__DIR__ . '/config/database.php'));
row('frontend/dist/index.html', is_file($root . '/frontend/dist/index.html'), is_file($root . '/frontend/dist/index.html') ? 'found' : 'dist folder public_html me upload karein');
row('dist ki .htaccess (SPA rewrite)', is_file($root . '/frontend/dist/.htaccess'), is_file($root . '/frontend/dist/.htaccess') ? 'found' : 'frontend/dist/.htaccess missing — deep link 404 dega');

// ---- 3. Database ----
$dbOk = false; $dbDetail = '';
try {
    require_once __DIR__ . '/config/app.php';
    require_once __DIR__ . '/config/database.php';
    $pdo = new PDO(
        sprintf('mysql:host=%s;port=%s;dbname=%s;charset=%s', DB_HOST, DB_PORT, DB_NAME, DB_CHARSET),
        DB_USER, DB_PASS, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
    $tables = ['admin_users', 'guest_house_rooms', 'guest_house_guests', 'orders', 'bills'];
    $have = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    $missing = array_values(array_diff($tables, $have));
    $dbOk = empty($missing);
    $dbDetail = $dbOk
        ? DB_NAME . ' connected · ' . count($have) . ' tables'
        : 'Missing tables: ' . implode(', ', $missing) . ' — database/schema.sql import karein';
} catch (Throwable $e) {
    $dbDetail = 'Connection failed: ' . $e->getMessage();
}
row('Database connection', $dbOk, $dbDetail);

// ---- 4. Writable ----
row('backend/ writable (logs)', is_writable(__DIR__), is_writable(__DIR__) ? 'ok' : 'permission 755/775 set karein');

// ---- 5. API route ----
$apiUrl = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http')
    . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost') . '/backend/health';
$health = @file_get_contents($apiUrl, false, stream_context_create(['http' => ['timeout' => 8, 'ignore_errors' => true]]));
$healthData = json_decode((string) $health, true);
row('API /backend/health', is_array($healthData) && ($healthData['success'] ?? false) === true,
    is_array($healthData) ? 'api_version ' . ($healthData['data']['api_version'] ?? '?') : 'Response: ' . substr(strip_tags((string) $health), 0, 160));

$fail = count(array_filter($rows, fn($r) => !$r['ok']));
?>
<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Install Check</title>
<style>
 body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#f8fafc;color:#0f172a}
 .wrap{max-width:760px;margin:0 auto;padding:28px 18px}
 h1{font-size:20px;margin:0 0 4px}
 .sub{color:#64748b;font-size:13px;margin:0 0 18px}
 .banner{border-radius:12px;padding:14px 16px;font-size:14px;font-weight:600;margin-bottom:18px}
 .ok{background:#dcfce7;color:#166534;border:1px solid #86efac}
 .bad{background:#fee2e2;color:#991b1b;border:1px solid #fca5a5}
 table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden}
 td{padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;vertical-align:top}
 tr:last-child td{border-bottom:0}
 .pill{display:inline-block;min-width:52px;text-align:center;border-radius:999px;padding:2px 9px;font-size:11px;font-weight:700}
 .p-ok{background:#dcfce7;color:#166534}.p-bad{background:#fee2e2;color:#991b1b}
 code{background:#f1f5f9;padding:1px 5px;border-radius:4px;font-size:12px}
 .foot{margin-top:16px;font-size:12px;color:#64748b;line-height:1.6}
</style></head><body><div class="wrap">
<h1>Deployment check</h1>
<p class="sub"><?= htmlspecialchars($_SERVER['HTTP_HOST'] ?? '') ?> · <?= date('d M Y, H:i') ?></p>
<div class="banner <?= $fail === 0 ? 'ok' : 'bad' ?>">
  <?= $fail === 0 ? '✅ Sab ready hai — dist + backend sahi jagah hain.' : '⚠️ ' . $fail . ' problem mili — neeche red lines dekhein.' ?>
</div>
<table>
<?php foreach ($rows as $r): ?>
  <tr>
    <td><span class="pill <?= $r['ok'] ? 'p-ok' : 'p-bad' ?>"><?= $r['ok'] ? 'OK' : 'FAIL' ?></span></td>
    <td><strong><?= htmlspecialchars($r['label']) ?></strong><?php if ($r['detail'] !== ''): ?><br><span style="color:#64748b"><?= htmlspecialchars($r['detail']) ?></span><?php endif; ?></td>
  </tr>
<?php endforeach; ?>
</table>
<p class="foot">
  Folder layout expected:<br>
  <code>public_html/index.html + assets/ + .htaccess</code> (dist ke andar ka content)<br>
  <code>public_html/backend/</code> (backend folder)<br>
  API base apne aap <code>/backend</code> hi rehta hai — koi URL hardcode nahi karna.
</p>
</div></body></html>
