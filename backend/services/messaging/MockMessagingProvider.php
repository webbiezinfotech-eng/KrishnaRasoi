<?php
/**
 * Development provider. Does not call any external API and does not
 * claim that a message was delivered.
 */
class MockMessagingProvider implements MessagingProviderInterface
{
    public function __construct(private readonly string $channel)
    {
    }

    public function channel(): string
    {
        return $this->channel;
    }

    public function send(array $payload): array
    {
        return [
            'success'             => true,
            'accepted'            => false,
            'mode'                => 'mock',
            'provider'            => 'mock',
            'status'              => 'queued',
            'provider_message_id' => null,
            'message'             => 'Message queued for development testing',
            'error'               => null,
        ];
    }
}
