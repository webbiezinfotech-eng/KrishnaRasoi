<?php
class TableController
{
    public function index(Request $req): never
    {
        Auth::guard();

        $tables = Database::all(
            "SELECT
                t.*,
                o.order_number,
                o.created_at AS order_started_at,
                o.grand_total AS current_order_total,
                (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = t.current_order_id) AS item_count
             FROM restaurant_tables t
             LEFT JOIN orders o ON t.current_order_id = o.id
             WHERE t.is_active = 1
             ORDER BY t.table_number ASC"
        );

        // Cast types
        foreach ($tables as &$t) {
            $t['id']                   = (int)$t['id'];
            $t['table_number']         = (int)$t['table_number'];
            $t['capacity']             = (int)$t['capacity'];
            $t['is_active']            = (bool)$t['is_active'];
            $t['current_order_id']     = $t['current_order_id'] ? (int)$t['current_order_id'] : null;
            $t['item_count']           = (int)$t['item_count'];
            $t['current_order_total']  = $t['current_order_total'] !== null ? (float)$t['current_order_total'] : null;
        }
        unset($t);

        Response::success($tables);
    }

    public function show(Request $req, int $id): never
    {
        Auth::guard();

        $table = $this->findTable($id);

        if ($table['current_order_id']) {
            $order = $this->getOrderWithItems((int)$table['current_order_id']);
            $table['current_order'] = $order;
        }

        Response::success($table);
    }

    public function update(Request $req, int $id): never
    {
        Auth::requireAdmin();

        $v = Validator::make($req->body())
            ->required('label')->string('label', 1, 50)
            ->required('capacity')->integer('capacity', 1, 50);

        if ($v->fails()) Response::unprocessable('Validation failed.', $v->errors());

        $table = $this->findTable($id);

        Database::run(
            'UPDATE restaurant_tables SET label = ?, capacity = ? WHERE id = ?',
            [$req->bodyStr('label'), $req->bodyInt('capacity'), $id]
        );

        Response::success(null, 'Table updated successfully.');
    }

    public function reset(Request $req, int $id): never
    {
        $payload = Auth::requireAdmin();

        $table = $this->findTable($id);

        if ($table['status'] === 'available') {
            Response::error('Table is already available.', 409);
        }

        Database::run(
            "UPDATE restaurant_tables SET status = 'available', current_order_id = NULL WHERE id = ?",
            [$id]
        );

        Helper::log($payload['admin_id'], 'reset_table', 'tables', $id,
            "Table {$table['label']} manually reset to available.");

        Response::success(null, "Table {$table['label']} reset to available.");
    }

    // ---- Private helpers ----

    private function findTable(int $id): array
    {
        $table = Database::row(
            'SELECT * FROM restaurant_tables WHERE id = ? AND is_active = 1',
            [$id]
        );
        if (!$table) Response::notFound('Table not found.');
        return $table;
    }

    private function getOrderWithItems(int $orderId): ?array
    {
        $order = Database::row(
            'SELECT o.*, t.label AS table_label FROM orders o
             LEFT JOIN restaurant_tables t ON o.table_id = t.id
             WHERE o.id = ?',
            [$orderId]
        );
        if (!$order) return null;

        $order['items'] = Database::all(
            'SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC',
            [$orderId]
        );
        return $order;
    }
}
