<?php
/**
 * Campaign create / recipient resolution / confirmation lock.
 */
class CampaignService
{
    public static function create(array $input, int $adminId): array
    {
        CustomerService::ensureSchema();

        $channel = strtolower(trim((string) ($input['channel'] ?? '')));
        if (!in_array($channel, ['whatsapp', 'sms'], true)) {
            Response::unprocessable('Validation failed.', ['channel' => ['Channel must be WhatsApp or SMS.']]);
        }

        $body = trim((string) ($input['message_body'] ?? $input['message'] ?? ''));
        if ($body === '') {
            Response::unprocessable('Validation failed.', ['message_body' => ['Message is required.']]);
        }
        if (mb_strlen($body) > 2000) {
            Response::unprocessable('Validation failed.', ['message_body' => ['Message must not exceed 2000 characters.']]);
        }

        $idempotencyKey = trim((string) ($input['idempotency_key'] ?? ''));
        if ($idempotencyKey !== '') {
            if (mb_strlen($idempotencyKey) > 64) {
                Response::unprocessable('Validation failed.', ['idempotency_key' => ['Idempotency key is too long.']]);
            }
            $existing = Database::row(
                'SELECT * FROM message_campaigns WHERE idempotency_key = ? LIMIT 1',
                [$idempotencyKey]
            );
            if ($existing) {
                return self::formatCampaign($existing, true);
            }
        } else {
            $idempotencyKey = null;
        }

        $resolved = self::resolveCustomers($input, $channel);
        $customers = $resolved['customers'];
        $skipped = $resolved['skipped'];
        if (empty($customers)) {
            Response::error('No eligible customers to message. Check selection and consent.', 422);
        }

        $name = trim((string) ($input['name'] ?? ''));
        if ($name === '') {
            $name = ucfirst($channel) . ' · ' . date('d M Y H:i');
        }
        $name = mb_substr($name, 0, 150);

        $mode = MessagingService::isMockMode() ? 'mock' : 'live';
        $now = date('Y-m-d H:i:s');

        Database::begin();
        try {
            Database::run(
                'INSERT INTO message_campaigns
                 (name, channel, message_body, status, mode, total_recipients, queued_count, sent_count, failed_count, skipped_count,
                  idempotency_key, created_by, template_name, template_language, template_parameters)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?)',
                [
                    $name,
                    $channel,
                    $body,
                    'draft',
                    $mode,
                    count($customers),
                    count($customers),
                    $skipped,
                    $idempotencyKey,
                    $adminId,
                    self::nullableString($input['template_name'] ?? null),
                    self::nullableString($input['template_language'] ?? null),
                    isset($input['template_parameters']) && is_array($input['template_parameters'])
                        ? json_encode($input['template_parameters'], JSON_UNESCAPED_UNICODE)
                        : null,
                ]
            );
            $campaignId = Database::lastId();

            $stmt = Database::get()->prepare(
                'INSERT INTO message_recipients
                 (campaign_id, customer_id, channel, recipient_name, recipient_mobile, personalized_message, status, queued_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
            );
            foreach ($customers as $c) {
                $personalized = MessagePersonalizer::apply($body, $c['name'] ?? null);
                $stmt->execute([
                    $campaignId,
                    (int) $c['id'],
                    $channel,
                    $c['name'] ?: null,
                    $c['mobile_number'],
                    $personalized,
                    'queued',
                    $now,
                ]);
            }

            Database::commit();
        } catch (Throwable $e) {
            Database::rollback();
            if (self::isDuplicateKey($e) && $idempotencyKey) {
                $existing = Database::row(
                    'SELECT * FROM message_campaigns WHERE idempotency_key = ? LIMIT 1',
                    [$idempotencyKey]
                );
                if ($existing) {
                    return self::formatCampaign($existing, true);
                }
            }
            Response::serverError('Failed to create campaign.');
        }

        $campaign = Database::row('SELECT * FROM message_campaigns WHERE id = ?', [$campaignId]);
        return self::formatCampaign($campaign, true);
    }

    public static function get(int $id): ?array
    {
        CustomerService::ensureSchema();
        $row = Database::row('SELECT * FROM message_campaigns WHERE id = ?', [$id]);
        return $row ?: null;
    }

    public static function formatCampaign(array $row, bool $withPreview = false): array
    {
        $data = [
            'id'                  => (int) $row['id'],
            'name'                => $row['name'],
            'channel'             => $row['channel'],
            'message_body'        => $row['message_body'],
            'status'              => $row['status'],
            'mode'                => $row['mode'],
            'total_recipients'    => (int) $row['total_recipients'],
            'queued_count'        => (int) $row['queued_count'],
            'sent_count'          => (int) $row['sent_count'],
            'failed_count'        => (int) $row['failed_count'],
            'skipped_count'       => (int) ($row['skipped_count'] ?? 0),
            'dispatched_at'       => $row['dispatched_at'],
            'created_by'          => $row['created_by'] !== null ? (int) $row['created_by'] : null,
            'created_at'          => $row['created_at'],
            'updated_at'          => $row['updated_at'],
            'development_mode'    => ($row['mode'] ?? '') === 'mock',
        ];
        if ($withPreview) {
            $first = Database::row(
                'SELECT recipient_name, personalized_message FROM message_recipients WHERE campaign_id = ? ORDER BY id ASC LIMIT 1',
                [(int) $row['id']]
            );
            $data['preview'] = $first['personalized_message'] ?? MessagePersonalizer::preview($row['message_body'], null);
            $data['preview_name'] = $first['recipient_name'] ?? null;
        }
        return $data;
    }

    /**
     * @return array{customers: array<int, array>, skipped: int}
     */
    public static function resolveCustomers(array $input, string $channel): array
    {
        $selectAll = !empty($input['select_all']);
        $search = trim((string) ($input['search'] ?? ''));
        $exclude = self::intList($input['exclude_ids'] ?? []);
        $ids = self::intList($input['customer_ids'] ?? []);

        if (!$selectAll && empty($ids)) {
            Response::unprocessable('Validation failed.', ['customer_ids' => ['Select at least one customer.']]);
        }

        $max = MESSAGING_MAX_RECIPIENTS;
        if (count($ids) > $max) {
            Response::error("Cannot message more than {$max} customers at once.", 422);
        }
        if (count($exclude) > $max) {
            Response::error('Selection is too large.', 422);
        }

        $consentCol = $channel === 'sms' ? 'sms_opt_in' : 'whatsapp_opt_in';
        $params = [];
        $where = ["`$consentCol` = 1", 'is_active = 1'];

        if ($selectAll) {
            if ($search !== '') {
                $where[] = '(name LIKE ? OR mobile_number LIKE ? OR mobile_normalized LIKE ?)';
                $like = '%' . self::like($search) . '%';
                $params[] = $like;
                $params[] = $like;
                $norm = CustomerService::normalizeMobile($search);
                $params[] = $norm ? '%' . $norm . '%' : $like;
            }
            if (!empty($exclude)) {
                $placeholders = implode(',', array_fill(0, count($exclude), '?'));
                $where[] = "id NOT IN ($placeholders)";
                array_push($params, ...$exclude);
            }
        } else {
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $where[] = "id IN ($placeholders)";
            array_push($params, ...$ids);
        }

        $sql = 'SELECT id, name, mobile_number, mobile_normalized, whatsapp_opt_in, sms_opt_in
                FROM customers
                WHERE ' . implode(' AND ', $where) . '
                ORDER BY name IS NULL, name ASC, id ASC
                LIMIT ' . ((int) $max + 1);

        $rows = Database::all($sql, $params);
        if (count($rows) > $max) {
            Response::error("Cannot message more than {$max} customers at once.", 422);
        }

        $skipped = 0;
        if (!$selectAll && count($ids) > count($rows)) {
            $skipped = count($ids) - count($rows);
        }

        return ['customers' => $rows, 'skipped' => $skipped];
    }

    public static function previewPayload(array $input): array
    {
        $channel = strtolower(trim((string) ($input['channel'] ?? 'whatsapp')));
        if (!in_array($channel, ['whatsapp', 'sms'], true)) {
            $channel = 'whatsapp';
        }
        $body = (string) ($input['message_body'] ?? $input['message'] ?? '');
        $name = $input['preview_name'] ?? null;

        if ($name === null) {
            $ids = self::intList($input['customer_ids'] ?? []);
            if (!empty($ids)) {
                $row = Database::row('SELECT name FROM customers WHERE id = ?', [$ids[0]]);
                $name = $row['name'] ?? null;
            }
        }

        return [
            'channel'          => $channel,
            'preview'          => MessagePersonalizer::preview($body, $name),
            'preview_name'     => $name,
            'uses_placeholder' => str_contains($body, '{{name}}'),
            'mode'             => MessagingService::isMockMode() ? 'mock' : 'live',
        ];
    }

    /** @return int[] */
    public static function intList(mixed $value): array
    {
        if (!is_array($value)) {
            return [];
        }
        $out = [];
        foreach ($value as $item) {
            if (is_numeric($item) && (int) $item > 0) {
                $out[] = (int) $item;
            }
        }
        return array_values(array_unique($out));
    }

    private static function like(string $q): string
    {
        return str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $q);
    }

    private static function nullableString(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }
        $s = trim((string) $value);
        return $s === '' ? null : $s;
    }

    private static function isDuplicateKey(Throwable $e): bool
    {
        $msg = $e->getMessage();
        return str_contains($msg, 'Duplicate') || str_contains($msg, '1062');
    }
}
