<?php
/**
 * Restaurant Manager — Backend Entry Point & Router
 * Plain PHP, no framework.
 */

declare(strict_types=1);

// ---- Error handling ----
set_error_handler(function (int $errno, string $errstr, string $errfile, int $errline): bool {
    if (!(error_reporting() & $errno)) return false;
    throw new ErrorException($errstr, 0, $errno, $errfile, $errline);
});

// ---- Bootstrap ----
require_once __DIR__ . '/config/app.php';
require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/config/messaging.php';
require_once __DIR__ . '/core/Database.php';
require_once __DIR__ . '/core/Response.php';
require_once __DIR__ . '/core/Request.php';
require_once __DIR__ . '/core/Auth.php';
require_once __DIR__ . '/utils/compat.php';
require_once __DIR__ . '/utils/Validator.php';
require_once __DIR__ . '/utils/Helper.php';
require_once __DIR__ . '/services/CustomerService.php';
require_once __DIR__ . '/services/messaging/MessagingProviderInterface.php';
require_once __DIR__ . '/services/messaging/MockMessagingProvider.php';
require_once __DIR__ . '/services/messaging/MessagePersonalizer.php';
require_once __DIR__ . '/services/messaging/ZaptiloWhatsAppService.php';
require_once __DIR__ . '/services/messaging/MetaWhatsAppCloudService.php';
require_once __DIR__ . '/services/messaging/MessageTemplateService.php';
require_once __DIR__ . '/services/messaging/WhatsAppService.php';
require_once __DIR__ . '/services/messaging/SmsService.php';
require_once __DIR__ . '/services/messaging/MessagingService.php';
require_once __DIR__ . '/services/messaging/CampaignService.php';
require_once __DIR__ . '/services/messaging/MessageQueueService.php';
require_once __DIR__ . '/services/messaging/MessageLogService.php';
require_once __DIR__ . '/controllers/AuthController.php';
require_once __DIR__ . '/controllers/DashboardController.php';
require_once __DIR__ . '/controllers/TableController.php';
require_once __DIR__ . '/controllers/MenuController.php';
require_once __DIR__ . '/controllers/OrderController.php';
require_once __DIR__ . '/controllers/BillingController.php';
require_once __DIR__ . '/controllers/ReportController.php';
require_once __DIR__ . '/controllers/SettingsController.php';
require_once __DIR__ . '/controllers/GuestHouseController.php';
require_once __DIR__ . '/controllers/GuestHouseReportController.php';
require_once __DIR__ . '/controllers/PrintController.php';
require_once __DIR__ . '/controllers/UsersController.php';
require_once __DIR__ . '/controllers/CustomerController.php';
require_once __DIR__ . '/controllers/MessagingController.php';
require_once __DIR__ . '/controllers/BackupController.php';

// ---- CORS ----
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$selfHost = ($_SERVER['HTTP_HOST'] ?? '');
// Same-domain deploy (Hostinger): apni hi origin allow karo, warna preflight block hota hai.
$sameOrigin = $origin !== '' && $selfHost !== '' && (
    str_contains($origin, '://' . $selfHost)
    || str_contains($origin, '://www.' . preg_replace('/^www\./', '', $selfHost))
);
if ($origin !== '' && (in_array($origin, ALLOWED_ORIGINS, true) || $sameOrigin)) {
    header("Access-Control-Allow-Origin: $origin");
    header('Vary: Origin');
    header('Access-Control-Allow-Credentials: true');
}
// Kuch shared hosts Authorization header strip kar dete hain — ise wapas inject karo
// warna har API "token required" 401 deti hai.
if (empty($_SERVER['HTTP_AUTHORIZATION'])) {
    $hdr = null;
    if (function_exists('getallheaders')) {
        foreach ((array) @getallheaders() as $k => $v) {
            if (strcasecmp((string)$k, 'Authorization') === 0) { $hdr = (string)$v; break; }
        }
    }
    if (!$hdr && !empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        $hdr = (string) $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    }
    if ($hdr) {
        $_SERVER['HTTP_AUTHORIZATION'] = $hdr;
    }
}
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Access-Control-Max-Age: 86400');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ---- Parse URI ----
$rawUri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
// Strip API prefix for both flows:
// - local:  /api/...
// - server: /backend/...
// - php dev server direct index: /backend/index.php/...
// - safe fallback: /backend/api/...
$uri    = preg_replace('#^/(backend/index\.php|index\.php|backend/api|backend|api)#', '', $rawUri);
$uri    = '/' . trim($uri, '/');
$method = strtoupper($_SERVER['REQUEST_METHOD']);
$req    = new Request();

// ---- Instantiate controllers ----
$auth    = new AuthController();
$dash    = new DashboardController();
$tables  = new TableController();
$menu    = new MenuController();
$orders  = new OrderController();
$billing = new BillingController();
$reports = new ReportController();
$sett    = new SettingsController();
$gh      = new GuestHouseController();
$ghRep   = new GuestHouseReportController();
$print   = new PrintController();
$users      = new UsersController();
$customers  = new CustomerController();
$messaging  = new MessagingController();
$backup    = new BackupController();

// ---- Router ----
// Returns true if matched, false if not

try {

    // Health (no auth — check DB for login issues)
    if ($uri === '/health' && $method === 'GET') {
        try {
            Database::get();
            $hasRole = false;
            try {
                $hasRole = (bool)Database::value(
                    "SELECT COUNT(*) FROM information_schema.COLUMNS
                     WHERE TABLE_SCHEMA = DATABASE()
                       AND TABLE_NAME = 'admin_users'
                       AND COLUMN_NAME = 'role'"
                );
            } catch (Throwable $e) {
                $hasRole = false;
            }
            Response::success([
                'db'           => 'ok',
                'api_version'  => '2.1.0-waiter',
                'users_api'    => true,
                'role_column'  => $hasRole,
            ], 'OK');
        } catch (Throwable $e) {
            Response::error('Database unavailable. Start MySQL and import restaurant_db.', 503);
        }
    }

    // Auth
    if ($uri === '/auth/login'           && $method === 'POST')  { $auth->login($req); }
    if ($uri === '/auth/logout'          && $method === 'POST')  { $auth->logout($req); }
    if ($uri === '/auth/me'              && $method === 'GET')   { $auth->me($req); }
    if ($uri === '/auth/change-password' && $method === 'POST')  { $auth->changePassword($req); }

    // Staff users (admin only)
    if ($uri === '/users' && $method === 'GET')  { $users->index($req); }
    if ($uri === '/users' && $method === 'POST') { $users->create($req); }
    if (preg_match('#^/users/(\d+)$#', $uri, $m) && $method === 'PUT') {
        $users->update($req, (int)$m[1]);
    }

    // Dashboard
    if ($uri === '/dashboard' && $method === 'GET') { $dash->index($req); }

    // Tables
    if ($uri === '/tables'  && $method === 'GET') { $tables->index($req); }

    if (preg_match('#^/tables/(\d+)$#', $uri, $m)) {
        match ($method) {
            'GET'  => $tables->show($req, (int)$m[1]),
            'PUT'  => $tables->update($req, (int)$m[1]),
            default => null,
        };
    }
    if (preg_match('#^/tables/(\d+)/reset$#', $uri, $m) && $method === 'POST') {
        $tables->reset($req, (int)$m[1]);
    }

    // Categories
    if ($uri === '/categories' && $method === 'GET')  { $menu->getCategories($req); }
    if ($uri === '/categories' && $method === 'POST') { $menu->createCategory($req); }

    if (preg_match('#^/categories/(\d+)$#', $uri, $m)) {
        match ($method) {
            'PUT'    => $menu->updateCategory($req, (int)$m[1]),
            'DELETE' => $menu->deleteCategory($req, (int)$m[1]),
            default  => null,
        };
    }

    // Menu items
    if ($uri === '/menu-items' && $method === 'GET')  { $menu->getItems($req); }
    if ($uri === '/menu-items' && $method === 'POST') { $menu->createItem($req); }

    if (preg_match('#^/menu-items/(\d+)$#', $uri, $m)) {
        match ($method) {
            'PUT'    => $menu->updateItem($req, (int)$m[1]),
            'DELETE' => $menu->toggleItem($req, (int)$m[1]),
            default  => null,
        };
    }

    // Orders — list & create
    if ($uri === '/orders'               && $method === 'GET')  { $orders->index($req); }
    if ($uri === '/orders/dine-in'       && $method === 'POST') { $orders->createDineIn($req); }
    if ($uri === '/orders/guest-house'   && $method === 'POST') { $orders->createGuestHouse($req); }

    // Orders — single
    if (preg_match('#^/orders/(\d+)$#', $uri, $m) && $method === 'GET') {
        $orders->show($req, (int)$m[1]);
    }

    // Order items
    if (preg_match('#^/orders/(\d+)/items$#', $uri, $m) && $method === 'POST') {
        $orders->addItem($req, (int)$m[1]);
    }
    if (preg_match('#^/orders/(\d+)/items/(\d+)$#', $uri, $m)) {
        match ($method) {
            'PUT'    => $orders->updateItem($req, (int)$m[1], (int)$m[2]),
            'DELETE' => $orders->removeItem($req, (int)$m[1], (int)$m[2]),
            default  => null,
        };
    }
    if (preg_match('#^/orders/(\d+)/cancel$#', $uri, $m) && $method === 'POST') {
        $orders->cancel($req, (int)$m[1]);
    }
    if (preg_match('#^/orders/(\d+)/commission$#', $uri, $m) && $method === 'PUT') {
        $orders->updateCommission($req, (int)$m[1]);
    }

    // Billing
    if (preg_match('#^/orders/(\d+)/bill$#', $uri, $m) && $method === 'POST') {
        $billing->generateBill($req, (int)$m[1]);
    }
    if ($uri === '/bills' && $method === 'GET') { $billing->index($req); }
    if (preg_match('#^/bills/([A-Z0-9-]+)/mark-paid$#', $uri, $m) && $method === 'POST') {
        $billing->markAsPaid($req, $m[1]);
    }
    if (preg_match('#^/bills/([A-Z0-9-]+)/payment-status$#', $uri, $m) && $method === 'POST') {
        $billing->updatePaymentStatus($req, $m[1]);
    }
    if (preg_match('#^/bills/([A-Z0-9-]+)$#', $uri, $m) && $method === 'GET') {
        $billing->show($req, $m[1]);
    }

    // Reports
    if ($uri === '/reports/sales'         && $method === 'GET') { $reports->sales($req); }
    if ($uri === '/reports/item-wise'     && $method === 'GET') { $reports->itemWise($req); }
    if ($uri === '/reports/table-wise'    && $method === 'GET') { $reports->tableWise($req); }
    if ($uri === '/reports/commission'    && $method === 'GET') { $reports->commission($req); }
    if ($uri === '/reports/payment-mode'  && $method === 'GET') { $reports->paymentMode($req); }
    if ($uri === '/reports/category-wise' && $method === 'GET') { $reports->categoryWise($req); }
    if ($uri === '/reports/occupancy' && $method === 'GET') { $reports->occupancy($req); }
    if ($uri === '/reports/pending-payments' && $method === 'GET') { $reports->pendingPayments($req); }

    // Print (LAN thermal ESC/POS)
    if ($uri === '/print/health' && $method === 'GET') { $print->health($req); }
    if ($uri === '/print/bill' && $method === 'POST') { $print->printBill($req); }
    if ($uri === '/print/kot'  && $method === 'POST') { $print->printKOT($req); }
    if ($uri === '/print/test' && $method === 'POST') { $print->testPrint($req); }

    // Settings
    if ($uri === '/settings' && $method === 'GET') { $sett->index($req); }
    if ($uri === '/settings' && $method === 'PUT') { $sett->update($req); }

    // Guest house
    if ($uri === '/guest-house/dashboard' && $method === 'GET') { $gh->dashboard($req); }
    if ($uri === '/guest-house/rooms'     && $method === 'GET') { $gh->rooms($req); }
    if ($uri === '/guest-house/rooms'     && $method === 'POST') { $gh->createRoom($req); }
    if ($uri === '/guest-house/available-rooms' && $method === 'GET') { $gh->availableRooms($req); }
    if ($uri === '/guest-house/room-categories' && $method === 'GET') { $gh->roomCategories($req); }
    if ($uri === '/guest-house/room-categories' && $method === 'POST') { $gh->createRoomCategory($req); }
    if ($uri === '/guest-house/profiles'  && $method === 'GET') { $gh->profiles($req); }
    if ($uri === '/guest-house/profiles'  && $method === 'POST') { $gh->createProfile($req); }
    if ($uri === '/guest-house/guests'    && $method === 'POST') { $gh->createGuest($req); }
    if (preg_match('#^/guest-house/guests/(\d+)$#', $uri, $m) && $method === 'PUT') {
        $gh->updateGuest($req, (int)$m[1]);
    }
    if ($uri === '/guest-house/bookings'  && $method === 'GET') { $gh->bookings($req); }
    if ($uri === '/guest-house/bookings'  && $method === 'POST') { $gh->createBooking($req); }
    if (preg_match('#^/guest-house/guests/(\d+)/payment$#', $uri, $m) && $method === 'POST') {
        $gh->addPayment($req, (int)$m[1]);
    }
    if (preg_match('#^/guest-house/guests/(\d+)/checkout$#', $uri, $m) && $method === 'POST') {
        $gh->checkout($req, (int)$m[1]);
    }

    // Guest house extras (v2)
    if (preg_match('#^/guest-house/rooms/(\d+)$#', $uri, $m) && $method === 'PUT') {
        $gh->updateRoom($req, (int)$m[1]);
    }
    if (preg_match('#^/guest-house/guests/(\d+)/charges$#', $uri, $m) && $method === 'GET') {
        $gh->charges($req, (int)$m[1]);
    }
    if (preg_match('#^/guest-house/guests/(\d+)/charges$#', $uri, $m) && $method === 'POST') {
        $gh->addCharge($req, (int)$m[1]);
    }
    if (preg_match('#^/guest-house/guests/(\d+)/final-bill$#', $uri, $m) && $method === 'GET') {
        $gh->finalBill($req, (int)$m[1]);
    }

    // Customers
    if ($uri === '/customers' && $method === 'GET')  { $customers->index($req); }
    if ($uri === '/customers' && $method === 'POST') { $customers->create($req); }
    if (preg_match('#^/customers/(\d+)$#', $uri, $m)) {
        match ($method) {
            'PUT'    => $customers->update($req, (int)$m[1]),
            'DELETE' => $customers->delete($req, (int)$m[1]),
            default  => null,
        };
    }

    // Messaging (admin only, enforced in controller)
    if ($uri === '/messaging/config' && $method === 'GET') { $messaging->config($req); }
    if ($uri === '/messaging/preview' && $method === 'POST') { $messaging->preview($req); }
    if ($uri === '/messaging/campaigns' && $method === 'GET') { $messaging->listCampaigns($req); }
    if ($uri === '/messaging/campaigns' && $method === 'POST') { $messaging->createCampaign($req); }
    if (preg_match('#^/messaging/campaigns/(\d+)$#', $uri, $m) && $method === 'GET') {
        $messaging->showCampaign($req, (int)$m[1]);
    }
    if (preg_match('#^/messaging/campaigns/(\d+)/preview$#', $uri, $m) && $method === 'POST') {
        $messaging->previewCampaign($req, (int)$m[1]);
    }
    if (preg_match('#^/messaging/campaigns/(\d+)/send$#', $uri, $m) && $method === 'POST') {
        $messaging->sendCampaign($req, (int)$m[1]);
    }
    if (preg_match('#^/messaging/campaigns/(\d+)/process$#', $uri, $m) && $method === 'POST') {
        $messaging->processCampaign($req, (int)$m[1]);
    }
    if (preg_match('#^/messaging/campaigns/(\d+)/recipients$#', $uri, $m) && $method === 'GET') {
        $messaging->recipients($req, (int)$m[1]);
    }
    if ($uri === '/messaging/whatsapp/health' && $method === 'GET') { $messaging->whatsappHealth($req); }
    if ($uri === '/messaging/whatsapp/test' && $method === 'POST') { $messaging->testWhatsApp($req); }
    if ($uri === '/messaging/whatsapp/templates' && $method === 'GET') { $messaging->templates($req); }
    if ($uri === '/messaging/logs' && $method === 'GET') { $messaging->logs($req); }
    if ($uri === '/messaging/templates/local' && $method === 'GET') { $messaging->listTemplates($req); }
    if ($uri === '/messaging/templates/local' && $method === 'POST') { $messaging->createTemplate($req); }
    if (preg_match('#^/messaging/templates/local/(\d+)$#', $uri, $m)) {
        match ($method) {
            'PUT'    => $messaging->updateTemplate($req, (int)$m[1]),
            'DELETE' => $messaging->deleteTemplate($req, (int)$m[1]),
            default => null,
        };
    }
    if ($uri === '/messaging/budget' && $method === 'GET') { $messaging->budget($req); }

    // Auth permissions catalogue (admin only)
    if ($uri === '/auth/permissions' && $method === 'GET') { $auth->permissions($req); }

    // Settings: staff-safe public subset + logo upload
    if ($uri === '/settings/public' && $method === 'GET')  { $sett->publicSettings($req); }
    if ($uri === '/settings/logo'   && $method === 'POST') { $sett->uploadLogo($req); }

    // Guest house: room edit / delete, booking cancel, Kripa Shanti reports
    if (preg_match('#^/guest-house/rooms/(\d+)$#', $uri, $m) && $method === 'DELETE') {
        $gh->deleteRoom($req, (int)$m[1]);
    }
    // Same action over POST — for hosts/proxies that block the DELETE verb.
    if (preg_match('#^/guest-house/rooms/(\d+)/delete$#', $uri, $m) && $method === 'POST') {
        $gh->deleteRoom($req, (int)$m[1]);
    }
    if (preg_match('#^/guest-house/guests/(\d+)/cancel$#', $uri, $m) && $method === 'POST') {
        $gh->cancelBooking($req, (int)$m[1]);
    }
    if ($uri === '/guest-house/reports' && $method === 'GET') { $ghRep->index($req); }

    // WhatsApp: date-wise guest audience
    if ($uri === '/customers/by-date' && $method === 'GET') { $customers->byDate($req); }

    // ---- Backup / Restore (admin only) ----
    if ($uri === '/backup/stats'  && $method === 'GET')  { $backup->stats($req); }
    if ($uri === '/backup/export' && $method === 'GET')  { $backup->export($req); }
    if ($uri === '/backup/import' && $method === 'POST') { $backup->import($req); }

    // ---- 404 fallback ----
    Response::error("Endpoint not found: $method $uri", 404);

} catch (Throwable $e) {
    if (APP_DEBUG) {
        Response::serverError($e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
    } else {
        error_log($e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
        Response::serverError('An unexpected error occurred.');
    }
}
