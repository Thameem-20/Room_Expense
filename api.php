<?php

declare(strict_types=1);

require_once __DIR__ . '/includes/bootstrap.php';

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
            if (!current_user_id()) {
                json_response(['ok' => true, 'logged_in' => false]);
            }
            $user = require_user();
            json_response(auth_payload($user));

        case 'signup':
        case 'setup':
            json_response(['ok' => false, 'error' => 'Ask the admin to add you from the admin portal.'], 403);

        case 'login':
            $username = clean_username((string) ($input['username'] ?? ''));
            $password = (string) ($input['password'] ?? '');
            $user = find_user_by_username($username);
            if (!$user || !password_verify($password, $user['password_hash'])) {
                json_response(['ok' => false, 'error' => 'Username or password is wrong.'], 401);
            }
            login_user($user);
            json_response(auth_payload(fetch_user((int) $user['id']) ?: $user));

        case 'create_room':
            json_response(['ok' => false, 'error' => 'Rooms are created in the admin portal.'], 403);

        case 'join_room':
            json_response(['ok' => false, 'error' => 'You cannot join on your own. Ask the room admin to add you.'], 403);

        case 'logout':
            clear_login();
            json_response(['ok' => true, 'logged_in' => false]);

        case 'add_member':
            json_response(['ok' => false, 'error' => 'Only the app admin can add people.'], 403);

        case 'add_item':
            $me = require_member();
            $roomId = (int) $me['room_id'];
            $name = clean_name((string) ($input['name'] ?? ''));
            $emoji = trim((string) ($input['emoji'] ?? ''));
            if ($name === '') {
                json_response(['ok' => false, 'error' => 'Give the item a name.'], 422);
            }
            if ($emoji === '' || mb_strlen($emoji) > 8) {
                json_response(['ok' => false, 'error' => 'Pick an emoji icon.'], 422);
            }
            try {
                db()->prepare('INSERT INTO items (room_id, name, name_key, emoji, is_quick) VALUES (?, ?, ?, ?, 1)')
                    ->execute([$roomId, $name, name_key($name), $emoji]);
            } catch (PDOException $e) {
                json_response(['ok' => false, 'error' => 'That item already exists.'], 409);
            }
            json_response(room_state());

        case 'add_expense':
            $me = require_member();
            $roomId = (int) $me['room_id'];
            $amountCents = to_cents($input['amount'] ?? 0);
            if ($amountCents < 1) {
                json_response(['ok' => false, 'error' => 'Enter an amount greater than 0.'], 422);
            }

            $paidBy = (int) ($input['paid_by'] ?? $me['id']);
            $payerCheck = db()->prepare('SELECT id FROM members WHERE id = ? AND room_id = ?');
            $payerCheck->execute([$paidBy, $roomId]);
            if (!$payerCheck->fetch()) {
                json_response(['ok' => false, 'error' => 'Payer is not in this room.'], 422);
            }

            $itemId = isset($input['item_id']) && $input['item_id'] !== '' ? (int) $input['item_id'] : null;
            $title = clean_name((string) ($input['title'] ?? ''));
            $emoji = trim((string) ($input['emoji'] ?? ''));

            if ($itemId) {
                $itemStmt = db()->prepare('SELECT id, name, emoji FROM items WHERE id = ? AND room_id = ?');
                $itemStmt->execute([$itemId, $roomId]);
                $item = $itemStmt->fetch();
                if (!$item) {
                    json_response(['ok' => false, 'error' => 'Item not found.'], 404);
                }
                $title = $item['name'];
                $emoji = $item['emoji'];
            } else {
                if ($title === '' || $emoji === '') {
                    json_response(['ok' => false, 'error' => 'Add an item name and emoji.'], 422);
                }
                $existing = db()->prepare('SELECT id, emoji FROM items WHERE room_id = ? AND name_key = ?');
                $existing->execute([$roomId, name_key($title)]);
                $found = $existing->fetch();
                if ($found) {
                    $itemId = (int) $found['id'];
                    $emoji = $found['emoji'];
                } else {
                    db()->prepare('INSERT INTO items (room_id, name, name_key, emoji, is_quick) VALUES (?, ?, ?, ?, 1)')
                        ->execute([$roomId, $title, name_key($title), $emoji]);
                    $itemId = (int) db()->lastInsertId();
                }
            }

            $members = fetch_members($roomId);
            $pdo = db();
            $pdo->beginTransaction();
            $pdo->prepare('INSERT INTO expenses (room_id, item_id, title, emoji, amount_cents, paid_by) VALUES (?, ?, ?, ?, ?, ?)')
                ->execute([$roomId, $itemId, $title, $emoji, $amountCents, $paidBy]);
            $expenseId = (int) $pdo->lastInsertId();
            split_expense($expenseId, $members, $amountCents);
            $pdo->prepare('UPDATE items SET last_amount_cents = ? WHERE id = ?')->execute([$amountCents, $itemId]);
            $pdo->commit();

            json_response(room_state());

        case 'settle':
            $me = require_member();
            $roomId = (int) $me['room_id'];
            $memberId = (int) ($input['member_id'] ?? 0);
            $created = settle_member($roomId, $memberId);
            json_response(array_merge(room_state(), ['settled' => $created]));

        case 'bathroom_complete':
            $me = require_member();
            $roomId = (int) $me['room_id'];
            $result = complete_bathroom($roomId, (int) $me['id']);
            json_response(array_merge(room_state(), ['bathroom_result' => $result]));

        case 'bathroom_reorder':
            $me = require_member();
            $roomId = (int) $me['room_id'];
            $ids = $input['member_ids'] ?? [];
            if (!is_array($ids) || !$ids) {
                json_response(['ok' => false, 'error' => 'Send the new cleaning order.'], 422);
            }
            save_bathroom_order($roomId, $ids);
            json_response(room_state());

        case 'delete_expense':
            $me = require_member();
            $roomId = (int) $me['room_id'];
            $expenseId = (int) ($input['expense_id'] ?? 0);
            $stmt = db()->prepare('DELETE FROM expenses WHERE id = ? AND room_id = ?');
            $stmt->execute([$expenseId, $roomId]);
            if ($stmt->rowCount() < 1) {
                json_response(['ok' => false, 'error' => 'Expense not found.'], 404);
            }
            json_response(room_state());

        default:
            json_response(['ok' => false, 'error' => 'Unknown action.'], 404);
    }
} catch (InvalidArgumentException $e) {
    try {
        $pdo = db();
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
    } catch (Throwable $ignored) {
    }
    json_response(['ok' => false, 'error' => $e->getMessage()], 422);
} catch (Throwable $e) {
    try {
        $pdo = db();
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
    } catch (Throwable $ignored) {
    }
    json_response(['ok' => false, 'error' => $e->getMessage()], 500);
}
