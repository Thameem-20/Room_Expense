<?php

declare(strict_types=1);

$isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (isset($_SERVER['SERVER_PORT']) && (string) $_SERVER['SERVER_PORT'] === '443')
    || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');

if ($isHttps) {
    // Production (HTTPS)
    define('DB_HOST', 'localhost');
    define('DB_USER', 'u593219986_thameemexp');
    define('DB_PASS', 'hU5mX2~Q2>y');
    define('DB_NAME', 'u593219986_roomexpense');
} else {
    // Local (XAMPP / HTTP)
    define('DB_HOST', 'localhost');
    define('DB_USER', 'root');
    define('DB_PASS', '');
    define('DB_NAME', 'room_expense');
}

const APP_NAME = 'RoomTab';
const CURRENCY = 'AED';
const MIN_PIN_LEN = 4;
const MAX_PIN_LEN = 6;
const MIN_MEMBERS = 2;
const MIN_PASSWORD_LEN = 4;
const REMEMBER_SECONDS = 60 * 60 * 24 * 365 * 10;
const REMEMBER_COOKIE = 'roomtab_mem';

const DEFAULT_ITEMS = [
    ['name' => 'Toothpaste', 'emoji' => '🦷'],
    ['name' => 'Tissue roll', 'emoji' => '🧻'],
    ['name' => 'Water', 'emoji' => '💧'],
    ['name' => 'Soap', 'emoji' => '🧼'],
    ['name' => 'Trash bags', 'emoji' => '🗑️'],
    ['name' => 'Dish soap', 'emoji' => '🫧'],
];
