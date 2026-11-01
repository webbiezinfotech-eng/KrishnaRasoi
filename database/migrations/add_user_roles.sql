-- Waiter role: table orders + KOT only (no billing / admin modules)
-- Run once against restaurant_db

ALTER TABLE `admin_users`
  ADD COLUMN `role` ENUM('admin','waiter') NOT NULL DEFAULT 'admin'
  AFTER `full_name`;

-- Seed waiter account (password: Waiter@1234)
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
  `is_active` = 1;
