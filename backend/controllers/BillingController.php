<?php
class BillingController
{
    // ================================================================
    // GENERATE BILL
    // ================================================================

    public function generateBill(Request $req, int $orderId): never
    {
        $payload = Auth::requireAdmin();

        $v = Validator::make($req->body())
            ->required('payment_mode')->in('payment_mode', ['cash', 'upi', 'card', 'credit'])
            ->in('payment_status', ['paid', 'unpaid']);

        if ($v->fails()) Response::unprocessable('Validation failed.', $v->errors());

        $paymentMode   = $req->bodyStr('payment_mode');
        $paymentStatus = $req->bodyStr('payment_status') ?: 'paid';
        $paidAt        = $paymentStatus === 'paid' ? date('Y-m-d H:i:s') : null;

        // Load order — must be running
        $order = Database::row(
            "SELECT o.*, t.label AS table_label FROM orders o
             LEFT JOIN restaurant_tables t ON o.table_id = t.id
             WHERE o.id = ? AND o.status = 'running'",
            [$orderId]
        );
        if (!$order) Response::error('Order not found or already billed/cancelled.', 404);

        // Must have at least one item
        $itemCount = (int)Database::value(
            'SELECT COUNT(*) FROM order_items WHERE order_id = ?',
            [$orderId]
        );
        if ($itemCount === 0) {
            Response::error('Cannot generate a bill for an empty order. Add items first.', 422);
        }

        // Validate and apply discount
        $discount = max(0.00, $req->bodyFloat('discount_amount'));
        if ($discount > (float)$order['subtotal']) {
            Response::error('Discount cannot exceed the order subtotal.', 422);
        }

        Database::begin();
        $isGuestHouseUpdate = false;
        $billNumber = '';
        try {
            // Recalculate fresh totals with the given discount
            $totals = Helper::calculateTotals(
                (float)$order['subtotal'],
                $order['order_type'],
                $discount,
                $order['order_type'] === 'guest_house' ? (float)$order['commission_amount'] : null
            );

            $existingBill = Database::row(
                'SELECT id, bill_number FROM bills WHERE order_id = ?',
                [$orderId]
            );

            $isGuestHouseUpdate = $order['order_type'] === 'guest_house' && $existingBill;

            if ($existingBill && !$isGuestHouseUpdate) {
                Database::rollback();
                Response::error('Bill already exists for this order.', 409);
            }

            if ($isGuestHouseUpdate) {
                // Guest house: refresh same bill when items/totals change (order stays running)
                Database::run(
                    'UPDATE bills
                     SET subtotal = ?, discount_amount = ?, tax_amount = ?,
                         commission_amount = ?, grand_total = ?,
                         payment_mode = ?, payment_status = ?, paid_at = ?,
                         bill_notes = COALESCE(?, bill_notes)
                     WHERE order_id = ?',
                    [
                        $totals['subtotal'],
                        $totals['discount_amount'],
                        $totals['tax_amount'],
                        $totals['commission_amount'],
                        $totals['grand_total'],
                        $paymentMode,
                        $paymentStatus,
                        $paidAt,
                        $req->bodyStr('bill_notes') ?: null,
                        $orderId,
                    ]
                );
                $billNumber = $existingBill['bill_number'];
            } else {
                $tempBillNumber = Helper::generateBillNumber();

                Database::run(
                    'INSERT INTO bills
                     (bill_number, order_id, subtotal, discount_amount, tax_amount,
                      commission_amount, grand_total, payment_mode, payment_status,
                      paid_at, bill_notes, created_by)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [
                        $tempBillNumber,
                        $orderId,
                        $totals['subtotal'],
                        $totals['discount_amount'],
                        $totals['tax_amount'],
                        $totals['commission_amount'],
                        $totals['grand_total'],
                        $paymentMode,
                        $paymentStatus,
                        $paidAt,
                        $req->bodyStr('bill_notes') ?: null,
                        $payload['admin_id'],
                    ]
                );

                $billId = (int) Database::lastId();
                $billNumber = Helper::formatBillNumberFromId($billId);
                Database::run(
                    'UPDATE bills SET bill_number = ? WHERE id = ?',
                    [$billNumber, $billId]
                );
            }

            // Update order — guest house stays running so more items/KOT can be added
            if ($order['order_type'] === 'guest_house') {
                Database::run(
                    "UPDATE orders
                     SET discount_amount = ?,
                         tax_amount      = ?,
                         grand_total     = ?
                     WHERE id = ?",
                    [
                        $totals['discount_amount'],
                        $totals['tax_amount'],
                        $totals['grand_total'],
                        $orderId,
                    ]
                );
            } else {
                Database::run(
                    "UPDATE orders
                     SET status = 'billed',
                         discount_amount = ?,
                         tax_amount      = ?,
                         grand_total     = ?
                     WHERE id = ?",
                    [
                        $totals['discount_amount'],
                        $totals['tax_amount'],
                        $totals['grand_total'],
                        $orderId,
                    ]
                );

                // Free the table (dine-in only)
                if ($order['table_id']) {
                    Database::run(
                        "UPDATE restaurant_tables SET status = 'available', current_order_id = NULL WHERE id = ?",
                        [$order['table_id']]
                    );
                }
            }

            Database::commit();
        } catch (Throwable $e) {
            Database::rollback();
            Response::serverError('Failed to generate bill. Please try again.');
        }

        Helper::log(
            $payload['admin_id'],
            $isGuestHouseUpdate ? 'update_bill' : 'generate_bill',
            'billing',
            $orderId,
            ($isGuestHouseUpdate ? 'Bill updated' : 'Bill generated') . " {$billNumber} for order #{$order['order_number']}"
        );

        $bill = $this->getBillDetail($billNumber);
        $bill['settings'] = Helper::allSettings();
        $bill['updated']    = $isGuestHouseUpdate;

        if ($isGuestHouseUpdate) {
            Response::success($bill, 'Bill updated successfully.');
        } else {
            Response::created($bill, 'Bill generated successfully.');
        }
    }

    public function markAsPaid(Request $req, string $billNumber): never
    {
        $payload = Auth::requireAdmin();

        $v = Validator::make($req->body())
            ->required('payment_mode')->in('payment_mode', ['cash', 'upi']);
        if ($v->fails()) Response::unprocessable('Validation failed.', $v->errors());

        $bill = Database::row(
            'SELECT id, payment_status FROM bills WHERE bill_number = ?',
            [$billNumber]
        );
        if (!$bill) Response::notFound('Bill not found.');
        if ($bill['payment_status'] === 'paid') Response::error('Bill is already marked as paid.', 409);

        Database::run(
            "UPDATE bills
             SET payment_status = 'paid',
                 payment_mode = ?,
                 paid_at = NOW()
             WHERE bill_number = ?",
            [$req->bodyStr('payment_mode'), $billNumber]
        );

        Helper::log(
            $payload['admin_id'], 'mark_bill_paid', 'billing', (int)$bill['id'],
            "Bill {$billNumber} marked as paid."
        );

        Response::success($this->getBillDetail($billNumber), 'Bill marked as paid successfully.');
    }

    public function updatePaymentStatus(Request $req, string $billNumber): never
    {
        $payload = Auth::requireAdmin();

        $v = Validator::make($req->body())
            ->required('payment_status')->in('payment_status', ['paid', 'unpaid'])
            ->in('payment_mode', ['cash', 'upi', 'card']);
        if ($v->fails()) Response::unprocessable('Validation failed.', $v->errors());

        $bill = Database::row(
            'SELECT id, payment_status FROM bills WHERE bill_number = ?',
            [$billNumber]
        );
        if (!$bill) Response::notFound('Bill not found.');

        $paymentStatus = $req->bodyStr('payment_status');
        $paymentMode   = $req->bodyStr('payment_mode');

        if ($paymentStatus === 'paid') {
            if (!$paymentMode) Response::error('Payment mode is required when marking bill as paid.', 422);

            Database::run(
                "UPDATE bills
                 SET payment_status = 'paid',
                     payment_mode = ?,
                     paid_at = NOW()
                 WHERE bill_number = ?",
                [$paymentMode, $billNumber]
            );
        } else {
            Database::run(
                "UPDATE bills
                 SET payment_status = 'unpaid',
                     payment_mode = 'credit',
                     paid_at = NULL
                 WHERE bill_number = ?",
                [$billNumber]
            );
        }

        Helper::log(
            $payload['admin_id'],
            'update_bill_payment_status',
            'billing',
            (int)$bill['id'],
            "Bill {$billNumber} payment status updated to {$paymentStatus}."
        );

        Response::success($this->getBillDetail($billNumber), 'Bill payment status updated successfully.');
    }

    // ================================================================
    // LIST BILLS (with filters + pagination)
    // ================================================================

    public function index(Request $req): never
    {
        Auth::requireAdmin();

        $page   = Helper::clamp($req->queryInt('page', 1), 1, 9999);
        $limit  = Helper::clamp($req->queryInt('limit', 20), 5, 100);
        $offset = ($page - 1) * $limit;

        $from  = $req->queryStr('from_date');
        $to    = $req->queryStr('to_date');
        $mode  = $req->queryStr('payment_mode');
        $type  = $req->queryStr('order_type');

        $where  = ['1=1'];
        $params = [];

        if ($from) { $where[] = 'DATE(b.created_at) >= ?'; $params[] = $from; }
        if ($to)   { $where[] = 'DATE(b.created_at) <= ?'; $params[] = $to; }
        if ($mode) { $where[] = 'b.payment_mode = ?';      $params[] = $mode; }
        if ($type) { $where[] = 'o.order_type = ?';        $params[] = $type; }

        $whereSQL = implode(' AND ', $where);

        $total = (int)Database::value(
            "SELECT COUNT(*) FROM bills b JOIN orders o ON b.order_id = o.id WHERE $whereSQL",
            $params
        );

        $bills = Database::all(
            "SELECT b.*, o.order_number, o.order_type, o.guest_name, o.guest_room,
                    t.label AS table_label, t.table_number
             FROM bills b
             JOIN orders o ON b.order_id = o.id
             LEFT JOIN restaurant_tables t ON o.table_id = t.id
             WHERE $whereSQL
             ORDER BY b.created_at DESC
             LIMIT ? OFFSET ?",
            [...$params, $limit, $offset]
        );

        foreach ($bills as &$b) {
            $b['id']                = (int)$b['id'];
            $b['grand_total']       = (float)$b['grand_total'];
            $b['subtotal']          = (float)$b['subtotal'];
            $b['commission_amount'] = (float)$b['commission_amount'];
            $b['discount_amount']   = (float)$b['discount_amount'];
            $b['tax_amount']        = (float)$b['tax_amount'];
        }
        unset($b);

        Response::success([
            'bills'      => $bills,
            'pagination' => Helper::paginate($total, $page, $limit),
        ]);
    }

    // ================================================================
    // SHOW SINGLE BILL (for print)
    // ================================================================

    public function show(Request $req, string $billNumber): never
    {
        Auth::requireAdmin();

        $bill = $this->getBillDetail($billNumber);
        if (!$bill) Response::notFound('Bill not found.');

        // Attach business settings for print
        $bill['settings'] = Helper::allSettings();

        Response::success($bill);
    }

    // ================================================================
    // Private helpers
    // ================================================================

    private function getBillDetail(string $billNumber): ?array
    {
        $bill = Database::row(
            "SELECT b.*,
                    o.order_number, o.order_type, o.guest_name, o.guest_room, o.guest_phone, o.notes AS order_notes,
                    t.label AS table_label, t.table_number
             FROM bills b
             JOIN orders o ON b.order_id = o.id
             LEFT JOIN restaurant_tables t ON o.table_id = t.id
             WHERE b.bill_number = ?",
            [$billNumber]
        );
        if (!$bill) return null;

        $items = Database::all(
            'SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC',
            [$bill['order_id']]
        );

        foreach ($items as &$item) {
            $item['unit_price'] = (float)$item['unit_price'];
            $item['line_total'] = (float)$item['line_total'];
            $item['quantity']   = (int)$item['quantity'];
        }
        unset($item);

        $bill['grand_total']       = (float)$bill['grand_total'];
        $bill['subtotal']          = (float)$bill['subtotal'];
        $bill['commission_amount'] = (float)$bill['commission_amount'];
        $bill['discount_amount']   = (float)$bill['discount_amount'];
        $bill['tax_amount']        = (float)$bill['tax_amount'];
        $bill['items']             = $items;

        return $bill;
    }
}
