<?php

declare(strict_types=1);

require_once __DIR__ . '/../includes/bootstrap.php';

$base = app_base_path();
$csrf = $_SESSION['csrf'];
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="theme-color" content="#0f172a">
    <title>RoomTab Admin</title>
    <link rel="icon" href="<?= htmlspecialchars($base) ?>/favicon.ico" sizes="any">
    <link rel="icon" type="image/png" sizes="32x32" href="<?= htmlspecialchars($base) ?>/icons/favicon-32.png?v=1">
    <link rel="icon" type="image/png" sizes="192x192" href="<?= htmlspecialchars($base) ?>/icons/icon-192.png?v=1">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="<?= htmlspecialchars($base) ?>/assets/css/app.css?v=15">
    <link rel="stylesheet" href="<?= htmlspecialchars($base) ?>/assets/css/admin.css?v=4">
</head>
<body class="admin-body">
    <div id="admin-app" class="admin-app"></div>
    <script>
        window.ROOMTAB_ADMIN = {
            base: <?= json_encode($base) ?>,
            csrf: <?= json_encode($csrf) ?>
        };
    </script>
    <script src="<?= htmlspecialchars($base) ?>/assets/js/admin.js?v=4"></script>
</body>
</html>