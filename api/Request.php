<?php
declare(strict_types=1);

/**
 * Request helpers — thin wrappers around superglobals and php://input.
 */
class Request
{
    private static ?array $jsonBodyCache = null;

    /**
     * Parse the request body as JSON. Returns [] on empty body.
     * Sends a 400 error if the body is present but malformed.
     */
    public static function jsonBody(): array
    {
        if (self::$jsonBodyCache !== null) {
            return self::$jsonBodyCache;
        }

        $raw = file_get_contents('php://input');
        if ($raw === false || $raw === '') {
            return self::$jsonBodyCache = [];
        }

        $decoded = json_decode($raw, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            Response::error('INVALID_JSON', 'Request body is not valid JSON: ' . json_last_error_msg(), 400);
        }
        if (!is_array($decoded)) {
            Response::error('INVALID_JSON', 'Request body must be a JSON object', 400);
        }

        return self::$jsonBodyCache = $decoded;
    }

    public static function query(string $key, ?string $default = null): ?string
    {
        return isset($_GET[$key]) ? (string) $_GET[$key] : $default;
    }

    public static function header(string $name): ?string
    {
        $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        return $_SERVER[$key] ?? null;
    }

    /**
     * Pull the bearer token from the Authorization header. Returns null if absent or malformed.
     */
    public static function bearerToken(): ?string
    {
        $auth = self::header('Authorization');
        if ($auth === null) {
            return null;
        }
        if (!preg_match('/^Bearer\s+([A-Fa-f0-9]{16,128})$/', $auth, $m)) {
            return null;
        }
        return $m[1];
    }
}
