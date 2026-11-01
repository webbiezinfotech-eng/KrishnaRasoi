<?php
/**
 * Zaptilo WhatsApp Business API client.
 * Token is read only from backend environment — never logged or returned.
 *
 * @see https://zaptilo.ai/developers
 */
class ZaptiloWhatsAppService
{
    public const DEFAULT_BASE_URL = 'https://web.zaptilo.ai';
    /** Documented on zaptilo.ai/developers but currently has no DNS (NXDOMAIN). */
    public const LEGACY_BASE_URL = 'https://api.zaptilo.ai';

    private string $token;
    private string $baseUrl;
    private int $timeout;

    public function __construct(?string $token = null, ?string $baseUrl = null, ?int $timeout = null)
    {
        $this->token = trim((string) ($token ?? (defined('ZAPTILO_API_TOKEN') ? ZAPTILO_API_TOKEN : '')));
        $configured = (string) ($baseUrl ?? (defined('ZAPTILO_BASE_URL') ? ZAPTILO_BASE_URL : self::DEFAULT_BASE_URL));
        $this->baseUrl = $this->normalizeBaseUrl($configured);
        $timeoutVal = $timeout ?? (defined('ZAPTILO_TIMEOUT') ? (int) ZAPTILO_TIMEOUT : 20);
        $this->timeout = $timeoutVal > 0 ? min($timeoutVal, 60) : 20;
    }

    public function isConfigured(): bool
    {
        return $this->token !== '';
    }

    public function sendTextMessage(string $phone, string $message): array
    {
        $number = CustomerService::toWhatsAppNumber($phone);
        $text = trim($message);
        if ($number === null) {
            return $this->fail('Invalid WhatsApp number.', $phone);
        }
        if ($text === '') {
            return $this->fail('Message is empty.', $number);
        }
        // Zaptilo Laravel API requires `phone` (docs also mention `number`).
        return $this->request('POST', '/api/send', [
            'phone'   => $number,
            'number'  => $number,
            'message' => $text,
        ], $number);
    }

    /**
     * Deliver a free-typed restaurant message to a customer number.
     * Contacts stay in this app. The Zaptilo account is the sender.
     * WhatsApp only delivers first contact via an approved template, so
     * custom text is placed into that template's variables when one exists.
     */
    public function sendCustomMessage(string $phone, string $message, string $name = ''): array
    {
        $picked = $this->pickApprovedTemplate();
        if ($picked !== null) {
            $bodyValues = $this->bodyValuesFor(
                (int) ($picked['body_param_count'] ?? 1),
                $name,
                $message
            );
            $viaTemplate = $this->sendTemplateMessage(
                $phone,
                $picked['name'],
                (string) ($picked['language'] ?? 'en_US'),
                $bodyValues
            );
            if (!empty($viaTemplate['accepted'])) {
                return $viaTemplate;
            }
            return $viaTemplate;
        }

        $preferred = trim(defined('ZAPTILO_CUSTOM_TEMPLATE') ? (string) ZAPTILO_CUSTOM_TEMPLATE : '');
        if ($preferred !== '') {
            return $this->fail(
                "Template '{$preferred}' is not APPROVED yet, or its language is not ready. In Zaptilo wait for Approved, click Sync Templates, then send again. Software will not mark this as sent.",
                CustomerService::toWhatsAppNumber($phone)
            );
        }

        return $this->sendTextMessage($phone, $message);
    }

    private static ?array $cachedTemplatePick = null;
    private static bool $cachedTemplatePickDone = false;

    /**
     * @return array{name: string, language: string, body_param_count: int}|null
     */
    public function pickApprovedTemplate(): ?array
    {
        if (self::$cachedTemplatePickDone) {
            return self::$cachedTemplatePick;
        }
        self::$cachedTemplatePickDone = true;
        $preferred = trim(defined('ZAPTILO_CUSTOM_TEMPLATE') ? (string) ZAPTILO_CUSTOM_TEMPLATE : '');
        $preferredLang = trim(defined('ZAPTILO_CUSTOM_TEMPLATE_LANG') ? (string) ZAPTILO_CUSTOM_TEMPLATE_LANG : 'en');
        if ($preferredLang === '') {
            $preferredLang = 'en';
        }

        $result = $this->getTemplates();
        $raw = is_array($result['provider_response'] ?? null) ? $result['provider_response'] : [];
        $list = [];
        if (isset($raw['data']) && is_array($raw['data'])) {
            $list = $raw['data'];
        } elseif (isset($raw['templates']) && is_array($raw['templates'])) {
            $list = $raw['templates'];
        }

        $approved = [];
        foreach ($list as $row) {
            if (!is_array($row)) {
                continue;
            }
            $name = trim((string) ($row['name'] ?? $row['template_name'] ?? ''));
            if ($name === '') {
                continue;
            }
            $status = strtoupper(trim((string) ($row['status'] ?? 'APPROVED')));
            if ($status !== '' && !in_array($status, ['APPROVED', 'ACTIVE', 'ENABLED'], true)) {
                continue;
            }
            $lang = $row['language'] ?? $row['language_code'] ?? 'en';
            if (is_array($lang)) {
                $lang = $lang['code'] ?? 'en';
            }
            $approved[] = [
                'name'             => $name,
                'language'         => (string) $lang !== '' ? (string) $lang : 'en',
                'body_param_count' => $this->countBodyParams($row),
            ];
        }

        if ($preferred !== '') {
            foreach ($approved as $tpl) {
                if (strcasecmp($tpl['name'], $preferred) === 0) {
                    self::$cachedTemplatePick = $tpl;
                    return $tpl;
                }
            }
            self::$cachedTemplatePick = null;
            return null;
        }

        foreach ($approved as $tpl) {
            if ($tpl['body_param_count'] > 0) {
                self::$cachedTemplatePick = $tpl;
                return $tpl;
            }
        }
        self::$cachedTemplatePick = $approved[0] ?? null;
        return self::$cachedTemplatePick;
    }

    private function countBodyParams(array $template): int
    {
        if (isset($template['body_params'])) {
            return max(0, (int) $template['body_params']);
        }
        $components = $template['components'] ?? [];
        if (is_array($components)) {
            foreach ($components as $component) {
                if (!is_array($component)) {
                    continue;
                }
                if (strtolower((string) ($component['type'] ?? '')) !== 'body') {
                    continue;
                }
                $example = $component['example']['body_text'][0] ?? null;
                if (is_array($example)) {
                    return count($example);
                }
                $text = (string) ($component['text'] ?? '');
                if (preg_match_all('/\{\{\d+\}\}/', $text, $m)) {
                    return count($m[0]);
                }
            }
        }
        $text = (string) ($template['body'] ?? $template['text'] ?? '');
        if (preg_match_all('/\{\{\d+\}\}/', $text, $m)) {
            return count($m[0]);
        }
        return 1;
    }

    /**
     * @return list<string>
     */
    private function bodyValuesFor(int $count, string $name, string $message): array
    {
        $name = trim($name) !== '' ? trim($name) : 'Guest';
        $message = trim($message);
        if ($count <= 0) {
            return [];
        }
        if ($count === 1) {
            return [$name];
        }
        $values = [$name, $message];
        while (count($values) < $count) {
            $values[] = $message !== '' ? $message : $name;
        }
        return array_slice($values, 0, $count);
    }

    public function sendTemplateMessage(
        string $phone,
        string $templateName,
        string $language = 'en',
        array $bodyValues = [],
        array $headerValues = []
    ): array {
        $number = CustomerService::toWhatsAppNumber($phone);
        $templateName = trim($templateName);
        if ($number === null) {
            return $this->fail('Invalid WhatsApp number.', $phone);
        }
        if ($templateName === '') {
            return $this->fail('Template name is required.', $number);
        }
        $names = array_values(array_unique(array_filter([
            $templateName,
            strtolower($templateName),
        ])));
        $langs = array_values(array_unique(array_filter([
            $language,
            'en_US',
            'en',
        ])));

        $last = $this->fail('Zaptilo template send failed.', $number);
        foreach ($names as $tryName) {
            foreach ($langs as $tryLang) {
                $payloads = [
                    [
                        'phone'         => $number,
                        'number'        => $number,
                        'template_name' => $tryName,
                        'language'      => $tryLang,
                    ],
                ];
                if ($bodyValues !== []) {
                    $payloads[0]['body_values'] = array_values($bodyValues);
                }
                if ($headerValues !== []) {
                    $payloads[0]['header_values'] = array_values($headerValues);
                }
                $components = [];
                if ($headerValues !== []) {
                    $components[] = [
                        'type'       => 'header',
                        'parameters' => array_map(static fn ($v) => ['type' => 'text', 'text' => (string) $v], array_values($headerValues)),
                    ];
                }
                if ($bodyValues !== []) {
                    $components[] = [
                        'type'       => 'body',
                        'parameters' => array_map(static fn ($v) => ['type' => 'text', 'text' => (string) $v], array_values($bodyValues)),
                    ];
                }
                $payloads[] = [
                    'phone'    => $number,
                    'template' => [
                        'name'       => $tryName,
                        'language'   => ['code' => $tryLang],
                        'components' => $components,
                    ],
                ];
                foreach ($payloads as $payload) {
                    $last = $this->request('POST', '/api/send/template', $payload, $number);
                    if (!empty($last['accepted'])) {
                        return $last;
                    }
                }
            }
        }
        return $last;
    }

    public function getTemplates(): array
    {
        return $this->request('GET', '/api/templates');
    }

    /**
     * Connectivity check for admin UI. Never returns the token.
     */
    public function diagnose(): array
    {
        $host = (string) (parse_url($this->baseUrl, PHP_URL_HOST) ?: 'web.zaptilo.ai');
        $resolved = @gethostbyname($host);
        $dnsOk = $resolved !== '' && $resolved !== $host;

        $probe = $this->isConfigured()
            ? $this->request('GET', '/api/templates')
            : [
                'success'   => false,
                'http_code' => 0,
                'error'     => 'Zaptilo API token is not configured.',
                'message'   => 'Zaptilo API token is not configured.',
            ];

        $httpCode = (int) ($probe['http_code'] ?? 0);
        $reachable = $httpCode > 0;

        return [
            'token_set'        => $this->isConfigured(),
            'base_url'         => $this->baseUrl,
            'curl_enabled'     => function_exists('curl_init'),
            'allow_url_fopen'  => filter_var(ini_get('allow_url_fopen'), FILTER_VALIDATE_BOOLEAN),
            'openssl'          => extension_loaded('openssl'),
            'dns_ok'           => $dnsOk,
            'reachable'        => $reachable,
            'authenticated'    => !empty($probe['success']),
            'http_code'        => $httpCode,
            'error'            => $reachable && !empty($probe['success'])
                ? null
                : ($probe['error'] ?? $probe['message'] ?? null),
        ];
    }

    /**
     * @return array{
     *   success: bool,
     *   accepted: bool,
     *   mode: string,
     *   provider: string,
     *   status: string,
     *   provider_message_id: ?string,
     *   message: string,
     *   error: ?string,
     *   http_code?: int,
     *   provider_response?: array
     * }
     */
    private function request(string $method, string $endpoint, ?array $data = null, ?string $number = null): array
    {
        if (!$this->isConfigured()) {
            return $this->fail('Zaptilo API token is not configured.', $number);
        }

        $url = $this->baseUrl . $endpoint;
        $body = $data !== null ? json_encode($data, JSON_UNESCAPED_UNICODE) : null;
        $suffix = $number ? substr($number, -4) : 'n/a';

        $http = $this->http($method, $url, $body, false);
        if ($this->isSslCertError($http)) {
            error_log("Zaptilo SSL CA missing; retrying {$method} {$endpoint} without peer verify");
            $http = $this->http($method, $url, $body, true);
        }
        if ($this->shouldRetryOnWebHost($http, $url)) {
            $fallbackUrl = self::DEFAULT_BASE_URL . $endpoint;
            error_log("Zaptilo host unresolved; retrying {$method} {$endpoint} on " . self::DEFAULT_BASE_URL);
            $http = $this->http($method, $fallbackUrl, $body, false);
            if ($this->isSslCertError($http)) {
                $http = $this->http($method, $fallbackUrl, $body, true);
            }
            $url = $fallbackUrl;
        }
        if (($http['raw'] === false || (($http['errno'] ?? 0) !== 0 && ($http['http_code'] ?? 0) === 0))
            && ($http['via'] ?? '') === 'curl'
        ) {
            $stream = $this->httpStream($method, $url, $body);
            if (($stream['http_code'] ?? 0) > 0 || $stream['raw'] !== false) {
                $http = $stream;
            }
        }

        $raw = $http['raw'];
        $errno = (int) ($http['errno'] ?? 0);
        $error = (string) ($http['error'] ?? '');
        $httpCode = (int) ($http['http_code'] ?? 0);

        if ($raw === false || ($errno !== 0 && $httpCode === 0)) {
            $msg = $this->networkErrorMessage($errno, $error);
            error_log("Zaptilo {$method} {$endpoint} failed suffix=***{$suffix} http=0 err_no={$errno}");
            return $this->fail($msg, $number, 0, ['error' => 'network', 'curl_errno' => $errno]);
        }

        $decoded = json_decode((string) $raw, true);
        if (!is_array($decoded)) {
            $decoded = ['raw' => mb_substr((string) $raw, 0, 200)];
        }
        $safe = self::sanitizeResponse($decoded);

        $ok = $this->isAcceptedResponse($httpCode, $decoded);
        if ($ok) {
            error_log("Zaptilo {$method} {$endpoint} ok suffix=***{$suffix} http={$httpCode}");
            return [
                'success'             => true,
                'accepted'            => true,
                'mode'                => 'live',
                'provider'            => 'zaptilo',
                'status'              => 'sent',
                'provider_message_id' => isset($decoded['id']) ? (string) $decoded['id'] : (isset($decoded['message_id']) ? (string) $decoded['message_id'] : null),
                'message'             => (string) ($decoded['message'] ?? 'Message sent successfully'),
                'error'               => null,
                'http_code'           => $httpCode,
                'provider_response'   => $safe,
            ];
        }

        // GET /api/templates may return a list without a boolean status.
        if ($httpCode >= 200 && $httpCode < 300 && str_contains($endpoint, '/templates')) {
            error_log("Zaptilo {$method} {$endpoint} ok suffix=***{$suffix} http={$httpCode}");
            return [
                'success'             => true,
                'accepted'            => true,
                'mode'                => 'live',
                'provider'            => 'zaptilo',
                'status'              => 'sent',
                'provider_message_id' => null,
                'message'             => 'OK',
                'error'               => null,
                'http_code'           => $httpCode,
                'provider_response'   => $safe,
            ];
        }

        $err = $this->extractProviderError($decoded, $httpCode);
        error_log("Zaptilo {$method} {$endpoint} fail suffix=***{$suffix} http={$httpCode}");
        return $this->fail($err, $number, $httpCode, $safe);
    }

    /**
     * @return array{raw: string|false, errno: int, error: string, http_code: int, via: string}
     */
    private function http(string $method, string $url, ?string $body, bool $insecureSsl): array
    {
        if (!function_exists('curl_init')) {
            return $this->httpStream($method, $url, $body, $insecureSsl);
        }

        $ch = curl_init();
        $headers = [
            'Authorization: Bearer ' . $this->token,
            'Content-Type: application/json',
            'Accept: application/json',
        ];
        $opts = [
            CURLOPT_URL            => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => min(15, $this->timeout),
            CURLOPT_TIMEOUT        => $this->timeout,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_USERAGENT      => 'RestaurantManager/1.0',
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS      => 3,
            CURLOPT_HTTP_VERSION   => CURL_HTTP_VERSION_1_1,
            CURLOPT_IPRESOLVE      => CURL_IPRESOLVE_V4,
            CURLOPT_ENCODING       => '',
        ];
        if (defined('CURLOPT_NOSIGNAL')) {
            $opts[CURLOPT_NOSIGNAL] = true;
        }
        if (defined('CURL_SSLVERSION_TLSv1_2')) {
            $opts[CURLOPT_SSLVERSION] = CURL_SSLVERSION_TLSv1_2;
        }
        $ca = $this->caBundlePath();
        if ($ca !== null) {
            $opts[CURLOPT_CAINFO] = $ca;
        }
        if ($insecureSsl) {
            $opts[CURLOPT_SSL_VERIFYPEER] = false;
            $opts[CURLOPT_SSL_VERIFYHOST] = 0;
        }
        curl_setopt_array($ch, $opts);
        if (strtoupper($method) === 'POST') {
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body ?? '{}');
        } else {
            curl_setopt($ch, CURLOPT_HTTPGET, true);
        }

        $raw = curl_exec($ch);
        $errno = curl_errno($ch);
        $error = (string) curl_error($ch);
        $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        return [
            'raw'       => $raw,
            'errno'     => $errno,
            'error'     => $error,
            'http_code' => $httpCode,
            'via'       => 'curl',
        ];
    }

    /**
     * @return array{raw: string|false, errno: int, error: string, http_code: int, via: string}
     */
    private function httpStream(string $method, string $url, ?string $body, bool $insecureSsl = false): array
    {
        if (!filter_var(ini_get('allow_url_fopen'), FILTER_VALIDATE_BOOLEAN)) {
            return [
                'raw'       => false,
                'errno'     => 7,
                'error'     => 'PHP curl is unavailable and allow_url_fopen is off.',
                'http_code' => 0,
                'via'       => 'stream',
            ];
        }

        $header = implode("\r\n", [
            'Authorization: Bearer ' . $this->token,
            'Content-Type: application/json',
            'Accept: application/json',
            'User-Agent: RestaurantManager/1.0',
        ]);
        $ctx = stream_context_create([
            'http' => [
                'method'        => strtoupper($method),
                'header'        => $header,
                'content'       => strtoupper($method) === 'POST' ? ($body ?? '{}') : '',
                'timeout'       => $this->timeout,
                'ignore_errors' => true,
            ],
            'ssl' => [
                'verify_peer'      => !$insecureSsl,
                'verify_peer_name' => !$insecureSsl,
            ],
        ]);

        $raw = @file_get_contents($url, false, $ctx);
        $httpCode = 0;
        if (!empty($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $m)) {
            $httpCode = (int) $m[1];
        }
        $error = $raw === false ? (error_get_last()['message'] ?? 'HTTP stream request failed.') : '';

        return [
            'raw'       => $raw,
            'errno'     => $raw === false ? 7 : 0,
            'error'     => is_string($error) ? $error : '',
            'http_code' => $httpCode,
            'via'       => 'stream',
        ];
    }

    private function extractProviderError(array $decoded, int $httpCode): string
    {
        $nested = $decoded['error'] ?? null;
        if (is_array($nested)) {
            $msg = (string) ($nested['error_data']['details'] ?? $nested['message'] ?? $nested['error_user_msg'] ?? '');
            $code = $nested['code'] ?? '';
            if ($msg !== '') {
                return trim($code !== '' ? "(#{$code}) {$msg}" : $msg);
            }
        }
        if (is_string($nested) && trim($nested) !== '') {
            return trim($nested);
        }
        $err = (string) ($decoded['message'] ?? "Zaptilo request failed (HTTP {$httpCode}).");
        if (!empty($decoded['errors']) && is_array($decoded['errors'])) {
            $parts = [];
            foreach ($decoded['errors'] as $field => $msgs) {
                $text = is_array($msgs) ? implode(' ', array_map('strval', $msgs)) : (string) $msgs;
                $text = trim($text);
                if ($text !== '') {
                    $parts[] = is_string($field) ? "{$field}: {$text}" : $text;
                }
            }
            if ($parts !== []) {
                $err = trim($err . ' ' . implode(' ', $parts));
            }
        }
        return $err;
    }

    private function isAcceptedResponse(int $httpCode, array $decoded): bool
    {
        if ($httpCode < 200 || $httpCode >= 300) {
            return false;
        }
        if (!empty($decoded['errors']) && is_array($decoded['errors'])) {
            return false;
        }
        if (!empty($decoded['error'])) {
            return false;
        }
        $blob = strtolower(json_encode($decoded) ?: '');
        if (str_contains($blob, 'does not exist')
            || str_contains($blob, 'oauthexception')
            || str_contains($blob, '132001')
            || str_contains($blob, '"failed"')
        ) {
            return false;
        }
        if (array_key_exists('status', $decoded)) {
            $status = $decoded['status'];
            if ($status === false || $status === 0 || $status === '0' || $status === 'false'
                || $status === 'error' || $status === 'failed') {
                return false;
            }
        }
        if (array_key_exists('success', $decoded)
            && ($decoded['success'] === false || $decoded['success'] === 0 || $decoded['success'] === '0')) {
            return false;
        }
        return true;
    }

    private function normalizeBaseUrl(string $url): string
    {
        $url = rtrim($url, '/');
        if ($url === '') {
            return self::DEFAULT_BASE_URL;
        }
        $host = strtolower((string) (parse_url($url, PHP_URL_HOST) ?: ''));
        if ($host === '' || $host === 'api.zaptilo.ai') {
            return self::DEFAULT_BASE_URL;
        }
        return $url;
    }

    private function shouldRetryOnWebHost(array $http, string $url): bool
    {
        if (str_starts_with($url, self::DEFAULT_BASE_URL)) {
            return false;
        }
        $errno = (int) ($http['errno'] ?? 0);
        $error = (string) ($http['error'] ?? '');
        return $errno === 6
            || stripos($error, 'Could not resolve host') !== false
            || stripos($error, 'name or service not known') !== false;
    }

    private function isSslCertError(array $http): bool
    {
        $errno = (int) ($http['errno'] ?? 0);
        $error = (string) ($http['error'] ?? '');
        if (in_array($errno, [60, 77], true)) {
            return true;
        }
        return $error !== '' && (
            stripos($error, 'SSL certificate') !== false
            || stripos($error, 'certificate problem') !== false
            || stripos($error, 'unable to get local issuer') !== false
            || stripos($error, 'CA bundle') !== false
        );
    }

    private function networkErrorMessage(int $errno, string $error): string
    {
        $error = trim($error);
        if ($errno === 28) {
            return 'cURL 28: Zaptilo request timed out.';
        }
        if ($error !== '') {
            return 'cURL ' . $errno . ': ' . mb_substr($error, 0, 220);
        }
        if ($errno !== 0) {
            return 'cURL ' . $errno . ': Zaptilo connection failed.';
        }
        return 'Zaptilo connection failed (no HTTP response).';
    }

    private function caBundlePath(): ?string
    {
        foreach ([ini_get('openssl.cafile'), ini_get('curl.cainfo')] as $ini) {
            $ini = is_string($ini) ? trim($ini) : '';
            if ($ini !== '' && is_readable($ini)) {
                return $ini;
            }
        }
        foreach ([
            '/etc/ssl/certs/ca-certificates.crt',
            '/etc/pki/tls/certs/ca-bundle.crt',
            '/etc/ssl/ca-bundle.pem',
            '/usr/local/share/certs/ca-root-nss.crt',
        ] as $path) {
            if (is_readable($path)) {
                return $path;
            }
        }
        return null;
    }

    private function fail(string $error, ?string $number, int $httpCode = 0, array $safe = []): array
    {
        return [
            'success'             => false,
            'accepted'            => false,
            'mode'                => 'live',
            'provider'            => 'zaptilo',
            'status'              => 'failed',
            'provider_message_id' => null,
            'message'             => $error,
            'error'               => $error,
            'http_code'           => $httpCode,
            'provider_response'   => $safe,
        ];
    }

    public static function sanitizeResponse(array $data): array
    {
        $blocked = ['token', 'api_token', 'authorization', 'bearer', 'password', 'secret', 'key'];
        $out = [];
        foreach ($data as $k => $v) {
            $lk = strtolower((string) $k);
            foreach ($blocked as $b) {
                if (str_contains($lk, $b)) {
                    continue 2;
                }
            }
            if (is_array($v)) {
                $out[$k] = self::sanitizeResponse($v);
            } elseif (is_scalar($v) || $v === null) {
                $out[$k] = is_string($v) ? mb_substr($v, 0, 300) : $v;
            }
        }
        return $out;
    }
}
