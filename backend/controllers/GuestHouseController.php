<?php
class GuestHouseController
{
    private bool $schemaEnsured = false;

    private function ensureAdvancedSchema(): void
    {
        if ($this->schemaEnsured) return;
        $this->schemaEnsured = true;

        try {
            $this->addColumnIfMissing('guest_house_guests', 'payment_mode', "ALTER TABLE guest_house_guests ADD COLUMN payment_mode VARCHAR(20) NOT NULL DEFAULT 'cash' AFTER id_proof");
            $this->addColumnIfMissing('guest_house_guests', 'total_amount', "ALTER TABLE guest_house_guests ADD COLUMN total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER payment_mode");
            $this->addColumnIfMissing('guest_house_guests', 'advance_amount', "ALTER TABLE guest_house_guests ADD COLUMN advance_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER total_amount");
            $this->addColumnIfMissing('guest_house_guests', 'paid_amount', "ALTER TABLE guest_house_guests ADD COLUMN paid_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER advance_amount");
            $this->addColumnIfMissing('guest_house_guests', 'balance_amount', "ALTER TABLE guest_house_guests ADD COLUMN balance_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER paid_amount");
            $this->addColumnIfMissing('guest_house_guests', 'expected_checkout_at', "ALTER TABLE guest_house_guests ADD COLUMN expected_checkout_at DATETIME DEFAULT NULL AFTER check_out_at");
            $this->addColumnIfMissing('guest_house_guests', 'booking_from', "ALTER TABLE guest_house_guests ADD COLUMN booking_from DATETIME DEFAULT NULL AFTER expected_checkout_at");
            $this->addColumnIfMissing('guest_house_guests', 'booking_to', "ALTER TABLE guest_house_guests ADD COLUMN booking_to DATETIME DEFAULT NULL AFTER booking_from");
            $this->addColumnIfMissing('guest_house_guests', 'adults_count', "ALTER TABLE guest_house_guests ADD COLUMN adults_count INT NOT NULL DEFAULT 1 AFTER phone");
            $this->addColumnIfMissing('guest_house_guests', 'children_count', "ALTER TABLE guest_house_guests ADD COLUMN children_count INT NOT NULL DEFAULT 0 AFTER adults_count");
            $this->addColumnIfMissing('guest_house_guests', 'companions', "ALTER TABLE guest_house_guests ADD COLUMN companions TEXT NULL AFTER children_count");
            $this->addColumnIfMissing('guest_house_guests', 'companions_id_details', "ALTER TABLE guest_house_guests ADD COLUMN companions_id_details TEXT NULL AFTER companions");
            $this->addColumnIfMissing('guest_house_rooms', 'category_id', "ALTER TABLE guest_house_rooms ADD COLUMN category_id INT UNSIGNED DEFAULT NULL AFTER room_type");
            $this->syncRoomCategories();
            Database::run("ALTER TABLE guest_house_guests
                MODIFY COLUMN status ENUM('reserved','checked_in','checked_out','cancelled') NOT NULL DEFAULT 'checked_in'");
        } catch (Throwable $e) {
            // keep backward compatibility when ALTER ... IF NOT EXISTS is unavailable
        }
    }

    /**
     * Purane rooms jinki category set nahi thi — unhe room_type ke naam se category se jodo.
     * Isi wajah se card par hamesha "Standard" dikh raha tha. Sirf tab chalta hai jab
     * sach me koi room category ke bina chhoot gaya ho.
     */
    private function syncRoomCategories(): void
    {
        try {
            if (!$this->tableExists('guest_house_room_categories')) return;
            if (!$this->columnExists('guest_house_rooms', 'category_id')) return;

            $pending = (int) Database::value(
                "SELECT COUNT(*) FROM guest_house_rooms WHERE is_active = 1 AND category_id IS NULL"
            );

            // Pass 2: stale category_id — room kisi aisi category ko point kar raha hai
            // jo ab active nahi hai (categories delete karke dobara banayi gayi thi to
            // unke ID badal gaye). Dashboard par naam room_type fallback se sahi dikh
            // jata hai, isliye wahan sab set lagta hai — par walk-in dropdown me wahi
            // category khaali aa jati thi. Aise rooms ko unke room_type naam se wapas
            // sahi (nayi) category se jodo.
            $staleRows = Database::all(
                "SELECT r.id, r.room_type
                 FROM guest_house_rooms r
                 LEFT JOIN guest_house_room_categories c ON c.id = r.category_id AND c.is_active = 1
                 WHERE r.is_active = 1 AND r.category_id IS NOT NULL AND c.id IS NULL"
            );
            foreach ($staleRows as $row) {
                $label = trim((string) ($row['room_type'] ?? ''));
                if ($label === '') continue;
                $catId = (int) Database::value(
                    "SELECT id FROM guest_house_room_categories WHERE name = ? AND is_active = 1 LIMIT 1",
                    [$label]
                );
                if ($catId > 0) {
                    Database::run(
                        "UPDATE guest_house_rooms SET category_id = ?, updated_at = NOW() WHERE id = ?",
                        [$catId, (int) $row['id']]
                    );
                }
            }

            if ($pending === 0) return;

            $rows = Database::all(
                "SELECT id, room_type FROM guest_house_rooms WHERE is_active = 1 AND category_id IS NULL"
            );
            foreach ($rows as $row) {
                $label = trim((string) ($row['room_type'] ?? ''));
                if ($label === '') $label = 'Standard';

                $catId = (int) Database::value(
                    "SELECT id FROM guest_house_room_categories WHERE name = ? LIMIT 1",
                    [$label]
                );
                if ($catId === 0) {
                    Database::run(
                        "INSERT INTO guest_house_room_categories (name, is_active, created_by)
                         SELECT ?, 1, COALESCE((SELECT MIN(id) FROM admin_users), 1)",
                        [$label]
                    );
                    $catId = Database::lastId();
                }
                Database::run(
                    "UPDATE guest_house_rooms SET category_id = ?, room_type = ?, updated_at = NOW() WHERE id = ?",
                    [$catId, $label, (int) $row['id']]
                );
            }
        } catch (Throwable $e) {
            // non-fatal — display phir bhi kaam karta rahega
        }
    }

    private function addColumnIfMissing(string $table, string $column, string $sql): void
    {
        if ($this->columnExists($table, $column)) return;
        Database::run($sql);
    }

    private function overlaps(string $from, string $to): string
    {
        return "(? < booking_to AND ? > booking_from)";
    }

    private function parseDateTime(string $field, string $value): string
    {
        if ($value === '') Response::unprocessable('Validation failed.', [$field => ["$field is required."]]);
        $ts = strtotime($value);
        if ($ts === false) Response::unprocessable('Validation failed.', [$field => ["$field must be a valid date/time."]]);
        return date('Y-m-d H:i:s', $ts);
    }

    private function paymentMode(string $mode): string
    {
        $modes = ['cash', 'upi', 'card', 'credit', 'bank'];
        $mode = strtolower(trim($mode));
        return in_array($mode, $modes, true) ? $mode : 'cash';
    }

    private function roomConflictMessage(array $booking): string
    {
        return "Room {$booking['room_no']} already booked from {$booking['booking_from']} to {$booking['booking_to']}.";
    }
    private function tableExists(string $table): bool
    {
        try {
            // Query information_schema instead of parameterizing SHOW TABLES.
            // This works reliably with PDO native prepared statements on MariaDB/MySQL.
            $exists = Database::value(
                "SELECT COUNT(*) FROM information_schema.TABLES
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
                [$table]
            );
            return (int) $exists > 0;
        } catch (Throwable $e) {
            return false;
        }
    }

    /**
     * MySQL/MariaDB: SHOW COLUMNS ... LIKE ? ko native prepared statement ke sath
     * kabhi kabhi khaali result milta hai. Isliye information_schema se poochte hain —
     * yehi wajah thi ki category_id column "missing" maan liya jata tha aur har room
     * ka category "Standard" ban jata tha.
     */
    private function columnExists(string $table, string $column): bool
    {
        try {
            $exists = Database::value(
                "SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                [$table, $column]
            );
            if ((int) $exists > 0) return true;

            // fallback (kuch shared hosts information_schema restrict karte hain)
            $cols = Database::all("SHOW COLUMNS FROM `{$table}`");
            foreach ($cols as $c) {
                if (strcasecmp((string) ($c['Field'] ?? ''), $column) === 0) return true;
            }
            return false;
        } catch (Throwable $e) {
            try {
                $cols = Database::all("SHOW COLUMNS FROM `{$table}`");
                foreach ($cols as $c) {
                    if (strcasecmp((string) ($c['Field'] ?? ''), $column) === 0) return true;
                }
            } catch (Throwable $e2) {
                // ignore
            }
            return false;
        }
    }

    public function roomCategories(Request $req): never
    {
        Auth::requireFrontDesk();
        try {
            $rows = Database::all(
                "SELECT id, name, is_active
                 FROM guest_house_room_categories
                 WHERE is_active = 1
                 ORDER BY name ASC"
            );
            Response::success($rows);
        } catch (Throwable $e) {
            Response::success([]);
        }
    }

    public function createRoomCategory(Request $req): never
    {
        $payload = Auth::requireFrontDesk();
        $v = Validator::make($req->body())
            ->required('name', 'Category Name')->string('name', 2, 80);
        if ($v->fails()) Response::unprocessable('Validation failed.', $v->errors());

        $name = $req->bodyStr('name');
        try {
            $exists = Database::row(
                "SELECT id, name, is_active
                 FROM guest_house_room_categories
                 WHERE name = ?
                 LIMIT 1",
                [$name]
            );
            if ($exists) Response::success($exists, 'Category already exists.');

            Database::run(
                "INSERT INTO guest_house_room_categories (name, created_by) VALUES (?, ?)",
                [$name, (int)$payload['admin_id']]
            );
            $id = Database::lastId();
            $row = Database::row("SELECT id, name, is_active FROM guest_house_room_categories WHERE id = ?", [$id]);
            Response::created($row, 'Room category created.');
        } catch (Throwable $e) {
            Response::serverError('Failed to create room category.');
        }
    }

    public function createRoom(Request $req): never
    {
        $payload = Auth::requireFrontDesk();
        $v = Validator::make($req->body())
            ->required('room_no', 'Room Number')->string('room_no', 1, 20)
            ->required('floor_no', 'Floor')->string('floor_no', 1, 20)
            ->numeric('rent', 0, 9999999, 'Rent');
        if ($v->fails()) Response::unprocessable('Validation failed.', $v->errors());

        $roomNo = $req->bodyStr('room_no');
        $floorNo = $req->bodyStr('floor_no');
        $categoryId = (int)$req->bodyInt('category_id', 0);
        $roomType = $req->bodyStr('room_type');
        $rent = max(0, $req->bodyFloat('rent', 0));

        try {
            $exists = Database::value(
                "SELECT COUNT(*) FROM guest_house_rooms WHERE room_no = ?",
                [$roomNo]
            );
            if ((int)$exists > 0) Response::error("Room {$roomNo} already exists.", 409);

            if ($categoryId > 0) {
                $catExists = Database::value(
                    "SELECT COUNT(*) FROM guest_house_room_categories WHERE id = ? AND is_active = 1",
                    [$categoryId]
                );
                if ((int)$catExists === 0) Response::notFound('Room category not found.');
            }

            // Category hi asli source hai — room_type me bhi wahi naam likho,
            // warna purani queries/reports me galti se "Standard" aa jata hai.
            if ($categoryId > 0) {
                $catName = (string) Database::value(
                    "SELECT name FROM guest_house_room_categories WHERE id = ?",
                    [$categoryId]
                );
                if (trim($catName) !== '') $roomType = trim($catName);
            }

            Database::run(
                "INSERT INTO guest_house_rooms (room_no, room_type, floor_no, category_id, rent, status, is_active, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, 'available', 1, NOW(), NOW())",
                [$roomNo, $roomType ?: null, $floorNo, $categoryId > 0 ? $categoryId : null, $rent]
            );
            $id = Database::lastId();
            Helper::log((int)$payload['admin_id'], 'create_room', 'guest_house', $id, "Room {$roomNo} created.");
            Response::created(['id' => $id], 'Room created successfully.');
        } catch (Throwable $e) {
            Response::serverError('Failed to create room.');
        }
    }

    public function profiles(Request $req): never
    {
        Auth::requireFrontDesk();
        try {
            $q = trim($req->queryStr('q'));
            $params = [];
            $where = 'WHERE is_active = 1';
            if ($q !== '') {
                $where .= ' AND (name LIKE ? OR address LIKE ?)';
                $like = '%' . $q . '%';
                $params[] = $like;
                $params[] = $like;
            }

            // No tiny LIMIT — old LIMIT 200 hid names like "test…" when A–S filled the page.
            // Search (q) returns matching rows; empty q returns full active list (capped safely).
            $limit = $q !== '' ? 150 : 5000;

            $rows = Database::all(
                "SELECT id, name, address
                 FROM guest_house_profiles
                 $where
                 ORDER BY name ASC
                 LIMIT {$limit}",
                $params
            );
            Response::success($rows);
        } catch (Throwable $e) {
            // Table may not exist in older DB before migration.
            Response::success([]);
        }
    }

    public function createProfile(Request $req): never
    {
        $payload = Auth::requireFrontDesk();
        $v = Validator::make($req->body())
            ->required('name', 'Guest House Name')->string('name', 2, 120)
            ->required('address', 'Address')->string('address', 2, 255);
        if ($v->fails()) Response::unprocessable('Validation failed.', $v->errors());

        $name = $req->bodyStr('name');
        $address = $req->bodyStr('address');
        try {
            $exists = Database::row(
                "SELECT id, name, address
                 FROM guest_house_profiles
                 WHERE name = ? AND address = ? AND is_active = 1
                 LIMIT 1",
                [$name, $address]
            );
            if ($exists) {
                Response::success($exists, 'Profile already exists.');
            }

            Database::run(
                "INSERT INTO guest_house_profiles (name, address, created_by)
                 VALUES (?, ?, ?)",
                [$name, $address, (int)$payload['admin_id']]
            );
            $id = Database::lastId();
            $row = Database::row(
                "SELECT id, name, address FROM guest_house_profiles WHERE id = ?",
                [$id]
            );
            Response::created($row, 'Guest house profile saved.');
        } catch (Throwable $e) {
            Response::serverError('Failed to save guest house profile.');
        }
    }

    public function dashboard(Request $req): never
    {
        Auth::requireFrontDesk();
        $this->ensureAdvancedSchema();

        $summary = Database::row(
            "SELECT
                COUNT(*) AS total_rooms,
                SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) AS available_rooms,
                SUM(CASE WHEN status = 'booked' THEN 1 ELSE 0 END) AS booked_rooms,
                SUM(CASE WHEN status = 'cleaning' THEN 1 ELSE 0 END) AS cleaning_rooms,
                SUM(CASE WHEN status = 'maintenance' THEN 1 ELSE 0 END) AS maintenance_rooms
             FROM guest_house_rooms
             WHERE is_active = 1"
        ) ?: ['total_rooms' => 0, 'available_rooms' => 0, 'booked_rooms' => 0, 'cleaning_rooms' => 0, 'maintenance_rooms' => 0];

        $activeGuests = (int) Database::value(
            "SELECT COUNT(*) FROM guest_house_guests WHERE status = 'checked_in'"
        );

        $todayCheckIns = (int) Database::value(
            "SELECT COUNT(*) FROM guest_house_guests WHERE status IN ('checked_in','checked_out') AND DATE(check_in_at) = ?",
            [date('Y-m-d')]
        );

        $todayCheckOuts = (int) Database::value(
            "SELECT COUNT(*) FROM guest_house_guests WHERE status = 'checked_out' AND DATE(check_out_at) = ?",
            [date('Y-m-d')]
        );

        // Money actually collected on guest-house stays today (payments ledger first, column fallback)
        $todayIncome = 0.0;
        try {
            $todayIncome = (float) Database::value(
                "SELECT COALESCE(SUM(amount), 0) FROM guest_house_payments WHERE DATE(created_at) = ?",
                [date('Y-m-d')]
            );
        } catch (Throwable $e) {
            $todayIncome = (float) Database::value(
                "SELECT COALESCE(SUM(paid_amount), 0) FROM guest_house_guests WHERE DATE(check_in_at) = ?",
                [date('Y-m-d')]
            );
        }

        // Pending = balance still owed on active (reserved / checked-in) stays
        $pendingPayments = (float) Database::value(
            "SELECT COALESCE(SUM(balance_amount), 0) FROM guest_house_guests
             WHERE status IN ('reserved','checked_in') AND balance_amount > 0"
        );
        $pendingCount = (int) Database::value(
            "SELECT COUNT(*) FROM guest_house_guests
             WHERE status IN ('reserved','checked_in') AND balance_amount > 0"
        );

        $hasCategoryTable = $this->tableExists('guest_house_room_categories');
        $hasCategoryCol = $this->columnExists('guest_house_rooms', 'category_id');
        $joinCategory = $hasCategoryTable && $hasCategoryCol;

        $rooms = Database::all(
            "SELECT r.id, r.room_no, r.room_type, r.floor_no, r.status, r.rent,
                    " . ($hasCategoryCol ? "r.category_id," : "NULL AS category_id,") . "
                    " . ($joinCategory ? "COALESCE(c.name, NULLIF(r.room_type, ''), 'Uncategorised')" : "COALESCE(NULLIF(r.room_type, ''), 'Uncategorised')") . " AS category_name,
                    g.id AS guest_id, g.guest_name, g.phone, g.id_proof, g.check_in_at, g.expected_checkout_at, g.balance_amount,
                    g.total_amount, g.paid_amount
             FROM guest_house_rooms r
             " . ($joinCategory ? "LEFT JOIN guest_house_room_categories c ON c.id = r.category_id" : "") . "
             LEFT JOIN guest_house_guests g
               ON g.room_id = r.id AND g.status = 'checked_in'
             WHERE r.is_active = 1
             ORDER BY CAST(r.room_no AS UNSIGNED), r.room_no"
        );

        // Per-guest extra charges (food/laundry/other) for rooms with checked-in guests
        $hasChargesTable = $this->tableExists('guest_house_charges');
        $extraCharges = [];
        if ($hasChargesTable) {
            foreach (Database::all(
                "SELECT guest_id, charge_type, COALESCE(SUM(amount), 0) AS total
                 FROM guest_house_charges GROUP BY guest_id, charge_type"
            ) as $c) {
                $extraCharges[(int)$c['guest_id']][$c['charge_type']] = (float)$c['total'];
            }
        }
        foreach ($rooms as &$room) {
            $gid = (int)($room['guest_id'] ?? 0);
            $room['food_charges']    = $extraCharges[$gid]['food'] ?? 0.0;
            $room['laundry_charges'] = $extraCharges[$gid]['laundry'] ?? 0.0;
            $room['other_charges']   = $extraCharges[$gid]['other'] ?? 0.0;
        }
        unset($room);

        $recentGuests = Database::all(
            "SELECT g.id, g.guest_name, g.phone, g.address, g.id_proof, g.room_id, r.category_id,
                    g.status, g.room_no, g.check_in_at, g.check_out_at, g.expected_checkout_at,
                    g.total_amount, g.advance_amount, g.paid_amount, g.balance_amount, g.payment_mode,
                    g.booking_from, g.booking_to, g.adults_count, g.children_count, g.extra_bed_count, g.extra_bed_rate,
                    g.id_proof_photo, g.guest_photo,
                    g.companions, g.companions_id_details
             FROM guest_house_guests g
             LEFT JOIN guest_house_rooms r ON r.id = g.room_id
             WHERE g.status IN ('checked_in','checked_out')
             ORDER BY g.created_at DESC
             LIMIT 12"
        );

        $dueCheckouts = Database::all(
            "SELECT id, guest_name, room_no, expected_checkout_at
             FROM guest_house_guests
             WHERE status = 'checked_in'
               AND expected_checkout_at IS NOT NULL
               AND expected_checkout_at <= NOW()
             ORDER BY expected_checkout_at ASC
             LIMIT 20"
        );

        Response::success([
            'summary' => [
                'total_rooms'         => (int) $summary['total_rooms'],
                'available_rooms'     => (int) $summary['available_rooms'],
                'booked_rooms'        => (int) $summary['booked_rooms'],
                'cleaning_rooms'      => (int) ($summary['cleaning_rooms'] ?? 0),
                'maintenance_rooms'   => (int) ($summary['maintenance_rooms'] ?? 0),
                'active_guests'       => $activeGuests,
                'today_check_ins'     => $todayCheckIns,
                'today_check_outs'    => $todayCheckOuts,
                'today_income'        => $todayIncome,
                'pending_payments'    => $pendingPayments,
                'pending_count'       => $pendingCount,
            ],
            'rooms' => $rooms,
            'recent_guests' => $recentGuests,
            'due_checkouts' => $dueCheckouts,
        ]);
    }

    public function availableRooms(Request $req): never
    {
        Auth::requireFrontDesk();
        $this->ensureAdvancedSchema();

        $categoryId = $req->queryInt('category_id', 0);
        $excludeGuestId = $req->queryInt('exclude_guest_id', 0);
        $from = trim($req->queryStr('from_date'));
        $to   = trim($req->queryStr('to_date'));

        // Dates optional — khaali ho to aaj se 1 din ka window.
        $fromTs = $from !== '' ? strtotime($from) : false;
        if ($fromTs === false) $fromTs = time();
        $toTs = $to !== '' ? strtotime($to) : false;
        if ($toTs === false) $toTs = $fromTs + 86400;
        if ($toTs <= $fromTs) $toTs = $fromTs + 86400;
        $fromSql = date('Y-m-d H:i:s', $fromTs);
        $toSql   = date('Y-m-d H:i:s', $toTs);

        $hasCategoryTable = $this->tableExists('guest_house_room_categories');
        $hasCategoryCol   = $this->columnExists('guest_house_rooms', 'category_id');
        $joinCategory     = $hasCategoryTable && $hasCategoryCol;
        $onlyFree         = $req->queryInt('only_available', 0) === 1;

        // Category ke SAARE rooms wapas aate hain, har room ke sath is_available flag.
        // Isse dropdown me room number ke aage chhota "Available / Occupied" tag lag sakta hai.
        $sql = "SELECT r.id, r.room_no, r.floor_no, r.rent, r.status,
                       " . ($hasCategoryCol ? "r.category_id," : "NULL AS category_id,") . "
                       " . ($joinCategory ? "COALESCE(c.name, NULLIF(r.room_type, ''), 'Uncategorised')" : "COALESCE(NULLIF(r.room_type, ''), 'Uncategorised')") . " AS category_name,
                       CASE WHEN EXISTS (
                            SELECT 1 FROM guest_house_guests g
                            WHERE g.room_id = r.id
                              AND g.id <> ?
                              AND g.status IN ('reserved', 'checked_in')
                              AND (? < CAST(COALESCE(g.booking_to, g.expected_checkout_at, g.check_out_at, '9999-12-31 23:59:59') AS DATETIME))
                              AND (? > CAST(COALESCE(g.booking_from, g.check_in_at, g.created_at) AS DATETIME))
                       ) THEN 0 ELSE 1 END AS is_available
                FROM guest_house_rooms r
                " . ($joinCategory ? "LEFT JOIN guest_house_room_categories c ON c.id = r.category_id" : "") . "
                WHERE r.is_active = 1";

        $params = [$excludeGuestId, $fromSql, $toSql];

        $catName = '';
        if ($categoryId > 0 && $hasCategoryTable) {
            try {
                $catName = trim((string) Database::value(
                    "SELECT name FROM guest_house_room_categories WHERE id = ?",
                    [$categoryId]
                ));
            } catch (Throwable $e) {
                $catName = '';
            }
        }

        // Live-hosting lesson (error 1267): SQL me string-vs-string match — LIKE / LOWER /
        // CONCAT — table (general_ci) vs connection (unicode_ci) collation clash paida
        // karta tha, wahi 500 tha. Isliye naam ka match ab POORA PHP me hota hai;
        // SQL me sirf numeric aur CAST kiye hue date comparisons bachte hain.
        $phpNameFilter = false;
        if ($categoryId > 0 && $hasCategoryCol && $catName !== '') {
            $phpNameFilter = true;   // saare active rooms lekar PHP me filter karenge
        } elseif ($categoryId > 0 && $hasCategoryCol) {
            $sql .= " AND r.category_id = ?";
            $params[] = $categoryId;
        }

        if ($onlyFree) {
            $sql .= " HAVING is_available = 1";
        }
        $sql .= " ORDER BY CAST(r.room_no AS UNSIGNED), r.room_no";

        try {
            $rows = Database::all($sql, $params);
        } catch (Throwable $e) {
            // TEMP DEBUG: generic 'unexpected error' ki jagah asli DB error browser me dikhao —
            // warna live server ka asli reason kahin nazar hi nahi aata.
            Response::error('Available-rooms SQL error: ' . $e->getMessage(), 500);
        }

        if ($phpNameFilter) {
            $norm = static function ($s): string {
                $s = trim((string) $s);
                $s = preg_replace('/\s+/', ' ', $s) ?? $s;
                return function_exists('mb_strtolower') ? mb_strtolower($s, 'UTF-8') : strtolower($s);
            };
            $catN = $norm($catName);
            $rows = array_values(array_filter($rows, static function (array $r) use ($norm, $catN, $categoryId): bool {
                if ((int) ($r['category_id'] ?? 0) === (int) $categoryId) return true;
                $rt = $norm($r['room_type'] ?? '');
                return $rt !== '' && $catN !== '' && (str_contains($rt, $catN) || str_contains($catN, $rt));
            }));
        }

        Response::success($rows);
    }

    /** Accepts data-URL (base64) or http(s) image for photos. Max ~2 MB. */
    private function photoData(?string $value, string $field): ?string
    {
        $value = trim((string) $value);
        if ($value === '') return null;
        $ok = str_starts_with($value, 'data:image/') || str_starts_with($value, 'https://') || str_starts_with($value, 'http://');
        if (!$ok || strlen($value) > 2600000) {
            Response::unprocessable('Validation failed.', [$field => ['Photo must be an image up to ~2 MB.']]);
        }
        return $value;
    }

    public function createGuest(Request $req): never
    {
        $payload = Auth::requireFrontDesk();
        $this->ensureAdvancedSchema();

        // Walk-in form ki saari details optional hain — client baad me edit kar sakta hai.
        // Sirf room zaroori hai, kyunki stay kisi room me hi hota hai.
        $v = Validator::make($req->body())
            ->string('guest_name', 0, 100)->string('phone', 0, 20)
            ->string('address', 0, 255)->string('id_proof', 0, 120);
        if ($v->fails()) Response::unprocessable('Validation failed.', $v->errors());

        $roomNo = trim($req->bodyStr('room_no'));
        if ($roomNo === '') {
            Response::unprocessable('Validation failed.', ['room_no' => ['Room select karein.']]);
        }

        $fromTs = strtotime(trim($req->bodyStr('from_date'))) ?: time();
        $toTs   = strtotime(trim($req->bodyStr('to_date'))) ?: ($fromTs + 86400);
        if ($toTs <= $fromTs) $toTs = $fromTs + 86400;
        $fromSql = date('Y-m-d H:i:s', $fromTs);
        $toSql   = date('Y-m-d H:i:s', $toTs);

        $expectedTs = strtotime(trim($req->bodyStr('expected_checkout_at'))) ?: $toTs;
        if ($expectedTs < $fromTs) $expectedTs = $toTs;
        $expectedCheckoutSql = date('Y-m-d H:i:s', $expectedTs);

        $totalAmount = max(0, $req->bodyFloat('total_amount', 0));
        $advanceAmount = max(0, $req->bodyFloat('advance_amount', 0));
        $paidAmount = max(0, $req->bodyFloat('paid_amount', $advanceAmount));
        if ($paidAmount < $advanceAmount) $paidAmount = $advanceAmount;
        if ($paidAmount > $totalAmount) $paidAmount = $totalAmount;
        $balanceAmount = max(0, $totalAmount - $paidAmount);
        $paymentMode = $this->paymentMode($req->bodyStr('payment_mode', 'cash'));
        $bookingId = $req->bodyInt('booking_id', 0);
        $adultsCount = max(1, $req->bodyInt('adults_count', 1));
        $childrenCount = max(0, $req->bodyInt('children_count', 0));
        $companions = $req->bodyStr('companions');
        $companionsIdDetails = $req->bodyStr('companions_id_details');
        $extraBedCount = max(0, $req->bodyInt('extra_bed_count', 0));
        $extraBedRate = max(0, $req->bodyFloat('extra_bed_rate', 0));
        $idProofPhoto = $this->photoData($req->bodyStr('id_proof_photo'), 'id_proof_photo');
        $guestPhoto = $this->photoData($req->bodyStr('guest_photo'), 'guest_photo');

        Database::begin();
        try {
            $room = Database::row(
                "SELECT * FROM guest_house_rooms WHERE room_no = ? AND is_active = 1 FOR UPDATE",
                [$roomNo]
            );
            if (!$room) {
                Database::rollback();
                Response::notFound('Room not found.');
            }
            $pickedCategory = (int)$req->bodyInt('category_id', 0);
            if ($pickedCategory > 0 && (int)$room['category_id'] !== $pickedCategory) {
                Database::rollback();
                Response::error("Selected room does not belong to chosen category.", 422);
            }

            $conflict = Database::row(
                "SELECT id, room_no,
                        COALESCE(booking_from, check_in_at, created_at) AS booking_from,
                        COALESCE(booking_to, expected_checkout_at, check_out_at, '9999-12-31 23:59:59') AS booking_to
                 FROM guest_house_guests
                 WHERE room_id = ?
                   AND status IN ('reserved', 'checked_in')
                   AND (? < CAST(COALESCE(booking_to, expected_checkout_at, check_out_at, '9999-12-31 23:59:59') AS DATETIME))
                   AND (? > CAST(COALESCE(booking_from, check_in_at, created_at) AS DATETIME))
                 LIMIT 1",
                [(int)$room['id'], $fromSql, $toSql]
            );
            if ($conflict && ((int)$conflict['id'] !== $bookingId)) {
                Database::rollback();
                Response::error($this->roomConflictMessage($conflict), 409);
            }

            if ($bookingId > 0) {
                $bookingRow = Database::row(
                    "SELECT id FROM guest_house_guests WHERE id = ? AND status = 'reserved' FOR UPDATE",
                    [$bookingId]
                );
                if (!$bookingRow) {
                    Database::rollback();
                    Response::error('Selected advance booking not found.', 404);
                }
                Database::run(
                    "UPDATE guest_house_guests
                     SET guest_name = ?, phone = ?, adults_count = ?, children_count = ?, extra_bed_count = ?, extra_bed_rate = ?,
                         companions = ?, companions_id_details = ?,
                         room_id = ?, room_no = ?, address = ?, id_proof = ?,
                         id_proof_photo = COALESCE(?, id_proof_photo), guest_photo = COALESCE(?, guest_photo),
                         payment_mode = ?, total_amount = ?, advance_amount = ?, paid_amount = ?, balance_amount = ?,
                         booking_from = ?, booking_to = ?, expected_checkout_at = ?, check_in_at = NOW(), check_out_at = NULL,
                         status = 'checked_in', updated_at = NOW()
                     WHERE id = ?",
                    [
                        $req->bodyStr('guest_name'),
                        $req->bodyStr('phone'),
                        $adultsCount,
                        $childrenCount,
                        $extraBedCount,
                        $extraBedRate,
                        $companions ?: null,
                        $companionsIdDetails ?: null,
                        (int) $room['id'],
                        $roomNo,
                        $req->bodyStr('address'),
                        $req->bodyStr('id_proof') ?: '',
                        $idProofPhoto,
                        $guestPhoto,
                        $paymentMode,
                        $totalAmount,
                        $advanceAmount,
                        $paidAmount,
                        $balanceAmount,
                        $fromSql,
                        $toSql,
                        $expectedCheckoutSql,
                        $bookingId,
                    ]
                );
                $guestId = $bookingId;
            } else {
                Database::run(
                    "INSERT INTO guest_house_guests
                     (guest_name, phone, adults_count, children_count, extra_bed_count, extra_bed_rate, companions, companions_id_details, room_id, room_no, address, id_proof, id_proof_photo, guest_photo, payment_mode, total_amount, advance_amount, paid_amount, balance_amount, booking_from, booking_to, expected_checkout_at, check_in_at, status, created_by)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 'checked_in', ?)",
                    [
                        $req->bodyStr('guest_name'),
                        $req->bodyStr('phone'),
                        $adultsCount,
                        $childrenCount,
                        $extraBedCount,
                        $extraBedRate,
                        $companions ?: null,
                        $companionsIdDetails ?: null,
                        (int) $room['id'],
                        $roomNo,
                        $req->bodyStr('address'),
                        $req->bodyStr('id_proof') ?: '',
                        $idProofPhoto,
                        $guestPhoto,
                        $paymentMode,
                        $totalAmount,
                        $advanceAmount,
                        $paidAmount,
                        $balanceAmount,
                        $fromSql,
                        $toSql,
                        $expectedCheckoutSql,
                        (int) $payload['admin_id'],
                    ]
                );
                $guestId = Database::lastId();
            }

            Database::run("UPDATE guest_house_rooms SET status = 'booked' WHERE id = ?", [(int) $room['id']]);
            Database::commit();
        } catch (Throwable $e) {
            Database::rollback();
            Response::serverError('Failed to save guest record.');
        }

        CustomerService::upsertFromContact($req->bodyStr('guest_name'), $req->bodyStr('phone'), true, 'GUEST_HOUSE');

        Helper::log((int)$payload['admin_id'], 'guest_checkin', 'guest_house', $guestId, "Guest checked in to room {$roomNo}");

        $guest = Database::row("SELECT * FROM guest_house_guests WHERE id = ?", [$guestId]);
        Response::created($guest, 'Guest check-in recorded.');
    }

    public function createBooking(Request $req): never
    {
        $payload = Auth::requireFrontDesk();
        $this->ensureAdvancedSchema();

        $v = Validator::make($req->body())
            ->required('guest_name', 'Guest Name')->string('guest_name', 2, 100)
            ->required('phone', 'Phone Number')->string('phone', 7, 20)->phone('phone', 'Phone Number')
            ->required('category_id', 'Room Category')->integer('category_id', 1)
            ->required('room_no', 'Room Number')->string('room_no', 1, 20)
            ->required('address', 'Address')->string('address', 5, 255)
            ->string('id_proof', 0, 120);
        if ($v->fails()) Response::unprocessable('Validation failed.', $v->errors());

        $fromSql = $this->parseDateTime('from_date', $req->bodyStr('from_date'));
        $toSql = $this->parseDateTime('to_date', $req->bodyStr('to_date'));
        if (strtotime($toSql) <= strtotime($fromSql)) {
            Response::unprocessable('Validation failed.', ['to_date' => ['To date must be after from date.']]);
        }

        $roomNo = $req->bodyStr('room_no');
        $room = Database::row("SELECT id, room_no, category_id, status FROM guest_house_rooms WHERE room_no = ? AND is_active = 1", [$roomNo]);
        if (!$room) Response::notFound('Room not found.');
        if ((int)$room['category_id'] !== (int)$req->bodyInt('category_id')) {
            Response::error("Selected room does not belong to chosen category.", 422);
        }

        $bookingConflict = Database::row(
            "SELECT room_no,
                    COALESCE(booking_from, check_in_at, created_at) AS booking_from,
                    COALESCE(booking_to, expected_checkout_at, check_out_at, '9999-12-31 23:59:59') AS booking_to
             FROM guest_house_guests
             WHERE room_id = ?
               AND status IN ('reserved', 'checked_in')
               AND (? < CAST(COALESCE(booking_to, expected_checkout_at, check_out_at, '9999-12-31 23:59:59') AS DATETIME))
               AND (? > CAST(COALESCE(booking_from, check_in_at, created_at) AS DATETIME))
             LIMIT 1",
            [(int)$room['id'], $fromSql, $toSql]
        );
        if ($bookingConflict) {
            Response::error($this->roomConflictMessage($bookingConflict), 409);
        }

        $totalAmount = max(0, $req->bodyFloat('total_amount', 0));
        $advanceAmount = max(0, $req->bodyFloat('advance_amount', 0));
        if ($advanceAmount > $totalAmount) $advanceAmount = $totalAmount;
        $balanceAmount = max(0, $totalAmount - $advanceAmount);
        $paymentMode = $this->paymentMode($req->bodyStr('payment_mode', 'cash'));
        $adultsCount = max(1, $req->bodyInt('adults_count', 1));
        $childrenCount = max(0, $req->bodyInt('children_count', 0));
        $companions = $req->bodyStr('companions');
        $companionsIdDetails = $req->bodyStr('companions_id_details');

        Database::run(
            "INSERT INTO guest_house_guests
             (guest_name, phone, adults_count, children_count, companions, companions_id_details, room_id, room_no, address, id_proof, payment_mode, total_amount, advance_amount, paid_amount, balance_amount, booking_from, booking_to, expected_checkout_at, status, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'reserved', ?)",
            [
                $req->bodyStr('guest_name'),
                $req->bodyStr('phone'),
                $adultsCount,
                $childrenCount,
                $companions ?: null,
                $companionsIdDetails ?: null,
                (int)$room['id'],
                $roomNo,
                $req->bodyStr('address'),
                $req->bodyStr('id_proof') ?: '',
                $paymentMode,
                $totalAmount,
                $advanceAmount,
                $advanceAmount,
                $balanceAmount,
                $fromSql,
                $toSql,
                $toSql,
                (int)$payload['admin_id'],
            ]
        );
        $bookingId = Database::lastId();

        CustomerService::upsertFromContact($req->bodyStr('guest_name'), $req->bodyStr('phone'), true, 'GUEST_HOUSE');

        Helper::log((int)$payload['admin_id'], 'guest_booking', 'guest_house', $bookingId, "Advance booking created for room {$roomNo}");
        Response::created(['id' => $bookingId], 'Advance booking created.');
    }

    public function bookings(Request $req): never
    {
        Auth::requireFrontDesk();
        $this->ensureAdvancedSchema();
        $rows = Database::all(
            "SELECT g.id, g.room_no, g.guest_name, g.phone, g.booking_from, g.booking_to, g.total_amount, g.advance_amount, g.balance_amount, g.payment_mode, g.status,
                    g.adults_count, g.children_count, g.companions, g.companions_id_details, g.room_id, r.category_id, g.expected_checkout_at
             FROM guest_house_guests g
             LEFT JOIN guest_house_rooms r ON r.id = g.room_id
             WHERE g.status = 'reserved'
             ORDER BY g.booking_from ASC
             LIMIT 100"
        );
        Response::success($rows);
    }

    public function updateGuest(Request $req, int $guestId): never
    {
        $payload = Auth::requireFrontDesk();
        $this->ensureAdvancedSchema();

        Database::begin();
        try {
            $guest = Database::row("SELECT * FROM guest_house_guests WHERE id = ? FOR UPDATE", [$guestId]);
            if (!$guest) {
                Database::rollback();
                Response::notFound('Guest record not found.');
            }

            $newStatus = $req->bodyStr('status', $guest['status']);
            if (!in_array($newStatus, ['reserved', 'checked_in', 'checked_out', 'cancelled'], true)) {
                $newStatus = $guest['status'];
            }

            $roomNo = $req->bodyStr('room_no', $guest['room_no']);
            $room = Database::row("SELECT id, room_no, category_id FROM guest_house_rooms WHERE room_no = ? AND is_active = 1 FOR UPDATE", [$roomNo]);
            if (!$room) {
                Database::rollback();
                Response::notFound('Room not found.');
            }

            $fromSql = $this->parseDateTime('from_date', $req->bodyStr('from_date', $guest['booking_from'] ?: $guest['check_in_at']));
            $toSql = $this->parseDateTime('to_date', $req->bodyStr('to_date', $guest['booking_to'] ?: $guest['expected_checkout_at'] ?: $guest['check_in_at']));
            if (strtotime($toSql) <= strtotime($fromSql)) {
                Database::rollback();
                Response::unprocessable('Validation failed.', ['to_date' => ['To date must be after from date.']]);
            }
            $expectedCheckoutSql = $this->parseDateTime('expected_checkout_at', $req->bodyStr('expected_checkout_at', $toSql));

            $conflict = Database::row(
                "SELECT room_no,
                        COALESCE(booking_from, check_in_at, created_at) AS booking_from,
                        COALESCE(booking_to, expected_checkout_at, check_out_at, '9999-12-31 23:59:59') AS booking_to
                 FROM guest_house_guests
                 WHERE room_id = ?
                   AND id <> ?
                   AND status IN ('reserved', 'checked_in')
                   AND (? < CAST(COALESCE(booking_to, expected_checkout_at, check_out_at, '9999-12-31 23:59:59') AS DATETIME))
                   AND (? > CAST(COALESCE(booking_from, check_in_at, created_at) AS DATETIME))
                 LIMIT 1",
                [(int)$room['id'], $guestId, $fromSql, $toSql]
            );
            if ($conflict) {
                Database::rollback();
                Response::error($this->roomConflictMessage($conflict), 409);
            }

            $extraBedCount = max(0, $req->bodyInt('extra_bed_count', (int)($guest['extra_bed_count'] ?? 0)));
            $extraBedRate = max(0, $req->bodyFloat('extra_bed_rate', (float)($guest['extra_bed_rate'] ?? 0)));
            $idProofPhoto = $this->photoData($req->bodyStr('id_proof_photo'), 'id_proof_photo');
            $guestPhoto = $this->photoData($req->bodyStr('guest_photo'), 'guest_photo');

            $totalAmount = max(0, $req->bodyFloat('total_amount', (float)$guest['total_amount']));
            $advanceAmount = max(0, $req->bodyFloat('advance_amount', (float)$guest['advance_amount']));
            $paidAmount = max(0, $req->bodyFloat('paid_amount', (float)$guest['paid_amount']));
            if ($advanceAmount > $totalAmount) $advanceAmount = $totalAmount;
            if ($paidAmount < $advanceAmount) $paidAmount = $advanceAmount;
            if ($paidAmount > $totalAmount) $paidAmount = $totalAmount;
            $balanceAmount = max(0, $totalAmount - $paidAmount);

            $checkInAtExpr = $newStatus === 'checked_in' ? "COALESCE(check_in_at, NOW())" : "check_in_at";
            $checkOutAtExpr = $newStatus === 'checked_out' ? "COALESCE(check_out_at, NOW())" : "check_out_at";

            Database::run(
                "UPDATE guest_house_guests
                 SET guest_name = ?, phone = ?, adults_count = ?, children_count = ?, extra_bed_count = ?, extra_bed_rate = ?,
                     companions = ?, companions_id_details = ?,
                     room_id = ?, room_no = ?, address = ?, id_proof = ?,
                     id_proof_photo = COALESCE(?, id_proof_photo), guest_photo = COALESCE(?, guest_photo), payment_mode = ?,
                     total_amount = ?, advance_amount = ?, paid_amount = ?, balance_amount = ?,
                     booking_from = ?, booking_to = ?, expected_checkout_at = ?,
                     status = ?, check_in_at = {$checkInAtExpr}, check_out_at = {$checkOutAtExpr}, updated_at = NOW()
                 WHERE id = ?",
                [
                    $req->bodyStr('guest_name', $guest['guest_name']),
                    $req->bodyStr('phone', $guest['phone']),
                    max(1, $req->bodyInt('adults_count', (int)($guest['adults_count'] ?? 1))),
                    max(0, $req->bodyInt('children_count', (int)($guest['children_count'] ?? 0))),
                    $extraBedCount,
                    $extraBedRate,
                    $req->bodyStr('companions', (string)($guest['companions'] ?? '')) ?: null,
                    $req->bodyStr('companions_id_details', (string)($guest['companions_id_details'] ?? '')) ?: null,
                    (int)$room['id'],
                    $roomNo,
                    $req->bodyStr('address', $guest['address']),
                    $req->bodyStr('id_proof', $guest['id_proof']),
                    $idProofPhoto,
                    $guestPhoto,
                    $this->paymentMode($req->bodyStr('payment_mode', $guest['payment_mode'] ?? 'cash')),
                    $totalAmount,
                    $advanceAmount,
                    $paidAmount,
                    $balanceAmount,
                    $fromSql,
                    $toSql,
                    $expectedCheckoutSql,
                    $newStatus,
                    $guestId,
                ]
            );

            $oldRoomId = (int)$guest['room_id'];
            $newRoomId = (int)$room['id'];
            foreach (array_unique([$oldRoomId, $newRoomId]) as $rid) {
                $cnt = (int)Database::value("SELECT COUNT(*) FROM guest_house_guests WHERE room_id = ? AND status = 'checked_in'", [$rid]);
                Database::run("UPDATE guest_house_rooms SET status = ? WHERE id = ?", [$cnt > 0 ? 'booked' : 'available', $rid]);
            }

            Database::commit();
        } catch (Throwable $e) {
            Database::rollback();
            Response::serverError('Failed to update guest record.');
        }

        CustomerService::upsertFromContact(
            $req->bodyStr('guest_name', $guest['guest_name']),
            $req->bodyStr('phone', $guest['phone']),
            true,
            'GUEST_HOUSE'
        );

        Helper::log((int)$payload['admin_id'], 'guest_update', 'guest_house', $guestId, "Guest record updated.");
        $row = Database::row("SELECT * FROM guest_house_guests WHERE id = ?", [$guestId]);
        Response::success($row, 'Guest updated successfully.');
    }

    public function addPayment(Request $req, int $guestId): never
    {
        $payload = Auth::requireFrontDesk();
        $this->ensureAdvancedSchema();
        $amount = max(0, $req->bodyFloat('amount', 0));
        if ($amount <= 0) Response::unprocessable('Validation failed.', ['amount' => ['Amount must be greater than 0.']]);
        $paymentMode = $this->paymentMode($req->bodyStr('payment_mode', 'cash'));

        Database::begin();
        try {
            $guest = Database::row(
                "SELECT id, paid_amount, total_amount, balance_amount, status
                 FROM guest_house_guests
                 WHERE id = ? FOR UPDATE",
                [$guestId]
            );
            if (!$guest) {
                Database::rollback();
                Response::notFound('Guest record not found.');
            }
            if ($guest['status'] !== 'checked_in') {
                Database::rollback();
                Response::error('Payment can only be added for checked-in guests.', 409);
            }

            $newPaid = (float)$guest['paid_amount'] + $amount;
            $total = (float)$guest['total_amount'];
            if ($newPaid > $total) $newPaid = $total;
            $newBalance = max(0, $total - $newPaid);

            Database::run(
                "UPDATE guest_house_guests
                 SET paid_amount = ?, balance_amount = ?, payment_mode = ?, updated_at = NOW()
                 WHERE id = ?",
                [$newPaid, $newBalance, $paymentMode, $guestId]
            );
            if ($this->tableExists('guest_house_payments')) {
                Database::run(
                    "INSERT INTO guest_house_payments (guest_id, amount, payment_mode, created_by, created_at)
                     VALUES (?, ?, ?, ?, NOW())",
                    [$guestId, $amount, $paymentMode, (int)$payload['admin_id']]
                );
            }
            Database::commit();
        } catch (Throwable $e) {
            Database::rollback();
            Response::serverError('Failed to add payment.');
        }

        Helper::log((int)$payload['admin_id'], 'guest_add_payment', 'guest_house', $guestId, "Payment added: {$amount}");
        $row = Database::row("SELECT id, paid_amount, balance_amount, payment_mode FROM guest_house_guests WHERE id = ?", [$guestId]);
        Response::success($row, 'Payment updated.');
    }

    public function checkout(Request $req, int $guestId): never
    {
        $payload = Auth::requireFrontDesk();

        Database::begin();
        try {
            $guest = Database::row(
                "SELECT * FROM guest_house_guests WHERE id = ? FOR UPDATE",
                [$guestId]
            );
            if (!$guest) {
                Database::rollback();
                Response::notFound('Guest record not found.');
            }
            if ($guest['status'] !== 'checked_in') {
                Database::rollback();
                Response::error('Guest is already checked out.', 409);
            }

            Database::run(
                "UPDATE guest_house_guests SET status = 'checked_out', check_out_at = NOW() WHERE id = ?",
                [$guestId]
            );
            Database::run("UPDATE guest_house_rooms SET status = 'available' WHERE id = ?", [(int)$guest['room_id']]);
            Database::commit();
        } catch (Throwable $e) {
            Database::rollback();
            Response::serverError('Failed to checkout guest.');
        }

        Helper::log((int)$payload['admin_id'], 'guest_checkout', 'guest_house', $guestId, "Guest checked out from room {$guest['room_no']}");
        Response::success(null, 'Guest checked out successfully.');
    }

    /** Update room: rent, room_type, floor and status (available/cleaning/maintenance). */
    public function updateRoom(Request $req, int $roomId): never
    {
        $payload = Auth::requireFrontDesk();
        $room = Database::row("SELECT * FROM guest_house_rooms WHERE id = ?", [$roomId]);
        if (!$room) Response::notFound('Room not found.');

        $status = $req->bodyStr('status', $room['status']);
        if (!in_array($status, ['available', 'booked', 'cleaning', 'maintenance'], true)) {
            Response::unprocessable('Validation failed.', ['status' => ['Invalid room status.']]);
        }
        // A room with an active guest cannot be manually freed
        if ($status === 'available' && $room['status'] === 'booked') {
            $active = (int) Database::value(
                "SELECT COUNT(*) FROM guest_house_guests WHERE room_id = ? AND status = 'checked_in'",
                [$roomId]
            );
            if ($active > 0) Response::error('Room has a checked-in guest. Check out the guest first.', 409);
        }

        $rent = $req->body('rent') !== null
            ? max(0, $req->bodyFloat('rent', (float)$room['rent']))
            : (float)$room['rent'];
        $roomType = $req->body('room_type') !== null ? $req->bodyStr('room_type') : $room['room_type'];
        $floorNo = $req->body('floor_no') !== null ? $req->bodyStr('floor_no') : $room['floor_no'];
        $roomNo = $req->body('room_no') !== null ? trim($req->bodyStr('room_no')) : $room['room_no'];

        if ($roomNo === '' || strlen($roomNo) > 20) {
            Response::unprocessable('Validation failed.', ['room_no' => ['Room number is required.']]);
        }
        $clash = Database::row(
            'SELECT id FROM guest_house_rooms WHERE room_no = ? AND id <> ? LIMIT 1',
            [$roomNo, $roomId]
        );
        if ($clash) {
            Response::error("Room number {$roomNo} already exists.", 409);
        }

        $categoryId = array_key_exists('category_id', (array)$req->body())
            ? (int)$req->bodyInt('category_id', 0)
            : (int)($room['category_id'] ?? 0);
        if ($categoryId <= 0) {
            $categoryId = $room['category_id'] !== null ? (int)$room['category_id'] : null;
        }

        // Category badli to room_type bhi usi naam par set karo (dono kabhi mismatch na hon)
        if ($categoryId !== null && (int) $categoryId > 0) {
            $catName = (string) Database::value(
                "SELECT name FROM guest_house_room_categories WHERE id = ?",
                [(int) $categoryId]
            );
            if (trim($catName) !== '') $roomType = trim($catName);
        }

        Database::run(
            "UPDATE guest_house_rooms SET room_no = ?, category_id = ?, status = ?, rent = ?, room_type = ?, floor_no = ?, updated_at = NOW() WHERE id = ?",
            [$roomNo, $categoryId, $status, $rent, $roomType ?: null, $floorNo, $roomId]
        );
        // Room number badla to us room ke active guests ka snapshot bhi update karo
        if ($roomNo !== $room['room_no']) {
            Database::run(
                "UPDATE guest_house_guests SET room_no = ? WHERE room_id = ? AND status IN ('reserved','checked_in')",
                [$roomNo, $roomId]
            );
        }
        Helper::log((int)$payload['admin_id'], 'update_room', 'guest_house', $roomId, "Room {$room['room_no']} updated (status: {$status}).");
        $row = Database::row("SELECT * FROM guest_house_rooms WHERE id = ?", [$roomId]);
        Response::success($row, 'Room updated.');
    }

    /** Add an extra charge (food / laundry / other) to a guest stay. */
    public function addCharge(Request $req, int $guestId): never
    {
        $payload = Auth::requireFrontDesk();
        $this->ensureAdvancedSchema();
        if (!$this->tableExists('guest_house_charges')) {
            Response::error('Charges table missing. Run database/migrations/add_roles_and_guest_house_v2.sql', 500);
        }
        $guest = Database::row("SELECT id, status, guest_name FROM guest_house_guests WHERE id = ?", [$guestId]);
        if (!$guest) Response::notFound('Guest record not found.');
        if (!in_array($guest['status'], ['reserved', 'checked_in'], true)) {
            Response::error('Charges can only be added for reserved or checked-in guests.', 409);
        }

        $v = Validator::make($req->body())
            ->required('charge_type', 'Charge Type')
            ->in('charge_type', ['food', 'laundry', 'other'], 'Charge Type')
            ->required('amount', 'Amount')
            ->numeric('amount', 0.01, 9999999, 'Amount');
        if ($v->fails()) Response::unprocessable('Validation failed.', $v->errors());

        $type = $req->bodyStr('charge_type');
        $amount = max(0.01, $req->bodyFloat('amount', 0));
        $desc = $req->bodyStr('description');

        Database::run(
            "INSERT INTO guest_house_charges (guest_id, charge_type, description, amount, created_by, created_at)
             VALUES (?, ?, ?, ?, ?, NOW())",
            [$guestId, $type, $desc ?: null, $amount, (int)$payload['admin_id']]
        );

        // Recalculate balance: total = stored total + extras; balance = total - paid
        $extras = (float) Database::value(
            "SELECT COALESCE(SUM(amount), 0) FROM guest_house_charges WHERE guest_id = ?",
            [$guestId]
        );
        $paid = (float) Database::value("SELECT paid_amount FROM guest_house_guests WHERE id = ?", [$guestId]);
        $baseTotal = (float) Database::value("SELECT total_amount FROM guest_house_guests WHERE id = ?", [$guestId]);
        $balance = max(0, ($baseTotal + $extras) - $paid);
        Database::run(
            "UPDATE guest_house_guests SET balance_amount = ? WHERE id = ?",
            [$balance, $guestId]
        );

        Helper::log((int)$payload['admin_id'], 'guest_add_charge', 'guest_house', $guestId, "Charge {$type}: {$amount}");
        $row = Database::row("SELECT * FROM guest_house_charges WHERE guest_id = ? ORDER BY id DESC LIMIT 1", [$guestId]);
        Response::created($row, 'Charge added.');
    }

    /** List extra charges of a stay. */
    public function charges(Request $req, int $guestId): never
    {
        Auth::requireFrontDesk();
        $this->ensureAdvancedSchema();
        if (!$this->tableExists('guest_house_charges')) Response::success([]);
        $rows = Database::all(
            "SELECT id, guest_id, charge_type, description, amount, created_at
             FROM guest_house_charges WHERE guest_id = ? ORDER BY id ASC",
            [$guestId]
        );
        Response::success($rows);
    }

    /** Final bill / folio: room rent, extra bed, food/laundry/other, payments, balance. */
    public function finalBill(Request $req, int $guestId): never
    {
        Auth::requireFrontDesk();
        $this->ensureAdvancedSchema();
        $guest = Database::row(
            "SELECT g.*, r.rent AS room_rent, c.name AS category_name
             FROM guest_house_guests g
             LEFT JOIN guest_house_rooms r ON r.id = g.room_id
             LEFT JOIN guest_house_room_categories c ON c.id = r.category_id
             WHERE g.id = ?",
            [$guestId]
        );
        if (!$guest) Response::notFound('Guest record not found.');

        $charges = $this->tableExists('guest_house_charges')
            ? Database::all(
                "SELECT charge_type, description, amount, created_at FROM guest_house_charges WHERE guest_id = ? ORDER BY id ASC",
                [$guestId]
              )
            : [];

        $food = 0.0; $laundry = 0.0; $other = 0.0;
        foreach ($charges as $c) {
            $amt = (float)$c['amount'];
            if ($c['charge_type'] === 'food') $food += $amt;
            elseif ($c['charge_type'] === 'laundry') $laundry += $amt;
            else $other += $amt;
        }

        $nights = 1;
        $from = $guest['booking_from'] ?: $guest['check_in_at'];
        $to = $guest['booking_to'] ?: $guest['expected_checkout_at'] ?: $guest['check_out_at'] ?: date('Y-m-d H:i:s');
        if ($from && $to) {
            $days = (int) ceil((strtotime($to) - strtotime($from)) / 86400);
            $nights = max(1, $days);
        }

        $roomRent = (float)($guest['total_amount'] ?? 0);
        $extraBed = (float)$guest['extra_bed_count'] * (float)$guest['extra_bed_rate'];
        $subTotal = $roomRent + $extraBed + $food + $laundry + $other;
        $paid = (float)$guest['paid_amount'];
        $balance = max(0, $subTotal - $paid);

        Helper::log(0, 'final_bill_view', 'guest_house', $guestId, 'Final bill viewed');
        Response::success([
            'guest' => $guest,
            'nights' => $nights,
            'lines' => [
                ['label' => 'Room Rent', 'amount' => $roomRent],
                ['label' => "Extra Bed ({$guest['extra_bed_count']} x " . number_format((float)$guest['extra_bed_rate'], 2) . ')', 'amount' => $extraBed],
                ['label' => 'Food', 'amount' => $food],
                ['label' => 'Laundry', 'amount' => $laundry],
                ['label' => 'Other Charges', 'amount' => $other],
            ],
            'charges' => $charges,
            'sub_total' => $subTotal,
            'paid_amount' => $paid,
            'balance_amount' => $balance,
            'payment_mode' => $guest['payment_mode'],
        ]);
    }

    /** Delete a room. Hard delete when there is no stay history; otherwise rename it and
     *  mark it inactive so the room number can be reused. */
    public function deleteRoom(Request $req, int $roomId): never
    {
        $payload = Auth::requireFrontDesk();
        $room = Database::row('SELECT * FROM guest_house_rooms WHERE id = ?', [$roomId]);
        if (!$room) Response::notFound('Room not found.');

        $active = (int) Database::value(
            "SELECT COUNT(*) FROM guest_house_guests WHERE room_id = ? AND status IN ('reserved','checked_in')",
            [$roomId]
        );
        if ($active > 0) {
            Response::error('Is room me guest booked/checked-in hai. Pehle checkout ya booking cancel karein.', 409);
        }

        $hardDeleted = false;
        $archived = false;

        try {
            Database::run('DELETE FROM guest_house_rooms WHERE id = ?', [$roomId]);
            $hardDeleted = true;
        } catch (Throwable $e) {
            // Purani history is room ko reference karti hai — room number free kar ke inactive kar do.
            $hasActiveCol = $this->columnExists('guest_house_rooms', 'is_active');
            $suffix = '-del-' . $roomId;
            $base = (string) $room['room_no'];
            if (mb_strlen($base) > 20 - mb_strlen($suffix)) {
                $base = mb_substr($base, 0, 20 - mb_strlen($suffix));
            }
            $freedNo = $base . $suffix;
            try {
                if ($hasActiveCol) {
                    Database::run(
                        "UPDATE guest_house_rooms SET is_active = 0, room_no = ?, status = 'available', updated_at = NOW() WHERE id = ?",
                        [$freedNo, $roomId]
                    );
                } else {
                    Database::run(
                        "UPDATE guest_house_rooms SET room_no = ?, status = 'available', updated_at = NOW() WHERE id = ?",
                        [$freedNo, $roomId]
                    );
                }
                $archived = true;
            } catch (Throwable $e2) {
                Response::serverError('Room delete nahi hua. Thodi der baad try karein.');
            }
        }

        Helper::log(
            (int)$payload['admin_id'],
            'delete_room',
            'guest_house',
            $roomId,
            "Room {$room['room_no']} deleted (" . ($hardDeleted ? 'removed' : 'archived, number freed') . ').'
        );

        Response::success(
            ['id' => $roomId, 'hard_deleted' => $hardDeleted, 'archived' => $archived],
            $hardDeleted ? '' : ''
        );
    }

    /** Cancel a booking (reserved stay) — frees the room date block. */
    public function cancelBooking(Request $req, int $guestId): never
    {
        $payload = Auth::requireFrontDesk();
        $this->ensureAdvancedSchema();

        $guest = Database::row('SELECT * FROM guest_house_guests WHERE id = ?', [$guestId]);
        if (!$guest) Response::notFound('Booking not found.');
        if ($guest['status'] === 'checked_in') {
            Response::error('Checked-in guest ko cancel nahi kar sakte — checkout karein.', 409);
        }
        if ($guest['status'] === 'cancelled') {
            Response::error('Booking pehle se cancelled hai.', 409);
        }

        Database::run(
            "UPDATE guest_house_guests SET status = 'cancelled', balance_amount = 0, updated_at = NOW() WHERE id = ?",
            [$guestId]
        );

        $stillBooked = (int) Database::value(
            "SELECT COUNT(*) FROM guest_house_guests WHERE room_id = ? AND status IN ('reserved','checked_in')",
            [(int)$guest['room_id']]
        );
        Database::run(
            'UPDATE guest_house_rooms SET status = ? WHERE id = ?',
            [$stillBooked > 0 ? 'booked' : 'available', (int)$guest['room_id']]
        );

        Helper::log((int)$payload['admin_id'], 'cancel_booking', 'guest_house', $guestId, "Booking cancelled (room {$guest['room_no']}).");
        Response::success(null, 'Booking cancel ho gayi.');
    }


    public function rooms(Request $req): never
    {
        Auth::requireFrontDesk();
        $hasCategoryTable = $this->tableExists('guest_house_room_categories');
        $hasCategoryCol = $this->columnExists('guest_house_rooms', 'category_id');
        $joinCategory = $hasCategoryTable && $hasCategoryCol;
        $rooms = Database::all(
            "SELECT r.id, r.room_no, r.room_type, r.floor_no, r.status,
                    " . ($hasCategoryCol ? "r.category_id," : "NULL AS category_id,") . "
                    " . ($joinCategory ? "COALESCE(c.name, NULLIF(r.room_type, ''), 'Uncategorised')" : "COALESCE(NULLIF(r.room_type, ''), 'Uncategorised')") . " AS category_name
             FROM guest_house_rooms r
             " . ($joinCategory ? "LEFT JOIN guest_house_room_categories c ON c.id = r.category_id" : "") . "
             WHERE r.is_active = 1
             ORDER BY CAST(r.room_no AS UNSIGNED), r.room_no"
        );
        Response::success($rooms);
    }
}
