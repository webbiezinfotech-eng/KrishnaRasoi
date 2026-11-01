-- =====================================================================
-- Migration: v3 — Guest-house login, staff permissions, logo, room edit/delete
-- App: Restaurant + Kripa Shanti Guest House
-- Date: 2026-10-24
-- Safe to re-run on MySQL 5.7 / 8.x / MariaDB.
-- NOTE: MySQL 5.7 does not support "ADD COLUMN IF NOT EXISTS", so every
--       column is added through a stored-procedure guard below.
-- =====================================================================

SET NAMES utf8mb4;

DROP PROCEDURE IF EXISTS sp_add_column;
DELIMITER $$
CREATE PROCEDURE sp_add_column(IN p_table VARCHAR(64), IN p_column VARCHAR(64), IN p_sql TEXT)
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND COLUMN_NAME = p_column
    ) THEN
        SET @ddl = p_sql;
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END$$
DELIMITER ;

-- 1. Roles: add manager / reception to the enum (ignore error if already there)
ALTER TABLE `admin_users`
  MODIFY COLUMN `role` ENUM('admin','manager','reception','waiter') NOT NULL DEFAULT 'admin';

-- 2. Per-user module permissions (JSON array of permission keys)
CALL sp_add_column('admin_users', 'permissions',
  'ALTER TABLE `admin_users` ADD COLUMN `permissions` TEXT NULL AFTER `role`');

-- 3. Room status: cleaning / maintenance (v2 already did this when possible)
ALTER TABLE `guest_house_rooms`
  MODIFY COLUMN `status` ENUM('available','booked','cleaning','maintenance') NOT NULL DEFAULT 'available';

-- 4. Room rent per night
CALL sp_add_column('guest_house_rooms', 'rent',
  'ALTER TABLE `guest_house_rooms` ADD COLUMN `rent` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `room_type`');

-- 5. Guest stay fields (photos, extra bed, counts, companions)
CALL sp_add_column('guest_house_guests', 'adults_count',
  'ALTER TABLE `guest_house_guests` ADD COLUMN `adults_count` INT NOT NULL DEFAULT 1 AFTER `phone`');
CALL sp_add_column('guest_house_guests', 'children_count',
  'ALTER TABLE `guest_house_guests` ADD COLUMN `children_count` INT NOT NULL DEFAULT 0 AFTER `adults_count`');
CALL sp_add_column('guest_house_guests', 'companions',
  'ALTER TABLE `guest_house_guests` ADD COLUMN `companions` TEXT NULL AFTER `children_count`');
CALL sp_add_column('guest_house_guests', 'companions_id_details',
  'ALTER TABLE `guest_house_guests` ADD COLUMN `companions_id_details` TEXT NULL AFTER `companions`');
CALL sp_add_column('guest_house_guests', 'extra_bed_count',
  'ALTER TABLE `guest_house_guests` ADD COLUMN `extra_bed_count` INT NOT NULL DEFAULT 0 AFTER `companions_id_details`');
CALL sp_add_column('guest_house_guests', 'extra_bed_rate',
  'ALTER TABLE `guest_house_guests` ADD COLUMN `extra_bed_rate` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `extra_bed_count`');
CALL sp_add_column('guest_house_guests', 'id_proof_photo',
  'ALTER TABLE `guest_house_guests` ADD COLUMN `id_proof_photo` LONGTEXT NULL');
CALL sp_add_column('guest_house_guests', 'guest_photo',
  'ALTER TABLE `guest_house_guests` ADD COLUMN `guest_photo` LONGTEXT NULL');
CALL sp_add_column('guest_house_guests', 'payment_mode',
  "ALTER TABLE `guest_house_guests` ADD COLUMN `payment_mode` VARCHAR(20) NOT NULL DEFAULT 'cash' AFTER `id_proof`");
CALL sp_add_column('guest_house_guests', 'total_amount',
  'ALTER TABLE `guest_house_guests` ADD COLUMN `total_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00');
CALL sp_add_column('guest_house_guests', 'advance_amount',
  'ALTER TABLE `guest_house_guests` ADD COLUMN `advance_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00');
CALL sp_add_column('guest_house_guests', 'paid_amount',
  'ALTER TABLE `guest_house_guests` ADD COLUMN `paid_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00');
CALL sp_add_column('guest_house_guests', 'balance_amount',
  'ALTER TABLE `guest_house_guests` ADD COLUMN `balance_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00');
CALL sp_add_column('guest_house_guests', 'expected_checkout_at',
  'ALTER TABLE `guest_house_guests` ADD COLUMN `expected_checkout_at` DATETIME NULL');
CALL sp_add_column('guest_house_guests', 'booking_from',
  'ALTER TABLE `guest_house_guests` ADD COLUMN `booking_from` DATETIME NULL');
CALL sp_add_column('guest_house_guests', 'booking_to',
  'ALTER TABLE `guest_house_guests` ADD COLUMN `booking_to` DATETIME NULL');

-- 6. Stay status needs reserved / cancelled
ALTER TABLE `guest_house_guests`
  MODIFY COLUMN `status` ENUM('reserved','checked_in','checked_out','cancelled') NOT NULL DEFAULT 'checked_in';

-- 7. Extra charges (food / laundry / other)
CREATE TABLE IF NOT EXISTS `guest_house_charges` (
  `id`          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `guest_id`    INT UNSIGNED  NOT NULL,
  `charge_type` ENUM('food','laundry','other') NOT NULL DEFAULT 'other',
  `description` VARCHAR(255)  DEFAULT NULL,
  `amount`      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `created_by`  INT UNSIGNED  DEFAULT NULL,
  `created_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ghc_guest` (`guest_id`),
  KEY `idx_ghc_type`  (`charge_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Payment ledger (today income / pending payments reports)
CREATE TABLE IF NOT EXISTS `guest_house_payments` (
  `id`           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `guest_id`     INT UNSIGNED  NOT NULL,
  `amount`       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `payment_mode` VARCHAR(20)   NOT NULL DEFAULT 'cash',
  `note`         VARCHAR(255)  DEFAULT NULL,
  `created_by`   INT UNSIGNED  DEFAULT NULL,
  `created_at`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ghp_guest` (`guest_id`),
  KEY `idx_ghp_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Settings: logo (file upload, stored as data URI) + invoice header fields
INSERT INTO `settings` (`setting_key`,`setting_value`,`setting_group`,`label`,`input_type`,`sort_order`) VALUES
  ('logo_data',           '',                        'invoice', 'Invoice Logo (PNG/JPG upload)',        'image',    90),
  ('restaurant_name',     'Restaurant Manager',      'invoice', 'Restaurant Name',                      'text',     91),
  ('guest_house_name',    'Kripa Shanti Atithi Bhavan','invoice','Guest House Name (invoice header)',   'text',     92),
  ('guest_house_address', '',                        'invoice', 'Guest House Address',                  'text',     93),
  ('guest_house_phone',   '',                        'invoice', 'Guest House Phone',                    'text',     94),
  ('invoice_prefix',      'KS',                      'invoice', 'Invoice Number Prefix',                'text',     95)
ON DUPLICATE KEY UPDATE `label` = VALUES(`label`);

-- 10. Permissions column on brand-new installs is TEXT; make sure value is valid JSON
UPDATE `admin_users` SET `permissions` = NULL WHERE `permissions` = '';

DROP PROCEDURE IF EXISTS sp_add_column;

-- =====================================================================
-- Default module permissions for the seeded staff accounts
-- admin = all, manager = guest house + reports, reception = guest house, waiter = tables
-- (Admin can change these any time from Settings -> Staff Users)
-- =====================================================================
UPDATE `admin_users`
   SET `permissions` = '["tables","orders","billing","menu","reports","guest_house","customers","messaging","settings","users"]'
 WHERE `role` = 'admin';

UPDATE `admin_users`
   SET `permissions` = '["guest_house","reports"]'
 WHERE `role` = 'manager' AND (`permissions` IS NULL OR `permissions` = '');

UPDATE `admin_users`
   SET `permissions` = '["guest_house"]'
 WHERE `role` = 'reception' AND (`permissions` IS NULL OR `permissions` = '');

UPDATE `admin_users`
   SET `permissions` = '["tables","orders"]'
 WHERE `role` = 'waiter' AND (`permissions` IS NULL OR `permissions` = '');
