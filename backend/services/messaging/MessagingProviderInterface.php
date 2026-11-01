<?php
/**
 * Contract for a WhatsApp or SMS delivery provider.
 * Phase 1 ships only a mock implementation. A real provider can be
 * added later without changing controllers or UI.
 */
interface MessagingProviderInterface
{
    public function channel(): string;

    /**
     * @param array{
     *   to: string,
     *   message: string,
     *   name?: ?string,
     *   template_name?: ?string,
     *   template_language?: ?string,
     *   template_parameters?: ?array
     * } $payload
     * @return array{
     *   success: bool,
     *   accepted: bool,
     *   mode: string,
     *   provider: string,
     *   status: string,
     *   provider_message_id: ?string,
     *   message: string,
     *   error?: ?string
     * }
     */
    public function send(array $payload): array;
}
