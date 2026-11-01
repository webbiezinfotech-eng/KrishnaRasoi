<?php
/**
 * Database configuration.
 * Priority: database.local.php → auto-detect host → XAMPP defaults.
 */
if (file_exists(__DIR__ . '/database.local.php')) {
    require __DIR__ . '/database.local.php';
    return;
}

$hostHeader = strtolower($_SERVER['HTTP_HOST'] ?? 'localhost');
$hostHeader = preg_replace('/:\d+$/', '', $hostHeader);

$isLocal = in_array($hostHeader, ['localhost', '127.0.0.1'], true)
    || str_ends_with($hostHeader, '.local')
    || str_starts_with($hostHeader, '192.168.')
    || str_starts_with($hostHeader, '10.');

if ($isLocal) {
    // XAMPP / local dev — use 127.0.0.1 (not "localhost") on macOS or PDO picks wrong socket.
    define('DB_HOST',    '127.0.0.1');
    define('DB_PORT',    '3306');
    define('DB_NAME',    'restaurant_db1');
    define('DB_USER',    'root');
    define('DB_PASS',    '');
} else {
    // Production (Hostinger / live server)
    define('DB_HOST',    '127.0.0.1');
    define('DB_PORT',    '3306');
    define('DB_NAME',    'u723435472_restaurant_db1');
    define('DB_USER',    'u723435472_restaurant_db1');
    define('DB_PASS',    'restaurantD_12');
}

define('DB_CHARSET', 'utf8mb4');
