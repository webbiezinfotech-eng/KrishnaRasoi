<?php
/**
 * Unified customer/contact store.
 * Deduplicates by normalised mobile number. Safe to call from other modules.
 */
class CustomerService
{
    private static bool $schemaReady = false;
    private static bool $importedExisting = false;

    public static function ensureSchema(): void
    {
        if (self::$schemaReady) {
            return;
        }
        self::$schemaReady = true;

        try {
            $createdCustomers = !self::tableExists('customers');

            Database::run(
                "CREATE TABLE IF NOT EXISTS `customers` (
                  `id`                  INT UNSIGNED     NOT NULL AUTO_INCREMENT,
                  `name`                VARCHAR(100)     DEFAULT NULL,
                  `mobile_number`       VARCHAR(20)      NOT NULL,
                  `mobile_normalized`   VARCHAR(15)      NOT NULL,
                  `whatsapp_opt_in`     TINYINT(1)       NOT NULL DEFAULT 1,
                  `sms_opt_in`          TINYINT(1)       NOT NULL DEFAULT 1,
                  `created_at`          DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  `updated_at`          DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  PRIMARY KEY (`id`),
                  UNIQUE KEY `uq_customers_mobile_normalized` (`mobile_normalized`),
                  KEY `idx_customers_name` (`name`),
                  KEY `idx_customers_mobile` (`mobile_number`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
            );

            Database::run(
                "CREATE TABLE IF NOT EXISTS `message_campaigns` (
                  `id`                   INT UNSIGNED     NOT NULL AUTO_INCREMENT,
                  `name`                 VARCHAR(150)     NOT NULL,
                  `channel`              ENUM('whatsapp','sms') NOT NULL,
                  `message_body`         TEXT             NOT NULL,
                  `status`               ENUM('draft','queued','processing','completed','failed','cancelled') NOT NULL DEFAULT 'draft',
                  `mode`                 VARCHAR(20)      NOT NULL DEFAULT 'mock',
                  `total_recipients`     INT UNSIGNED     NOT NULL DEFAULT 0,
                  `queued_count`         INT UNSIGNED     NOT NULL DEFAULT 0,
                  `sent_count`           INT UNSIGNED     NOT NULL DEFAULT 0,
                  `failed_count`         INT UNSIGNED     NOT NULL DEFAULT 0,
                  `skipped_count`        INT UNSIGNED     NOT NULL DEFAULT 0,
                  `idempotency_key`      VARCHAR(64)      DEFAULT NULL,
                  `dispatched_at`        DATETIME         DEFAULT NULL,
                  `created_by`           INT UNSIGNED     DEFAULT NULL,
                  `template_name`        VARCHAR(120)     DEFAULT NULL,
                  `template_language`    VARCHAR(20)      DEFAULT NULL,
                  `template_parameters`  JSON             DEFAULT NULL,
                  `created_at`           DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  `updated_at`           DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  PRIMARY KEY (`id`),
                  UNIQUE KEY `uq_campaigns_idempotency` (`idempotency_key`),
                  KEY `idx_campaigns_status` (`status`),
                  KEY `idx_campaigns_created` (`created_at`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
            );

            Database::run(
                "CREATE TABLE IF NOT EXISTS `message_recipients` (
                  `id`                    INT UNSIGNED     NOT NULL AUTO_INCREMENT,
                  `campaign_id`           INT UNSIGNED     NOT NULL,
                  `customer_id`           INT UNSIGNED     DEFAULT NULL,
                  `channel`               ENUM('whatsapp','sms') NOT NULL,
                  `recipient_name`        VARCHAR(100)     DEFAULT NULL,
                  `recipient_mobile`      VARCHAR(20)      NOT NULL,
                  `personalized_message`  TEXT             NOT NULL,
                  `status`                ENUM('queued','processing','sent','failed') NOT NULL DEFAULT 'queued',
                  `provider_message_id`   VARCHAR(120)     DEFAULT NULL,
                  `error_message`         VARCHAR(500)     DEFAULT NULL,
                  `queued_at`             DATETIME         DEFAULT NULL,
                  `sent_at`               DATETIME         DEFAULT NULL,
                  `created_at`            DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  PRIMARY KEY (`id`),
                  KEY `idx_recipients_campaign` (`campaign_id`),
                  KEY `idx_recipients_status` (`status`),
                  KEY `idx_recipients_customer` (`customer_id`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
            );

            self::ensureExtraColumns();
            self::ensureMessageLogsTable();

            if ($createdCustomers) {
                self::importExistingGuestContacts();
            } else {
                $count = (int) Database::value('SELECT COUNT(*) FROM customers');
                if ($count === 0) {
                    self::importExistingGuestContacts();
                }
            }
        } catch (Throwable $e) {
            error_log('CustomerService schema: ' . $e->getMessage());
        }
    }

    /**
     * Insert or update by normalised mobile. Never throws — existing workflows must not break.
     *
     * @param bool $overwriteName When true, replace the stored name if a new non-empty name is given.
     */
    public static function upsertFromContact(?string $name, ?string $mobile, bool $overwriteName = false, string $contactType = 'CUSTOMER'): ?array
    {
        try {
            self::ensureSchema();
            $mobile = trim((string) $mobile);
            $normalized = self::normalizeMobile($mobile);
            if ($normalized === null) {
                return null;
            }

            $display = $mobile !== '' ? mb_substr($mobile, 0, 20) : $normalized;
            $cleanName = trim((string) $name);
            if ($cleanName === '') {
                $cleanName = null;
            } else {
                $cleanName = mb_substr($cleanName, 0, 100);
            }
            $contactType = self::normalizeContactType($contactType);

            $existing = Database::row(
                'SELECT * FROM customers WHERE mobile_normalized = ? LIMIT 1',
                [$normalized]
            );

            if ($existing) {
                $newName = $existing['name'];
                if ($cleanName !== null) {
                    if ($overwriteName || $existing['name'] === null || trim((string) $existing['name']) === '') {
                        $newName = $cleanName;
                    }
                }
                $type = !empty($existing['contact_type']) ? $existing['contact_type'] : $contactType;
                Database::run(
                    'UPDATE customers SET name = ?, mobile_number = ?, contact_type = ?, is_active = 1, updated_at = NOW() WHERE id = ?',
                    [$newName, $display, $type, (int) $existing['id']]
                );
                return Database::row('SELECT * FROM customers WHERE id = ?', [(int) $existing['id']]);
            }

            Database::run(
                'INSERT INTO customers (name, mobile_number, mobile_normalized, contact_type, is_active, whatsapp_opt_in, sms_opt_in)
                 VALUES (?, ?, ?, ?, 1, 1, 1)',
                [$cleanName, $display, $normalized, $contactType]
            );
            return Database::row('SELECT * FROM customers WHERE id = ?', [Database::lastId()]);
        } catch (Throwable $e) {
            error_log('Customer upsert skipped: ' . $e->getMessage());
            return null;
        }
    }

    public static function normalizeMobile(string $raw): ?string
    {
        $digits = preg_replace('/\D+/', '', $raw) ?? '';
        if ($digits === '') {
            return null;
        }
        if (strlen($digits) >= 12 && str_starts_with($digits, '91')) {
            $digits = substr($digits, -10);
        } elseif (strlen($digits) === 11 && str_starts_with($digits, '0')) {
            $digits = substr($digits, 1);
        } elseif (strlen($digits) > 10) {
            $digits = substr($digits, -10);
        }
        $len = strlen($digits);
        if ($len < 10 || $len > 15) {
            return null;
        }
        return $digits;
    }

    /** Zaptilo expects country code + number, e.g. 9198XXXXXXXX */
    public static function toWhatsAppNumber(string $raw): ?string
    {
        $normalized = self::normalizeMobile($raw);
        if ($normalized === null) {
            return null;
        }
        if (strlen($normalized) === 10) {
            return '91' . $normalized;
        }
        if (strlen($normalized) === 12 && str_starts_with($normalized, '91')) {
            return $normalized;
        }
        return strlen($normalized) >= 10 ? $normalized : null;
    }

    public static function normalizeContactType(string $type): string
    {
        $type = strtoupper(trim($type));
        return in_array($type, ['CUSTOMER', 'GUEST_HOUSE', 'OTHER'], true) ? $type : 'CUSTOMER';
    }

    public static function formatRow(array $row): array
    {
        return [
            'id'              => (int) $row['id'],
            'name'            => $row['name'] !== null && $row['name'] !== '' ? $row['name'] : null,
            'mobile_number'   => $row['mobile_number'],
            'phone'           => $row['mobile_number'],
            'contact_type'    => self::normalizeContactType((string) ($row['contact_type'] ?? 'CUSTOMER')),
            'is_active'       => !isset($row['is_active']) || (int) $row['is_active'] === 1,
            'whatsapp_opt_in' => (bool) (int) $row['whatsapp_opt_in'],
            'sms_opt_in'      => (bool) (int) $row['sms_opt_in'],
            'created_at'      => $row['created_at'],
            'updated_at'      => $row['updated_at'],
        ];
    }

    public static function find(int $id): ?array
    {
        self::ensureSchema();
        $row = Database::row('SELECT * FROM customers WHERE id = ?', [$id]);
        return $row ?: null;
    }

    public static function importExistingGuestContacts(): void
    {
        if (self::$importedExisting) {
            return;
        }
        self::$importedExisting = true;
        try {
            if (!self::tableExists('guest_house_guests')) {
                return;
            }
            $known = Database::all('SELECT mobile_normalized FROM customers');
            $have = [];
            foreach ($known as $row) {
                $have[$row['mobile_normalized']] = true;
            }
            $rows = Database::all(
                'SELECT guest_name, phone FROM guest_house_guests
                 WHERE phone IS NOT NULL AND phone != \'\'
                 ORDER BY id ASC
                 LIMIT 2000'
            );
            foreach ($rows as $row) {
                $norm = self::normalizeMobile((string) ($row['phone'] ?? ''));
                if ($norm === null || isset($have[$norm])) {
                    continue;
                }
                $saved = self::upsertFromContact($row['guest_name'] ?? null, $row['phone'] ?? null, false, 'GUEST_HOUSE');
                if ($saved) {
                    $have[$norm] = true;
                }
            }
        } catch (Throwable $e) {
            error_log('Customer backfill skipped: ' . $e->getMessage());
        }
    }

    private static function ensureExtraColumns(): void
    {
        self::addColumnIfMissing('customers', 'contact_type', "ALTER TABLE customers ADD COLUMN contact_type VARCHAR(20) NOT NULL DEFAULT 'CUSTOMER' AFTER mobile_normalized");
        self::addColumnIfMissing('customers', 'is_active', "ALTER TABLE customers ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER contact_type");
        self::addColumnIfMissing('message_recipients', 'provider_response', "ALTER TABLE message_recipients ADD COLUMN provider_response TEXT NULL AFTER error_message");
        try {
            $len = Database::value(
                "SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'message_recipients' AND COLUMN_NAME = 'error_message'"
            );
            if ($len !== null && (int) $len < 500) {
                Database::run('ALTER TABLE message_recipients MODIFY COLUMN error_message VARCHAR(500) DEFAULT NULL');
            }
        } catch (Throwable $e) {
            error_log('Schema error_message widen: ' . $e->getMessage());
        }
    }

    private static function ensureMessageLogsTable(): void
    {
        Database::run(
            "CREATE TABLE IF NOT EXISTS `message_logs` (
              `id`                 INT UNSIGNED     NOT NULL AUTO_INCREMENT,
              `contact_id`         INT UNSIGNED     DEFAULT NULL,
              `channel`            VARCHAR(20)      NOT NULL DEFAULT 'whatsapp',
              `message`            TEXT             NOT NULL,
              `status`             VARCHAR(20)      NOT NULL DEFAULT 'PENDING',
              `provider`           VARCHAR(40)      DEFAULT NULL,
              `provider_response`  TEXT             DEFAULT NULL,
              `sent_at`            DATETIME         DEFAULT NULL,
              `created_at`         DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (`id`),
              KEY `idx_message_logs_contact` (`contact_id`),
              KEY `idx_message_logs_status` (`status`),
              KEY `idx_message_logs_created` (`created_at`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        );
    }

    private static function addColumnIfMissing(string $table, string $column, string $sql): void
    {
        try {
            $col = Database::value(
                'SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
                [$table, $column]
            );
            if ((int) $col === 0) {
                Database::run($sql);
            }
        } catch (Throwable $e) {
            error_log("Schema column {$table}.{$column}: " . $e->getMessage());
        }
    }

    private static function tableExists(string $table): bool
    {
        try {
            $exists = Database::value(
                'SELECT COUNT(*) FROM information_schema.TABLES
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
                [$table]
            );
            return (int) $exists > 0;
        } catch (Throwable $e) {
            return false;
        }
    }
}
