<?php
/**
 * Kripa Shanti (guest house) reports.
 * Filter-wise + date-wise, rows ready for on-screen table and Excel/PDF export.
 */
class GuestHouseReportController
{
    private function q(string $key, string $default = ''): string
    {
        $v = $_GET[$key] ?? $default;
        return is_string($v) ? trim($v) : $default;
    }

    private function tableExists(string $table): bool
    {
        try {
            return !empty(Database::value('SHOW TABLES LIKE ?', [$table]));
        } catch (Throwable $e) {
            return false;
        }
    }

    private function settingsMap(): array
    {
        $m = [];
        try {
            foreach (Database::all('SELECT setting_key, setting_value FROM settings') as $r) {
                $m[$r['setting_key']] = $r['setting_value'];
            }
        } catch (Throwable $e) {
        }
        return $m;
    }

    public function index(Request $req): never
    {
        Auth::requireFrontDesk();

        $from = $this->q('from_date', date('Y-m-01'));
        $to   = $this->q('to_date', date('Y-m-d'));
        $type = $this->q('type', 'checkins');

        $fromTs = strtotime($from);
        $toTs   = strtotime($to);
        if ($fromTs === false || $toTs === false) {
            Response::unprocessable('Validation failed.', ['from_date' => ['Valid from/to date chahiye.']]);
        }
        if ($toTs < $fromTs) {
            Response::unprocessable('Validation failed.', ['to_date' => ['To date, from date ke baad honi chahiye.']]);
        }
        $fromSql = date('Y-m-d 00:00:00', $fromTs);
        $toSql   = date('Y-m-d 23:59:59', $toTs);

        $hasPayments = $this->tableExists('guest_house_payments');
        $hasCharges  = $this->tableExists('guest_house_charges');

        $baseSelect = "g.id, g.guest_name, g.phone, g.room_no, g.status, g.payment_mode,
                       g.check_in_at, g.check_out_at, g.expected_checkout_at,
                       g.booking_from, g.booking_to, g.total_amount, g.advance_amount,
                       g.paid_amount, g.balance_amount, g.adults_count, g.children_count,
                       g.extra_bed_count, g.extra_bed_rate, g.id_proof, g.address";

        $columns = [];
        $rows    = [];

        switch ($type) {
            case 'checkouts':
                $columns = $this->stayColumns();
                $rows = Database::all(
                    "SELECT $baseSelect FROM guest_house_guests g
                     WHERE g.status = 'checked_out' AND g.check_out_at BETWEEN ? AND ?
                     ORDER BY g.check_out_at DESC",
                    [$fromSql, $toSql]
                );
                break;

            case 'bookings':
                $columns = $this->stayColumns();
                $rows = Database::all(
                    "SELECT $baseSelect FROM guest_house_guests g
                     WHERE g.booking_from BETWEEN ? AND ?
                     ORDER BY g.booking_from ASC",
                    [$fromSql, $toSql]
                );
                break;

            case 'payments':
                $columns = [
                    ['key' => 'paid_at', 'label' => 'Date'],
                    ['key' => 'guest_name', 'label' => 'Guest'],
                    ['key' => 'room_no', 'label' => 'Room'],
                    ['key' => 'amount', 'label' => 'Amount'],
                    ['key' => 'payment_mode', 'label' => 'Mode'],
                    ['key' => 'note', 'label' => 'Note'],
                ];
                if ($hasPayments) {
                    $rows = Database::all(
                        "SELECT p.created_at AS paid_at, p.amount, p.payment_mode,
                                COALESCE(g.guest_name, '-') AS guest_name,
                                COALESCE(g.room_no, '-') AS room_no,
                                'Payment received' AS note
                         FROM guest_house_payments p
                         LEFT JOIN guest_house_guests g ON g.id = p.guest_id
                         WHERE p.created_at BETWEEN ? AND ?
                         ORDER BY p.created_at DESC",
                        [$fromSql, $toSql]
                    );
                } else {
                    $rows = Database::all(
                        "SELECT g.check_in_at AS paid_at, g.paid_amount AS amount, g.payment_mode,
                                g.guest_name, g.room_no, 'Opening/advance payment' AS note
                         FROM guest_house_guests g
                         WHERE g.check_in_at BETWEEN ? AND ? AND g.paid_amount > 0
                         ORDER BY g.check_in_at DESC",
                        [$fromSql, $toSql]
                    );
                }
                break;

            case 'pending':
                $columns = $this->stayColumns();
                $rows = Database::all(
                    "SELECT $baseSelect FROM guest_house_guests g
                     WHERE g.status IN ('reserved','checked_in') AND g.balance_amount > 0
                     ORDER BY g.balance_amount DESC"
                );
                break;

            case 'occupancy':
                $columns = [
                    ['key' => 'day', 'label' => 'Date'],
                    ['key' => 'occupied', 'label' => 'Occupied Rooms'],
                    ['key' => 'total_rooms', 'label' => 'Total Rooms'],
                    ['key' => 'occupancy_percent', 'label' => 'Occupancy %'],
                    ['key' => 'revenue', 'label' => 'Room Revenue'],
                ];
                $totalRooms = (int)Database::value('SELECT COUNT(*) FROM guest_house_rooms WHERE is_active = 1');
                $cursor = $fromTs;
                $guard  = 0;
                while ($cursor <= $toTs && $guard < 186) {
                    $dayStart = date('Y-m-d 00:00:00', $cursor);
                    $dayEnd   = date('Y-m-d 23:59:59', $cursor);
                    $occupied = (int)Database::value(
                        "SELECT COUNT(DISTINCT room_id) FROM guest_house_guests
                         WHERE status IN ('checked_in','checked_out','reserved')
                           AND COALESCE(booking_from, check_in_at) <= ?
                           AND COALESCE(booking_to, expected_checkout_at, check_out_at, ?) >= ?",
                        [$dayEnd, $dayEnd, $dayStart]
                    );
                    $revenue = (float)Database::value(
                        "SELECT COALESCE(SUM(total_amount), 0) FROM guest_house_guests
                         WHERE COALESCE(booking_from, check_in_at) BETWEEN ? AND ?",
                        [$dayStart, $dayEnd]
                    );
                    $rows[] = [
                        'day'               => date('Y-m-d', $cursor),
                        'occupied'          => $occupied,
                        'total_rooms'       => $totalRooms,
                        'occupancy_percent' => $totalRooms > 0 ? round($occupied * 100 / $totalRooms, 1) : 0,
                        'revenue'           => round($revenue, 2),
                    ];
                    $cursor = strtotime('+1 day', $cursor);
                    $guard++;
                }
                break;

            case 'summary':
            default:
                $type    = 'checkins';
                $columns = $this->stayColumns();
                $rows = Database::all(
                    "SELECT $baseSelect FROM guest_house_guests g
                     WHERE g.check_in_at BETWEEN ? AND ?
                     ORDER BY g.check_in_at DESC",
                    [$fromSql, $toSql]
                );
                break;
        }

        $stays = Database::row(
            "SELECT COUNT(*) AS stays,
                    COALESCE(SUM(total_amount), 0) AS billed,
                    COALESCE(SUM(paid_amount), 0) AS collected,
                    COALESCE(SUM(balance_amount), 0) AS pending,
                    COALESCE(SUM(adults_count + children_count), 0) AS persons
             FROM guest_house_guests
             WHERE check_in_at BETWEEN ? AND ?",
            [$fromSql, $toSql]
        ) ?: ['stays' => 0, 'billed' => 0, 'collected' => 0, 'pending' => 0, 'persons' => 0];

        $bookingsCount = (int)Database::value(
            "SELECT COUNT(*) FROM guest_house_guests WHERE booking_from BETWEEN ? AND ? AND status = 'reserved'",
            [$fromSql, $toSql]
        );
        $advanceTotal = (float)Database::value(
            "SELECT COALESCE(SUM(advance_amount), 0) FROM guest_house_guests WHERE booking_from BETWEEN ? AND ?",
            [$fromSql, $toSql]
        );
        $chargesTotal = 0.0;
        if ($hasCharges) {
            $chargesTotal = (float)Database::value(
                'SELECT COALESCE(SUM(amount), 0) FROM guest_house_charges WHERE created_at BETWEEN ? AND ?',
                [$fromSql, $toSql]
            );
        }
        $collected = 0.0;
        if ($hasPayments) {
            $collected = (float)Database::value(
                'SELECT COALESCE(SUM(amount), 0) FROM guest_house_payments WHERE created_at BETWEEN ? AND ?',
                [$fromSql, $toSql]
            );
        }

        $m = $this->settingsMap();
        $totalRooms = (int)Database::value('SELECT COUNT(*) FROM guest_house_rooms WHERE is_active = 1');

        Response::success([
            'type'      => $type,
            'from_date' => date('Y-m-d', $fromTs),
            'to_date'   => date('Y-m-d', $toTs),
            'columns'   => $columns,
            'rows'      => $rows,
            'summary'   => [
                'total_rooms'      => $totalRooms,
                'stays'            => (int)$stays['stays'],
                'persons'          => (int)$stays['persons'],
                'check_ins'        => (int)Database::value(
                    'SELECT COUNT(*) FROM guest_house_guests WHERE check_in_at BETWEEN ? AND ?',
                    [$fromSql, $toSql]
                ),
                'check_outs'       => (int)Database::value(
                    "SELECT COUNT(*) FROM guest_house_guests WHERE status = 'checked_out' AND check_out_at BETWEEN ? AND ?",
                    [$fromSql, $toSql]
                ),
                'bookings'         => $bookingsCount,
                'advance'          => round($advanceTotal, 2),
                'billed'           => round((float)$stays['billed'], 2),
                'collected'        => round($collected > 0 ? $collected : (float)$stays['collected'], 2),
                'outstanding'      => round((float)$stays['pending'], 2),
                'extra_charges'    => round($chargesTotal, 2),
                'gst_percent'      => (float)($m['tax_percentage'] ?? 0),
            ],
            'house' => [
                'name'    => $m['guest_house_name'] ?? 'Kripa Shanti Atithi Bhavan',
                'address' => $m['guest_house_address'] ?? '',
                'phone'   => $m['guest_house_phone'] ?? '',
                'gst'     => $m['gst_number'] ?? '',
                'logo'    => $m['logo_data'] ?? '',
            ],
            'generated_at' => date('Y-m-d H:i:s'),
        ]);
    }

    private function stayColumns(): array
    {
        return [
            ['key' => 'guest_name',       'label' => 'Guest'],
            ['key' => 'phone',            'label' => 'Mobile'],
            ['key' => 'room_no',          'label' => 'Room'],
            ['key' => 'check_in_at',      'label' => 'Check-in'],
            ['key' => 'check_out_at',     'label' => 'Check-out'],
            ['key' => 'expected_checkout_at', 'label' => 'Expected Out'],
            ['key' => 'adults_count',     'label' => 'Adults'],
            ['key' => 'children_count',   'label' => 'Children'],
            ['key' => 'total_amount',     'label' => 'Total'],
            ['key' => 'paid_amount',      'label' => 'Paid'],
            ['key' => 'balance_amount',   'label' => 'Balance'],
            ['key' => 'payment_mode',     'label' => 'Mode'],
            ['key' => 'status',           'label' => 'Status'],
        ];
    }
}
