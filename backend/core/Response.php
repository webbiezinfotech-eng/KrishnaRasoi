<?php
/**
 * Standardised JSON response helper.
 * Every exit point in the application goes through one of these methods.
 */
class Response
{
    public static function json(array $body, int $code = 200): never
    {
        http_response_code($code);
        echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    public static function success(mixed $data = null, string $message = 'Success', int $code = 200): never
    {
        self::json(['success' => true, 'message' => $message, 'data' => $data], $code);
    }

    public static function created(mixed $data = null, string $message = 'Created successfully.'): never
    {
        self::success($data, $message, 201);
    }

    public static function error(string $message = 'An error occurred.', int $code = 400, array $errors = []): never
    {
        $body = ['success' => false, 'message' => $message];
        if (!empty($errors)) {
            $body['errors'] = $errors;
        }
        self::json($body, $code);
    }

    public static function notFound(string $message = 'Resource not found.'): never
    {
        self::error($message, 404);
    }

    public static function unauthorized(string $message = 'Unauthorized.'): never
    {
        self::error($message, 401);
    }

    public static function forbidden(string $message = 'Forbidden.'): never
    {
        self::error($message, 403);
    }

    public static function serverError(string $message = 'Internal server error.'): never
    {
        self::error($message, 500);
    }

    public static function unprocessable(string $message = 'Validation failed.', array $errors = []): never
    {
        self::error($message, 422, $errors);
    }
}
