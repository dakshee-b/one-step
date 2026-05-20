<?php
declare(strict_types=1);

/**
 * MedDrop front controller — single entry point for all HTTP requests.
 *
 * Local dev:
 *   php -S localhost:8000 -t public public/index.php
 *
 * Production (Raspberry Pi + Apache):
 *   .htaccess in this directory rewrites all non-file requests to index.php.
 */

// -----------------------------------------------------------------------------
// PHP built-in dev server: serve static files directly when they exist on disk.
// Returning false signals the server to handle the request as a static asset.
// -----------------------------------------------------------------------------
if (PHP_SAPI === 'cli-server') {
    $requested = __DIR__ . parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    if ($requested !== __DIR__ && is_file($requested)) {
        return false;
    }
}

// Anything that isn't an API call serves the SPA shell. The frontend is a
// hash-routed single-page app, so all UI routes resolve to index.html.
$requestPath = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/';
if (!str_starts_with($requestPath, '/api/')) {
    header('Content-Type: text/html; charset=utf-8');
    readfile(__DIR__ . '/index.html');
    exit;
}

require_once __DIR__ . '/../api/Database.php';
require_once __DIR__ . '/../api/Response.php';
require_once __DIR__ . '/../api/Request.php';
require_once __DIR__ . '/../api/Router.php';
require_once __DIR__ . '/../api/Auth.php';
require_once __DIR__ . '/../api/Controllers/AuthController.php';
require_once __DIR__ . '/../api/Controllers/ProfileController.php';
require_once __DIR__ . '/../api/Controllers/MedicationController.php';
require_once __DIR__ . '/../api/Controllers/DashboardController.php';
require_once __DIR__ . '/../api/Controllers/NotificationController.php';

// -----------------------------------------------------------------------------
// Bootstrap
// -----------------------------------------------------------------------------
$config = Database::config();
date_default_timezone_set($config['app']['timezone']);

if ($config['app']['env'] === 'development') {
    error_reporting(E_ALL);
    ini_set('display_errors', '1');
} else {
    ini_set('display_errors', '0');
    error_reporting(E_ALL & ~E_DEPRECATED & ~E_STRICT);
}

// CORS — permissive for local dev. Tighten Allow-Origin for production.
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Device-Secret');
header('Access-Control-Max-Age: 86400');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// -----------------------------------------------------------------------------
// Route table
// -----------------------------------------------------------------------------
$router = new Router();

// Health check — used for readiness probing and smoke tests.
$router->get('/api/v1/health', function () {
    Response::json([
        'status'   => 'ok',
        'time'     => date('c'),
        'timezone' => date_default_timezone_get(),
    ]);
});

// -----------------------------------------------------------------------------
// Auth
// -----------------------------------------------------------------------------
$router->get ('/api/v1/auth/status',   [AuthController::class, 'status']);
$router->post('/api/v1/auth/register', [AuthController::class, 'register']);
$router->post('/api/v1/auth/login',    [AuthController::class, 'login']);
$router->post('/api/v1/auth/logout',   [AuthController::class, 'logout']);
$router->get ('/api/v1/auth/me',       [AuthController::class, 'me']);

// -----------------------------------------------------------------------------
// Profile
// -----------------------------------------------------------------------------
$router->get   ('/api/v1/profile',       [ProfileController::class, 'show']);
$router->put   ('/api/v1/profile',       [ProfileController::class, 'update']);
$router->post  ('/api/v1/profile/photo', [ProfileController::class, 'uploadPhoto']);
$router->delete('/api/v1/profile/photo', [ProfileController::class, 'deletePhoto']);

// -----------------------------------------------------------------------------
// Medications (3 fixed slots — no POST/DELETE)
// -----------------------------------------------------------------------------
$router->get ('/api/v1/medications',             [MedicationController::class, 'index']);
$router->put ('/api/v1/medications/{id}',        [MedicationController::class, 'update']);
$router->post('/api/v1/medications/{id}/refill', [MedicationController::class, 'refill']);

// -----------------------------------------------------------------------------
// Dashboard & adherence
// -----------------------------------------------------------------------------
$router->get('/api/v1/dashboard/overview', [DashboardController::class, 'overview']);
$router->get('/api/v1/dashboard/today',    [DashboardController::class, 'today']);
$router->get('/api/v1/adherence/weekly',   [DashboardController::class, 'adherenceWeekly']);
$router->get('/api/v1/adherence/monthly',  [DashboardController::class, 'adherenceMonthly']);

// -----------------------------------------------------------------------------
// Notifications
// -----------------------------------------------------------------------------
$router->get   ('/api/v1/notifications',            [NotificationController::class, 'index']);
$router->delete('/api/v1/notifications',            [NotificationController::class, 'destroyAll']);
$router->delete('/api/v1/notifications/{id}',       [NotificationController::class, 'destroy']);
$router->patch ('/api/v1/notifications/{id}/read',  [NotificationController::class, 'markRead']);

// Device routes (internal — called by the MQTT bridge) will be registered here
// in a later step alongside the scheduler and bridge daemons.

// -----------------------------------------------------------------------------
// Dispatch
// -----------------------------------------------------------------------------
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/';

try {
    $router->dispatch($_SERVER['REQUEST_METHOD'], $path);
} catch (Throwable $e) {
    error_log(sprintf("Unhandled exception: %s\n%s", $e->getMessage(), $e->getTraceAsString()));
    $message = $config['app']['env'] === 'development'
        ? $e->getMessage()
        : 'An internal error occurred';
    Response::error('INTERNAL_ERROR', $message, 500);
}
