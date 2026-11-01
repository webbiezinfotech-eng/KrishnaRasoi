<?php
class AuthController
{
    /** Role + permission list for a user row (permissions column is optional). */
    private static function permissionsFor(array $user): array
    {
        $role = in_array($user['role'] ?? 'admin', Auth::ROLES, true) ? $user['role'] : 'admin';
        $raw  = null;
        if (array_key_exists('permissions', $user)) {
            $raw = $user['permissions'];
        } else {
            try {
                $raw = Database::value('SELECT permissions FROM admin_users WHERE id = ?', [(int)$user['id']]);
            } catch (Throwable $e) {
                $raw = null;
            }
        }
        return Auth::normalizePermissions($raw, $role);
    }

    private static function payloadFor(array $user): array
    {
        $role  = in_array($user['role'] ?? 'admin', Auth::ROLES, true) ? $user['role'] : 'admin';
        return [
            'id'          => (int)$user['id'],
            'username'    => $user['username'],
            'email'       => $user['email'],
            'full_name'   => $user['full_name'],
            'role'        => $role,
            'permissions' => self::permissionsFor($user),
        ];
    }

    public function login(Request $req): never
    {
        $v = Validator::make($req->body())
            ->required('username')->string('username', 1, 50)
            ->required('password')->string('password', 4, 100);

        if ($v->fails()) {
            Response::unprocessable('Validation failed.', $v->errors());
        }

        $username = $req->bodyStr('username');
        $password = $req->bodyStr('password');

        $user = Database::row(
            'SELECT id, username, email, full_name, role, password_hash, is_active
             FROM admin_users WHERE username = ? OR email = ? LIMIT 1',
            [$username, $username]
        );

        if (!$user || !$user['is_active']) {
            Response::error('Invalid username or password.', 401);
        }

        if (!password_verify($password, $user['password_hash'])) {
            Response::error('Invalid username or password.', 401);
        }

        $admin = self::payloadFor($user);

        Database::run(
            'UPDATE admin_users SET last_login_at = NOW() WHERE id = ?',
            [$user['id']]
        );

        $token = Auth::generateToken([
            'admin_id'    => $user['id'],
            'username'    => $user['username'],
            'role'        => $admin['role'],
            'permissions' => $admin['permissions'],
        ]);

        Helper::log($user['id'], 'login', 'auth', null, "Login from {$_SERVER['REMOTE_ADDR']}");

        Response::success([
            'token'      => $token,
            'expires_in' => JWT_EXPIRY,
            'admin'      => $admin,
        ], 'Login successful.');
    }

    public function logout(Request $req): never
    {
        $payload = Auth::guard();
        Helper::log($payload['admin_id'], 'logout', 'auth');
        Response::success(null, 'Logged out successfully.');
    }

    public function me(Request $req): never
    {
        $payload = Auth::guard();

        $user = Database::row(
            'SELECT id, username, email, full_name, role, is_active, last_login_at, created_at
             FROM admin_users WHERE id = ? LIMIT 1',
            [$payload['admin_id']]
        );

        if (!$user) Response::notFound('Admin user not found.');

        $admin = self::payloadFor($user);
        $admin['last_login_at'] = $user['last_login_at'] ?? null;
        $admin['created_at']    = $user['created_at'] ?? null;
        $admin['is_active']     = (bool)($user['is_active'] ?? 1);

        Response::success($admin);
    }

    public function changePassword(Request $req): never
    {
        $payload = Auth::guard();

        $v = Validator::make($req->body())
            ->required('current_password')
            ->required('new_password')->string('new_password', 8, 100)
            ->required('confirm_password');

        if ($v->fails()) Response::unprocessable('Validation failed.', $v->errors());

        if ($req->bodyStr('new_password') !== $req->bodyStr('confirm_password')) {
            Response::unprocessable('Validation failed.', ['confirm_password' => ['Passwords do not match.']]);
        }

        $user = Database::row(
            'SELECT id, password_hash FROM admin_users WHERE id = ?',
            [$payload['admin_id']]
        );

        if (!$user || !password_verify($req->bodyStr('current_password'), $user['password_hash'])) {
            Response::error('Current password is incorrect.', 401);
        }

        $newHash = password_hash($req->bodyStr('new_password'), PASSWORD_BCRYPT, ['cost' => 12]);
        Database::run('UPDATE admin_users SET password_hash = ? WHERE id = ?', [$newHash, $user['id']]);

        Helper::log($payload['admin_id'], 'change_password', 'auth');
        Response::success(null, 'Password updated successfully.');
    }

    /** Permission catalogue + all permissions (for the admin's checkbox matrix). */
    public function permissions(Request $req): never
    {
        Auth::requireAdmin();
        $items = [];
        foreach (Auth::PERMISSIONS as $key) {
            $items[] = ['key' => $key, 'label' => Auth::PERMISSION_LABELS[$key] ?? ucfirst($key)];
        }
        Response::success([
            'permissions'   => $items,
            'roles'         => Auth::ROLES,
            'role_defaults' => [
                'admin'     => Auth::defaultPermissions('admin'),
                'manager'   => Auth::defaultPermissions('manager'),
                'reception' => Auth::defaultPermissions('reception'),
                'waiter'    => Auth::defaultPermissions('waiter'),
            ],
        ]);
    }
}
