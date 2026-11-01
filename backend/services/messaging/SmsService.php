<?php
/**
 * SMS send facade. Kept separate from WhatsApp so DLT/sender config can
 * be added later without touching the customer UI.
 */
class SmsService
{
    public static function send(
        string $to,
        string $message,
        array $options = []
    ): array {
        $payload = [
            'to'                  => $to,
            'message'             => $message,
            'name'                => $options['name'] ?? null,
            'template_name'       => $options['template_name'] ?? null,
            'template_language'   => $options['template_language'] ?? null,
            'template_parameters' => $options['template_parameters'] ?? null,
        ];
        if (self::isMockMode()) {
            return (new MockMessagingProvider('sms'))->send($payload);
        }
        return [
            'success'             => false,
            'accepted'            => false,
            'mode'                => 'live',
            'provider'            => SMS_PROVIDER ?: '',
            'status'              => 'failed',
            'provider_message_id' => null,
            'message'             => 'No SMS provider configured',
            'error'               => 'No SMS provider configured',
        ];
    }

    public static function provider(): MessagingProviderInterface
    {
        return new MockMessagingProvider('sms');
    }

    public static function isMockMode(): bool
    {
        return strtolower((string) MESSAGING_MODE) !== 'live';
    }
}
