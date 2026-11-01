<?php
/**
 * Staff user management (admin-only).
 * Admin hi staff bana sakta hai, ID/password set karta hai, aur module permissions
 * checkbox se tick karta hai. Permission list JWT me jati hai aur server par enforce hoti hai.
 */
class UsersController
{
    private function hasPermissionsColumn(): bool
    {
        try {
            $col = Database::row("SHOW COLUMNS FROM `admin_users` LIKE 'permissions'");
            return !empty($col);
        } catch (Throwable $e) {
            return false;
        }
    }

    private function decodeRow(array $u): array
    {
        $role = in_array($u['role'] ?? 'admin', Auth::ROLES, true) ? $u['role'] : 'admin';
        $u['id']            = (int)$u['id'];
        $u['is_active']     = (bool)$u['is_active'];
        $u['role']          = $role;
        $u['permissions']   = Auth::normalizePermissions($u['permissions'] ?? null, $role);
        return $u;
    }

    public function index(Request $req): never
    {
        Auth::requireAdmin();

        $cols = $this->hasPermissionsColumn()
            ? 'id, username, email, full_name, role, permissions, is_active, last_login_at, created_at'
            : 'id, username, email, full_name, role, is_active, last_login_at, created_at';

        $users = Database::all("SELECT $cols FROM admin_users ORDER BY role ASC, full_name ASC");
        $users = array_map(fn($u) => $this->decodeRow($u), $users);

        Response::success([
            'users'       => $users,
            'permissions' => array_map(
                fn($k) => ['key' => $k, 'label' => Auth::PERMISSION_LABELS[$k] ?? ucfirst($k)],
                Auth::PERMISSIONS
            ),
        ]);
    }

    public function create(Request $req): never
    {
        $payload = Auth::requireAdmin();

        $v = Validator::make($req->body())
            ->required('username')->string('username', 3, 50)
            ->required('password')->string('password', 6, 100)
            ->required('full_name')->string('full_name', 2, 100)
            ->string('email', 0, 120)
            ->in('role', Auth::ROLES);

        if ($v->fails()) {
            Response::unprocessable('Validation failed.', $v->errors());
        }

        $username = strtolower(trim($req->bodyStr('username')));
        $email    = trim($req->bodyStr('email') ?: '');
        $role     = $req->bodyStr('role') ?: 'waiter';
        $fullName = trim($req->bodyStr('full_name'));

        if (!preg_match('/^[a-z0-9._-]+$/', $username)) {
            Response::unprocessable('Validation failed.', [
                'username' => ['Use letters, numbers, dots, underscores or hyphens only.'],
            ]);
        }

        if ($email === '') {
            $email = $username . '@restaurant.local';
        }

        $exists = Database::row(
            'SELECT id FROM admin_users WHERE username = ? OR email = ? LIMIT 1',
            [$username, $email]
        );
        if ($exists) {
            Response::error('Username or email already exists.', 409);
        }

        $hash = password_hash($req->bodyStr('password'), PASSWORD_BCRYPT, ['cost' => 12]);
        $permissions = Auth::normalizePermissions($req->body('permissions'), $role);

        if ($this->hasPermissionsColumn()) {
            Database::run(
                'INSERT INTO admin_users (username, email, password_hash, full_name, role, permissions, is_active)
                 VALUES (?, ?, ?, ?, ?, ?, 1)',
                [$username, $email, $hash, $fullName, $role, json_encode($permissions)]
            );
        } else {
            Database::run(
                'INSERT INTO admin_users (username, email, password_hash, full_name, role, is_active)
                 VALUES (?, ?, ?, ?, ?, 1)',
                [$username, $email, $hash, $fullName, $role]
            );
        }

        $id = (int)Database::lastId();
        Helper::log($payload['admin_id'], 'create_user', 'users', $id, "Created {$role} user {$username}");

        Response::created([
            'id'          => $id,
            'username'    => $username,
            'email'       => $email,
            'full_name'   => $fullName,
            'role'        => $role,
            'permissions' => $permissions,
            'is_active'   => true,
        ], 'User created successfully.');
    }

    public function update(Request $req, int $id): never
    {
        $payload = Auth::requireAdmin();

        $user = Database::row('SELECT * FROM admin_users WHERE id = ?', [$id]);
        if (!$user) {
            Response::notFound('User not found.');
        }

        $body     = $req->body();
        $fullName = array_key_exists('full_name', $body) ? trim((string)$body['full_name']) : $user['full_name'];
        $role     = array_key_exists('role', $body) && $body['role'] !== ''
            ? (string)$body['role']
            : ($user['role'] ?? 'admin');
        $username = array_key_exists('username', $body) && trim((string)$body['username']) !== ''
            ? strtolower(trim((string)$body['username']))
            : $user['username'];
        $isActive = array_key_exists('is_active', $body)
            ? (int)(!!$body['is_active'])
            : (int)$user['is_active'];

        if ($fullName === '' || strlen($fullName) > 100) {
            Response::unprocessable('Validation failed.', ['full_name' => ['Full name is required.']]);
        }
        if (!in_array($role, Auth::ROLES, true)) {
            Response::unprocessable('Validation failed.', ['role' => ['Invalid role.']]);
        }
        if (!preg_match('/^[a-z0-9._-]+$/', $username)) {
            Response::unprocessable('Validation failed.', [
                'username' => ['Use letters, numbers, dots, underscores or hyphens only.'],
            ]);
        }
        $clash = Database::row(
            'SELECT id FROM admin_users WHERE username = ? AND id <> ? LIMIT 1',
            [$username, $id]
        );
        if ($clash) {
            Response::error('Username already exists.', 409);
        }

        // Never deactivate / demote the last active admin
        if (($user['role'] ?? 'admin') === 'admin' && ($role !== 'admin' || !$isActive)) {
            $otherAdmins = (int)Database::value(
                "SELECT COUNT(*) FROM admin_users
                 WHERE role = 'admin' AND is_active = 1 AND id != ?",
                [$id]
            );
            if ($otherAdmins < 1) {
                Response::error('Cannot remove or deactivate the last active admin.', 409);
            }
        }

        if ((int)$payload['admin_id'] === $id && !$isActive) {
            Response::error('You cannot deactivate your own account.', 409);
        }

        $params = [$username, $fullName, $role, $isActive];
        $sql    = 'UPDATE admin_users SET username = ?, full_name = ?, role = ?, is_active = ?';
        $perms  = null;

        if ($this->hasPermissionsColumn()) {
            $perms = array_key_exists('permissions', $body)
                ? Auth::normalizePermissions($body['permissions'], $role)
                : Auth::normalizePermissions($user['permissions'] ?? null, $role);
            $sql .= ', permissions = ?';
            $params[] = json_encode($perms);
        }

        $newPassword = trim((string)($body['password'] ?? ''));
        if ($newPassword !== '') {
            if (strlen($newPassword) < 6) {
                Response::unprocessable('Validation failed.', ['password' => ['Password must be at least 6 characters.']]);
            }
            $sql .= ', password_hash = ?';
            $params[] = password_hash($newPassword, PASSWORD_BCRYPT, ['cost' => 12]);
        }

        $sql .= ' WHERE id = ?';
        $params[] = $id;
        Database::run($sql, $params);

        Helper::log($payload['admin_id'], 'update_user', 'users', $id, "Updated user {$username}");

        Response::success([
            'id'          => $id,
            'username'    => $username,
            'email'       => $user['email'],
            'full_name'   => $fullName,
            'role'        => $role,
            'permissions' => $perms ?? Auth::normalizePermissions($user['permissions'] ?? null, $role),
            'is_active'   => (bool)$isActive,
        ], 'User updated successfully.');
    }
}
