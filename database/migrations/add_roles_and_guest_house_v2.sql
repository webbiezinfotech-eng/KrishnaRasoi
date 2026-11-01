-- ================================================================
-- Migration: Roles (Reception/Manager) + Guest House v2 + WhatsApp v2
-- Run on existing databases. Safe to re-run where possible.
-- MySQL note: ENUM MODIFY re-runs fine; column ADDs use IF NOT EXISTS.
-- ================================================================

SET NAMES utf8mb4;

-- ----------------------------------------------------------------
-- 1. Extended roles: admin / manager / reception / waiter
--    Passwords: Reception@1234 / Manager@1234
-- ----------------------------------------------------------------
ALTER TABLE `admin_users`
  MODIFY COLUMN `role` ENUM('admin','manager','reception','waiter') NOT NULL DEFAULT 'admin';

INSERT INTO `admin_users` (`username`, `email`, `password_hash`, `full_name`, `role`, `is_active`)
VALUES
  ('reception', 'reception@restaurant.com', '$2b$12$UqhzCk79fqmXmUcULGVFgeFoXz/pZUNq/WjaYwtD56c2GQhKA7yQi', 'Reception', 'reception', 1),
  ('manager',   'manager@restaurant.com',   '$2b$12$U5Sc7q6ZvYJwyPtf./6Cy.prtj/GhO/VawexywY7OIPrZ0E7sUYXO', 'Manager',   'manager',   1)
ON DUPLICATE KEY UPDATE
  `role` = VALUES(`role`),
  `is_active` = 1;

-- ----------------------------------------------------------------
-- 2. Room Management: rent + cleaning/maintenance status
-- ----------------------------------------------------------------
ALTER TABLE `guest_house_rooms`
  ADD COLUMN IF NOT EXISTS `rent` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `category_id`;

ALTER TABLE `guest_house_rooms`
  MODIFY COLUMN `status` ENUM('available','booked','cleaning','maintenance') NOT NULL DEFAULT 'available';

-- ----------------------------------------------------------------
-- 3. Guest Registration photos + Extra Bed
-- ----------------------------------------------------------------
ALTER TABLE `guest_house_guests`
  ADD COLUMN IF NOT EXISTS `id_proof_photo` LONGTEXT NULL AFTER `id_proof`,
  ADD COLUMN IF NOT EXISTS `guest_photo` LONGTEXT NULL AFTER `id_proof_photo`,
  ADD COLUMN IF NOT EXISTS `extra_bed_count` INT NOT NULL DEFAULT 0 AFTER `children_count`,
  ADD COLUMN IF NOT EXISTS `extra_bed_rate` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `extra_bed_count`;

-- ----------------------------------------------------------------
-- 4. Guest stay extra charges (Food / Laundry / Other) + payments ledger
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `guest_house_charges` (
  `id`          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `guest_id`    INT UNSIGNED  NOT NULL,
  `charge_type` ENUM('food','laundry','other') NOT NULL DEFAULT 'other',
  `description` VARCHAR(255)  DEFAULT NULL,
  `amount`      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `created_by`  INT UNSIGNED  DEFAULT NULL,
  `created_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_gh_charges_guest` (`guest_id`),
  CONSTRAINT `fk_gh_charges_guest`
    FOREIGN KEY (`guest_id`) REFERENCES `guest_house_guests` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `guest_house_payments` (
  `id`           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `guest_id`     INT UNSIGNED  NOT NULL,
  `amount`       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `payment_mode` VARCHAR(20)   NOT NULL DEFAULT 'cash',
  `note`         VARCHAR(255)  DEFAULT NULL,
  `created_by`   INT UNSIGNED  DEFAULT NULL,
  `created_at`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_gh_payments_guest` (`guest_id`),
  KEY `idx_gh_payments_created` (`created_at`),
  CONSTRAINT `fk_gh_payments_guest`
    FOREIGN KEY (`guest_id`) REFERENCES `guest_house_guests` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------
-- 5. Settings: guest house profile, GST, invoice, WhatsApp budget
-- ----------------------------------------------------------------
INSERT IGNORE INTO `settings` (`setting_key`, `setting_value`, `setting_group`, `label`, `input_type`, `sort_order`) VALUES
('guest_house_name',          'Krishna Guest House', 'general',  'Guest House Name',            'text',     6),
('business_logo',             '',                    'general',  'Logo (image URL)',            'text',     7),
('gst_number',                '',                    'billing',  'GST Number',                  'text',     5),
('gst_percentage',            '0.00',                'billing',  'GST Percentage (%)',          'number',   6),
('invoice_format',            'a4',                  'billing',  'Invoice Format (a4/thermal)', 'text',     7),
('extra_bed_charge',          '0.00',                'billing',  'Extra Bed Charge (per night)','number',   8),
-- ('whatsapp_monthly_budget',   '0.00',                'whatsapp', 'WhatsApp Monthly Budget (₹)', 'number',   1),
-- ('whatsapp_cost_per_message', '0.86',                'whatsapp', 'WhatsApp Cost per Message (₹)','number',  2);

-- ----------------------------------------------------------------
-- 6. WhatsApp v2: reusable message templates + cost tracking
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `message_templates` (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `message_recipients`
  ADD COLUMN IF NOT EXISTS `cost_amount` DECIMAL(10,4) NOT NULL DEFAULT 0.0000 AFTER `provider_response`;

ALTER TABLE `message_logs`
  ADD COLUMN IF NOT EXISTS `cost_amount` DECIMAL(10,4) NOT NULL DEFAULT 0.0000 AFTER `provider_response`;
