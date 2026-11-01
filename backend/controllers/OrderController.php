<?php
class OrderController
{
    // ================================================================
    // LIST & SHOW
    // ================================================================

    public function index(Request $req): never
    {
        Auth::requireAdmin();

        $page   = Helper::clamp($req->queryInt('page', 1), 1, 9999);
        $limit  = Helper::clamp($req->queryInt('limit', 20), 5, 100);
        $offset = ($page - 1) * $limit;

        $status = $req->queryStr('status');
        $type   = $req->queryStr('order_type');
        $date   = $req->queryStr('date');
        $from   = $req->queryStr('from_date');
        $to     = $req->queryStr('to_date');

        $where  = ['1=1'];
        $params = [];

        if ($status === 'running') {
            // Dine-in: active table orders. Guest house: only credit/due bills (bill must exist).
            $where[] = "(
                (o.order_type = 'dine_in' AND o.status = 'running')
                OR (
                    o.order_type = 'guest_house'
                    AND o.status = 'running'
                    AND EXISTS (
                        SELECT 1 FROM bills b
                        WHERE b.order_id = o.id AND b.payment_status = 'unpaid'
                    )
                )
            )";
        } elseif ($status) {
            $where[] = 'o.status = ?';
            $params[] = $status;
        }
        if ($type)   { $where[] = 'o.order_type = ?';         $params[] = $type; }
        if ($date)   { $where[] = 'DATE(o.created_at) = ?';   $params[] = $date; }
        if ($from)   { $where[] = 'DATE(o.created_at) >= ?';  $params[] = $from; }
        if ($to)     { $where[] = 'DATE(o.created_at) <= ?';  $params[] = $to; }

        $whereSQL = implode(' AND ', $where);

        $total  = (int)Database::value("SELECT COUNT(*) FROM orders o WHERE $whereSQL", $params);
        $orders = Database::all(
            "SELECT o.*, t.label AS table_label,
                    (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
             FROM orders o
             LEFT JOIN restaurant_tables t ON o.table_id = t.id
             WHERE $whereSQL
             ORDER BY o.created_at DESC
             LIMIT ? OFFSET ?",
            [...$params, $limit, $offset]
        );

        foreach ($orders as &$o) {
            $o['id']                = (int)$o['id'];
            $o['grand_total']       = (float)$o['grand_total'];
            $o['subtotal']          = (float)$o['subtotal'];
            $o['commission_amount'] = (float)$o['commission_amount'];
            $o['item_count']        = (int)$o['item_count'];
            $this->attachBillSummary($o);
        }
        unset($o);

        Response::success([
            'orders'     => $orders,
            'pagination' => Helper::paginate($total, $page, $limit),
        ]);
    }

    public function show(Request $req, int $id): never
    {
        $payload = Auth::guard();
        $order = $this->getOrderWithItems($id);
        if (!$order) Response::notFound('Order not found.');
        Auth::assertWaiterDineInOrder($order, $payload);
        Response::success($order);
    }

    // ================================================================
    // CREATE — DINE IN
    // ================================================================

    public function createDineIn(Request $req): never
    {
        $payload = Auth::guard();

        $v = Validator::make($req->body())
            ->required('table_id')->integer('table_id', 1);

        if ($v->fails()) Response::unprocessable('Validation failed.', $v->errors());

        $tableId = $req->bodyInt('table_id');

        // Lock check: table must be available
        Database::begin();
        try {
            $table = Database::row(
                'SELECT * FROM restaurant_tables WHERE id = ? AND is_active = 1 FOR UPDATE',
                [$tableId]
            );

            if (!$table) {
                Database::rollback();
                Response::notFound('Table not found.');
            }
            if ($table['status'] !== 'available') {
                Database::rollback();
                Response::error(
                    "Table {$table['label']} is currently {$table['status']}. Please select a different table.",
                    409
                );
            }

            $tempOrderNumber = Helper::generateOrderNumber();
            Database::run(
                'INSERT INTO orders
                 (order_number, order_type, table_id, status, subtotal, commission_amount, tax_amount, grand_total, created_by)
                 VALUES (?, ?, ?, ?, 0, 0, 0, 0, ?)',
                [$tempOrderNumber, 'dine_in', $tableId, 'running', $payload['admin_id']]
            );
            $orderId = Database::lastId();
            $orderNumber = Helper::formatOrderNumberFromId((int)$orderId);
            Database::run(
                'UPDATE orders SET order_number = ? WHERE id = ?',
                [$orderNumber, $orderId]
            );

            Database::run(
                "UPDATE restaurant_tables SET status = 'occupied', current_order_id = ? WHERE id = ?",
                [$orderId, $tableId]
            );

            Database::commit();
        } catch (Throwable $e) {
            Database::rollback();
            Response::serverError('Failed to create order. Please try again.');
        }

        Helper::log($payload['admin_id'], 'create_order', 'orders', $orderId,
            "Dine-in order #{$orderNumber} on {$table['label']}");

        Response::created($this->getOrderWithItems($orderId), 'Dine-in order created successfully.');
    }

    // ================================================================
    // CREATE — GUEST HOUSE
    // ================================================================

    public function createGuestHouse(Request $req): never
    {
        $payload = Auth::requireAdmin();

        $v = Validator::make($req->body())
            ->required('guest_name', 'Guest House Name')->string('guest_name', 2, 100)
            ->required('guest_room', 'Room Number')->string('guest_room', 1, 50)
            ->string('guest_phone', 0, 20)
            ->phone('guest_phone');
        $v->required('guest_address', 'Address')->string('guest_address', 5, 255)
          ->string('guest_id_proof', 0, 120);

        if ($v->fails()) Response::unprocessable('Validation failed.', $v->errors());

        Database::begin();
        try {
            $tempOrderNumber = Helper::generateOrderNumber();

            Database::run(
                'INSERT INTO orders
                 (order_number, order_type, guest_name, guest_room, guest_phone, guest_address, guest_id_proof,
                  status, subtotal, commission_amount, tax_amount, grand_total, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?)',
                [
                    $tempOrderNumber, 'guest_house',
                    $req->bodyStr('guest_name'),
                    $req->bodyStr('guest_room') ?: null,
                    $req->bodyStr('guest_phone') ?: null,
                    $req->bodyStr('guest_address') ?: null,
                    $req->bodyStr('guest_id_proof') ?: null,
                    'running',
                    $payload['admin_id'],
                ]
            );
            $orderId = Database::lastId();
            $orderNumber = Helper::formatOrderNumberFromId((int)$orderId);
            Database::run(
                'UPDATE orders SET order_number = ? WHERE id = ?',
                [$orderNumber, $orderId]
            );
            Database::commit();
        } catch (Throwable $e) {
            Database::rollback();
            Response::serverError('Failed to create order.');
        }

        // Save the guest-house contact number if provided. Do not use guest_name —
        // that field stores the property name, not a person.
        $orderPhone = $req->bodyStr('guest_phone');
        if ($orderPhone !== '') {
            CustomerService::upsertFromContact(null, $orderPhone, false);
        }

        Helper::log($payload['admin_id'], 'create_order', 'orders', $orderId,
            "Guest house order #{$orderNumber} for {$req->bodyStr('guest_name')}");

        Response::created($this->getOrderWithItems($orderId), 'Guest house order created successfully.');
    }

    // ================================================================
    // ADD ITEM TO ORDER
    // ================================================================

    public function addItem(Request $req, int $orderId): never
    {
        $payload = Auth::guard();

        $v = Validator::make($req->body())
            ->required('menu_item_id')->integer('menu_item_id', 1)
            ->required('quantity')->integer('quantity', 1, 999);

        if ($v->fails()) Response::unprocessable('Validation failed.', $v->errors());

        $order = Database::row(
            "SELECT * FROM orders WHERE id = ? AND status = 'running'",
            [$orderId]
        );
        if (!$order) Response::notFound('Order not found or is not in running state.');
        Auth::assertWaiterDineInOrder($order, $payload);

        $menuItemId = $req->bodyInt('menu_item_id');
        $menuItem   = Database::row(
            'SELECT * FROM menu_items WHERE id = ? AND is_active = 1',
            [$menuItemId]
        );
        if (!$menuItem) Response::notFound('Menu item not found or is inactive.');

        // Price depends on order type
        $unitPrice = $order['order_type'] === 'guest_house'
            ? (float)$menuItem['guest_house_price']
            : (float)$menuItem['restaurant_price'];

        $addQty = $req->bodyInt('quantity');

        Database::begin();
        try {
            // If same item already in order → increment quantity
            $existing = Database::row(
                'SELECT * FROM order_items WHERE order_id = ? AND menu_item_id = ?',
                [$orderId, $menuItemId]
            );

            if ($existing) {
                $newQty   = (int)$existing['quantity'] + $addQty;
                $newTotal = round($unitPrice * $newQty, 2);
                Database::run(
                    'UPDATE order_items SET quantity = ?, line_total = ? WHERE id = ?',
                    [$newQty, $newTotal, $existing['id']]
                );
            } else {
                $lineTotal = round($unitPrice * $addQty, 2);
                // Get category name for snapshot
                $catName = Database::value(
                    'SELECT name FROM categories WHERE id = ?',
                    [$menuItem['category_id']]
                ) ?: '';

                Database::run(
                    'INSERT INTO order_items
                     (order_id, menu_item_id, item_name, item_category, unit_price, quantity, line_total, notes)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [
                        $orderId, $menuItemId,
                        $menuItem['name'], $catName,
                        $unitPrice, $addQty,
                        round($unitPrice * $addQty, 2),
                        $req->bodyStr('notes') ?: null,
                    ]
                );
            }

            Helper::recalcOrder($orderId);
            Database::commit();
        } catch (Throwable $e) {
            Database::rollback();
            Response::serverError('Failed to add item to order.');
        }

        Response::success($this->getOrderWithItems($orderId), 'Item added successfully.');
    }

    // ================================================================
    // UPDATE ITEM QUANTITY
    // ================================================================

    public function updateItem(Request $req, int $orderId, int $itemId): never
    {
        $payload = Auth::guard();

        $v = Validator::make($req->body())
            ->required('quantity')->integer('quantity', 1, 999);

        if ($v->fails()) Response::unprocessable('Validation failed.', $v->errors());

        $order = Database::row(
            "SELECT status, order_type FROM orders WHERE id = ? AND status = 'running'",
            [$orderId]
        );
        if (!$order) Response::error('Order is not in running state.', 409);
        Auth::assertWaiterDineInOrder($order, $payload);

        $oi = Database::row(
            'SELECT * FROM order_items WHERE id = ? AND order_id = ?',
            [$itemId, $orderId]
        );
        if (!$oi) Response::notFound('Order item not found.');

        $newQty   = $req->bodyInt('quantity');
        $newTotal = round((float)$oi['unit_price'] * $newQty, 2);

        Database::begin();
        try {
            Database::run(
                'UPDATE order_items SET quantity = ?, line_total = ? WHERE id = ?',
                [$newQty, $newTotal, $itemId]
            );
            Helper::recalcOrder($orderId);
            Database::commit();
        } catch (Throwable $e) {
            Database::rollback();
            Response::serverError('Failed to update item.');
        }

        Response::success($this->getOrderWithItems($orderId), 'Item updated successfully.');
    }

    // ================================================================
    // REMOVE ITEM
    // ================================================================

    public function removeItem(Request $req, int $orderId, int $itemId): never
    {
        $payload = Auth::guard();

        $order = Database::row(
            "SELECT status, order_type FROM orders WHERE id = ? AND status = 'running'",
            [$orderId]
        );
        if (!$order) Response::error('Order is not editable.', 409);
        Auth::assertWaiterDineInOrder($order, $payload);

        $oi = Database::row(
            'SELECT id FROM order_items WHERE id = ? AND order_id = ?',
            [$itemId, $orderId]
        );
        if (!$oi) Response::notFound('Order item not found.');

        Database::begin();
        try {
            Database::run('DELETE FROM order_items WHERE id = ?', [$itemId]);
            Helper::recalcOrder($orderId);
            Database::commit();
        } catch (Throwable $e) {
            Database::rollback();
            Response::serverError('Failed to remove item.');
        }

        Response::success($this->getOrderWithItems($orderId), 'Item removed successfully.');
    }

    // ================================================================
    // UPDATE COMMISSION (GUEST HOUSE ONLY)
    // ================================================================

    public function updateCommission(Request $req, int $orderId): never
    {
        Auth::requireAdmin();

        $v = Validator::make($req->body())
            ->required('commission_amount')->numeric('commission_amount', 0, 9999999);

        if ($v->fails()) Response::unprocessable('Validation failed.', $v->errors());

        $order = Database::row(
            "SELECT id, status, order_type, subtotal, discount_amount FROM orders WHERE id = ?",
            [$orderId]
        );
        if (!$order) Response::notFound('Order not found.');
        if ($order['status'] !== 'running') Response::error('Only running orders can be edited.', 409);
        if ($order['order_type'] !== 'guest_house') Response::error('Commission is editable only for guest house orders.', 422);

        $commissionAmount = max(0.00, $req->bodyFloat('commission_amount'));
        $totals = Helper::calculateTotals(
            (float)$order['subtotal'],
            (string)$order['order_type'],
            (float)$order['discount_amount'],
            $commissionAmount
        );

        Database::run(
            'UPDATE orders SET commission_amount = ?, tax_amount = ?, grand_total = ? WHERE id = ?',
            [
                $totals['commission_amount'],
                $totals['tax_amount'],
                $totals['grand_total'],
                $orderId,
            ]
        );

        Response::success($this->getOrderWithItems($orderId), 'Commission updated successfully.');
    }

    // ================================================================
    // CANCEL ORDER
    // ================================================================

    public function cancel(Request $req, int $id): never
    {
        $payload = Auth::requireAdmin();

        $order = Database::row(
            "SELECT * FROM orders WHERE id = ? AND status = 'running'",
            [$id]
        );
        if (!$order) Response::error('Order not found or cannot be cancelled.', 409);

        Database::begin();
        try {
            Database::run(
                "UPDATE orders SET status = 'cancelled' WHERE id = ?",
                [$id]
            );

            if ($order['table_id']) {
                Database::run(
                    "UPDATE restaurant_tables SET status = 'available', current_order_id = NULL WHERE id = ?",
                    [$order['table_id']]
                );
            }

            Database::commit();
        } catch (Throwable $e) {
            Database::rollback();
            Response::serverError('Failed to cancel order.');
        }

        Helper::log($payload['admin_id'], 'cancel_order', 'orders', $id,
            "Order #{$order['order_number']} cancelled.");

        Response::success(null, 'Order cancelled successfully.');
    }

    // ================================================================
    // Private helpers
    // ================================================================

    private function getOrderWithItems(int $id): ?array
    {
        $order = Database::row(
            'SELECT o.*, t.label AS table_label, t.table_number
             FROM orders o
             LEFT JOIN restaurant_tables t ON o.table_id = t.id
             WHERE o.id = ?',
            [$id]
        );
        if (!$order) return null;

        $items = Database::all(
            'SELECT oi.*, mi.is_active AS item_still_active
             FROM order_items oi
             LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
             WHERE oi.order_id = ?
             ORDER BY oi.id ASC',
            [$id]
        );

        // Cast numeric fields
        $order['id']                = (int)$order['id'];
        $order['subtotal']          = (float)$order['subtotal'];
        $order['tax_amount']        = (float)$order['tax_amount'];
        $order['commission_amount'] = (float)$order['commission_amount'];
        $order['discount_amount']   = (float)$order['discount_amount'];
        $order['grand_total']       = (float)$order['grand_total'];

        foreach ($items as &$item) {
            $item['id']         = (int)$item['id'];
            $item['quantity']   = (int)$item['quantity'];
            $item['unit_price'] = (float)$item['unit_price'];
            $item['line_total'] = (float)$item['line_total'];
        }
        unset($item);

        $order['items'] = $items;
        $this->attachBillSummary($order);
        return $order;
    }

    private function attachBillSummary(array &$order): void
    {
        $bill = Database::row(
            'SELECT id, bill_number, payment_status, payment_mode, grand_total, paid_at
             FROM bills WHERE order_id = ?',
            [(int)$order['id']]
        );

        if (!$bill) {
            $order['bill'] = null;
            return;
        }

        $bill['id']          = (int)$bill['id'];
        $bill['grand_total'] = (float)$bill['grand_total'];
        $order['bill']       = $bill;
    }
}
