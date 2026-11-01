-- QZ Tray printer name (optional — blank = Windows default printer)
INSERT IGNORE INTO settings (setting_key, setting_value, setting_group, label, input_type, sort_order) VALUES
('qz_printer_name', '', 'printer', 'QZ Tray Printer Name (blank = default)', 'text', 4);
