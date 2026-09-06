<?php

declare(strict_types=1);

require_once __DIR__ . '/../includes/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');

$action = $_GET['action'] ?? '';
$input = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf();
    $input = request_json();
    $action = $input['action'] ?? $action;
}

try {
    db();

    switch ($action) {
        case 'bootstrap':
            if (!current_app_admin_id()) {
                json_response(['ok' => true, 'logged_in' => false]);
            }
            $admin = require_app_admin();
            json_response([
                'ok' => true,
                'logged_in' => true,
                'admin' => ['email' => $admin['email']],
                'rooms' => list_managed_rooms(),
            ]);

        case 'login':
            $email = mb_strtolower(trim((string) ($input['email'] ?? '')));
            $password = (string) ($input['password'] ?? '');
            $stmt = db()->prepare('SELECT * FROM app_admins WHERE email_key = ?');
            $stmt->execute([$email]);
            $admin = $stmt->fetch();
            if (!$admin || !password_verify($password, $admin['password_hash'])) {
                json_response(['ok' => false, 'error' => 'Email or password is wrong.'], 401);
            }
            login_app_admin($admin);
            json_response([
                'ok' => true,
                'logged_in' => true,
                'admin' => ['email' => $admin['email']],
                'rooms' => list_managed_rooms(),
            ]);

        case 'logout':
            logout_app_admin();
            json_response(['ok' => true, 'logged_in' => false]);

        case 'create_room':
            require_app_admin();
            $roomId = create_managed_room((string) ($input['name'] ?? ''));
            json_response([
                'ok' => true,
                'rooms' => list_managed_rooms(),
                'room' => managed_room_detail($roomId),
            ]);

        case 'update_room':
            require_app_admin();
            $roomId = (int) ($input['room_id'] ?? 0);
            update_managed_room($roomId, (string) ($input['name'] ?? ''));
            json_response([
                'ok' => true,
                'rooms' => list_managed_rooms(),
                'room' => managed_room_detail($roomId),
            ]);

        case 'room':
            require_app_admin();
            $roomId = (int) ($_GET['id'] ?? $input['id'] ?? 0);
            json_response(['ok' => true, 'room' => managed_room_detail($roomId)]);

        case 'add_person':
            require_app_admin();
            $roomId = (int) ($input['room_id'] ?? 0);
            admin_add_person(
                $roomId,
                (string) ($input['name'] ?? ''),
                (string) ($input['username'] ?? ''),
                (string) ($input['password'] ?? '')
            );
            json_response(['ok' => true, 'room' => managed_room_detail($roomId), 'rooms' => list_managed_rooms()]);

        case 'update_person':
            require_app_admin();
            $roomId = (int) ($input['room_id'] ?? 0);
            admin_update_person(
                $roomId,
                (int) ($input['member_id'] ?? 0),
                (string) ($input['name'] ?? ''),
                (string) ($input['username'] ?? ''),
                (string) ($input['password'] ?? '')
            );
            json_response(['ok' => true, 'room' => managed_room_detail($roomId), 'rooms' => list_managed_rooms()]);

        case 'delete_person':
            require_app_admin();
            $roomId = (int) ($input['room_id'] ?? 0);
            admin_delete_person($roomId, (int) ($input['member_id'] ?? 0));
            json_response(['ok' => true, 'room' => managed_room_detail($roomId), 'rooms' => list_managed_rooms()]);

        case 'delete_room':
            require_app_admin();
            delete_managed_room((int) ($input['room_id'] ?? 0));
            json_response(['ok' => true, 'rooms' => list_managed_rooms()]);

        default:
            json_response(['ok' => false, 'error' => 'Unknown action.'], 404);
    }
} catch (InvalidArgumentException $e) {
    json_response(['ok' => false, 'error' => $e->getMessage()], 422);
} catch (Throwable $e) {
    json_response(['ok' => false, 'error' => $e->getMessage()], 500);
}