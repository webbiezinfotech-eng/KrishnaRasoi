<?php
/**
 * Queue drain. The browser never fans out one request per recipient.
 * In mock mode no provider HTTP call is made and nothing is marked sent.
 */
class MessageQueueService
{
    public static function dispatch(int $campaignId): array
    {
        CustomerService::ensureSchema();

        Database::begin();
        try {
            $campaign = Database::row(
                'SELECT * FROM message_campaigns WHERE id = ? FOR UPDATE',
                [$campaignId]
            );
            if (!$campaign) {
                Database::rollback();
                Response::notFound('Campaign not found.');
            }
            if (!empty($campaign['dispatched_at'])) {
                Database::rollback();
                return [
                    'campaign' => CampaignService::formatCampaign($campaign),
                    'success'  => true,
                    'mode'     => $campaign['mode'],
                    'message'  => 'Campaign was already queued.',
                    'duplicate'=> true,
                ];
            }
            if (!in_array($campaign['status'], ['draft', 'queued'], true)) {
                Database::rollback();
                Response::error('This campaign cannot be sent.', 409);
            }

            $now = date('Y-m-d H:i:s');
            Database::run(
                'UPDATE message_campaigns
                 SET status = ?, dispatched_at = ?, updated_at = NOW()
                 WHERE id = ?',
                ['queued', $now, $campaignId]
            );
            Database::commit();
        } catch (Throwable $e) {
            Database::rollback();
            Response::serverError('Failed to queue campaign.');
        }

        $campaign = Database::row('SELECT * FROM message_campaigns WHERE id = ?', [$campaignId]);
        if (($campaign['channel'] ?? '') === 'whatsapp' && !MessagingService::isMockMode() && WhatsAppService::hasToken()) {
            $result = self::processAll($campaignId);
        } else {
            $result = self::processBatch($campaignId);
        }

        $fresh = Database::row('SELECT * FROM message_campaigns WHERE id = ?', [$campaignId]);
        $mode = (($fresh['mode'] ?? '') === 'live') ? 'live' : 'mock';

        $message = $result['message']
            ?? ($mode === 'mock'
                ? 'Message queued for development testing'
                : 'Campaign processed.');

        return [
            'success'  => ($result['success'] ?? true) !== false,
            'mode'     => $mode,
            'test_mode'=> false,
            'message'  => $message,
            'campaign' => CampaignService::formatCampaign($fresh, true),
            'summary'  => $result['summary'] ?? null,
            'batch'    => $result,
        ];
    }

    /**
     * TEST MODE: never send to the selected customer list.
     */
    private static function dispatchTestOnly(int $campaignId, array $campaign): array
    {
        $testPhone = WhatsAppService::testPhone();
        $number = CustomerService::toWhatsAppNumber($testPhone);
        if ($number === null) {
            return [
                'success'   => false,
                'processed' => 0,
                'mode'      => 'test',
                'message'   => 'TEST MODE is on. In server .env set ZAPTILO_TEST_PHONE to the WhatsApp number that should RECEIVE the test (example 917378852436). This is not the sender number — Zaptilo already has the business WhatsApp.',
                'summary'   => ['total' => 0, 'sent' => 0, 'failed' => 0, 'results' => []],
            ];
        }

        $body = (string) $campaign['message_body'];
        $personalized = MessagePersonalizer::apply($body, 'Test');
        $options = [
            'template_name'       => $campaign['template_name'] ?? null,
            'template_language'   => $campaign['template_language'] ?? null,
            'template_parameters' => !empty($campaign['template_parameters'])
                ? json_decode((string) $campaign['template_parameters'], true)
                : null,
        ];

        if (MessagingService::isMockMode() || !WhatsAppService::hasToken()) {
            $send = [
                'accepted' => false,
                'status'   => 'queued',
                'mode'     => 'mock',
                'message'  => 'TEST MODE (mock): would send only to the configured test number. Add ZAPTILO_API_TOKEN and set MESSAGING_MODE=live for a real one-number test.',
                'provider_response' => ['note' => 'mock_test_mode'],
            ];
        } else {
            $send = MessagingService::sendWhatsApp($number, $personalized, $options);
        }

        $accepted = !empty($send['accepted']);
        MessageLogService::record(
            null,
            'whatsapp',
            $personalized,
            $accepted ? 'SENT' : (MessagingService::isMockMode() ? 'PENDING' : 'FAILED'),
            'zaptilo',
            $send['provider_response'] ?? $send['message'] ?? null
        );

        Database::run(
            'UPDATE message_recipients SET status = ?, error_message = ? WHERE campaign_id = ?',
            ['queued', 'Skipped: TEST MODE — not sent to selected contacts.', $campaignId]
        );
        Database::run(
            "UPDATE message_campaigns
             SET mode = 'test', status = ?, queued_count = total_recipients, sent_count = ?, failed_count = ?, updated_at = NOW()
             WHERE id = ?",
            [$accepted ? 'completed' : (MessagingService::isMockMode() ? 'queued' : 'failed'), $accepted ? 1 : 0, $accepted ? 0 : 1, $campaignId]
        );

        return [
            'processed' => 1,
            'mode'      => MessagingService::isMockMode() ? 'mock' : 'test',
            'message'   => $accepted
                ? 'TEST MODE: 1 WhatsApp sent to the configured test number. Selected customers were not contacted.'
                : ($send['message'] ?? 'TEST MODE send did not complete.'),
            'summary'   => [
                'total'   => 1,
                'sent'    => $accepted ? 1 : 0,
                'failed'  => $accepted ? 0 : 1,
                'results' => [[
                    'number_masked' => WhatsAppService::maskedTestPhone(),
                    'status'        => $accepted ? 'SENT' : (MessagingService::isMockMode() ? 'PENDING' : 'FAILED'),
                    'message'       => $send['message'] ?? null,
                ]],
            ],
        ];
    }

    private static function processAll(int $campaignId): array
    {
        $results = [];
        $sent = 0;
        $failed = 0;
        $loops = 0;
        do {
            $batch = self::processBatch($campaignId);
            $loops++;
            foreach ($batch['results'] ?? [] as $row) {
                $results[] = $row;
                if (($row['status'] ?? '') === 'sent') {
                    $sent++;
                } else {
                    $failed++;
                }
            }
            if (($batch['processed'] ?? 0) === 0) {
                break;
            }
        } while ($loops < 80);

        $total = $sent + $failed;
        return [
            'processed' => $total,
            'mode'      => 'live',
            'message'   => "Processed {$total} recipients.",
            'summary'   => [
                'total'   => $total,
                'sent'    => $sent,
                'failed'  => $failed,
                'results' => $results,
            ],
        ];
    }

    /**
     * Process up to BATCH_SIZE queued recipients.
     * Mock: leave status as queued (not sent). Live: call provider facade.
     */
    public static function processBatch(int $campaignId): array
    {
        CustomerService::ensureSchema();
        $campaign = Database::row('SELECT * FROM message_campaigns WHERE id = ?', [$campaignId]);
        if (!$campaign) {
            return ['processed' => 0, 'mode' => 'mock'];
        }

        $isMock = ($campaign['mode'] ?? 'mock') === 'mock' || MessagingService::isMockMode();
        $limit = MESSAGING_BATCH_SIZE;

        if ($isMock) {
            // Recipients stay queued. Do not pretend they were sent.
            self::refreshCounts($campaignId);
            return [
                'processed' => 0,
                'mode'      => 'mock',
                'message'   => 'Message queued for development testing',
            ];
        }

        $rows = Database::all(
            'SELECT * FROM message_recipients
             WHERE campaign_id = ? AND status = ?
             ORDER BY id ASC
             LIMIT ' . (int) $limit,
            [$campaignId, 'queued']
        );

        $processed = 0;
        $results = [];
        foreach ($rows as $row) {
            Database::run(
                'UPDATE message_recipients SET status = ? WHERE id = ? AND status = ?',
                ['processing', (int) $row['id'], 'queued']
            );

            $options = [
                'name'                => $row['recipient_name'],
                'template_name'       => $campaign['template_name'],
                'template_language'   => $campaign['template_language'],
                'template_parameters' => $campaign['template_parameters']
                    ? json_decode((string) $campaign['template_parameters'], true)
                    : null,
            ];

            $result = $campaign['channel'] === 'sms'
                ? MessagingService::sendSMS($row['recipient_mobile'], $row['personalized_message'], $options)
                : MessagingService::sendWhatsApp($row['recipient_mobile'], $row['personalized_message'], $options);

            $accepted = !empty($result['accepted']);
            $safeResponse = isset($result['provider_response']) && is_array($result['provider_response'])
                ? json_encode(ZaptiloWhatsAppService::sanitizeResponse($result['provider_response']), JSON_UNESCAPED_UNICODE)
                : null;
            if ($accepted) {
                $cost = (float) Helper::setting('whatsapp_cost_per_message', 0.0);
                Database::run(
                    'UPDATE message_recipients
                     SET status = ?, provider_message_id = ?, sent_at = NOW(), error_message = NULL, provider_response = ?, cost_amount = ?
                     WHERE id = ?',
                    ['sent', $result['provider_message_id'] ?? null, $safeResponse, $cost, (int) $row['id']]
                );
                MessageLogService::record((int) ($row['customer_id'] ?? 0) ?: null, $campaign['channel'], $row['personalized_message'], 'SENT', 'zaptilo', $result['provider_response'] ?? null);
                $results[] = ['id' => (int) $row['id'], 'status' => 'sent', 'mobile' => $row['recipient_mobile']];
            } else {
                $err = $result['error'] ?? $result['message'] ?? 'Not accepted by provider.';
                $status = ($result['mode'] ?? '') === 'mock' ? 'queued' : 'failed';
                Database::run(
                    'UPDATE message_recipients
                     SET status = ?, error_message = ?, provider_message_id = ?, provider_response = ?
                     WHERE id = ?',
                    [$status, mb_substr((string) $err, 0, 500), $result['provider_message_id'] ?? null, $safeResponse, (int) $row['id']]
                );
                if ($status === 'failed') {
                    MessageLogService::record((int) ($row['customer_id'] ?? 0) ?: null, $campaign['channel'], $row['personalized_message'], 'FAILED', 'zaptilo', $result['provider_response'] ?? $err);
                }
                $results[] = ['id' => (int) $row['id'], 'status' => $status, 'mobile' => $row['recipient_mobile'], 'error' => $err];
            }
            $processed++;
            if (ZAPTILO_SEND_DELAY_MS > 0) {
                usleep(ZAPTILO_SEND_DELAY_MS * 1000);
            }
        }

        self::refreshCounts($campaignId);
        return ['processed' => $processed, 'mode' => 'live', 'results' => $results];
    }

    public static function refreshCounts(int $campaignId): void
    {
        $counts = Database::row(
            "SELECT
                SUM(status = 'queued' OR status = 'processing') AS queued_count,
                SUM(status = 'sent') AS sent_count,
                SUM(status = 'failed') AS failed_count,
                COUNT(*) AS total_recipients
             FROM message_recipients
             WHERE campaign_id = ?",
            [$campaignId]
        );
        $queued = (int) ($counts['queued_count'] ?? 0);
        $sent = (int) ($counts['sent_count'] ?? 0);
        $failed = (int) ($counts['failed_count'] ?? 0);
        $total = (int) ($counts['total_recipients'] ?? 0);

        $campaign = Database::row('SELECT mode, dispatched_at FROM message_campaigns WHERE id = ?', [$campaignId]);
        $status = 'queued';
        if (!empty($campaign['dispatched_at']) && ($campaign['mode'] ?? '') !== 'mock') {
            if ($queued === 0 && $total > 0) {
                $status = $failed === $total ? 'failed' : 'completed';
            } elseif ($sent > 0 || $failed > 0) {
                $status = 'processing';
            }
        }

        Database::run(
            'UPDATE message_campaigns
             SET queued_count = ?, sent_count = ?, failed_count = ?, total_recipients = ?, status = ?, updated_at = NOW()
             WHERE id = ?',
            [$queued, $sent, $failed, $total, $status, $campaignId]
        );
    }
}
