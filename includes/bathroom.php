<?php

declare(strict_types=1);

function ensure_bathroom_order(int $roomId): void
{
    $members = fetch_members($roomId);
    if (!$members) {
        return;
    }

    $stmt = db()->prepare('SELECT member_id, sort_order FROM bathroom_order WHERE room_id = ? ORDER BY sort_order ASC, member_id ASC');
    $stmt->execute([$roomId]);
    $existing = [];
    foreach ($stmt->fetchAll() as $row) {
        $existing[(int) $row['member_id']] = (int) $row['sort_order'];
    }

    $memberIds = [];
    foreach ($members as $member) {
        $memberIds[(int) $member['id']] = true;
        if (!isset($existing[(int) $member['id']])) {
            $next = $existing ? (max($existing) + 1) : 0;
            db()->prepare('INSERT INTO bathroom_order (room_id, member_id, sort_order) VALUES (?, ?, ?)')
                ->execute([$roomId, (int) $member['id'], $next]);
            $existing[(int) $member['id']] = $next;
        }
    }

    foreach (array_keys($existing) as $memberId) {
        if (!isset($memberIds[$memberId])) {
            db()->prepare('DELETE FROM bathroom_order WHERE room_id = ? AND member_id = ?')
                ->execute([$roomId, $memberId]);
            unset($existing[$memberId]);
        }
    }

    $ordered = bathroom_order_ids($roomId);
    save_bathroom_order($roomId, $ordered);
}

function bathroom_order_ids(int $roomId): array
{
    $stmt = db()->prepare('SELECT member_id FROM bathroom_order WHERE room_id = ? ORDER BY sort_order ASC, member_id ASC');
    $stmt->execute([$roomId]);
    return array_map(static fn($row) => (int) $row['member_id'], $stmt->fetchAll());
}

function save_bathroom_order(int $roomId, array $memberIds): void
{
    $ids = array_values(array_unique(array_map('intval', $memberIds)));
    $valid = [];
    foreach (fetch_members($roomId) as $member) {
        $valid[(int) $member['id']] = true;
    }
    $ids = array_values(array_filter($ids, static fn($id) => isset($valid[$id])));
    foreach (array_keys($valid) as $id) {
        if (!in_array($id, $ids, true)) {
            $ids[] = $id;
        }
    }

    $pdo = db();
    $started = !$pdo->inTransaction();
    if ($started) {
        $pdo->beginTransaction();
    }
    $pdo->prepare('DELETE FROM bathroom_order WHERE room_id = ?')->execute([$roomId]);
    $insert = $pdo->prepare('INSERT INTO bathroom_order (room_id, member_id, sort_order) VALUES (?, ?, ?)');
    foreach ($ids as $i => $memberId) {
        $insert->execute([$roomId, $memberId, $i]);
    }
    if ($started) {
        $pdo->commit();
    }
}

function bathroom_state(int $roomId): array
{
    ensure_bathroom_order($roomId);
    $members = [];
    foreach (fetch_members($roomId) as $member) {
        $members[(int) $member['id']] = $member;
    }

    $order = [];
    foreach (bathroom_order_ids($roomId) as $i => $memberId) {
        if (!isset($members[$memberId])) {
            continue;
        }
        $order[] = [
            'id' => $memberId,
            'name' => $members[$memberId]['name'],
            'username' => $members[$memberId]['username'] ?? '',
            'position' => $i + 1,
            'is_current' => $i === 0,
        ];
    }

    $logs = db()->prepare(
        'SELECT l.id, l.completed_at, a.name AS cleaner, b.name AS marked_by
         FROM bathroom_logs l
         INNER JOIN members a ON a.id = l.member_id
         INNER JOIN members b ON b.id = l.completed_by
         WHERE l.room_id = ?
         ORDER BY l.completed_at DESC, l.id DESC'
    );
    $logs->execute([$roomId]);
    $history = $logs->fetchAll();
    foreach ($history as &$row) {
        $row['id'] = (int) $row['id'];
    }
    unset($row);

    return [
        'current' => $order[0] ?? null,
        'order' => $order,
        'history' => $history,
    ];
}

function complete_bathroom(int $roomId, int $actorMemberId): array
{
    ensure_bathroom_order($roomId);
    $ids = bathroom_order_ids($roomId);
    if (!$ids) {
        throw new RuntimeException('Add roommates before starting the bathroom rota.');
    }

    $currentId = $ids[0];
    db()->prepare('INSERT INTO bathroom_logs (room_id, member_id, completed_by) VALUES (?, ?, ?)')
        ->execute([$roomId, $currentId, $actorMemberId]);

    $rotated = array_values(array_merge(array_slice($ids, 1), [$currentId]));
    save_bathroom_order($roomId, $rotated);

    $names = [];
    foreach (fetch_members($roomId) as $member) {
        $names[(int) $member['id']] = $member['name'];
    }

    return [
        'cleaned' => $names[$currentId] ?? 'Someone',
        'next' => $names[$rotated[0] ?? 0] ?? null,
    ];
}
