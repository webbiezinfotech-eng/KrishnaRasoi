<?php
/**
 * Phase 1 supports a single optional placeholder: {{name}}
 */
class MessagePersonalizer
{
    public static function apply(string $body, ?string $name): string
    {
        if (!str_contains($body, '{{name}}')) {
            return $body;
        }
        $replacement = trim((string) $name);
        if ($replacement === '') {
            $replacement = 'Guest';
        }
        return str_replace('{{name}}', $replacement, $body);
    }

    public static function preview(string $body, ?string $name): string
    {
        return self::apply($body, $name);
    }
}
