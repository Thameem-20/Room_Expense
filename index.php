<?php

declare(strict_types=1);

require_once __DIR__ . '/includes/bootstrap.php';

$base = app_base_path();
$csrf = $_SESSION['csrf'];
$title = APP_NAME;
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
    <meta name="theme-color" content="#0f172a">
    <meta name="color-scheme" content="light">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="<?= htmlspecialchars($title) ?>">
    <meta name="application-name" content="<?= htmlspecialchars($title) ?>">
    <meta name="description" content="Shared room expenses, settled simply.">
    <title><?= htmlspecialchars($title) ?></title>
    <link rel="manifest" href="<?= htmlspecialchars($base) ?>/manifest.webmanifest">
    <link rel="apple-touch-icon" href="<?= htmlspecialchars($base) ?>/icons/apple-touch-icon.png">
    <link rel="icon" href="<?= htmlspecialchars($base) ?>/favicon.ico" sizes="any">
    <link rel="icon" type="image/png" sizes="32x32" href="<?= htmlspecialchars($base) ?>/icons/favicon-32.png?v=1">
    <link rel="icon" type="image/png" sizes="192x192" href="<?= htmlspecialchars($base) ?>/icons/icon-192.png?v=1">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="<?= htmlspecialchars($base) ?>/assets/css/app.css?v=23">
</head>
<body>
    <div id="app" class="app"></div>
    <script>
        window.ROOMTAB = {
            base: <?= json_encode($base) ?>,
            csrf: <?= json_encode($csrf) ?>,
            name: <?= json_encode(APP_NAME) ?>,
            currency: <?= json_encode(CURRENCY) ?>
        };
    </script>
    <script src="<?= htmlspecialchars($base) ?>/assets/js/app.js?v=23"></script>
    <script src="<?= htmlspecialchars($base) ?>/assets/js/pwa.js?v=4"></script>
</body>
</html>
