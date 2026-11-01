-- ==========================================================
-- Guest House Booking + Payment Migration (MySQL)
-- Single-table flow: booking + check-in in `guest_house_guests`
-- Run on existing database.
-- ==========================================================

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

