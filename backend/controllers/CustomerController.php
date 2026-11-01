<?php
class CustomerController
{
    public function index(Request $req): never
    {
        Auth::requireAdmin();
        CustomerService::ensureSchema();
        CustomerService::importExistingGuestContacts();

        $q = $req->queryStr('q');
        $type = strtoupper($req->queryStr('contact_type'));
        $idsOnly = $req->query('ids_only') === '1' || $req->query('ids_only') === 'true';
        $includeInactive = $req->query('include_inactive') === '1';
        $page = max(1, $req->queryInt('page', 1));
        $perPage = Helper::clamp($req->queryInt('limit', $req->queryInt('per_page', 50)), 1, 200);

        $params = [];
        $where = $includeInactive ? '1=1' : 'is_active = 1';
        if (in_array($type, ['CUSTOMER', 'GUEST_HOUSE', 'OTHER'], true)) {
            $where .= ' AND contact_type = ?';
            $params[] = $type;
        }
        if ($q !== '') {
            $where .= ' AND (name LIKE ? OR mobile_number LIKE ? OR mobile_normalized LIKE ?)';
            $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $q) . '%';
            $params[] = $like;
            $params[] = $like;
            $norm = CustomerService::normalizeMobile($q);
            $params[] = $norm ? '%' . $norm . '%' : $like;
        }

        if ($idsOnly) {
            $ids = Database::all(
                "SELECT id FROM customers WHERE $where ORDER BY id ASC LIMIT " . (int) MESSAGING_MAX_RECIPIENTS,
                $params
            );
            $list = array_map(static fn(array $r) => (int) $r['id'], $ids);
            Response::success([
                'ids'   => $list,
                'total' => count($list),
            ]);
        }

        $total = (int) Database::value("SELECT COUNT(*) FROM customers WHERE $where", $params);
        $offset = ($page - 1) * $perPage;
        $rows = Database::all(
            "SELECT * FROM customers WHERE $where
             ORDER BY name IS NULL, name ASC, id DESC
             LIMIT " . (int) $perPage . ' OFFSET ' . (int) $offset,
            $params
        );

        $data = array_map([CustomerService::class, 'formatRow'], $rows);
        Response::success([
            'customers'  => $data,
            'pagination' => Helper::paginate($total, $page, $perPage),
        ]);
    }

    public function create(Request $req): never
    {
        $payload = Auth::requireAdmin();
        CustomerService::ensureSchema();

        $v = Validator::make($req->body())
            ->required('mobile_number', 'Mobile Number')->string('mobile_number', 7, 20)->phone('mobile_number', 'Mobile Number')
            ->string('name', 0, 100)
            ->in('contact_type', ['CUSTOMER', 'GUEST_HOUSE', 'OTHER'], 'Contact Type');
        if ($v->fails()) {
            Response::unprocessable('Validation failed.', $v->errors());
        }

        $mobile = $req->bodyStr('mobile_number');
        $normalized = CustomerService::normalizeMobile($mobile);
        if ($normalized === null) {
            Response::unprocessable('Validation failed.', ['mobile_number' => ['Mobile Number must be a valid phone number.']]);
        }

        $dup = Database::row('SELECT id FROM customers WHERE mobile_normalized = ?', [$normalized]);
        if ($dup) {
            Response::error('A customer with this mobile number already exists.', 409);
        }

        $name = $req->bodyStr('name') ?: null;
        $type = CustomerService::normalizeContactType($req->bodyStr('contact_type', 'CUSTOMER'));
        $wa = $this->boolVal($req->body('whatsapp_opt_in', true), true);
        $sms = $this->boolVal($req->body('sms_opt_in', true), true);

        Database::run(
            'INSERT INTO customers (name, mobile_number, mobile_normalized, contact_type, is_active, whatsapp_opt_in, sms_opt_in)
             VALUES (?, ?, ?, ?, 1, ?, ?)',
            [$name, $mobile, $normalized, $type, $wa ? 1 : 0, $sms ? 1 : 0]
        );
        $id = Database::lastId();
        Helper::log((int) $payload['admin_id'], 'create_customer', 'customers', $id, "Customer {$mobile}");

        Response::created(
            CustomerService::formatRow(Database::row('SELECT * FROM customers WHERE id = ?', [$id])),
            'Customer saved.'
        );
    }

    public function update(Request $req, int $id): never
    {
        $payload = Auth::requireAdmin();
        CustomerService::ensureSchema();

        $row = CustomerService::find($id);
        if (!$row) {
            Response::notFound('Customer not found.');
        }

        $v = Validator::make($req->body())
            ->required('mobile_number', 'Mobile Number')->string('mobile_number', 7, 20)->phone('mobile_number', 'Mobile Number')
            ->string('name', 0, 100)
            ->in('contact_type', ['CUSTOMER', 'GUEST_HOUSE', 'OTHER'], 'Contact Type');
        if ($v->fails()) {
            Response::unprocessable('Validation failed.', $v->errors());
        }

        $mobile = $req->bodyStr('mobile_number');
        $normalized = CustomerService::normalizeMobile($mobile);
        if ($normalized === null) {
            Response::unprocessable('Validation failed.', ['mobile_number' => ['Mobile Number must be a valid phone number.']]);
        }

        $dup = Database::row(
            'SELECT id FROM customers WHERE mobile_normalized = ? AND id != ?',
            [$normalized, $id]
        );
        if ($dup) {
            Response::error('A customer with this mobile number already exists.', 409);
        }

        $name = $req->bodyStr('name') ?: null;
        $type = CustomerService::normalizeContactType($req->bodyStr('contact_type', $row['contact_type'] ?? 'CUSTOMER'));
        $active = $this->boolVal($req->body('is_active', $row['is_active'] ?? 1), !isset($row['is_active']) || (int) $row['is_active'] === 1);
        $wa = $this->boolVal($req->body('whatsapp_opt_in', $row['whatsapp_opt_in']), (bool) $row['whatsapp_opt_in']);
        $sms = $this->boolVal($req->body('sms_opt_in', $row['sms_opt_in']), (bool) $row['sms_opt_in']);

        Database::run(
            'UPDATE customers
             SET name = ?, mobile_number = ?, mobile_normalized = ?, contact_type = ?, is_active = ?, whatsapp_opt_in = ?, sms_opt_in = ?, updated_at = NOW()
             WHERE id = ?',
            [$name, $mobile, $normalized, $type, $active ? 1 : 0, $wa ? 1 : 0, $sms ? 1 : 0, $id]
        );
        Helper::log((int) $payload['admin_id'], 'update_customer', 'customers', $id, "Customer {$mobile}");

        Response::success(
            CustomerService::formatRow(Database::row('SELECT * FROM customers WHERE id = ?', [$id])),
            'Customer updated.'
        );
    }

    public function delete(Request $req, int $id): never
    {
        $payload = Auth::requireAdmin();
        CustomerService::ensureSchema();

        $row = CustomerService::find($id);
        if (!$row) {
            Response::notFound('Customer not found.');
        }

        Database::run('UPDATE customers SET is_active = 0, updated_at = NOW() WHERE id = ?', [$id]);
        Helper::log((int) $payload['admin_id'], 'deactivate_customer', 'customers', $id, "Deactivated {$row['mobile_number']}");

        Response::success(null, 'Customer deactivated.');
    }

    private function boolVal(mixed $value, bool $default): bool
    {
        if ($value === null) {
            return $default;
        }
        if (is_bool($value)) {
            return $value;
        }
        if (is_numeric($value)) {
            return (int) $value === 1;
        }
        $s = strtolower(trim((string) $value));
        if (in_array($s, ['1', 'true', 'yes', 'on'], true)) {
            return true;
        }
        if (in_array($s, ['0', 'false', 'no', 'off'], true)) {
            return false;
        }
        return $default;
    }

    /**
     * Date-wise audience: guest house me kis date range me kaun aaya / kaun tha.
     * Returns customer rows (existing) + guests that are not yet customers, so the
     * admin can select and message them on WhatsApp.
     */
    public function byDate(Request $req): never
    {
        Auth::requireAdmin();
        CustomerService::ensureSchema();

        $from = trim($req->queryStr('from_date'));
        $to   = trim($req->queryStr('to_date'));
        $mode = trim($req->queryStr('mode')) ?: 'checkin';

        $fromTs = $from !== '' ? strtotime($from) : strtotime(date('Y-m-01'));
        $toTs   = $to !== '' ? strtotime($to) : strtotime(date('Y-m-d'));
        if ($fromTs === false || $toTs === false) {
            Response::unprocessable('Validation failed.', ['from_date' => ['Valid from/to date chahiye.']]);
        }
        if ($toTs < $fromTs) {
            Response::unprocessable('Validation failed.', ['to_date' => ['To date, from date ke baad honi chahiye.']]);
        }
        $fromSql = date('Y-m-d 00:00:00', $fromTs);
        $toSql   = date('Y-m-d 23:59:59', $toTs);

        $dateCol = match ($mode) {
            'checkout' => 'g.check_out_at',
            'stay'     => 'g.booking_from',
            default    => 'g.check_in_at',
        };

        $guests = Database::all(
            "SELECT g.id AS guest_id, g.guest_name, g.phone, g.room_no, g.status,
                    g.check_in_at, g.check_out_at, g.total_amount, g.paid_amount, g.balance_amount
             FROM guest_house_guests g
             WHERE $dateCol BETWEEN ? AND ?
             ORDER BY $dateCol DESC
             LIMIT 500",
            [$fromSql, $toSql]
        );

        $norm = static function (string $raw): string {
            $d = preg_replace('/\D+/', '', $raw);
            return strlen($d) > 10 ? substr($d, -10) : $d;
        };

        $map = [];
        try {
            foreach (Database::all('SELECT id, name, mobile_number, mobile_normalized FROM customers') as $c) {
                $map[$c['mobile_normalized']] = $c;
            }
        } catch (Throwable $e) {
        }

        $out = [];
        $seen = [];
        foreach ($guests as $g) {
            $n = $norm((string)$g['phone']);
            if ($n === '' || isset($seen[$n])) continue;
            $seen[$n] = true;
            $match = $map[$n] ?? null;
            if (!$match) {
                // Guest abhi customers table me nahi hai → contact bana do (WhatsApp ke liye zaroori)
                try {
                    CustomerService::upsertFromContact($g['guest_name'], $g['phone'], true, 'GUEST_HOUSE');
                    $match = Database::row(
                        'SELECT id, name, mobile_number FROM customers WHERE mobile_normalized = ? LIMIT 1',
                        [$n]
                    );
                    if ($match) $map[$n] = $match;
                } catch (Throwable $e) {
                }
            }
            $out[] = [
                'customer_id'   => $match ? (int)$match['id'] : null,
                'name'          => $g['guest_name'] ?: ($match['name'] ?? null),
                'mobile_number' => $g['phone'],
                'room_no'       => $g['room_no'],
                'status'        => $g['status'],
                'check_in_at'   => $g['check_in_at'],
                'check_out_at'  => $g['check_out_at'],
                'balance'       => (float)$g['balance_amount'],
                'is_customer'   => (bool)$match,
            ];
        }

        Response::success([
            'from_date' => date('Y-m-d', $fromTs),
            'to_date'   => date('Y-m-d', $toTs),
            'mode'      => $mode,
            'total'     => count($out),
            'guests'    => $out,
        ]);
    }

}
