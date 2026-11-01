-- ================================================================
-- Restaurant Billing & Guest House Management System
-- Complete MySQL Schema v1.0
-- Encoding: utf8mb4 | Engine: InnoDB
-- ================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';

-- ----------------------------------------------------------------
-- 1. admin_users
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `admin_users` (
  `id`            INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  `username`      VARCHAR(50)      NOT NULL,
  `email`         VARCHAR(120)     NOT NULL,
  `password_hash` VARCHAR(255)     NOT NULL,
  `full_name`     VARCHAR(100)     NOT NULL,
  `role`          ENUM('admin','waiter') NOT NULL DEFAULT 'admin',
  `is_active`     TINYINT(1)       NOT NULL DEFAULT 1,
  `last_login_at` DATETIME         DEFAULT NULL,
  `created_at`    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_username` (`username`),
  UNIQUE KEY `uq_email`    (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------
-- 2. settings
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `settings` (
  `id`            INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  `setting_key`   VARCHAR(100)     NOT NULL,
  `setting_value` TEXT             DEFAULT NULL,
  `setting_group` VARCHAR(50)      NOT NULL DEFAULT 'general',
  `label`         VARCHAR(150)     NOT NULL,
  `input_type`    VARCHAR(30)      NOT NULL DEFAULT 'text',
  `sort_order`    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `updated_at`    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_setting_key` (`setting_key`),
  KEY `idx_setting_group` (`setting_group`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------
-- 3. restaurant_tables
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `restaurant_tables` (
  `id`               INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `table_number`     TINYINT UNSIGNED NOT NULL,
  `label`            VARCHAR(50)     NOT NULL,
  `capacity`         TINYINT UNSIGNED NOT NULL DEFAULT 4,
  `status`           ENUM('available','occupied','billing_pending')
                                     NOT NULL DEFAULT 'available',
  `current_order_id` INT UNSIGNED    DEFAULT NULL,
  `is_active`        TINYINT(1)      NOT NULL DEFAULT 1,
  `created_at`       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_table_number` (`table_number`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------
-- 4. categories
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `categories` (
  `id`          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `name`        VARCHAR(100)    NOT NULL,
  `description` TEXT            DEFAULT NULL,
  `sort_order`  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `is_active`   TINYINT(1)      NOT NULL DEFAULT 1,
  `created_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_category_name` (`name`),
  KEY `idx_sort_active` (`sort_order`, `is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------
-- 5. menu_items
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `menu_items` (
  `id`                INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `category_id`       INT UNSIGNED    NOT NULL,
  `name`              VARCHAR(150)    NOT NULL,
  `description`       TEXT            DEFAULT NULL,
  `restaurant_price`  DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  `guest_house_price` DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  `is_active`         TINYINT(1)      NOT NULL DEFAULT 1,
  `sort_order`        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_category_id`   (`category_id`),
  KEY `idx_is_active`     (`is_active`),
  KEY `idx_sort_order`    (`sort_order`),
  CONSTRAINT `fk_menu_items_category`
    FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`)
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------
-- 6. orders
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `orders` (
  `id`                INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `order_number`      VARCHAR(25)     NOT NULL,
  `order_type`        ENUM('dine_in','guest_house') NOT NULL,
  `table_id`          INT UNSIGNED    DEFAULT NULL,
  `guest_name`        VARCHAR(100)    DEFAULT NULL,
  `guest_room`        VARCHAR(50)     DEFAULT NULL,
  `guest_phone`       VARCHAR(20)     DEFAULT NULL,
  `guest_address`     VARCHAR(255)    DEFAULT NULL,
  `guest_id_proof`    VARCHAR(120)    DEFAULT NULL,
  `status`            ENUM('running','billed','cancelled') NOT NULL DEFAULT 'running',
  `subtotal`          DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  `discount_amount`   DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  `tax_amount`        DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  `commission_amount` DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  `grand_total`       DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  `notes`             TEXT            DEFAULT NULL,
  `created_by`        INT UNSIGNED    NOT NULL,
  `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_order_number` (`order_number`),
  KEY `idx_order_type`   (`order_type`),
  KEY `idx_status`       (`status`),
  KEY `idx_table_id`     (`table_id`),
  KEY `idx_created_at`   (`created_at`),
  KEY `idx_created_by`   (`created_by`),
  CONSTRAINT `fk_orders_table`
    FOREIGN KEY (`table_id`) REFERENCES `restaurant_tables` (`id`)
    ON UPDATE CASCADE,
  CONSTRAINT `fk_orders_admin`
    FOREIGN KEY (`created_by`) REFERENCES `admin_users` (`id`)
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------
-- 7. order_items
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `order_items` (
  `id`            INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `order_id`      INT UNSIGNED    NOT NULL,
  `menu_item_id`  INT UNSIGNED    NOT NULL,
  `item_name`     VARCHAR(150)    NOT NULL COMMENT 'Snapshot of name at time of order',
  `item_category` VARCHAR(100)    NOT NULL COMMENT 'Snapshot of category at time of order',
  `unit_price`    DECIMAL(10,2)   NOT NULL,
  `quantity`      SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  `line_total`    DECIMAL(10,2)   NOT NULL,
  `notes`         VARCHAR(255)    DEFAULT NULL,
  `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_order_id`     (`order_id`),
  KEY `idx_menu_item_id` (`menu_item_id`),
  CONSTRAINT `fk_order_items_order`
    FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_order_items_menu`
    FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items` (`id`)
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------
-- 8. bills
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `bills` (
  `id`                INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `bill_number`       VARCHAR(25)     NOT NULL,
  `order_id`          INT UNSIGNED    NOT NULL,
  `subtotal`          DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  `discount_amount`   DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  `tax_amount`        DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  `commission_amount` DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  `grand_total`       DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  `payment_mode`      ENUM('cash','upi','card','credit') NOT NULL DEFAULT 'cash',
  `payment_status`    ENUM('paid','unpaid')     NOT NULL DEFAULT 'paid',
  `paid_at`           DATETIME        DEFAULT NULL,
  `bill_notes`        TEXT            DEFAULT NULL,
  `created_by`        INT UNSIGNED    NOT NULL,
  `created_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_bill_number` (`bill_number`),
  UNIQUE KEY `uq_order_id`    (`order_id`),
  KEY `idx_payment_status` (`payment_status`),
  KEY `idx_created_at`     (`created_at`),
  KEY `idx_created_by`     (`created_by`),
  CONSTRAINT `fk_bills_order`
    FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`)
    ON UPDATE CASCADE,
  CONSTRAINT `fk_bills_admin`
    FOREIGN KEY (`created_by`) REFERENCES `admin_users` (`id`)
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------
-- 9. guest_house_rooms
-- ----------------------------------------------------------------
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
  UNIQUE KEY `uq_guest_house_room_no` (`room_no`),
  KEY `idx_gh_room_category` (`category_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------
-- 10. guest_house_room_categories
-- ----------------------------------------------------------------
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

-- ----------------------------------------------------------------
-- 11. guest_house_guests
-- ----------------------------------------------------------------
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

-- ----------------------------------------------------------------
-- 12. guest_house_profiles
-- ----------------------------------------------------------------
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

-- ----------------------------------------------------------------
-- 13. activity_logs
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `activity_logs` (
  `id`           BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `admin_id`     INT UNSIGNED     DEFAULT NULL,
  `action`       VARCHAR(100)     NOT NULL,
  `module`       VARCHAR(50)      NOT NULL,
  `reference_id` INT UNSIGNED     DEFAULT NULL,
  `description`  TEXT             DEFAULT NULL,
  `ip_address`   VARCHAR(45)      DEFAULT NULL,
  `user_agent`   VARCHAR(255)     DEFAULT NULL,
  `created_at`   DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_admin_id`   (`admin_id`),
  KEY `idx_module`     (`module`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------
-- 14. customers (unified contact list)
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
-- 15. message_campaigns
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
-- 16. message_recipients
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

SET FOREIGN_KEY_CHECKS = 1;

-- ----------------------------------------------------------------
-- Compatibility migrations for existing databases
-- ----------------------------------------------------------------
ALTER TABLE `orders` ADD COLUMN IF NOT EXISTS `guest_address` VARCHAR(255) DEFAULT NULL AFTER `guest_phone`;
ALTER TABLE `orders` ADD COLUMN IF NOT EXISTS `guest_id_proof` VARCHAR(120) DEFAULT NULL AFTER `guest_address`;
ALTER TABLE `bills`
  MODIFY COLUMN `payment_mode` ENUM('cash','upi','card','credit') NOT NULL DEFAULT 'cash';
ALTER TABLE `guest_house_rooms` ADD COLUMN IF NOT EXISTS `category_id` INT UNSIGNED DEFAULT NULL AFTER `floor_no`;
UPDATE `settings`
SET `label` = 'Guest House Commission (%)',
    `setting_value` = CASE
        WHEN CAST(`setting_value` AS DECIMAL(10,2)) > 100 THEN '10.00'
        ELSE `setting_value`
    END
WHERE `setting_key` = 'guest_house_commission';

-- ================================================================
-- SEED DATA
-- ================================================================

-- Admin: password = Admin@1234
INSERT INTO `admin_users` (`username`, `email`, `password_hash`, `full_name`, `role`) VALUES
('admin', 'admin@restaurant.com',
 '$2y$12$U7v/u/DvN7Djyo5V/ntfS.fd0Ui7BKqjTd5e1uv.eYq7phZwCP8C.', 'System Administrator', 'admin'),
('waiter', 'waiter@restaurant.com',
 '$2y$12$Iiw4Sm/bu0/hk/CEDFwnsOVKp03LblkNDV7xk4MGboj0pcDkTbd2i', 'Waiter', 'waiter');

-- Settings
INSERT INTO `settings` (`setting_key`, `setting_value`, `setting_group`, `label`, `input_type`, `sort_order`) VALUES
('business_name',         'The Grand Restaurant',                    'general', 'Business Name',                      'text',     1),
('business_address',      '123 Main Street, City, State - 400001',   'general', 'Address',                            'textarea', 2),
('business_phone',        '+91 98765 43210',                         'general', 'Contact Number',                     'text',     3),
('currency_symbol',       '₹',                                       'general', 'Currency Symbol',                    'text',     4),
('bill_footer_text',      'Thank you for your order!',               'general', 'Bill Footer Text',                   'textarea', 5),
('guest_house_commission','10.00',  'billing', 'Guest House Commission (%)',            'number',   1),
('tax_percentage',        '0.00',   'billing', 'Tax Percentage (%)',                   'number',   2),
('bill_prefix',           'BILL',   'billing', 'Bill Number Prefix',                   'text',     3),
('order_prefix',          'ORD',    'billing', 'Order Number Prefix',                  'text',     4),
('printer_enabled',       '1',              'printer', 'Enable Direct Print (1=yes)',  'text',     1),
('printer_ip',            '192.168.0.101',  'printer', 'Thermal Printer IP',           'text',     2),
('printer_port',          '9100',           'printer', 'Printer Port (usually 9100)',  'number',   3);

-- Tables 1–10
INSERT INTO `restaurant_tables` (`table_number`, `label`, `capacity`) VALUES
(1,'Table 1',4),(2,'Table 2',4),(3,'Table 3',4),(4,'Table 4',4),(5,'Table 5',6),
(6,'Table 6',6),(7,'Table 7',2),(8,'Table 8',2),(9,'Table 9',8),(10,'Table 10',8);

-- Guest house rooms
INSERT INTO `guest_house_rooms` (`room_no`, `room_type`, `floor_no`) VALUES
('101', 'Standard', '1'),
('102', 'Standard', '1'),
('103', 'Deluxe', '1'),
('201', 'Standard', '2'),
('202', 'Deluxe', '2'),
('203', 'Suite', '2');

INSERT INTO `guest_house_room_categories` (`name`, `created_by`) VALUES
('Standard', 1), ('Deluxe', 1), ('Suite', 1);

-- Guest house profiles
INSERT INTO `guest_house_profiles` (`name`, `address`, `created_by`) VALUES
('Krishna Guest House', 'Vrindavan Main Road, Near Prem Mandir', 1);

-- Categories
INSERT INTO `categories` (`name`, `sort_order`) VALUES
('Starters',1),('Main Course',2),('Breads',3),('Rice & Biryani',4),('Beverages',5),('Desserts',6);

-- Menu items
INSERT INTO `menu_items` (`category_id`,`name`,`restaurant_price`,`guest_house_price`,`sort_order`) VALUES
(1,'Veg Spring Roll',120.00,140.00,1),(1,'Paneer Tikka',180.00,200.00,2),
(1,'Chicken 65',200.00,230.00,3),(1,'Fish Fingers',220.00,250.00,4),
(1,'Hara Bhara Kabab',150.00,170.00,5),
(2,'Paneer Butter Masala',220.00,250.00,1),(2,'Dal Makhani',180.00,200.00,2),
(2,'Chicken Curry',250.00,280.00,3),(2,'Mutton Rogan Josh',320.00,360.00,4),
(2,'Mixed Vegetable',160.00,180.00,5),(2,'Kadai Paneer',230.00,260.00,6),
(3,'Tandoori Roti',20.00,25.00,1),(3,'Butter Naan',35.00,40.00,2),
(3,'Garlic Naan',45.00,55.00,3),(3,'Paratha',40.00,50.00,4),
(4,'Veg Fried Rice',160.00,180.00,1),(4,'Chicken Biryani',280.00,320.00,2),
(4,'Mutton Biryani',350.00,400.00,3),(4,'Veg Biryani',200.00,230.00,4),
(5,'Cold Coffee',80.00,90.00,1),(5,'Fresh Lime Soda',60.00,70.00,2),
(5,'Mango Lassi',70.00,80.00,3),(5,'Mineral Water',20.00,25.00,4),
(5,'Masala Chai',30.00,35.00,5),
(6,'Gulab Jamun',60.00,70.00,1),(6,'Ice Cream (2 Scoops)',80.00,90.00,2),(6,'Kheer',70.00,80.00,3);
