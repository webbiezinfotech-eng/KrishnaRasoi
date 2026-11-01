-- Run schema.sql first, then this file if you need to re-seed only data
--
-- Login (any one username field works in the app):
--   Admin:  admin  / Admin@1234
--   Waiter: waiter / Waiter@1234  (tables + order + KOT only)
--
INSERT IGNORE INTO `admin_users` (`username`, `email`, `password_hash`, `full_name`, `role`) VALUES
('admin', 'admin@restaurant.com', '$2y$12$U7v/u/DvN7Djyo5V/ntfS.fd0Ui7BKqjTd5e1uv.eYq7phZwCP8C.', 'System Administrator', 'admin'),
('waiter', 'waiter@restaurant.com', '$2y$12$Iiw4Sm/bu0/hk/CEDFwnsOVKp03LblkNDV7xk4MGboj0pcDkTbd2i', 'Waiter', 'waiter');

-- If you already imported the old broken hash, fix the password with:
-- UPDATE admin_users SET password_hash = '$2y$12$U7v/u/DvN7Djyo5V/ntfS.fd0Ui7BKqjTd5e1uv.eYq7phZwCP8C.' WHERE username = 'admin';
