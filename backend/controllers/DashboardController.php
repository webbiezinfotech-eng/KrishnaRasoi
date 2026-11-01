<?php
class DashboardController
{
    public function index(Request $req): never
    {
        Auth::requireAdmin();

        $today = date('Y-m-d');

        // ---- Today's billing summary (only billed/paid orders) ----
        $summary = Database::row(
            "SELECT
                COUNT(b.id)                                                AS total_orders,
                COALESCE(SUM(b.grand_total), 0)                           AS total_sales,
                COALESCE(SUM(CASE WHEN o.order_type='dine_in'     THEN b.grand_total ELSE 0 END), 0) AS dine_in_sales,
                COALESCE(SUM(CASE WHEN o.order_type='guest_house'  THEN b.grand_total ELSE 0 END), 0) AS guest_house_sales,
                COALESCE(SUM(b.commission_amount), 0)                     AS total_commission,
                COALESCE(SUM(b.discount_amount), 0)                       AS total_discount
             FROM bills b
             JOIN orders o ON b.order_id = o.id
             WHERE DATE(b.created_at) = ?
               AND b.payment_status = 'paid'",
            [$today]
        );

        if ($summary === null) {
            $summary = [
                'total_orders'     => 0,
                'total_sales'      => 0,
                'dine_in_sales'    => 0,
                'guest_house_sales'=> 0,
                'total_commission' => 0,
                'total_discount'   => 0,
            ];
        }

        // Running = dine-in tables + guest house credit/due bills only
        $running = (int) Database::value(
            "SELECT COUNT(*) FROM orders o
             WHERE (
                (o.order_type = 'dine_in' AND o.status = 'running')
                OR (
                    o.order_type = 'guest_house'
                    AND o.status = 'running'
                    AND EXISTS (
                        SELECT 1 FROM bills b
                        WHERE b.order_id = o.id AND b.payment_status = 'unpaid'
                    )
                )
             )"
        );

        // ---- Active (non-available) tables ----
        $activeTables = (int) Database::value(
            "SELECT COUNT(*) FROM restaurant_tables WHERE status != 'available' AND is_active = 1"
        );

        // ---- Closed bills today ----
        $closedBills = (int) Database::value(
            "SELECT COUNT(*) FROM bills WHERE DATE(created_at) = ? AND payment_status = 'paid'",
            [$today]
        );

        // ---- Recent 10 orders ----
        $recent = Database::all(
            "SELECT o.id, o.order_number, o.order_type, o.status, o.grand_total,
                    o.guest_name, o.created_at,
                    t.label AS table_label,
                    (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
             FROM orders o
             LEFT JOIN restaurant_tables t ON o.table_id = t.id
             ORDER BY o.created_at DESC
             LIMIT 10"
        );

        Response::success([
            'today_sales'        => (float)$summary['total_sales'],
            'today_dine_in'      => (float)$summary['dine_in_sales'],
            'today_guest_house'  => (float)$summary['guest_house_sales'],
            'today_commission'   => (float)$summary['total_commission'],
            'today_discount'     => (float)$summary['total_discount'],
            'today_orders'       => (int)$summary['total_orders'],
            'running_orders'     => $running,
            'active_tables'      => $activeTables,
            'closed_bills_today' => $closedBills,
            'recent_orders'      => $recent,
        ]);
    }
}
