<?php

declare(strict_types=1);

function current_user_id(): ?int
{
    $id = $_SESSION['user_id'] ?? null;
    return $id ? (int) $id : null;
}

function current_room_id(): ?int
{
    $id = $_SESSION['room_id'] ?? null;
    return $id ? (int) $id : null;
}

function current_member_id(): ?int
{
    $id = $_SESSION['member_id'] ?? null;
    return $id ? (int) $id : null;
}

function fetch_user(int $userId): ?array
{
    $stmt = db()->prepare('SELECT id, username, display_name, active_room_id, created_at FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $user = $stmt->fetch();
    return $user ?: null;
}

function require_user(): array
{
    $userId = current_user_id();
    if (!$userId) {
        json_response(['ok' => false, 'error' => 'Please log in.', 'logged_in' => false], 401);
    }
    $user = fetch_user($userId);
    if (!$user) {
        clear_login();
        json_response(['ok' => false, 'error' => 'Please log in.', 'logged_in' => false], 401);
    }
    return $user;
}

function require_room(): int
{
    require_user();
    $roomId = current_room_id();
    if (!$roomId) {
        json_response(['ok' => false, 'error' => 'Join or create a room first.', 'needs_room' => true], 401);
    }
    return $roomId;
}

function require_member(): array
{
    $user = require_user();
    $roomId = require_room();
    $stmt = db()->prepare('SELECT * FROM members WHERE room_id = ? AND user_id = ?');
    $stmt->execute([$roomId, (int) $user['id']]);
    $member = $stmt->fetch();
    if (!$member) {
        unset($_SESSION['room_id'], $_SESSION['member_id']);
        json_response(['ok' => false, 'error' => 'You are not in this room.', 'needs_room' => true], 401);
    }
    $_SESSION['member_id'] = (int) $member['id'];
    return $member;
}

function issue_remember_token(int $userId): void
{
    $token = bin2hex(random_bytes(32));
    db()->prepare('UPDATE users SET remember_token = ? WHERE id = ?')
        ->execute([hash('sha256', $token), $userId]);
    set_app_cookie(REMEMBER_COOKIE, $token, time() + REMEMBER_SECONDS);
}

function attach_room_session(int $userId, ?int $preferredRoomId = null): void
{
    $roomId = $preferredRoomId;
    if ($roomId) {
        $check = db()->prepare('SELECT id FROM members WHERE room_id = ? AND user_id = ?');
        $check->execute([$roomId, $userId]);
        if (!$check->fetch()) {
            $roomId = null;
        }
    }
    if (!$roomId) {
        $stmt = db()->prepare(
            'SELECT room_id FROM members WHERE user_id = ? ORDER BY id DESC LIMIT 1'
        );
        $stmt->execute([$userId]);
        $row = $stmt->fetch();
        $roomId = $row ? (int) $row['room_id'] : null;
    }

    if (!$roomId) {
        unset($_SESSION['room_id'], $_SESSION['member_id']);
        return;
    }

    $member = db()->prepare('SELECT id FROM members WHERE room_id = ? AND user_id = ?');
    $member->execute([$roomId, $userId]);
    $row = $member->fetch();
    if (!$row) {
        unset($_SESSION['room_id'], $_SESSION['member_id']);
        return;
    }

    $_SESSION['room_id'] = $roomId;
    $_SESSION['member_id'] = (int) $row['id'];
    db()->prepare('UPDATE users SET active_room_id = ? WHERE id = ?')->execute([$roomId, $userId]);
}

function login_user(array $user, ?int $roomId = null): void
{
    session_regenerate_id(true);
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(16));
    }
    $_SESSION['user_id'] = (int) $user['id'];
    $preferred = $roomId ?? (isset($user['active_room_id']) ? (int) $user['active_room_id'] : null);
    attach_room_session((int) $user['id'], $preferred ?: null);
    issue_remember_token((int) $user['id']);
}

function clear_login(): void
{
    $userId = current_user_id();
    if ($userId) {
        db()->prepare('UPDATE users SET remember_token = NULL WHERE id = ?')->execute([$userId]);
    }
    unset($_SESSION['user_id'], $_SESSION['room_id'], $_SESSION['member_id']);
    clear_app_cookie(REMEMBER_COOKIE);
}

function restore_remember_login(): void
{
    if (current_user_id()) {
        attach_room_session(current_user_id());
        return;
    }

    $token = (string) ($_COOKIE[REMEMBER_COOKIE] ?? '');
    if ($token === '' || strlen($token) < 32) {
        return;
    }

    $stmt = db()->prepare('SELECT * FROM users WHERE remember_token = ?');
    $stmt->execute([hash('sha256', $token)]);
    $user = $stmt->fetch();
    if (!$user) {
        clear_app_cookie(REMEMBER_COOKIE);
        return;
    }

    $_SESSION['user_id'] = (int) $user['id'];
    attach_room_session((int) $user['id'], isset($user['active_room_id']) ? (int) $user['active_room_id'] : null);
}

function create_user(string $displayName, string $username, string $password): array
{
    $displayName = clean_name($displayName);
    $username = clean_username($username);
    if ($displayName === '') {
        throw new InvalidArgumentException('Enter a display name.');
    }
    if (!valid_username($username)) {
        throw new InvalidArgumentException('Username must be 3–24 letters, numbers, or underscores.');
    }
    if (strlen($password) < MIN_PASSWORD_LEN) {
        throw new InvalidArgumentException('Password must be at least ' . MIN_PASSWORD_LEN . ' characters.');
    }

    try {
        db()->prepare('INSERT INTO users (username, username_key, display_name, password_hash) VALUES (?, ?, ?, ?)')
            ->execute([$username, name_key($username), $displayName, password_hash($password, PASSWORD_DEFAULT)]);
    } catch (PDOException $e) {
        throw new InvalidArgumentException('That username is already taken.');
    }

    $user = fetch_user((int) db()->lastInsertId());
    if (!$user) {
        throw new RuntimeException('Could not create the account.');
    }
    return $user;
}

function find_user_by_username(string $username): ?array
{
    $stmt = db()->prepare('SELECT * FROM users WHERE username_key = ?');
    $stmt->execute([name_key(clean_username($username))]);
    $user = $stmt->fetch();
    return $user ?: null;
}

function add_user_to_room(int $roomId, int $userId, string $displayName): int
{
    $exists = db()->prepare('SELECT id FROM members WHERE room_id = ? AND user_id = ?');
    $exists->execute([$roomId, $userId]);
    $row = $exists->fetch();
    if ($row) {
        return (int) $row['id'];
    }

    $name = clean_name($displayName);
    $key = name_key($name);
    $suffix = 1;
    while (true) {
        try {
            db()->prepare('INSERT INTO members (room_id, name, name_key, user_id) VALUES (?, ?, ?, ?)')
                ->execute([$roomId, $name, $key, $userId]);
            return (int) db()->lastInsertId();
        } catch (PDOException $e) {
            $suffix++;
            $name = clean_name($displayName) . ' ' . $suffix;
            $key = name_key($name);
            if ($suffix > 20) {
                throw new InvalidArgumentException('Could not add that person to the room.');
            }
        }
    }
}

function user_count(): int
{
    return (int) db()->query('SELECT COUNT(*) FROM users')->fetchColumn();
}

function parse_roommate_drafts(array $memberInputs, string $skipUsername = ''): array
{
    $newMembers = [];
    $seenUsers = [];
    if ($skipUsername !== '') {
        $seenUsers[name_key($skipUsername)] = true;
    }
    foreach ($memberInputs as $raw) {
        if (!is_array($raw)) {
            continue;
        }
        $memberName = clean_name((string) ($raw['name'] ?? ''));
        $memberUser = clean_username((string) ($raw['username'] ?? ''));
        $memberPass = (string) ($raw['password'] ?? '');
        $key = name_key($memberUser);
        if ($memberName === '' || $memberUser === '' || isset($seenUsers[$key])) {
            continue;
        }
        if (!valid_username($memberUser)) {
            throw new InvalidArgumentException('Username "' . $memberUser . '" is invalid.');
        }
        $seenUsers[$key] = true;
        $newMembers[] = ['name' => $memberName, 'username' => $memberUser, 'password' => $memberPass];
    }
    return $newMembers;
}

function resolve_new_users(array $drafts): array
{
    $resolved = [];
    foreach ($drafts as $draft) {
        $existing = find_user_by_username($draft['username']);
        if ($existing) {
            throw new InvalidArgumentException('Username "' . $draft['username'] . '" already exists. Pick a new one.');
        }
        $resolved[] = create_user($draft['name'], $draft['username'], $draft['password']);
    }
    return $resolved;
}

function create_room_for_admin(array $user, string $name, string $pin, array $roommates): int
{
    $name = clean_name($name);
    $pin = trim($pin);
    if ($name === '') {
        throw new InvalidArgumentException('Give the room a name.');
    }
    if (!preg_match('/^\d{' . MIN_PIN_LEN . ',' . MAX_PIN_LEN . '}$/', $pin)) {
        throw new InvalidArgumentException('Room PIN must be ' . MIN_PIN_LEN . '–' . MAX_PIN_LEN . ' digits.');
    }

    $pdo = db();
    $exists = $pdo->prepare('SELECT id FROM rooms WHERE name_key = ?');
    $exists->execute([name_key($name)]);
    if ($exists->fetch()) {
        throw new InvalidArgumentException('That room name is already taken.');
    }

    $pdo->beginTransaction();
    try {
        $pdo->prepare('INSERT INTO rooms (name, name_key, pin_hash, admin_user_id) VALUES (?, ?, ?, ?)')
            ->execute([$name, name_key($name), password_hash($pin, PASSWORD_DEFAULT), (int) $user['id']]);
        $roomId = (int) $pdo->lastInsertId();
        add_user_to_room($roomId, (int) $user['id'], $user['display_name']);
        foreach ($roommates as $roommate) {
            add_user_to_room($roomId, (int) $roommate['id'], $roommate['display_name']);
        }
        seed_default_items($roomId);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }

    attach_room_session((int) $user['id'], $roomId);
    return $roomId;
}

function fetch_room(int $roomId): ?array
{
    $stmt = db()->prepare('SELECT id, name, admin_user_id, created_at FROM rooms WHERE id = ?');
    $stmt->execute([$roomId]);
    $room = $stmt->fetch();
    return $room ?: null;
}

function is_room_admin(?array $room, ?int $userId): bool
{
    if (!$room || !$userId) {
        return false;
    }
    return (int) ($room['admin_user_id'] ?? 0) === $userId;
}

function require_room_admin(): array
{
    $member = require_member();
    $user = require_user();
    $room = fetch_room((int) $member['room_id']);
    if (!is_room_admin($room, (int) $user['id'])) {
        json_response(['ok' => false, 'error' => 'Only the room admin can add roommates.'], 403);
    }
    return $member;
}

function fetch_members(int $roomId): array
{
    $stmt = db()->prepare(
        'SELECT m.id, m.name, m.user_id, m.created_at, u.username
         FROM members m
         LEFT JOIN users u ON u.id = m.user_id
         WHERE m.room_id = ?
         ORDER BY m.id ASC'
    );
    $stmt->execute([$roomId]);
    return $stmt->fetchAll();
}

function fetch_items(int $roomId): array
{
    $stmt = db()->prepare('SELECT id, name, emoji, last_amount_cents, is_quick FROM items WHERE room_id = ? ORDER BY is_quick DESC, id ASC');
    $stmt->execute([$roomId]);
    $rows = $stmt->fetchAll();
    foreach ($rows as &$row) {
        $row['id'] = (int) $row['id'];
        $row['last_amount'] = $row['last_amount_cents'] !== null ? from_cents((int) $row['last_amount_cents']) : null;
        $row['is_quick'] = (bool) $row['is_quick'];
        unset($row['last_amount_cents']);
    }
    return $rows;
}

function seed_default_items(int $roomId): void
{
    $stmt = db()->prepare('INSERT INTO items (room_id, name, name_key, emoji, is_quick) VALUES (?, ?, ?, ?, 1)');
    foreach (DEFAULT_ITEMS as $item) {
        $stmt->execute([$roomId, $item['name'], name_key($item['name']), $item['emoji']]);
    }
}

function auth_payload(array $user): array
{
    $hasRoom = (bool) current_room_id();
    $payload = [
        'ok' => true,
        'logged_in' => true,
        'needs_room' => !$hasRoom,
        'user' => [
            'id' => (int) $user['id'],
            'username' => $user['username'],
            'name' => $user['display_name'],
        ],
    ];
    if ($hasRoom) {
        return array_merge(room_state(), $payload);
    }
    return $payload;
}
