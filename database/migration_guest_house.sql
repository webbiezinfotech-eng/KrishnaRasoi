-- Guest House + UI responsiveness migration
-- Run this file on existing databases.

ALTER TABLE `orders` ADD COLUMN IF NOT EXISTS `guest_address` VARCHAR(255) DEFAULT NULL AFTER `guest_phone`;
ALTER TABLE `orders` ADD COLUMN IF NOT EXISTS `guest_id_proof` VARCHAR(120) DEFAULT NULL AFTER `guest_address`;
ALTER TABLE `bills`
  MODIFY COLUMN `payment_mode` ENUM('cash','upi','card','credit') NOT NULL DEFAULT 'cash';

CREATE TABLE IF NOT EXISTS `guest_house_rooms` (
  `id`          INT UNSIGNED       NOT NULL AUTO_INCREMENT,
  `room_no`     VARCHAR(20)        NOT NULL,
  `room_type`   VARCHAR(50)        DEFAULT NULL,
  `floor_no`    VARCHAR(20)        DEFAULT NULL,
  `category_id` INT UNSIGNED       DEFAULT NULL,
  `status`      ENUM('available','booked') NOT NULL DEFAULT 'available',
  `is_active`   TINYINT(1)         NOT NULL DEFAULT 1,
  `created_at`  DATETIME           NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME           NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_guest_house_room_no` (`room_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `guest_house_room_categories` (
  `id`         INT UNSIGNED        NOT NULL AUTO_INCREMENT,
  `name`       VARCHAR(80)         NOT NULL,
  `is_active`  TINYINT(1)          NOT NULL DEFAULT 1,
  `created_by` INT UNSIGNED        NOT NULL,
  `created_at` DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_gh_room_category_name` (`name`),
  CONSTRAINT `fk_gh_room_category_admin`
    FOREIGN KEY (`created_by`) REFERENCES `admin_users` (`id`)
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `guest_house_guests` (
  `id`           INT UNSIGNED       NOT NULL AUTO_INCREMENT,
  `guest_name`   VARCHAR(100)       NOT NULL,
  `phone`        VARCHAR(20)        NOT NULL,
  `room_id`      INT UNSIGNED       NOT NULL,
  `room_no`      VARCHAR(20)        NOT NULL,
  `address`      VARCHAR(255)       NOT NULL,
  `id_proof`     VARCHAR(120)       NOT NULL,
  `status`       ENUM('checked_in','checked_out') NOT NULL DEFAULT 'checked_in',
  `check_in_at`  DATETIME           NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `check_out_at` DATETIME           DEFAULT NULL,
  `created_by`   INT UNSIGNED       NOT NULL,
  `created_at`   DATETIME           NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME           NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_gh_room_id` (`room_id`),
  KEY `idx_gh_status` (`status`),
  KEY `idx_gh_created_at` (`created_at`),
  CONSTRAINT `fk_gh_guest_room`
    FOREIGN KEY (`room_id`) REFERENCES `guest_house_rooms` (`id`)
    ON UPDATE CASCADE,
  CONSTRAINT `fk_gh_guest_admin`
    FOREIGN KEY (`created_by`) REFERENCES `admin_users` (`id`)
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `guest_house_profiles` (
  `id`          INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  `name`        VARCHAR(120)      NOT NULL,
  `address`     VARCHAR(255)      NOT NULL,
  `is_active`   TINYINT(1)        NOT NULL DEFAULT 1,
  `created_by`  INT UNSIGNED      NOT NULL,
  `created_at`  DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_gh_profile_name` (`name`),
  KEY `idx_gh_profile_active` (`is_active`),
  CONSTRAINT `fk_gh_profile_admin`
    FOREIGN KEY (`created_by`) REFERENCES `admin_users` (`id`)
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `guest_house_rooms` (`room_no`, `room_type`, `floor_no`) VALUES
('101', 'Standard', '1'),
('102', 'Standard', '1'),
('103', 'Deluxe', '1'),
('201', 'Standard', '2'),
('202', 'Deluxe', '2'),
('203', 'Suite', '2');

INSERT IGNORE INTO `guest_house_profiles` (`id`, `name`, `address`, `created_by`) VALUES
(1, 'Krishna Guest House', 'Vrindavan Main Road, Near Prem Mandir', 1);

INSERT IGNORE INTO `guest_house_room_categories` (`id`, `name`, `created_by`) VALUES
(1, 'Standard', 1),
(2, 'Deluxe', 1),
(3, 'Suite', 1);

ALTER TABLE `guest_house_rooms`
  ADD COLUMN IF NOT EXISTS `category_id` INT UNSIGNED DEFAULT NULL AFTER `floor_no`;

ALTER TABLE `guest_house_guests`
  ADD COLUMN IF NOT EXISTS `payment_mode` VARCHAR(20) NOT NULL DEFAULT 'cash' AFTER `id_proof`,
  ADD COLUMN IF NOT EXISTS `total_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `payment_mode`,
  ADD COLUMN IF NOT EXISTS `advance_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `total_amount`,
  ADD COLUMN IF NOT EXISTS `paid_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `advance_amount`,
  ADD COLUMN IF NOT EXISTS `balance_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `paid_amount`,
  ADD COLUMN IF NOT EXISTS `expected_checkout_at` DATETIME DEFAULT NULL AFTER `check_out_at`,
  ADD COLUMN IF NOT EXISTS `booking_from` DATETIME DEFAULT NULL AFTER `expected_checkout_at`,
  ADD COLUMN IF NOT EXISTS `booking_to` DATETIME DEFAULT NULL AFTER `booking_from`,
  ADD COLUMN IF NOT EXISTS `adults_count` INT NOT NULL DEFAULT 1 AFTER `phone`,
  ADD COLUMN IF NOT EXISTS `children_count` INT NOT NULL DEFAULT 0 AFTER `adults_count`,
  ADD COLUMN IF NOT EXISTS `companions` TEXT NULL AFTER `children_count`,
  ADD COLUMN IF NOT EXISTS `companions_id_details` TEXT NULL AFTER `companions`;

ALTER TABLE `guest_house_guests`
  MODIFY COLUMN `status` ENUM('reserved','checked_in','checked_out','cancelled') NOT NULL DEFAULT 'checked_in';

UPDATE `guest_house_rooms` SET `category_id` = 1 WHERE `category_id` IS NULL AND (LOWER(COALESCE(`room_type`, '')) = 'standard' OR `room_type` IS NULL);
UPDATE `guest_house_rooms` SET `category_id` = 2 WHERE `category_id` IS NULL AND LOWER(COALESCE(`room_type`, '')) = 'deluxe';
UPDATE `guest_house_rooms` SET `category_id` = 3 WHERE `category_id` IS NULL AND LOWER(COALESCE(`room_type`, '')) = 'suite';
