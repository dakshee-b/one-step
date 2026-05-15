<?php
declare(strict_types=1);

/**
 * Response helpers. All methods send JSON and terminate the request.
 *
 * Error envelope shape:
 *   { "error": { "code": "<machine-readable>", "message": "<human-readable>", "details"?: {...} } }
 */
class Response
{
    public static function json(mixed $data, int $status = 200): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        exit;
    }

    public static function created(mixed $data): never
    {
        self::json($data, 201);
    }

    public static function noContent(): never
    {
        http_response_code(204);
        exit;
    }

    public static function error(string $code, string $message, int $status = 400, ?array $details = null): never
    {
        $body = ['error' => ['code' => $code, 'message' => $message]];
        if ($details !== null) {
            $body['error']['details'] = $details;
        }
        self::json($body, $status);
    }
}
