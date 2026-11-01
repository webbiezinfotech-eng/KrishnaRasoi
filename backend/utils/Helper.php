<?php
/**
 * Application-level helper functions.
 */
class Helper
{
    // ---- Order & Bill number generation ----

    public static function generateOrderNumber(): string
    {
        $prefix = self::setting('order_prefix', 'ORD');
        return strtoupper($prefix . 'TMP' . date('YmdHis') . random_int(100, 999));
    }

    public static function generateBillNumber(): string
    {
        $prefix = self::setting('bill_prefix', 'BILL');
        return strtoupper($prefix . 'TMP' . date('YmdHis') . random_int(100, 999));
    }

    public static function formatOrderNumberFromId(int $orderId): string
    {
        $prefix = strtoupper((string) self::setting('order_prefix', 'ORD'));
        return $prefix . str_pad((string)$orderId, 6, '0', STR_PAD_LEFT);
    }

    public static function formatBillNumberFromId(int $billId): string
    {
        $prefix = strtoupper((string) self::setting('bill_prefix', 'BILL'));
        return $prefix . str_pad((string)$billId, 6, '0', STR_PAD_LEFT);
    }

    /** Last numeric digits — BILL000020 → 20 */
    public static function shortDocNumber(string $numStr): string
    {
        if (preg_match('/(\d+)$/', $numStr, $m)) {
            $n = ltrim($m[1], '0');
            return $n !== '' ? $n : $m[1];
        }
        return $numStr;
    }

    // ---- Settings ----

    public static function setting(string $key, mixed $default = null): mixed
    {
        static $cache = [];
        if (!array_key_exists($key, $cache)) {
            $row = Database::row(
                'SELECT setting_value FROM settings WHERE setting_key = ? LIMIT 1',
                [$key]
            );
            $cache[$key] = $row !== null ? $row['setting_value'] : $default;
        }
        return $cache[$key] ?? $default;
    }

    public static function allSettings(): array
    {
        $rows   = Database::all('SELECT setting_key, setting_value FROM settings');
        $result = [];
        foreach ($rows as $r) {
            $result[$r['setting_key']] = $r['setting_value'];
        }
        return $result;
    }

    // ---- Order totals calculation ----
    // NOTE: guest house commission is percentage-based and applied on subtotal.

    public static function calculateTotals(
        float  $subtotal,
        string $orderType,
        float  $discountAmount = 0.00,
        ?float $commissionOverride = null
    ): array {
        $taxPct    = (float) self::setting('tax_percentage', 0);
        $taxAmount = round($subtotal * ($taxPct / 100), 2);

        $commission = 0.00;
        if ($orderType === 'guest_house') {
            if ($commissionOverride !== null) {
                $commission = round(max(0.00, $commissionOverride), 2);
            } else {
                $commissionPct = (float) self::setting('guest_house_commission', 0);
                if ($commissionPct < 0) {
                    $commissionPct = 0;
                }
                $commission = round($subtotal * ($commissionPct / 100), 2);
            }
        }

        // Commission is payable to guest house partner (debit), not customer-facing bill amount.
        // Keep tracking commission separately but do not add it to customer grand total.
        $grandTotal = round($subtotal + $taxAmount - $discountAmount, 2);
        if ($grandTotal < 0) $grandTotal = 0.00;

        return [
            'subtotal'          => round($subtotal, 2),
            'tax_amount'        => $taxAmount,
            'commission_amount' => $commission,
            'discount_amount'   => round($discountAmount, 2),
            'grand_total'       => $grandTotal,
        ];
    }

    // ---- Recalculate & persist order totals ----

    public static function recalcOrder(int $orderId): void
    {
        $order = Database::row(
            'SELECT order_type, subtotal, commission_amount FROM orders WHERE id = ?',
            [$orderId]
        );
        if (!$order) return;

        $subtotal = (float) Database::value(
            'SELECT COALESCE(SUM(line_total), 0) FROM order_items WHERE order_id = ?',
            [$orderId]
        );

        $commissionOverride = null;
        if ($order['order_type'] === 'guest_house') {
            $commissionPct = (float) self::setting('guest_house_commission', 0);
            if ($commissionPct < 0) {
                $commissionPct = 0;
            }

            // If current commission differs from auto setting-based value,
            // treat it as a manual override and preserve that amount.
            $expectedAutoCommission = round(((float)$order['subtotal']) * ($commissionPct / 100), 2);
            $currentCommission = round((float)$order['commission_amount'], 2);
            if (abs($currentCommission - $expectedAutoCommission) > 0.009) {
                $commissionOverride = $currentCommission;
            }
        }

        $totals = self::calculateTotals(
            $subtotal,
            $order['order_type'],
            0.00,
            $commissionOverride
        );

        Database::run(
            'UPDATE orders SET subtotal=?, tax_amount=?, commission_amount=?, discount_amount=?, grand_total=? WHERE id=?',
            [
                $totals['subtotal'],
                $totals['tax_amount'],
                $totals['commission_amount'],
                $totals['discount_amount'],
                $totals['grand_total'],
                $orderId,
            ]
        );
    }

    // ---- Activity logging (non-fatal) ----

    public static function log(
        int     $adminId,
        string  $action,
        string  $module,
        ?int    $referenceId = null,
        ?string $description = null
    ): void {
        try {
            Database::run(
                'INSERT INTO activity_logs (admin_id, action, module, reference_id, description, ip_address, user_agent)
                 VALUES (?, ?, ?, ?, ?, ?, ?)',
                [
                    $adminId, $action, $module, $referenceId, $description,
                    $_SERVER['REMOTE_ADDR'] ?? null,
                    substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255),
                ]
            );
        } catch (Throwable) {
            // Non-fatal: never let logging break the main request
        }
    }

    // ---- Pagination helper ----

    public static function paginate(int $total, int $page, int $perPage): array
    {
        return [
            'total'    => $total,
            'page'     => $page,
            'per_page' => $perPage,
            'pages'    => (int)ceil($total / max($perPage, 1)),
        ];
    }

    // ---- Safe integer clamp ----

    public static function clamp(int $value, int $min, int $max): int
    {
        return max($min, min($max, $value));
    }
}
