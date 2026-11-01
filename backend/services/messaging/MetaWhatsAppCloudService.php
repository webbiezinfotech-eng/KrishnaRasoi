<?php
/**
 * Official WhatsApp Business Cloud API (Meta Graph API) service.
 * Selected via WHATSAPP_PROVIDER=meta_cloud in .env.
 * Credentials come only from the server .env — never the frontend.
 *
 * Env keys:
 *   META_WHATSAPP_TOKEN            (System User access token with whatsapp_business_messaging)
 *   META_WHATSAPP_PHONE_NUMBER_ID  (Phone number ID from Meta dashboard)
 *   META_WHATSAPP_WABA_ID          (WhatsApp Business Account ID — for template list)
 *   META_GRAPH_API_VERSION         (default v21.0)
 */
class MetaWhatsAppCloudService
{
    private string $token;
    private string $phoneId;
    private string $wabaId;
    private string $apiVersion;

    public function __construct()
    {
        $this->token      = trim(messaging_env('META_WHATSAPP_TOKEN'));
        $this->phoneId    = trim(messaging_env('META_WHATSAPP_PHONE_NUMBER_ID'));
        $this->wabaId     = trim(messaging_env('META_WHATSAPP_WABA_ID'));
        $this->apiVersion = trim(messaging_env('META_GRAPH_API_VERSION', 'v21.0'));
    }

    public function isConfigured(): bool
    {
        return $this->token !== '' && $this->phoneId !== '';
    }

    public static function isEnabled(): bool
    {
        return strtolower(trim(messaging_env('WHATSAPP_PROVIDER'))) === 'meta_cloud';
    }

    /** Free-form text — only works inside the 24-hour customer service window. */
    public function sendTextMessage(string $phone, string $message): array
    {
        $payload = [
            'messaging_product' => 'whatsapp',
            'recipient_type'    => 'individual',
            'to'                => $phone,
            'type'              => 'text',
            'text'              => ['preview_url' => false, 'body' => $message],
        ];
        return $this->request('POST', "/{$this->phoneId}/messages", $payload);
    }

    /** Business-initiated messages must use an APPROVED template. */
    public function sendTemplateMessage(string $phone, string $templateName, string $language = 'en', array $bodyValues = []): array
    {
        $params = [];
        foreach ($bodyValues as $v) {
            $params[] = ['type' => 'text', 'text' => (string) $v];
        }
        $payload = [
            'messaging_product' => 'whatsapp',
            'recipient_type'    => 'individual',
            'to'                => $phone,
            'type'              => 'template',
            'template'          => [
                'name'     => $templateName,
                'language' => ['code' => $language],
            ],
        ];
        if (!empty($params)) {
            $payload['template']['components'] = [[ 'type' => 'body', 'parameters' => $params ]];
        }
        return $this->request('POST', "/{$this->phoneId}/messages", $payload);
    }

    /** List templates on the WABA (needs META_WHATSAPP_WABA_ID). */
    public function getTemplates(): array
    {
        if ($this->token === '' || $this->wabaId === '') {
            return ['success' => false, 'message' => 'META_WHATSAPP_TOKEN / META_WHATSAPP_WABA_ID are not set on the server.'];
        }
        return $this->request('GET', "/{$this->wabaId}/message_templates?limit=200");
    }

    private function request(string $method, string $path, ?array $data = null): array
    {
        $url = "https://graph.facebook.com/{$this->apiVersion}" . $path;
        $ch = curl_init($url);
        $headers = [
            'Authorization: Bearer ' . $this->token,
            'Content-Type: application/json',
        ];
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => ZAPTILO_TIMEOUT,
            CURLOPT_HTTPHEADER     => $headers,
        ]);
        if ($method === 'POST') {
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data, JSON_UNESCAPED_UNICODE));
        }

        $body   = curl_exec($ch);
        $http   = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err    = curl_error($ch);
        curl_close($ch);

        if ($body === false) {
            return ['success' => false, 'accepted' => false, 'status' => 'failed',
                    'message' => 'Network error: ' . $err, 'provider_response' => []];
        }
        $decoded = json_decode((string) $body, true);
        $ok = $http >= 200 && $http < 300;
        $messageId = $decoded['messages'][0]['id'] ?? null;
        return [
            'success'             => $ok,
            'accepted'            => $ok,
            'status'              => $ok ? 'sent' : 'failed',
            'provider'            => 'meta_cloud',
            'provider_message_id' => $messageId,
            'message'             => $ok ? 'Sent via WhatsApp Cloud API.' : (string) ($decoded['error']['message'] ?? "HTTP {$http}"),
            'http_code'           => $http,
            'provider_response'   => is_array($decoded) ? $decoded : ['raw' => mb_substr((string) $body, 0, 1000)],
        ];
    }
}
