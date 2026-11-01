-- ============================================================
-- Hostinger / phpMyAdmin: Waiter role (run once)
-- Fix for Staff Users + waiter login
-- ============================================================

-- 1) Add role column (ignore error if already exists)
ALTER TABLE `admin_users`
  ADD COLUMN `role` ENUM('admin','waiter') NOT NULL DEFAULT 'admin'
  AFTER `full_name`;

-- 2) Existing admins stay admin
UPDATE `admin_users` SET `role` = 'admin' WHERE `role` IS NULL OR `role` = '';

-- 3) Default waiter login (password: Waiter@1234)
--    Agar username "waiter" pehle se hai to password/role update ho jayega.
INSERT INTO `admin_users` (`username`, `email`, `password_hash`, `full_name`, `role`, `is_active`)
VALUES (
  'waiter',
  'waiter@restaurant.com',
  '$2y$12$Iiw4Sm/bu0/hk/CEDFwnsOVKp03LblkNDV7xk4MGboj0pcDkTbd2i',
  'Waiter',
  'waiter',
  1
)
ON DUPLICATE KEY UPDATE
  `role` = 'waiter',
  `password_hash` = VALUES(`password_hash`),
  `full_name` = VALUES(`full_name`),
  `is_active` = 1;

-- 4) Verify
SELECT id, username, full_name, role, is_active FROM admin_users;
