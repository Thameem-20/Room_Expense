<?php

declare(strict_types=1);

function app_base_path(): string
{
    $script = str_replace('\\', '/', $_SERVER['SCRIPT_NAME'] ?? '/index.php');
    $dir = rtrim(dirname($script), '/');
    if (str_ends_with($dir, '/admin')) {
        $dir = substr($dir, 0, -6);
    }
    if ($dir === '/' || $dir === '.' || $dir === '') {
        return '';
    }
    return $dir;
}

function json_response(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function request_json(): array
{
    $raw = file_get_contents('php://input') ?: '';
    if ($raw === '') {
        return $_POST;
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function clean_name(string $value): string
{
    $value = trim(preg_replace('/\s+/u', ' ', $value) ?? '');
    return mb_substr($value, 0, 80);
}

function name_key(string $value): string
{
    return mb_strtolower(clean_name($value));
}

function to_cents(float|int|string $amount): int
{
    return (int) round(((float) $amount) * 100);
}

function from_cents(int $cents): string
{
    return number_format($cents / 100, 2, '.', '');
}

function format_money(int $cents): string
{
    $abs = from_cents(abs($cents));
    return CURRENCY . ' ' . $abs;
}

function require_csrf(): void
{
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!hash_equals($_SESSION['csrf'] ?? '', $token)) {
        json_response(['ok' => false, 'error' => 'Session expired. Refresh and try again.'], 403);
    }
}

function cookie_options(int $expires): array
{
    return [
        'expires' => $expires,
        'path' => app_base_path() ?: '/',
        'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'httponly' => true,
        'samesite' => 'Lax',
    ];
}

function set_app_cookie(string $name, string $value, int $expires): void
{
    setcookie($name, $value, cookie_options($expires));
    $_COOKIE[$name] = $value;
}

function clear_app_cookie(string $name): void
{
    setcookie($name, '', cookie_options(time() - 3600));
    unset($_COOKIE[$name]);
}

function clean_username(string $value): string
{
    return trim($value);
}

function valid_username(string $value): bool
{
    return (bool) preg_match('/^[A-Za-z0-9_]{3,24}$/', $value);
}
