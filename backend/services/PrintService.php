<?php
require_once __DIR__ . '/../utils/EscposPrinter.php';

/**
 * Central LAN thermal print service (TCP ESC/POS port 9100).
 */
class PrintService
{
    private static ?string $lastError = null;

    public static function getConfig(): array
    {
        $s = Helper::allSettings();
        return [
            'enabled' => ($s['printer_enabled'] ?? '1') === '1',
            'ip'      => trim($s['printer_ip'] ?? ''),
            'port'    => max(1, min(65535, (int)($s['printer_port'] ?? 9100))),
            'width'   => max(32, min(64, (int)($s['printer_width'] ?? 48))),
            'timeout' => max(1.0, min(15.0, (float)($s['printer_timeout'] ?? 5.0))),
            'retries' => max(1, min(5, (int)($s['printer_retries'] ?? 2))),
        ];
    }

    public static function getLastError(): ?string
    {
        return self::$lastError;
    }

    public static function health(): array
    {
        $cfg = self::getConfig();
        if (!$cfg['enabled']) {
            return [
                'ok'      => false,
                'code'    => 'PRINTER_DISABLED',
                'message' => 'Printer disabled in Settings.',
                'config'  => self::publicConfig($cfg),
            ];
        }
        if ($cfg['ip'] === '') {
            return [
                'ok'      => false,
                'code'    => 'PRINTER_NOT_CONFIGURED',
                'message' => 'Printer IP not set. Settings → Printer IP daalo.',
                'config'  => self::publicConfig($cfg),
            ];
        }
        if (!filter_var($cfg['ip'], FILTER_VALIDATE_IP)) {
            return [
                'ok'      => false,
                'code'    => 'INVALID_PRINTER_IP',
                'message' => 'Invalid printer IP in Settings.',
                'config'  => self::publicConfig($cfg),
            ];
        }

        $printer = new EscposPrinter($cfg['width']);
        $connected = self::connectWithRetry($printer, $cfg['ip'], $cfg['port'], $cfg['timeout'], 1);
        if ($connected) {
            $printer->close();
            return [
                'ok'      => true,
                'code'    => 'ONLINE',
                'message' => "Printer reachable at {$cfg['ip']}:{$cfg['port']}",
                'config'  => self::publicConfig($cfg),
            ];
        }

        return [
            'ok'      => false,
            'code'    => 'PRINTER_OFFLINE',
            'message' => self::$lastError ?? "Cannot reach printer at {$cfg['ip']}:{$cfg['port']}",
            'config'  => self::publicConfig($cfg),
        ];
    }

    public static function printBill(string $billNumber): void
    {
        $bill = Database::row(
            "SELECT b.*, o.order_number, o.order_type, o.guest_name, o.guest_room,
                    t.label AS table_label, t.table_number
             FROM bills b
             JOIN orders o ON b.order_id = o.id
             LEFT JOIN restaurant_tables t ON o.table_id = t.id
             WHERE b.bill_number = ?",
            [$billNumber]
        );
        if (!$bill) {
            Response::notFound('Bill not found.');
        }

        $items = Database::all(
            'SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC',
            [$bill['order_id']]
        );
        $settings = Helper::allSettings();

        self::send(function (EscposPrinter $p) use ($bill, $items, $settings) {
            self::formatBill($p, $bill, $items, $settings);
        });
    }

    public static function printKOT(int $orderId): void
    {
        $order = Database::row(
            "SELECT o.*, t.label AS table_label, t.table_number
             FROM orders o
             LEFT JOIN restaurant_tables t ON o.table_id = t.id
             WHERE o.id = ?",
            [$orderId]
        );
        if (!$order) {
            Response::notFound('Order not found.');
        }

        $items = Database::all(
            'SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC',
            [$orderId]
        );

        self::send(function (EscposPrinter $p) use ($order, $items) {
            self::formatKOT($p, $order, $items);
        });
    }

    public static function testPrint(string $type = 'bill'): void
    {
        self::send(function (EscposPrinter $p) use ($type) {
            if ($type === 'kot') {
                self::formatKOT($p, [
                    'order_number' => 'TEST-001',
                    'order_type'   => 'dine_in',
                    'table_label'  => 'Table 1',
                    'table_number' => '1',
                ], [
                    ['item_name' => 'PRINT TEST OK', 'quantity' => 1],
                    ['item_name' => 'Masala Dosa', 'quantity' => 2],
                ]);
            } else {
                $settings = Helper::allSettings();
                self::formatBill($p, [
                    'bill_number'      => 'TEST',
                    'order_number'     => 'TEST-001',
                    'order_type'       => 'dine_in',
                    'table_label'      => 'Table 1',
                    'payment_mode'     => 'cash',
                    'created_at'       => date('Y-m-d H:i:s'),
                    'paid_at'          => date('Y-m-d H:i:s'),
                    'subtotal'         => 350,
                    'tax_amount'       => 0,
                    'discount_amount'  => 0,
                    'commission_amount'=> 0,
                    'grand_total'      => 350,
                ], [
                    ['item_name' => 'Print Test Item', 'quantity' => 1, 'line_total' => 350],
                ], $settings);
            }
        });
    }

    private static function send(callable $formatter): never
    {
        $cfg = self::getConfig();
        if (!$cfg['enabled']) {
            Response::error('Printer is disabled in Settings.', 422, ['code' => 'PRINTER_DISABLED']);
        }
        if ($cfg['ip'] === '') {
            Response::error('Printer IP not configured in Settings.', 422, ['code' => 'PRINTER_NOT_CONFIGURED']);
        }
        if (!filter_var($cfg['ip'], FILTER_VALIDATE_IP)) {
            Response::error('Invalid printer IP in Settings.', 422, ['code' => 'INVALID_PRINTER_IP']);
        }

        $printer = new EscposPrinter($cfg['width']);
        if (!self::connectWithRetry($printer, $cfg['ip'], $cfg['port'], $cfg['timeout'], $cfg['retries'])) {
            Response::error(
                self::$lastError ?? "Cannot connect to printer at {$cfg['ip']}:{$cfg['port']}",
                503,
                ['code' => 'PRINTER_OFFLINE', 'printer' => "{$cfg['ip']}:{$cfg['port']}"]
            );
        }

        try {
            $printer->init();
            $formatter($printer);
            $printer->cut();
        } catch (Throwable $e) {
            Response::error('Print failed: ' . $e->getMessage(), 500, ['code' => 'ESC_POS_ERROR']);
        } finally {
            $printer->close();
        }

        Response::success(
            ['printed' => true, 'printer' => "{$cfg['ip']}:{$cfg['port']}"],
            'Printed successfully.'
        );
    }

    private static function connectWithRetry(
        EscposPrinter $printer,
        string $ip,
        int $port,
        float $timeout,
        int $retries
    ): bool {
        self::$lastError = null;
        for ($i = 1; $i <= $retries; $i++) {
            if ($printer->connect($ip, $port, $timeout)) {
                return true;
            }
            self::$lastError = $printer->getLastError()
                ?? "Connection refused at {$ip}:{$port} (attempt {$i}/{$retries})";
            if ($i < $retries) {
                usleep(300000);
            }
        }
        return false;
    }

    private static function publicConfig(array $cfg): array
    {
        return [
            'enabled' => $cfg['enabled'],
            'ip'      => $cfg['ip'],
            'port'    => $cfg['port'],
        ];
    }

    private static function formatKOT(EscposPrinter $p, array $order, array $items): void
    {
        $when = date('d/m/Y, h:i:s A');
        $isDineIn = ($order['order_type'] ?? '') === 'dine_in';
        $place = $isDineIn
            ? 'RESTAURANT (DINE IN)'
            : ('GUEST HOUSE: ' . ($order['guest_name'] ?? 'GUEST HOUSE'));
        $location = $isDineIn
            ? 'TABLE: ' . ($order['table_number'] ?? $order['table_label'] ?? '-')
            : 'ROOM: ' . ($order['guest_room'] ?? '-');

        $p->align('center');
        $p->bold(true);
        $p->text('KITCHEN ORDER');
        $p->bold(false);
        $p->separator();
        $p->text('ORDER: ' . Helper::shortDocNumber($order['order_number'] ?? $order['id'] ?? '-'));
        $p->align('left');
        $p->text('DATE: ' . $when);
        $p->text('PLACE: ' . $place);
        $p->text($location);
        $p->separator();

        foreach ($items as $item) {
            $name = strtoupper($item['item_name'] ?? '');
            $qty  = (string)($item['quantity'] ?? 0);
            $p->twoColumn($name, $qty);
        }

        $p->separator();
        $p->align('center');
        $p->text('TOTAL ITEMS: ' . count($items));
        $p->feed(1);
    }

    private static function formatBill(EscposPrinter $p, array $bill, array $items, array $settings): void
    {
        $sym    = $settings['currency_symbol'] ?? 'Rs.';
        $sym    = $sym === '₹' ? 'Rs.' : $sym;
        $when   = date('d-M-Y, h:i A', strtotime($bill['created_at'] ?? 'now'));
        $billNo = Helper::shortDocNumber($bill['bill_number'] ?? '-');
        $ordNo  = Helper::shortDocNumber($bill['order_number'] ?? '-');
        $table  = $bill['table_label'] ?? $bill['guest_room'] ?? '-';
        $pay    = strtoupper($bill['payment_mode'] ?? 'CASH');
        $footer = $settings['bill_footer_text'] ?? 'Thank you!';

        $p->align('center');
        $p->bold(true);
        $p->text($settings['business_name'] ?? 'Restaurant');
        $p->bold(false);
        if (!empty($settings['business_address'])) {
            $p->text($settings['business_address']);
        }
        if (!empty($settings['business_phone'])) {
            $p->text($settings['business_phone']);
        }
        $p->separator();
        $p->bold(true);
        $p->text('TAX INVOICE');
        $p->bold(false);
        $p->separator();
        $p->bold(true);
        $p->text($billNo);
        $p->bold(false);
        $p->text($when);
        $p->text("Order {$ordNo} | Table {$table} | {$pay}");
        $p->separator();

        foreach ($items as $item) {
            $name = ($item['item_name'] ?? '') . ' x' . ($item['quantity'] ?? 0);
            $amt  = $sym . number_format((float)($item['line_total'] ?? 0), 2);
            $p->twoColumn($name, $amt);
        }

        $p->separator();
        $p->twoColumn('Subtotal', $sym . number_format((float)($bill['subtotal'] ?? 0), 2));

        if ((float)($bill['tax_amount'] ?? 0) > 0) {
            $p->twoColumn('Tax', $sym . number_format((float)$bill['tax_amount'], 2));
        }
        if ((float)($bill['discount_amount'] ?? 0) > 0) {
            $p->twoColumn('Discount', '-' . $sym . number_format((float)$bill['discount_amount'], 2));
        }

        $p->separator();
        $p->align('center');
        $p->bold(true);
        $p->text('TOTAL');
        $p->text($sym . number_format((float)($bill['grand_total'] ?? 0), 2));
        $p->bold(false);
        $p->separator();
        $p->text('**** ' . strtoupper($footer) . ' ****');
        $p->text('Date & Time : ' . $when);
        $p->feed(1);
    }
}
