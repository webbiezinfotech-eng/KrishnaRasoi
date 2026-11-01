-- Zaptilo WhatsApp: extend unified customers + message logs
SET NAMES utf8mb4;

ALTER TABLE `customers`
  ADD COLUMN IF NOT EXISTS `contact_type` VARCHAR(20) NOT NULL DEFAULT 'CUSTOMER' AFTER `mobile_normalized`,
  ADD COLUMN IF NOT EXISTS `is_active` TINYINT(1) NOT NULL DEFAULT 1 AFTER `contact_type`;

ALTER TABLE `message_recipients`
  ADD COLUMN IF NOT EXISTS `provider_response` TEXT NULL AFTER `error_message`;

CREATE TABLE IF NOT EXISTS `message_logs` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
