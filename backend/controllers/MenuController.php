<?php
class MenuController
{
    // ================================================================
    // CATEGORIES
    // ================================================================

    public function getCategories(Request $req): never
    {
        Auth::guard();

        $showAll = $req->query('all') === '1';
        $sql = $showAll
            ? 'SELECT * FROM categories ORDER BY sort_order ASC, name ASC'
            : 'SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order ASC, name ASC';

        $cats = Database::all($sql);
        foreach ($cats as &$c) {
            $c['id']         = (int)$c['id'];
            $c['sort_order'] = (int)$c['sort_order'];
            $c['is_active']  = (bool)$c['is_active'];
        }
        unset($c);

        Response::success($cats);
    }

    public function createCategory(Request $req): never
    {
        Auth::requireAdmin();

        $v = Validator::make($req->body())
            ->required('name')->string('name', 2, 100)
            ->string('description', 0, 500);

        if ($v->fails()) Response::unprocessable('Validation failed.', $v->errors());

        // Duplicate check
        $exists = Database::value(
            'SELECT COUNT(*) FROM categories WHERE name = ?',
            [$req->bodyStr('name')]
        );
        if ($exists) Response::error('A category with this name already exists.', 409);

        Database::run(
            'INSERT INTO categories (name, description, sort_order, is_active) VALUES (?, ?, ?, 1)',
            [
                $req->bodyStr('name'),
                $req->bodyStr('description') ?: null,
                $req->bodyInt('sort_order'),
            ]
        );

        $id = Database::lastId();
        Response::created(
            Database::row('SELECT * FROM categories WHERE id = ?', [$id]),
            'Category created successfully.'
        );
    }

    public function updateCategory(Request $req, int $id): never
    {
        Auth::requireAdmin();

        $this->findCategory($id);

        $v = Validator::make($req->body())
            ->required('name')->string('name', 2, 100)
            ->string('description', 0, 500);

        if ($v->fails()) Response::unprocessable('Validation failed.', $v->errors());

        // Duplicate name — exclude self
        $exists = Database::value(
            'SELECT COUNT(*) FROM categories WHERE name = ? AND id != ?',
            [$req->bodyStr('name'), $id]
        );
        if ($exists) Response::error('A category with this name already exists.', 409);

        Database::run(
            'UPDATE categories SET name = ?, description = ?, sort_order = ?, is_active = ? WHERE id = ?',
            [
                $req->bodyStr('name'),
                $req->bodyStr('description') ?: null,
                $req->bodyInt('sort_order'),
                $req->body('is_active') !== null ? (int)(bool)$req->body('is_active') : 1,
                $id,
            ]
        );

        Response::success(
            Database::row('SELECT * FROM categories WHERE id = ?', [$id]),
            'Category updated successfully.'
        );
    }

    public function deleteCategory(Request $req, int $id): never
    {
        Auth::requireAdmin();
        $this->findCategory($id);

        // Prevent delete if items exist
        $itemCount = (int)Database::value(
            'SELECT COUNT(*) FROM menu_items WHERE category_id = ?',
            [$id]
        );
        if ($itemCount > 0) {
            Response::error(
                "Cannot delete this category — it has $itemCount menu item(s). " .
                "Deactivate or move them first.",
                409
            );
        }

        Database::run('DELETE FROM categories WHERE id = ?', [$id]);
        Response::success(null, 'Category deleted successfully.');
    }

    // ================================================================
    // MENU ITEMS
    // ================================================================

    public function getItems(Request $req): never
    {
        Auth::guard();

        $catId      = $req->queryInt('category_id');
        $activeOnly = $req->query('active_only') === '1';
        $search     = $req->queryStr('search');

        $where  = ['1=1'];
        $params = [];

        if ($catId > 0)  { $where[] = 'mi.category_id = ?'; $params[] = $catId; }
        if ($activeOnly) { $where[] = 'mi.is_active = 1'; }
        if ($search)     { $where[] = 'mi.name LIKE ?'; $params[] = "%$search%"; }

        $whereSQL = implode(' AND ', $where);

        $items = Database::all(
            "SELECT mi.*, c.name AS category_name
             FROM menu_items mi
             JOIN categories c ON mi.category_id = c.id
             WHERE $whereSQL
             ORDER BY c.sort_order ASC, mi.sort_order ASC, mi.name ASC",
            $params
        );

        foreach ($items as &$item) {
            $item['id']                = (int)$item['id'];
            $item['category_id']       = (int)$item['category_id'];
            $item['restaurant_price']  = (float)$item['restaurant_price'];
            $item['guest_house_price'] = (float)$item['guest_house_price'];
            $item['sort_order']        = (int)$item['sort_order'];
            $item['is_active']         = (bool)$item['is_active'];
        }
        unset($item);

        Response::success($items);
    }

    public function createItem(Request $req): never
    {
        Auth::requireAdmin();

        $v = Validator::make($req->body())
            ->required('name')->string('name', 2, 150)
            ->required('category_id')->integer('category_id', 1)
            ->required('restaurant_price')->numeric('restaurant_price', 0)
            ->required('guest_house_price')->numeric('guest_house_price', 0)
            ->string('description', 0, 500);

        if ($v->fails()) Response::unprocessable('Validation failed.', $v->errors());

        // Category must exist and be active
        $cat = Database::row(
            'SELECT id FROM categories WHERE id = ? AND is_active = 1',
            [$req->bodyInt('category_id')]
        );
        if (!$cat) Response::error('Selected category does not exist or is inactive.', 422);

        Database::run(
            'INSERT INTO menu_items
             (category_id, name, description, restaurant_price, guest_house_price, sort_order, is_active)
             VALUES (?, ?, ?, ?, ?, ?, 1)',
            [
                $req->bodyInt('category_id'),
                $req->bodyStr('name'),
                $req->bodyStr('description') ?: null,
                $req->bodyFloat('restaurant_price'),
                $req->bodyFloat('guest_house_price'),
                $req->bodyInt('sort_order'),
            ]
        );

        $id = Database::lastId();
        $item = Database::row(
            'SELECT mi.*, c.name AS category_name FROM menu_items mi
             JOIN categories c ON mi.category_id = c.id WHERE mi.id = ?',
            [$id]
        );

        Response::created($item, 'Menu item created successfully.');
    }

    public function updateItem(Request $req, int $id): never
    {
        Auth::requireAdmin();
        $this->findItem($id);

        $v = Validator::make($req->body())
            ->required('name')->string('name', 2, 150)
            ->required('category_id')->integer('category_id', 1)
            ->required('restaurant_price')->numeric('restaurant_price', 0)
            ->required('guest_house_price')->numeric('guest_house_price', 0)
            ->string('description', 0, 500);

        if ($v->fails()) Response::unprocessable('Validation failed.', $v->errors());

        Database::run(
            'UPDATE menu_items
             SET category_id = ?, name = ?, description = ?,
                 restaurant_price = ?, guest_house_price = ?,
                 sort_order = ?, is_active = ?
             WHERE id = ?',
            [
                $req->bodyInt('category_id'),
                $req->bodyStr('name'),
                $req->bodyStr('description') ?: null,
                $req->bodyFloat('restaurant_price'),
                $req->bodyFloat('guest_house_price'),
                $req->bodyInt('sort_order'),
                $req->body('is_active') !== null ? (int)(bool)$req->body('is_active') : 1,
                $id,
            ]
        );

        $item = Database::row(
            'SELECT mi.*, c.name AS category_name FROM menu_items mi
             JOIN categories c ON mi.category_id = c.id WHERE mi.id = ?',
            [$id]
        );

        Response::success($item, 'Menu item updated successfully.');
    }

    public function toggleItem(Request $req, int $id): never
    {
        Auth::requireAdmin();
        $item = $this->findItem($id);
        $newStatus = $item['is_active'] ? 0 : 1;
        Database::run('UPDATE menu_items SET is_active = ? WHERE id = ?', [$newStatus, $id]);
        $label = $newStatus ? 'activated' : 'deactivated';
        Response::success(['is_active' => (bool)$newStatus], "Item $label successfully.");
    }

    // ---- Private helpers ----

    private function findCategory(int $id): array
    {
        $cat = Database::row('SELECT * FROM categories WHERE id = ?', [$id]);
        if (!$cat) Response::notFound('Category not found.');
        return $cat;
    }

    private function findItem(int $id): array
    {
        $item = Database::row('SELECT * FROM menu_items WHERE id = ?', [$id]);
        if (!$item) Response::notFound('Menu item not found.');
        return $item;
    }
}
