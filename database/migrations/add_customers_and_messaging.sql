-- ================================================================
-- Phase 1: Unified customers + bulk messaging (provider-agnostic)
-- Run on existing databases. Safe to re-run (IF NOT EXISTS).
-- ================================================================

SET NAMES utf8mb4;

-- ----------------------------------------------------------------
-- customers — one contact list for restaurant + guest house + manual
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `customers` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------
-- message_campaigns
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `message_campaigns` (
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
  KEY `idx_campaigns_created` (`created_at`),
  CONSTRAINT `fk_campaigns_created_by` FOREIGN KEY (`created_by`) REFERENCES `admin_users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------
-- message_recipients — queue + per-contact log
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `message_recipients` (
  `id`                    INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  `campaign_id`           INT UNSIGNED     NOT NULL,
  `customer_id`           INT UNSIGNED     DEFAULT NULL,
  `channel`               ENUM('whatsapp','sms') NOT NULL,
  `recipient_name`        VARCHAR(100)     DEFAULT NULL,
  `recipient_mobile`      VARCHAR(20)      NOT NULL,
  `personalized_message`  TEXT             NOT NULL,
  `status`                ENUM('queued','processing','sent','failed') NOT NULL DEFAULT 'queued',
  `provider_message_id`   VARCHAR(120)     DEFAULT NULL,
  `error_message`         VARCHAR(255)     DEFAULT NULL,
  `queued_at`             DATETIME         DEFAULT NULL,
  `sent_at`               DATETIME         DEFAULT NULL,
  `created_at`            DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_recipients_campaign` (`campaign_id`),
  KEY `idx_recipients_status` (`status`),
  KEY `idx_recipients_customer` (`customer_id`),
  CONSTRAINT `fk_recipients_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `message_campaigns` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_recipients_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
