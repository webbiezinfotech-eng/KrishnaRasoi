<?php
class ReportController
{
    private function defaultFrom(): string { return date('Y-m-01'); }
    private function defaultTo():   string { return date('Y-m-d'); }

    /** Orders store guest_address as "Name - Address" — match profile by that format. */
    private function guestHouseProfileJoin(): string
    {
        return "LEFT JOIN guest_house_profiles ghp ON (
            o.guest_address = CONCAT(ghp.name, ' - ', ghp.address)
            OR ghp.address = o.guest_address
        )";
    }

    private function applyGuestHouseFilter(array &$where, array &$params, int $guestHouseId): void
    {
        if ($guestHouseId <= 0) {
            return;
        }

        $profile = Database::row(
            'SELECT id, name, address FROM guest_house_profiles WHERE id = ?',
            [$guestHouseId]
        );
        if (!$profile) {
            $where[] = '1 = 0';
            return;
        }

        $displayAddr = trim($profile['name'] . ' - ' . $profile['address']);
        $where[] = '(ghp.id = ? OR o.guest_address = ? OR o.guest_address LIKE ?)';
        $params[] = (int)$profile['id'];
        $params[] = $displayAddr;
        $params[] = trim($profile['name']) . ' - %';
    }

    // ================================================================
    // SALES REPORT (day-by-day within range)
    // ================================================================

    public function sales(Request $req): never
    {
        Auth::requireAdmin();

        $from = $req->queryStr('from_date') ?: $this->defaultFrom();
        $to   = $req->queryStr('to_date')   ?: $this->defaultTo();
        $type = $req->queryStr('order_type');
        $guestHouseId = $req->queryInt('guest_house_id');

        $where  = ["DATE(b.created_at) BETWEEN ? AND ?", "b.payment_status = 'paid'"];
        $params = [$from, $to];

        if ($type) { $where[] = 'o.order_type = ?'; $params[] = $type; }
        $this->applyGuestHouseFilter($where, $params, $guestHouseId);

        $whereSQL = implode(' AND ', $where);
        $ghJoin = $this->guestHouseProfileJoin();

        $rows = Database::all(
            "SELECT
                DATE(b.created_at)                                                  AS date,
                COUNT(b.id)                                                         AS total_orders,
                SUM(b.grand_total)                                                  AS total_sales,
                SUM(CASE WHEN o.order_type='dine_in'    THEN b.grand_total ELSE 0 END) AS dine_in_sales,
                SUM(CASE WHEN o.order_type='guest_house' THEN b.grand_total ELSE 0 END) AS guest_house_sales,
                SUM(b.commission_amount)                                            AS total_commission,
                SUM(b.discount_amount)                                              AS total_discount,
                SUM(b.tax_amount)                                                   AS total_tax
             FROM bills b
             JOIN orders o ON b.order_id = o.id
             $ghJoin
             WHERE $whereSQL
             GROUP BY DATE(b.created_at)
             ORDER BY date DESC",
            $params
        );

        // Aggregate summary
        $summary = [
            'total_sales'       => 0.0,
            'total_orders'      => 0,
            'dine_in_sales'     => 0.0,
            'guest_house_sales' => 0.0,
            'total_commission'  => 0.0,
            'total_discount'    => 0.0,
            'total_tax'         => 0.0,
        ];
        foreach ($rows as &$r) {
            $r['total_orders']      = (int)$r['total_orders'];
            $r['total_sales']       = (float)$r['total_sales'];
            $r['dine_in_sales']     = (float)$r['dine_in_sales'];
            $r['guest_house_sales'] = (float)$r['guest_house_sales'];
            $r['total_commission']  = (float)$r['total_commission'];
            $r['total_discount']    = (float)$r['total_discount'];
            $r['total_tax']         = (float)$r['total_tax'];

            $summary['total_sales']       += $r['total_sales'];
            $summary['total_orders']      += $r['total_orders'];
            $summary['dine_in_sales']     += $r['dine_in_sales'];
            $summary['guest_house_sales'] += $r['guest_house_sales'];
            $summary['total_commission']  += $r['total_commission'];
            $summary['total_discount']    += $r['total_discount'];
            $summary['total_tax']         += $r['total_tax'];
        }
        unset($r);

        Response::success(['rows' => $rows, 'summary' => $summary, 'from_date' => $from, 'to_date' => $to]);
    }

    // ================================================================
    // ITEM-WISE REPORT
    // ================================================================

    public function itemWise(Request $req): never
    {
        Auth::requireAdmin();

        $from  = $req->queryStr('from_date') ?: $this->defaultFrom();
        $to    = $req->queryStr('to_date')   ?: $this->defaultTo();
        $catId = $req->queryInt('category_id');
        $type  = $req->queryStr('order_type');
        $guestHouseId = $req->queryInt('guest_house_id');

        $where  = ["DATE(b.created_at) BETWEEN ? AND ?", "b.payment_status = 'paid'"];
        $params = [$from, $to];

        if ($catId > 0) { $where[] = 'mi.category_id = ?'; $params[] = $catId; }
        if ($type)      { $where[] = 'o.order_type = ?';   $params[] = $type; }
        $this->applyGuestHouseFilter($where, $params, $guestHouseId);

        $whereSQL = implode(' AND ', $where);
        $ghJoin = $this->guestHouseProfileJoin();

        $rows = Database::all(
            "SELECT
                oi.item_name,
                oi.item_category,
                SUM(oi.quantity)        AS total_qty,
                AVG(oi.unit_price)      AS avg_price,
                SUM(oi.line_total)      AS total_revenue
             FROM order_items oi
             JOIN orders o   ON oi.order_id = o.id
             JOIN bills b    ON b.order_id  = o.id
             JOIN menu_items mi ON oi.menu_item_id = mi.id
             $ghJoin
             WHERE $whereSQL
             GROUP BY oi.item_name, oi.item_category, oi.menu_item_id
             ORDER BY total_revenue DESC",
            $params
        );

        foreach ($rows as &$r) {
            $r['total_qty']     = (int)$r['total_qty'];
            $r['avg_price']     = round((float)$r['avg_price'], 2);
            $r['total_revenue'] = (float)$r['total_revenue'];
        }
        unset($r);

        Response::success(['rows' => $rows, 'from_date' => $from, 'to_date' => $to]);
    }

    // ================================================================
    // TABLE-WISE REPORT
    // ================================================================

    public function tableWise(Request $req): never
    {
        Auth::requireAdmin();

        $from = $req->queryStr('from_date') ?: $this->defaultFrom();
        $to   = $req->queryStr('to_date')   ?: $this->defaultTo();

        $rows = Database::all(
            "SELECT
                t.table_number, t.label AS table_label,
                COUNT(b.id)        AS total_orders,
                SUM(b.grand_total) AS total_sales,
                SUM(b.discount_amount) AS total_discount
             FROM bills b
             JOIN orders o ON b.order_id = o.id
             JOIN restaurant_tables t ON o.table_id = t.id
             WHERE DATE(b.created_at) BETWEEN ? AND ?
               AND b.payment_status = 'paid'
               AND o.order_type = 'dine_in'
             GROUP BY t.id, t.table_number, t.label
             ORDER BY total_sales DESC",
            [$from, $to]
        );

        foreach ($rows as &$r) {
            $r['total_orders']   = (int)$r['total_orders'];
            $r['total_sales']    = (float)$r['total_sales'];
            $r['total_discount'] = (float)$r['total_discount'];
        }
        unset($r);

        Response::success(['rows' => $rows, 'from_date' => $from, 'to_date' => $to]);
    }

    // ================================================================
    // COMMISSION REPORT (guest house only)
    // ================================================================

    public function commission(Request $req): never
    {
        Auth::requireAdmin();

        $from = $req->queryStr('from_date') ?: $this->defaultFrom();
        $to   = $req->queryStr('to_date')   ?: $this->defaultTo();
        $search = trim($req->queryStr('q'));
        $guestHouseId = $req->queryInt('guest_house_id');

        $where = [
            "DATE(b.created_at) BETWEEN ? AND ?",
            "b.payment_status = 'paid'",
            "o.order_type = 'guest_house'",
        ];
        $params = [$from, $to];

        if ($guestHouseId > 0) {
            $this->applyGuestHouseFilter($where, $params, $guestHouseId);
        }
        if ($search !== '') {
            $where[] = "(ghp.name LIKE ? OR o.guest_name LIKE ? OR o.guest_address LIKE ? OR o.order_number LIKE ? OR b.bill_number LIKE ?)";
            $like = '%' . $search . '%';
            $params[] = $like;
            $params[] = $like;
            $params[] = $like;
            $params[] = $like;
            $params[] = $like;
        }

        $whereSql = implode(' AND ', $where);
        $ghJoin = $this->guestHouseProfileJoin();

        $rows = Database::all(
            "SELECT
                DATE(b.created_at) AS date,
                o.order_number, o.guest_name, o.guest_room, o.guest_phone, o.guest_address,
                ghp.id AS guest_house_id, ghp.name AS guest_house_name,
                b.bill_number, b.grand_total, b.commission_amount, b.payment_mode,
                b.paid_at
             FROM bills b
             JOIN orders o ON b.order_id = o.id
             $ghJoin
             WHERE $whereSql
             ORDER BY b.created_at DESC",
            $params
        );

        $totalCommission = 0.0;
        $houseTotalsMap = [];
        foreach ($rows as &$r) {
            $r['grand_total']       = (float)$r['grand_total'];
            $r['commission_amount'] = (float)$r['commission_amount'];
            $r['guest_house_id']    = $r['guest_house_id'] !== null ? (int)$r['guest_house_id'] : null;
            $r['guest_house_name']  = $r['guest_house_name'] ?: ($r['guest_address'] ?: '—');
            $totalCommission       += $r['commission_amount'];

            $houseKey = $r['guest_house_id'] !== null ? (string)$r['guest_house_id'] : ('name:' . $r['guest_house_name']);
            if (!isset($houseTotalsMap[$houseKey])) {
                $houseTotalsMap[$houseKey] = [
                    'guest_house_id' => $r['guest_house_id'],
                    'guest_house_name' => $r['guest_house_name'],
                    'total_orders' => 0,
                    'total_sales' => 0.0,
                    'total_commission_paid' => 0.0,
                ];
            }
            $houseTotalsMap[$houseKey]['total_orders'] += 1;
            $houseTotalsMap[$houseKey]['total_sales'] += $r['grand_total'];
            $houseTotalsMap[$houseKey]['total_commission_paid'] += $r['commission_amount'];
        }
        unset($r);

        $houseSummary = array_values($houseTotalsMap);
        usort($houseSummary, fn($a, $b) => $b['total_commission_paid'] <=> $a['total_commission_paid']);
        foreach ($houseSummary as &$h) {
            $h['total_orders'] = (int)$h['total_orders'];
            $h['total_sales'] = round((float)$h['total_sales'], 2);
            $h['total_commission_paid'] = round((float)$h['total_commission_paid'], 2);
        }
        unset($h);

        Response::success([
            'rows'             => $rows,
            'total_commission' => round($totalCommission, 2),
            'house_summary'    => $houseSummary,
            'from_date'        => $from,
            'to_date'          => $to,
        ]);
    }

    // ================================================================
    // PAYMENT MODE REPORT
    // ================================================================

    public function paymentMode(Request $req): never
    {
        Auth::requireAdmin();

        $from = $req->queryStr('from_date') ?: $this->defaultFrom();
        $to   = $req->queryStr('to_date')   ?: $this->defaultTo();
        $type = $req->queryStr('order_type');
        $guestHouseId = $req->queryInt('guest_house_id');

        $where = [
            "DATE(b.created_at) BETWEEN ? AND ?",
            "b.payment_status = 'paid'",
        ];
        $params = [$from, $to];
        if ($type !== '') {
            $where[] = "o.order_type = ?";
            $params[] = $type;
        }
        $this->applyGuestHouseFilter($where, $params, $guestHouseId);
        $whereSql = implode(' AND ', $where);
        $ghJoin = $this->guestHouseProfileJoin();

        $rows = Database::all(
            "SELECT
                b.payment_mode,
                COUNT(b.id)        AS total_transactions,
                SUM(b.grand_total) AS total_amount
             FROM bills b
             JOIN orders o ON b.order_id = o.id
             $ghJoin
             WHERE $whereSql
             GROUP BY b.payment_mode",
            $params
        );

        foreach ($rows as &$r) {
            $r['total_transactions'] = (int)$r['total_transactions'];
            $r['total_amount']       = (float)$r['total_amount'];
        }
        unset($r);

        Response::success(['rows' => $rows, 'from_date' => $from, 'to_date' => $to]);
    }

    // ================================================================
    // CATEGORY-WISE REPORT
    // ================================================================

    public function categoryWise(Request $req): never
    {
        Auth::requireAdmin();

        $from = $req->queryStr('from_date') ?: $this->defaultFrom();
        $to   = $req->queryStr('to_date')   ?: $this->defaultTo();

        $rows = Database::all(
            "SELECT
                oi.item_category                AS category_name,
                SUM(oi.quantity)                AS total_qty,
                SUM(oi.line_total)              AS total_revenue,
                COUNT(DISTINCT oi.menu_item_id) AS item_count
             FROM order_items oi
             JOIN orders o ON oi.order_id = o.id
             JOIN bills b  ON b.order_id  = o.id
             WHERE DATE(b.created_at) BETWEEN ? AND ?
               AND b.payment_status = 'paid'
             GROUP BY oi.item_category
             ORDER BY total_revenue DESC",
            [$from, $to]
        );

        foreach ($rows as &$r) {
            $r['total_qty']     = (int)$r['total_qty'];
            $r['total_revenue'] = (float)$r['total_revenue'];
            $r['item_count']    = (int)$r['item_count'];
        }
        unset($r);

        Response::success(['rows' => $rows, 'from_date' => $from, 'to_date' => $to]);
    }

    // ================================================================
    // OCCUPANCY REPORT (guest house)
    // ================================================================

    public function occupancy(Request $req): never
    {
        Auth::requireAdmin();

        $from = $req->queryStr('from_date') ?: $this->defaultFrom();
        $to   = $req->queryStr('to_date')   ?: $this->defaultTo();

        $totalRooms = (int) Database::value('SELECT COUNT(*) FROM guest_house_rooms WHERE is_active = 1');

        // Nights occupied per day = active stays covering that day
        $rows = Database::all(
            "SELECT d.day,
                    (SELECT COUNT(*) FROM guest_house_guests g
                     WHERE g.status IN ('reserved','checked_in','checked_out')
                       AND DATE(COALESCE(g.booking_from, g.check_in_at, g.created_at)) <= d.day
                       AND DATE(COALESCE(g.booking_to, g.expected_checkout_at, g.check_out_at, d.day)) >= d.day
                    ) AS occupied_rooms
             FROM (
                 SELECT DATE_ADD(?, INTERVAL seq DAY) AS day
                 FROM (
                     SELECT a.N + b.N * 10 + c.N * 100 AS seq
                     FROM (SELECT 0 N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) a,
                          (SELECT 0 N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) b,
                          (SELECT 0 N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) c
                 ) nums
                 WHERE DATE_ADD(?, INTERVAL seq DAY) <= ?
             ) d
             ORDER BY d.day ASC",
            [$from . ' 00:00:00', $from . ' 00:00:00', $to . ' 23:59:59']
        );

        $totalRoomNights = 0;
        $occupiedNights = 0;
        foreach ($rows as &$r) {
            $r['occupied_rooms'] = min((int)$r['occupied_rooms'], $totalRooms);
            $r['occupancy_percent'] = $totalRooms > 0 ? round(($r['occupied_rooms'] / $totalRooms) * 100, 1) : 0;
            $totalRoomNights += $totalRooms;
            $occupiedNights += $r['occupied_rooms'];
        }
        unset($r);

        Response::success([
            'rows' => $rows,
            'summary' => [
                'total_rooms'       => $totalRooms,
                'days'              => count($rows),
                'avg_occupancy'     => $totalRoomNights > 0 ? round(($occupiedNights / $totalRoomNights) * 100, 1) : 0,
                'occupied_nights'   => $occupiedNights,
            ],
            'from_date' => $from,
            'to_date'   => $to,
        ]);
    }

    // ================================================================
    // PENDING PAYMENTS REPORT (guest house + restaurant credit bills)
    // ================================================================

    public function pendingPayments(Request $req): never
    {
        Auth::requireAdmin();

        $guests = Database::all(
            "SELECT g.id, g.guest_name, g.phone, g.room_no, g.status, g.check_in_at, g.check_out_at,
                    g.total_amount, g.paid_amount, g.balance_amount, g.payment_mode
             FROM guest_house_guests g
             WHERE g.balance_amount > 0 AND g.status IN ('reserved','checked_in','checked_out')
             ORDER BY g.balance_amount DESC
             LIMIT 500"
        );

        $bills = Database::all(
            "SELECT b.bill_number, b.grand_total, b.payment_status, b.created_at,
                    o.guest_name, o.order_type
             FROM bills b
             JOIN orders o ON b.order_id = o.id
             WHERE b.payment_status = 'unpaid'
             ORDER BY b.created_at DESC
             LIMIT 500"
        );

        $ghTotal = 0.0;
        foreach ($guests as $g) $ghTotal += (float)$g['balance_amount'];
        $billTotal = 0.0;
        foreach ($bills as $b) $billTotal += (float)$b['grand_total'];

        Response::success([
            'guest_house' => ['rows' => $guests, 'total' => $ghTotal],
            'bills'       => ['rows' => $bills,  'total' => $billTotal],
            'grand_total' => $ghTotal + $billTotal,
        ]);
    }
}
