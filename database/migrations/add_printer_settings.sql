-- Run once on existing database to enable direct thermal printing
INSERT INTO `settings` (`setting_key`, `setting_value`, `setting_group`, `label`, `input_type`, `sort_order`) VALUES
('printer_enabled', '1', 'printer', 'Enable Direct Print', 'text', 1),
('printer_ip',      '192.168.0.101', 'printer', 'Printer IP Address', 'text', 2),
('printer_port',    '9100', 'printer', 'Printer Port', 'number', 3)
ON DUPLICATE KEY UPDATE setting_key = setting_key;
