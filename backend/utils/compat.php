<?php
/**
 * Compatibility shims.
 * Kuch shared hosts par mbstring extension off hota hai; us case me mb_* calls
 * fatal error deti hain aur login 500 ho jata hai. Ye file fallback deti hai.
 */
if (!function_exists('mb_strlen')) {
    function mb_strlen($string, $encoding = null) { return strlen((string) $string); }
}
if (!function_exists('mb_substr')) {
    function mb_substr($string, $start, $length = null, $encoding = null) {
        return $length === null ? substr((string) $string, $start) : substr((string) $string, $start, $length);
    }
}
if (!function_exists('mb_strtolower')) {
    function mb_strtolower($string, $encoding = null) { return strtolower((string) $string); }
}
if (!function_exists('mb_strtoupper')) {
    function mb_strtoupper($string, $encoding = null) { return strtoupper((string) $string); }
}
if (!function_exists('mb_str_split')) {
    function mb_str_split($string, $length = 1, $encoding = null) { return str_split((string) $string, $length); }
}
