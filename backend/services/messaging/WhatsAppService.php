<?php
/**
 * WhatsApp send facade. Controllers never talk to Zaptilo directly.
 */
class WhatsAppService
{
    public static function send(
        string $to,
        string $message,
        array $options = []
    ): array {
        $payload = [
            'to'                   => $to,
            'message'              => $message,
            'name'                 => $options['name'] ?? null,
            'template_name'        => $options['template_name'] ?? null,
            'template_language'    => $options['template_language'] ?? null,
            'template_parameters'  => $options['template_parameters'] ?? null,
        ];

        if (self::shouldUseMock()) {
            return (new MockMessagingProvider('whatsapp'))->send($payload);
        }

        // Official WhatsApp Business Cloud API (Meta) — selected via .env
        if (MetaWhatsAppCloudService::isEnabled()) {
            $meta = new MetaWhatsAppCloudService();
            if (!$meta->isConfigured()) {
                return [
                    'success'             => false,
                    'accepted'            => false,
                    'mode'                => 'live',
                    'provider'            => 'meta_cloud',
                    'status'              => 'failed',
                    'provider_message_id' => null,
                    'message'             => 'Meta Cloud API is not configured (META_WHATSAPP_TOKEN / META_WHATSAPP_PHONE_NUMBER_ID).',
                    'error'               => 'Meta Cloud API is not configured.',
                ];
            }
            if ($template !== '') {
                $bodyValues = is_array($params['body'] ?? null) ? $params['body'] : (is_array($params) && array_is_list($params) ? $params : []);
                return $meta->sendTemplateMessage($to, $template, $language, $bodyValues);
            }
            return $meta->sendTextMessage($to, $message);
        }

        $zaptilo = new ZaptiloWhatsAppService();
        if (!$zaptilo->isConfigured()) {
            return [
                'success'             => false,
                'accepted'            => false,
                'mode'                => 'live',
                'provider'            => 'zaptilo',
                'status'              => 'failed',
                'provider_message_id' => null,
                'message'             => 'Zaptilo API token is not configured.',
                'error'               => 'Zaptilo API token is not configured.',
            ];
        }

        $template = trim((string) ($options['template_name'] ?? ''));
        $language = (string) ($options['template_language'] ?? 'en');
        $params = $options['template_parameters'] ?? [];
        $bodyValues = is_array($params['body'] ?? null) ? $params['body'] : (is_array($params) && array_is_list($params) ? $params : []);
        $headerValues = is_array($params['header'] ?? null) ? $params['header'] : [];

        if ($template !== '') {
            return $zaptilo->sendTemplateMessage($to, $template, $language, $bodyValues, $headerValues);
        }

        return $zaptilo->sendCustomMessage($to, $message, (string) ($options['name'] ?? ''));
    }

    public static function sendTextMessage(string $phone, string $message): array
    {
        return (new ZaptiloWhatsAppService())->sendTextMessage($phone, $message);
    }

    public static function sendTemplateMessage(
        string $phone,
        string $templateName,
        string $language = 'en',
        array $bodyValues = [],
        array $headerValues = []
    ): array {
        return (new ZaptiloWhatsAppService())->sendTemplateMessage($phone, $templateName, $language, $bodyValues, $headerValues);
    }

    public static function getTemplates(): array
    {
        return (new ZaptiloWhatsAppService())->getTemplates();
    }

    public static function isMockMode(): bool
    {
        return strtolower((string) MESSAGING_MODE) !== 'live';
    }

    /** Provider used for live sending: meta_cloud | zaptilo. */
    public static function providerName(): string
    {
        return MetaWhatsAppCloudService::isEnabled() ? 'meta_cloud' : 'zaptilo';
    }

    public static function isTestMode(): bool
    {
        return defined('WHATSAPP_TEST_MODE') && WHATSAPP_TEST_MODE === true;
    }

    public static function hasToken(): bool
    {
        return (new ZaptiloWhatsAppService())->isConfigured();
    }

    public static function testPhone(): string
    {
        return defined('ZAPTILO_TEST_PHONE') ? trim((string) ZAPTILO_TEST_PHONE) : '';
    }

    public static function maskedTestPhone(): ?string
    {
        $phone = CustomerService::toWhatsAppNumber(self::testPhone());
        if ($phone === null) {
            return null;
        }
        $len = strlen($phone);
        return str_repeat('*', max(0, $len - 4)) . substr($phone, -4);
    }

    private static function shouldUseMock(): bool
    {
        if (self::isMockMode()) {
            return true;
        }
        $provider = strtolower(trim((string) (defined('WHATSAPP_PROVIDER') ? WHATSAPP_PROVIDER : '')));
        return $provider === 'mock';
    }
}
