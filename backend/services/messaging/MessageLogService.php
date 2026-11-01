<?php
class MessageLogService
{
    public static function listCampaigns(int $page, int $perPage): array
    {
        CustomerService::ensureSchema();
        $page = max(1, $page);
        $perPage = Helper::clamp($perPage, 1, 100);
        $offset = ($page - 1) * $perPage;

        $total = (int) Database::value('SELECT COUNT(*) FROM message_campaigns');
        $rows = Database::all(
            'SELECT c.*, u.full_name AS created_by_name
             FROM message_campaigns c
             LEFT JOIN admin_users u ON u.id = c.created_by
             ORDER BY c.id DESC
             LIMIT ' . (int) $perPage . ' OFFSET ' . (int) $offset
        );

        $data = [];
        foreach ($rows as $row) {
            $item = CampaignService::formatCampaign($row);
            $item['created_by_name'] = $row['created_by_name'] ?? null;
            $data[] = $item;
        }

        return [
            'campaigns'  => $data,
            'pagination' => Helper::paginate($total, $page, $perPage),
        ];
    }

    public static function listRecipients(int $campaignId, int $page, int $perPage, ?string $status = null): array
    {
        CustomerService::ensureSchema();
        $page = max(1, $page);
        $perPage = Helper::clamp($perPage, 1, 200);
        $offset = ($page - 1) * $perPage;

        $params = [$campaignId];
        $where = 'campaign_id = ?';
        if ($status && in_array($status, ['queued', 'processing', 'sent', 'failed'], true)) {
            $where .= ' AND status = ?';
            $params[] = $status;
        }

        $total = (int) Database::value(
            "SELECT COUNT(*) FROM message_recipients WHERE $where",
            $params
        );
        $rows = Database::all(
            "SELECT id, campaign_id, customer_id, channel, recipient_name, recipient_mobile,
                    personalized_message, status, provider_message_id, error_message,
                    queued_at, sent_at, created_at
             FROM message_recipients
             WHERE $where
             ORDER BY id ASC
             LIMIT " . (int) $perPage . ' OFFSET ' . (int) $offset,
            $params
        );

        foreach ($rows as &$row) {
            $row['id'] = (int) $row['id'];
            $row['campaign_id'] = (int) $row['campaign_id'];
            $row['customer_id'] = $row['customer_id'] !== null ? (int) $row['customer_id'] : null;
        }
        unset($row);

        return [
            'recipients' => $rows,
            'pagination' => Helper::paginate($total, $page, $perPage),
        ];
    }

    public static function record(
        ?int $contactId,
        string $channel,
        string $message,
        string $status,
        string $provider,
        mixed $providerResponse = null
    ): void {
        try {
            CustomerService::ensureSchema();
            $status = strtoupper($status);
            if (!in_array($status, ['PENDING', 'SENT', 'FAILED'], true)) {
                $status = 'PENDING';
            }
            $safe = '';
            if (is_array($providerResponse)) {
                $safe = json_encode(ZaptiloWhatsAppService::sanitizeResponse($providerResponse), JSON_UNESCAPED_UNICODE);
            } elseif (is_string($providerResponse) && $providerResponse !== '') {
                $safe = mb_substr($providerResponse, 0, 1000);
            }
            Database::run(
                'INSERT INTO message_logs (contact_id, channel, message, status, provider, provider_response, sent_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)',
                [
                    $contactId,
                    $channel,
                    $message,
                    $status,
                    $provider,
                    $safe ?: null,
                    $status === 'SENT' ? date('Y-m-d H:i:s') : null,
                ]
            );
        } catch (Throwable $e) {
            error_log('message_logs write skipped: ' . $e->getMessage());
        }
    }

    public static function listLogs(int $page, int $perPage, ?string $status = null): array
    {
        CustomerService::ensureSchema();
        $page = max(1, $page);
        $perPage = Helper::clamp($perPage, 1, 100);
        $offset = ($page - 1) * $perPage;
        $params = [];
        $where = '1=1';
        if ($status) {
            $where .= ' AND status = ?';
            $params[] = strtoupper($status);
        }
        $total = (int) Database::value("SELECT COUNT(*) FROM message_logs WHERE $where", $params);
        $rows = Database::all(
            "SELECT l.*, c.name AS contact_name, c.mobile_number
             FROM message_logs l
             LEFT JOIN customers c ON c.id = l.contact_id
             WHERE $where
             ORDER BY l.id DESC
             LIMIT " . (int) $perPage . ' OFFSET ' . (int) $offset,
            $params
        );
        foreach ($rows as &$row) {
            $row['id'] = (int) $row['id'];
            $row['contact_id'] = $row['contact_id'] !== null ? (int) $row['contact_id'] : null;
            if (!empty($row['provider_response']) && is_string($row['provider_response'])) {
                $decoded = json_decode($row['provider_response'], true);
                $row['provider_response'] = is_array($decoded) ? $decoded : $row['provider_response'];
            }
        }
        unset($row);
        return [
            'logs'       => $rows,
            'pagination' => Helper::paginate($total, $page, $perPage),
        ];
    }
}
