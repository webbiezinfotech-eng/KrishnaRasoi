<?php
/**
 * JWT-based stateless authentication.
 * HS256 with base64url encoding.
 */
class Auth
{
    private static function b64url(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private static function b64decode(string $data): string
    {
        $pad = strlen($data) % 4;
        if ($pad) $data .= str_repeat('=', 4 - $pad);
        return base64_decode(strtr($data, '-_', '+/'));
    }

    public static function generateToken(array $payload): string
    {
        $header  = self::b64url(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
        $payload['iat'] = time();
        $payload['exp'] = time() + JWT_EXPIRY;
        $body = self::b64url(json_encode($payload));
        $sig  = self::b64url(hash_hmac('sha256', "$header.$body", JWT_SECRET, true));
        return "$header.$body.$sig";
    }

    public static function verifyToken(string $token): ?array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) return null;

        [$header, $body, $sig] = $parts;
        $expected = self::b64url(hash_hmac('sha256', "$header.$body", JWT_SECRET, true));

        if (!hash_equals($expected, $sig)) return null;

        $payload = json_decode(self::b64decode($body), true);
        if (!$payload || !isset($payload['exp']) || $payload['exp'] < time()) {
            return null;
        }
        return $payload;
    }

    /**
     * Bearer token from Authorization header (works with Apache, nginx, PHP built-in server, proxies).
     */
    private static function bearerFromRequest(): ?string
    {
        $auth = '';
        if (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
            $auth = (string) $_SERVER['HTTP_AUTHORIZATION'];
        } elseif (!empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
            $auth = (string) $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
        } elseif (function_exists('apache_request_headers')) {
            $headers = apache_request_headers();
            if (is_array($headers)) {
                $headers = array_change_key_case($headers, CASE_LOWER);
                $auth = $headers['authorization'] ?? '';
            }
        }
        if ($auth === '' && function_exists('getallheaders')) {
            $headers = @getallheaders();
            if (is_array($headers)) {
                $headers = array_change_key_case($headers, CASE_LOWER);
                $auth = $headers['authorization'] ?? '';
            }
        }
        if (!str_starts_with($auth, 'Bearer ')) {
            return null;
        }
        return substr($auth, 7);
    }

    /**
     * Bearer token from Authorization header or ?token= query (for print window).
     */
    public static function tokenFromRequest(): ?string
    {
        $token = self::bearerFromRequest();
        if ($token !== null && $token !== '') {
            return $token;
        }
        $query = $_GET['token'] ?? '';
        return is_string($query) && $query !== '' ? $query : null;
    }

    /**
     * Require a valid Bearer token. Returns decoded payload or terminates with 401.
     */
    public static function guard(): array
    {
        $token = self::tokenFromRequest();

        if ($token === null || $token === '') {
            Response::unauthorized('Authorization token is required.');
        }
        $payload = self::verifyToken($token);

        if (!$payload) {
            Response::unauthorized('Invalid or expired token. Please log in again.');
        }
        return $payload;
    }

    /** All roles the system understands. */
    public const ROLES = ['admin', 'manager', 'reception', 'waiter'];

    /** Module permissions the admin can tick/untick per staff user. */
    public const PERMISSIONS = [
        'tables', 'orders', 'billing', 'menu',
        'reports', 'guest_house', 'customers', 'messaging',
        'settings', 'users',
    ];

    /** Human labels for the permission checkboxes. */
    public const PERMISSION_LABELS = [
        'tables'      => 'Tables',
        'orders'      => 'Running Orders / KOT',
        'billing'     => 'Bills & Billing',
        'menu'        => 'Menu & Categories',
        'reports'     => 'Reports',
        'guest_house' => 'Kripa Shanti (Guest House)',
        'customers'   => 'Customers',
        'messaging'   => 'WhatsApp Messages',
        'settings'    => 'Settings',
        'users'       => 'Staff Users',
    ];

    /** Role defaults, used when a user has no explicit permission list. */
    public static function defaultPermissions(string $role): array
    {
        return match ($role) {
            'admin'     => self::PERMISSIONS,
            'manager'   => ['guest_house', 'reports'],
            'reception' => ['guest_house'],
            'waiter'    => ['tables', 'orders'],
            default     => ['guest_house'],
        };
    }

    /** Normalise any stored value (JSON string / array / null) into a permission list. */
    public static function normalizePermissions(mixed $raw, string $role): array
    {
        if ($role === 'admin') {
            return self::PERMISSIONS;
        }
        if (is_string($raw)) {
            $raw = $raw === '' ? null : json_decode($raw, true);
        }
        if (!is_array($raw)) {
            return self::defaultPermissions($role);
        }
        $out = [];
        foreach ($raw as $p) {
            if (is_string($p) && in_array($p, self::PERMISSIONS, true) && !in_array($p, $out, true)) {
                $out[] = $p;
            }
        }
        return $out;
    }

    /** Permissions of the current (or given) token holder. */
    public static function permissions(?array $payload = null): array
    {
        $payload = $payload ?? self::guard();
        return self::normalizePermissions($payload['permissions'] ?? null, self::role($payload));
    }

    public static function can(string $permission, ?array $payload = null): bool
    {
        return in_array($permission, self::permissions($payload), true);
    }

    /** Guard a module by permission (admin always passes). */
    public static function requirePermission(string $permission): array
    {
        $payload = self::guard();
        if (!self::can($permission, $payload)) {
            Response::forbidden(
                'Aapke login me "' . (self::PERMISSION_LABELS[$permission] ?? $permission)
                . '" module ka access nahi hai. Admin se permission lein.'
            );
        }
        return $payload;
    }

    /** Normalised role from JWT (legacy tokens without role = admin). */
    public static function role(?array $payload = null): string
    {
        $payload = $payload ?? self::guard();
        $role = $payload['role'] ?? 'admin';
        return in_array($role, self::ROLES, true) ? $role : 'admin';
    }

    /** Any logged-in staff member. */
    public static function requireStaff(): array
    {
        return self::guard();
    }

    /** Full admin only (settings, users, reports, messaging, billing). */
    public static function requireAdmin(): array
    {
        $payload = self::guard();
        if (self::role($payload) !== 'admin') {
            self::forbiddenRoles($payload, ['admin']);
        }
        return $payload;
    }

    /** Admin + Manager (guest house operations, reports view). */
    public static function requireManagement(): array
    {
        $payload = self::guard();
        if (!in_array(self::role($payload), ['admin', 'manager'], true)) {
            self::forbiddenRoles($payload, ['admin', 'manager']);
        }
        return $payload;
    }

    /** Guest-house front desk: admin, or any staff whose permissions include guest_house. */
    public static function requireFrontDesk(): array
    {
        $payload = self::guard();
        $role = self::role($payload);
        if ($role === 'admin' || self::can('guest_house', $payload)) {
            return $payload;
        }
        self::forbiddenRoles($payload, ['admin', 'manager', 'reception']);
    }

    private static function forbiddenRoles(array $payload, array $allowed): never
    {
        Response::forbidden(
            'This action needs one of these roles: ' . implode(', ', $allowed)
            . '. You are logged in as "' . ($payload['username'] ?? '?') . '".'
        );
    }

    public static function isWaiter(?array $payload = null): bool
    {
        return self::role($payload) === 'waiter';
    }

    /** Waiters may only touch dine-in (table) orders. */
    public static function assertWaiterDineInOrder(array $order, ?array $payload = null): void
    {
        if (!self::isWaiter($payload)) {
            return;
        }
        if (($order['order_type'] ?? '') !== 'dine_in') {
            Response::forbidden('Waiters can only access table orders.');
        }
    }
}
