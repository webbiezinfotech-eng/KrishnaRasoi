<?php
/**
 * Provider-agnostic messaging configuration (Phase 1).
 *
 * Defaults to mock/development mode. No real WhatsApp or SMS provider
 * is selected or called. Fill placeholders later via environment variables
 * or a local .env file — never put secrets in frontend code.
 */

(static function (): void {
    $candidates = [
        dirname(__DIR__, 2) . '/.env',
        dirname(__DIR__) . '/.env',
        rtrim((string) ($_SERVER['DOCUMENT_ROOT'] ?? ''), '/') . '/.env',
    ];
    foreach ($candidates as $path) {
        if (!is_file($path) || !is_readable($path)) {
            continue;
        }
        $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($lines === false) {
            continue;
        }
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#')) {
                continue;
            }
            if (!str_contains($line, '=')) {
                continue;
            }
            [$key, $value] = explode('=', $line, 2);
            $key = trim($key);
            $value = trim($value);
            if ($key === '') {
                continue;
            }
            if (
                (str_starts_with($value, '"') && str_ends_with($value, '"'))
                || (str_starts_with($value, "'") && str_ends_with($value, "'"))
            ) {
                $value = substr($value, 1, -1);
            }
            $existing = getenv($key);
            if ($existing === false || $existing === '') {
                @putenv($key . '=' . $value);
            }
            $_ENV[$key] = $value;
            $_SERVER[$key] = $value;
        }
    }
})();

if (!function_exists('messaging_env')) {
    function messaging_env(string $key, string $default = ''): string
    {
        if (isset($_ENV[$key]) && is_string($_ENV[$key]) && $_ENV[$key] !== '') {
            return $_ENV[$key];
        }
        if (isset($_SERVER[$key]) && is_string($_SERVER[$key]) && $_SERVER[$key] !== '') {
            return $_SERVER[$key];
        }
        $g = getenv($key);
        if ($g !== false && $g !== '') {
            return $g;
        }
        return $default;
    }
}

if (!defined('MESSAGING_MODE')) {
    define('MESSAGING_MODE', messaging_env('MESSAGING_MODE', 'mock')); // mock | live
}
if (!defined('MESSAGING_PROVIDER')) {
    define('MESSAGING_PROVIDER', messaging_env('MESSAGING_PROVIDER'));
}
if (!defined('WHATSAPP_PROVIDER')) {
    define('WHATSAPP_PROVIDER', messaging_env('WHATSAPP_PROVIDER'));
}
if (!defined('SMS_PROVIDER')) {
    define('SMS_PROVIDER', messaging_env('SMS_PROVIDER'));
}

if (!defined('WHATSAPP_API_KEY')) {
    define('WHATSAPP_API_KEY', messaging_env('WHATSAPP_API_KEY'));
}
if (!defined('WHATSAPP_SENDER_ID')) {
    define('WHATSAPP_SENDER_ID', messaging_env('WHATSAPP_SENDER_ID'));
}
if (!defined('WHATSAPP_BUSINESS_ID')) {
    define('WHATSAPP_BUSINESS_ID', messaging_env('WHATSAPP_BUSINESS_ID'));
}

if (!defined('SMS_API_KEY')) {
    define('SMS_API_KEY', messaging_env('SMS_API_KEY'));
}
if (!defined('SMS_SENDER_ID')) {
    define('SMS_SENDER_ID', messaging_env('SMS_SENDER_ID'));
}

if (!defined('MESSAGING_BATCH_SIZE')) {
    $batch = (int) messaging_env('MESSAGING_BATCH_SIZE', '50');
    define('MESSAGING_BATCH_SIZE', $batch > 0 ? min($batch, 200) : 50);
}
if (!defined('MESSAGING_MAX_RECIPIENTS')) {
    $max = (int) messaging_env('MESSAGING_MAX_RECIPIENTS', '2000');
    define('MESSAGING_MAX_RECIPIENTS', $max > 0 ? min($max, 10000) : 2000);
}

if (!defined('ZAPTILO_API_TOKEN')) {
    define('ZAPTILO_API_TOKEN', trim(messaging_env('ZAPTILO_API_TOKEN')));
}
if (!defined('ZAPTILO_BASE_URL')) {
    define('ZAPTILO_BASE_URL', rtrim(messaging_env('ZAPTILO_BASE_URL', 'https://web.zaptilo.ai'), '/'));
}
if (!defined('ZAPTILO_TEST_PHONE')) {
    define('ZAPTILO_TEST_PHONE', trim(messaging_env('ZAPTILO_TEST_PHONE')));
}
if (!defined('ZAPTILO_TIMEOUT')) {
    $t = (int) messaging_env('ZAPTILO_TIMEOUT', '20');
    define('ZAPTILO_TIMEOUT', $t > 0 ? min($t, 60) : 20);
}
if (!defined('ZAPTILO_SEND_DELAY_MS')) {
    $d = (int) messaging_env('ZAPTILO_SEND_DELAY_MS', '250');
    define('ZAPTILO_SEND_DELAY_MS', $d >= 0 ? min($d, 5000) : 250);
}
if (!defined('ZAPTILO_CUSTOM_TEMPLATE')) {
    define('ZAPTILO_CUSTOM_TEMPLATE', trim(messaging_env('ZAPTILO_CUSTOM_TEMPLATE', 'Customer_message')));
}
if (!defined('ZAPTILO_CUSTOM_TEMPLATE_LANG')) {
    define('ZAPTILO_CUSTOM_TEMPLATE_LANG', trim(messaging_env('ZAPTILO_CUSTOM_TEMPLATE_LANG', 'en_US')));
}
if (!defined('WHATSAPP_TEST_MODE')) {
    $flag = strtolower(trim(messaging_env('WHATSAPP_TEST_MODE', 'false')));
    define('WHATSAPP_TEST_MODE', in_array($flag, ['1', 'true', 'yes', 'on'], true));
}
