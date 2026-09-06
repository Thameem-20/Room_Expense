<?php

declare(strict_types=1);

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/calc.php';
require_once __DIR__ . '/bathroom.php';
require_once __DIR__ . '/admin.php';

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_name('roomtab');
    ini_set('session.gc_maxlifetime', (string) REMEMBER_SECONDS);
    session_set_cookie_params([
        'lifetime' => REMEMBER_SECONDS,
        'path' => app_base_path() ?: '/',
        'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

if (empty($_SESSION['csrf'])) {
    $_SESSION['csrf'] = bin2hex(random_bytes(16));
}

try {
    restore_remember_login();
} catch (Throwable $ignored) {
}
