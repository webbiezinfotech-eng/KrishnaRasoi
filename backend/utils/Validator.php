<?php
/**
 * Fluent input validator for request data.
 *
 * Usage:
 *   $v = Validator::make($req->body())
 *       ->required('name')->string('name', 2, 100)
 *       ->required('price')->numeric('price', 0);
 *   if ($v->fails()) Response::unprocessable('Validation failed.', $v->errors());
 */
class Validator
{
    private array $data;
    private array $errors = [];

    private function __construct(array $data)
    {
        $this->data = $data;
    }

    public static function make(array $data): self
    {
        return new self($data);
    }

    // ---- Rules ----

    public function required(string $field, ?string $label = null): self
    {
        $label = $label ?? $this->label($field);
        $val   = $this->data[$field] ?? null;
        if ($val === null || $val === '') {
            $this->addError($field, "$label is required.");
        }
        return $this;
    }

    public function string(string $field, int $min = 0, int $max = 255, ?string $label = null): self
    {
        $label = $label ?? $this->label($field);
        $val   = $this->data[$field] ?? null;
        if ($val === null || $val === '') return $this;
        $len = mb_strlen((string)$val);
        if ($min > 0 && $len < $min) $this->addError($field, "$label must be at least $min characters.");
        if ($len > $max) $this->addError($field, "$label must not exceed $max characters.");
        return $this;
    }

    public function numeric(string $field, float $min = 0, float $max = PHP_FLOAT_MAX, ?string $label = null): self
    {
        $label = $label ?? $this->label($field);
        $val   = $this->data[$field] ?? null;
        if ($val === null || $val === '') return $this;
        if (!is_numeric($val)) {
            $this->addError($field, "$label must be a valid number.");
            return $this;
        }
        $num = (float)$val;
        if ($num < $min) $this->addError($field, "$label must be at least $min.");
        if ($num > $max) $this->addError($field, "$label must not exceed $max.");
        return $this;
    }

    public function integer(string $field, int $min = 1, int $max = PHP_INT_MAX, ?string $label = null): self
    {
        $label = $label ?? $this->label($field);
        $val   = $this->data[$field] ?? null;
        if ($val === null || $val === '') return $this;
        if (!filter_var($val, FILTER_VALIDATE_INT)) {
            $this->addError($field, "$label must be a whole number.");
            return $this;
        }
        $num = (int)$val;
        if ($num < $min) $this->addError($field, "$label must be at least $min.");
        if ($num > $max) $this->addError($field, "$label must not exceed $max.");
        return $this;
    }

    public function in(string $field, array $allowed, ?string $label = null): self
    {
        $label = $label ?? $this->label($field);
        $val   = $this->data[$field] ?? null;
        if ($val === null || $val === '') return $this;
        if (!in_array($val, $allowed, true)) {
            $this->addError($field, "$label must be one of: " . implode(', ', $allowed) . ".");
        }
        return $this;
    }

    public function email(string $field, ?string $label = null): self
    {
        $label = $label ?? $this->label($field);
        $val   = $this->data[$field] ?? null;
        if ($val && !filter_var($val, FILTER_VALIDATE_EMAIL)) {
            $this->addError($field, "$label must be a valid email address.");
        }
        return $this;
    }

    public function phone(string $field, ?string $label = null): self
    {
        $label = $label ?? $this->label($field);
        $val   = $this->data[$field] ?? null;
        if ($val && !preg_match('/^[+\d\s\-()]{7,20}$/', $val)) {
            $this->addError($field, "$label must be a valid phone number.");
        }
        return $this;
    }

    // ---- Results ----

    public function fails(): bool  { return !empty($this->errors); }
    public function passes(): bool { return empty($this->errors); }
    public function errors(): array { return $this->errors; }

    // ---- Helpers ----

    private function addError(string $field, string $message): void
    {
        $this->errors[$field][] = $message;
    }

    private function label(string $field): string
    {
        return ucwords(str_replace('_', ' ', $field));
    }
}
