<?php
/**
 * Application configuration.
 * IMPORTANT: Change JWT_SECRET to a random 64-char string before deploying.
 */
define('APP_ENV',   getenv('APP_ENV') ?: 'production');   // production | development
define('APP_DEBUG', APP_ENV === 'development');

define('JWT_SECRET', 'CHANGE_THIS_TO_A_RANDOM_64_CHAR_STRING_IN_PRODUCTION_!!!!!!!!');
define('JWT_EXPIRY', 86400);   // 24 hours

// Allowed CORS origins
define('ALLOWED_ORIGINS', [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
]);

define('TIMEZONE', 'Asia/Kolkata');
date_default_timezone_set(TIMEZONE);
