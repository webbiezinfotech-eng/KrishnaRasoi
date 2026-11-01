<?php
/**
 * Reusable message templates stored in the local database.
 * Lets the client pick a ready-made template instead of typing every time.
 * Placeholders: {{name}}, {{guest_house}}, {{room}}, {{dates}}, {{amount}}, {{offer}}
 */
class MessageTemplateService
{
    private static bool $schemaReady = false;

    public static function ensureSchema(): void
    {
        if (self::$schemaReady) return;
        self::$schemaReady = true;

        try {
            Database::run(
                "CREATE TABLE IF NOT EXISTS `message_templates` (
                  `id`         INT UNSIGNED  NOT NULL AUTO_INCREMENT,
                  `name`       VARCHAR(120)  NOT NULL,
                  `body`       TEXT          NOT NULL,
                  `channel`    ENUM('whatsapp','sms') NOT NULL DEFAULT 'whatsapp',
                  `is_active`  TINYINT(1)    NOT NULL DEFAULT 1,
                  `created_by` INT UNSIGNED  DEFAULT NULL,
                  `created_at` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  `updated_at` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  PRIMARY KEY (`id`),
                  UNIQUE KEY `uq_message_templates_name` (`name`),
                  KEY `idx_message_templates_active` (`is_active`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
            );
            $count = (int) Database::value('SELECT COUNT(*) FROM message_templates');
            if ($count === 0) {
                self::seedDefaults();
            }
        } catch (Throwable $e) {
            error_log('MessageTemplateService schema: ' . $e->getMessage());
        }
    }

    private static function seedDefaults(): void
    {
        $defaults = [
            ['Booking Confirmation', 'Hello {{name}}, your booking at {{guest_house}} is confirmed. Room: {{room}}, dates: {{dates}}. We look forward to hosting you!'],
            ['Welcome / Check-in',   'Welcome {{name}}! Thank you for choosing {{guest_house}}. Your room {{room}} is ready. For any assistance, just reply to this message.'],
            ['Payment Reminder',     'Dear {{name}}, a payment of {{amount}} is pending for your stay at {{guest_house}}. Kindly clear the balance at your convenience. Thank you!'],
            ['Festival Greeting',    'Hello {{name}}! Wishing you and your family happiness and prosperity from all of us at {{guest_house}}.'],
            ['Offer / Promotion',    'Hello {{name}}! Special offer at {{guest_house}}: {{offer}}. Rooms are limited — book soon!'],
            ['Check-out Thank You',  'Thank you for staying with us, {{name}}! We hope you had a pleasant experience at {{guest_house}}. Visit us again soon!'],
        ];
        $stmt = Database::get()->prepare(
            'INSERT IGNORE INTO message_templates (name, body, channel, is_active, created_by) VALUES (?, ?, ?, 1, NULL)'
        );
        foreach ($defaults as [$name, $body]) {
            $stmt->execute([$name, $body, 'whatsapp']);
        }
    }

    public static function listAll(?string $channel = null): array
    {
        self::ensureSchema();
        $params = [];
        $where = 'is_active = 1';
        if ($channel && in_array($channel, ['whatsapp', 'sms'], true)) {
            $where .= ' AND (channel = ? OR channel IS NULL)';
            $params[] = $channel;
        }
        return Database::all(
            "SELECT id, name, body, channel, is_active, created_at FROM message_templates WHERE $where ORDER BY id ASC",
            $params
        );
    }

    public static function create(array $input, int $adminId): array
    {
        self::ensureSchema();
        $name = trim((string) ($input['name'] ?? ''));
        $body = trim((string) ($input['body'] ?? ''));
        $channel = in_array($input['channel'] ?? '', ['whatsapp', 'sms'], true) ? $input['channel'] : 'whatsapp';
        if ($name === '' || $body === '') {
            Response::unprocessable('Validation failed.', ['name' => ['Template name and body are required.']]);
        }
        if (mb_strlen($name) > 120) {
            Response::unprocessable('Validation failed.', ['name' => ['Template name must not exceed 120 characters.']]);
        }
        if (mb_strlen($body) > 2000) {
            Response::unprocessable('Validation failed.', ['body' => ['Template body must not exceed 2000 characters.']]);
        }
        $exists = Database::value('SELECT COUNT(*) FROM message_templates WHERE name = ?', [$name]);
        if ((int) $exists > 0) {
            Response::error("A template named \"{$name}\" already exists.", 409);
        }
        Database::run(
            'INSERT INTO message_templates (name, body, channel, is_active, created_by) VALUES (?, ?, ?, 1, ?)',
            [$name, $body, $channel, $adminId]
        );
        $id = Database::lastId();
        return Database::row('SELECT id, name, body, channel, is_active, created_at FROM message_templates WHERE id = ?', [$id]);
    }

    public static function update(int $id, array $input, int $adminId): ?array
    {
        self::ensureSchema();
        $row = Database::row('SELECT * FROM message_templates WHERE id = ?', [$id]);
        if (!$row) return null;
        $body = trim((string) ($input['body'] ?? $row['body']));
        if ($body === '') $body = $row['body'];
        if (mb_strlen($body) > 2000) {
            Response::unprocessable('Validation failed.', ['body' => ['Template body must not exceed 2000 characters.']]);
        }
        $name = trim((string) ($input['name'] ?? $row['name']));
        if ($name !== $row['name']) {
            $dup = Database::value('SELECT COUNT(*) FROM message_templates WHERE name = ? AND id <> ?', [$name, $id]);
            if ((int) $dup > 0) Response::error("A template named \"{$name}\" already exists.", 409);
        }
        Database::run('UPDATE message_templates SET name = ?, body = ? WHERE id = ?', [$name, $body, $id]);
        return Database::row('SELECT id, name, body, channel, is_active, created_at FROM message_templates WHERE id = ?', [$id]);
    }

    public static function delete(int $id): bool
    {
        self::ensureSchema();
        $n = Database::value('UPDATE message_templates SET is_active = 0 WHERE id = ?', [$id])->rowCount();
        return $n > 0;
    }
}
