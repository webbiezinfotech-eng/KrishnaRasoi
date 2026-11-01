<?php
/**
 * Application-facing messaging API.
 * Business logic should call sendWhatsApp / sendSMS only.
 */
class MessagingService
{
    public static function sendWhatsApp(string $to, string $message, array $options = []): array
    {
        return WhatsAppService::send($to, $message, $options);
    }

    public static function sendSMS(string $to, string $message, array $options = []): array
    {
        return SmsService::send($to, $message, $options);
    }

    public static function isMockMode(): bool
    {
        return WhatsAppService::isMockMode();
    }

    public static function publicConfig(): array
    {
        return [
            'mode'                  => self::isMockMode() ? 'mock' : 'live',
            'test_mode'             => false,
            'test_phone_masked'     => WhatsAppService::maskedTestPhone(),
            'whatsapp_ready'        => WhatsAppService::hasToken() && !self::isMockMode(),
            'whatsapp_token_set'    => WhatsAppService::hasToken(),
            'batch_size'            => MESSAGING_BATCH_SIZE,
            'max_recipients'        => MESSAGING_MAX_RECIPIENTS,
            'whatsapp_configured'   => WhatsAppService::hasToken(),
            'sms_configured'        => false,
            'provider'              => WhatsAppService::providerName(),
            'placeholder'           => '{{name}}',
        ];
    }
}
