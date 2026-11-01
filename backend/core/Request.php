<?php
/**
 * Wraps the incoming HTTP request.
 * Parses JSON body, query string, and route params.
 */
class Request
{
    private array $body   = [];
    private array $query  = [];
    private array $params = [];   // route params injected by router

    public function __construct()
    {
        $this->query = $_GET ?? [];

        $raw = file_get_contents('php://input');
        if (!empty($raw)) {
            $decoded = json_decode($raw, true);
            $this->body = is_array($decoded) ? $decoded : [];
        }
        // Fall back to POST (form-encoded)
        if (empty($this->body) && !empty($_POST)) {
            $this->body = $_POST;
        }
    }

    // ---- Body accessors ----
    public function body(?string $key = null, mixed $default = null): mixed
    {
        if ($key === null) return $this->body;
        return array_key_exists($key, $this->body) ? $this->body[$key] : $default;
    }

    public function bodyInt(string $key, int $default = 0): int
    {
        return (int)($this->body[$key] ?? $default);
    }

    public function bodyFloat(string $key, float $default = 0.0): float
    {
        return (float)($this->body[$key] ?? $default);
    }

    public function bodyStr(string $key, string $default = ''): string
    {
        return isset($this->body[$key]) ? trim((string)$this->body[$key]) : $default;
    }

    // ---- Query string ----
    public function query(?string $key = null, mixed $default = null): mixed
    {
        if ($key === null) return $this->query;
        return array_key_exists($key, $this->query) ? $this->query[$key] : $default;
    }

    public function queryInt(string $key, int $default = 0): int
    {
        return (int)($this->query[$key] ?? $default);
    }

    public function queryStr(string $key, string $default = ''): string
    {
        return isset($this->query[$key]) ? trim((string)$this->query[$key]) : $default;
    }

    // ---- Route params ----
    public function setParams(array $params): void { $this->params = $params; }
    public function param(string $key, mixed $default = null): mixed
    {
        return $this->params[$key] ?? $default;
    }

    public function method(): string
    {
        return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    }

    public function isMethod(string $method): bool
    {
        return $this->method() === strtoupper($method);
    }
}
