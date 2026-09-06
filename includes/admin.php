<?php

declare(strict_types=1);

function current_app_admin_id(): ?int
{
    $id = $_SESSION['app_admin_id'] ?? null;
    return $id ? (int) $id : null;
}

function fetch_app_admin(int $id): ?array
{
    $stmt = db()->prepare('SELECT id, email, created_at FROM app_admins WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function require_app_admin(): array
{
    $id = current_app_admin_id();
    if (!$id) {
        json_response(['ok' => false, 'error' => 'Admin login required.', 'logged_in' => false], 401);
    }
    $admin = fetch_app_admin($id);
    if (!$admin) {
        unset($_SESSION['app_admin_id']);
        json_response(['ok' => false, 'error' => 'Admin login required.', 'logged_in' => false], 401);
    }
    return $admin;
}

function login_app_admin(array $admin): void
{
    session_regenerate_id(true);
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(16));
    }
    $_SESSION['app_admin_id'] = (int) $admin['id'];
}

function logout_app_admin(): void
{
    unset($_SESSION['app_admin_id']);
}

function list_managed_rooms(): array
{
    $rows = db()->query(
        'SELECT r.id, r.name, r.created_at,
                (SELECT COUNT(*) FROM members m WHERE m.room_id = r.id) AS member_count
         FROM rooms r
         ORDER BY r.id DESC'
    )->fetchAll();
    foreach ($rows as &$row) {
        $row['id'] = (int) $row['id'];
        $row['member_count'] = (int) $row['member_count'];
    }
    return $rows;
}

function managed_room_detail(int $roomId): array
{
    $room = fetch_room($roomId);
    if (!$room) {
        throw new InvalidArgumentException('Room not found.');
    }
    $members = fetch_members($roomId);
    foreach ($members as &$member) {
        $member['id'] = (int) $member['id'];
        $member['user_id'] = isset($member['user_id']) ? (int) $member['user_id'] : null;
    }
    unset($member);
    return [
        'id' => (int) $room['id'],
        'name' => $room['name'],
        'created_at' => $room['created_at'],
        'members' => $members,
    ];
}

function unused_room_pin_hash(): string
{
    return password_hash(bin2hex(random_bytes(8)), PASSWORD_DEFAULT);
}

function create_managed_room(string $name): int
{
    $name = clean_name($name);
    if ($name === '') {
        throw new InvalidArgumentException('Give the room a name.');
    }

    $pdo = db();
    $exists = $pdo->prepare('SELECT id FROM rooms WHERE name_key = ?');
    $exists->execute([name_key($name)]);
    if ($exists->fetch()) {
        throw new InvalidArgumentException('That room name is already taken.');
    }

    $pdo->prepare('INSERT INTO rooms (name, name_key, pin_hash) VALUES (?, ?, ?)')
        ->execute([$name, name_key($name), unused_room_pin_hash()]);
    $roomId = (int) $pdo->lastInsertId();
    seed_default_items($roomId);
    return $roomId;
}

function update_managed_room(int $roomId, string $name): void
{
    if (!fetch_room($roomId)) {
        throw new InvalidArgumentException('Room not found.');
    }
    $name = clean_name($name);
    if ($name === '') {
        throw new InvalidArgumentException('Give the room a name.');
    }

    $exists = db()->prepare('SELECT id FROM rooms WHERE name_key = ? AND id <> ?');
    $exists->execute([name_key($name), $roomId]);
    if ($exists->fetch()) {
        throw new InvalidArgumentException('That room name is already taken.');
    }

    db()->prepare('UPDATE rooms SET name = ?, name_key = ? WHERE id = ?')
        ->execute([$name, name_key($name), $roomId]);
}

function fetch_room_member(int $roomId, int $memberId): array
{
    $stmt = db()->prepare('SELECT * FROM members WHERE id = ? AND room_id = ?');
    $stmt->execute([$memberId, $roomId]);
    $member = $stmt->fetch();
    if (!$member) {
        throw new InvalidArgumentException('Person not found.');
    }
    return $member;
}

function admin_update_person(int $roomId, int $memberId, string $name, string $username, string $password): void
{
    $member = fetch_room_member($roomId, $memberId);
    $name = clean_name($name);
    if ($name === '') {
        throw new InvalidArgumentException('Enter a display name.');
    }

    $pdo = db();
    $nameTaken = $pdo->prepare('SELECT id FROM members WHERE room_id = ? AND name_key = ? AND id <> ?');
    $nameTaken->execute([$roomId, name_key($name), $memberId]);
    if ($nameTaken->fetch()) {
        throw new InvalidArgumentException('That name is already in this room.');
    }

    $pdo->prepare('UPDATE members SET name = ?, name_key = ? WHERE id = ?')
        ->execute([$name, name_key($name), $memberId]);

    $userId = isset($member['user_id']) ? (int) $member['user_id'] : 0;
    $username = clean_username($username);

    if (!$userId) {
        if ($username === '' && $password === '') {
            return;
        }
        $created = create_user($name, $username, $password);
        $pdo->prepare('UPDATE members SET user_id = ? WHERE id = ?')->execute([(int) $created['id'], $memberId]);
        return;
    }

    if ($username === '') {
        throw new InvalidArgumentException('Enter a username.');
    }
    if (!valid_username($username)) {
        throw new InvalidArgumentException('Username must be 3–24 letters, numbers, or underscores.');
    }

    $other = find_user_by_username($username);
    if ($other && (int) $other['id'] !== $userId) {
        throw new InvalidArgumentException('That username is already taken.');
    }

    if ($password !== '') {
        if (strlen($password) < MIN_PASSWORD_LEN) {
            throw new InvalidArgumentException('Password must be at least ' . MIN_PASSWORD_LEN . ' characters.');
        }
        $pdo->prepare('UPDATE users SET username = ?, username_key = ?, display_name = ?, password_hash = ? WHERE id = ?')
            ->execute([$username, name_key($username), $name, password_hash($password, PASSWORD_DEFAULT), $userId]);
        return;
    }

    $pdo->prepare('UPDATE users SET username = ?, username_key = ?, display_name = ? WHERE id = ?')
        ->execute([$username, name_key($username), $name, $userId]);
}

function admin_delete_person(int $roomId, int $memberId): void
{
    $member = fetch_room_member($roomId, $memberId);
    $userId = isset($member['user_id']) ? (int) $member['user_id'] : 0;

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->prepare('DELETE FROM expense_shares WHERE member_id = ?')->execute([$memberId]);
        $pdo->prepare(
            'DELETE es FROM expense_shares es
             INNER JOIN expenses e ON e.id = es.expense_id
             WHERE e.paid_by = ?'
        )->execute([$memberId]);
        $pdo->prepare('DELETE FROM expenses WHERE paid_by = ?')->execute([$memberId]);
        $pdo->prepare('DELETE FROM settlements WHERE from_member_id = ? OR to_member_id = ?')
            ->execute([$memberId, $memberId]);
        $pdo->prepare('DELETE FROM bathroom_logs WHERE member_id = ? OR completed_by = ?')
            ->execute([$memberId, $memberId]);
        $pdo->prepare('DELETE FROM bathroom_order WHERE member_id = ?')->execute([$memberId]);
        $pdo->prepare('DELETE FROM members WHERE id = ?')->execute([$memberId]);

        if ($userId) {
            $pdo->prepare('UPDATE users SET active_room_id = NULL WHERE id = ? AND active_room_id = ?')
                ->execute([$userId, $roomId]);
            $pdo->prepare('UPDATE rooms SET admin_user_id = NULL WHERE id = ? AND admin_user_id = ?')
                ->execute([$roomId, $userId]);
            $left = $pdo->prepare('SELECT COUNT(*) FROM members WHERE user_id = ?');
            $left->execute([$userId]);
            if ((int) $left->fetchColumn() === 0) {
                $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$userId]);
            }
        }

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

function admin_add_person(int $roomId, string $name, string $username, string $password): void
{
    if (!fetch_room($roomId)) {
        throw new InvalidArgumentException('Room not found.');
    }
    $username = clean_username($username);
    if ($username === '') {
        throw new InvalidArgumentException('Enter a username.');
    }
    $existing = find_user_by_username($username);
    if ($existing) {
        add_user_to_room($roomId, (int) $existing['id'], $name !== '' ? $name : $existing['display_name']);
        return;
    }
    $created = create_user($name, $username, $password);
    add_user_to_room($roomId, (int) $created['id'], $created['display_name']);
}

function delete_managed_room(int $roomId): void
{
    if (!fetch_room($roomId)) {
        throw new InvalidArgumentException('Room not found.');
    }

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->prepare('UPDATE users SET active_room_id = NULL WHERE active_room_id = ?')->execute([$roomId]);
        $pdo->prepare(
            'DELETE es FROM expense_shares es
             INNER JOIN expenses e ON e.id = es.expense_id
             WHERE e.room_id = ?'
        )->execute([$roomId]);
        $pdo->prepare('DELETE FROM expenses WHERE room_id = ?')->execute([$roomId]);
        $pdo->prepare('DELETE FROM settlements WHERE room_id = ?')->execute([$roomId]);
        $pdo->prepare('DELETE FROM rooms WHERE id = ?')->execute([$roomId]);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}