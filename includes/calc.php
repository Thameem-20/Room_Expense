<?php

declare(strict_types=1);

function member_balances(int $roomId): array
{
    $members = fetch_members($roomId);
    $balances = [];
    foreach ($members as $member) {
        $balances[(int) $member['id']] = [
            'id' => (int) $member['id'],
            'name' => $member['name'],
            'username' => $member['username'] ?? '',
            'user_id' => isset($member['user_id']) ? (int) $member['user_id'] : null,
            'paid_cents' => 0,
            'share_cents' => 0,
            'settled_out_cents' => 0,
            'settled_in_cents' => 0,
            'balance_cents' => 0,
        ];
    }

    $paid = db()->prepare('SELECT paid_by, SUM(amount_cents) AS total FROM expenses WHERE room_id = ? GROUP BY paid_by');
    $paid->execute([$roomId]);
    foreach ($paid->fetchAll() as $row) {
        $id = (int) $row['paid_by'];
        if (isset($balances[$id])) {
            $balances[$id]['paid_cents'] = (int) $row['total'];
        }
    }

    $shares = db()->prepare(
        'SELECT s.member_id, SUM(s.share_cents) AS total
         FROM expense_shares s
         INNER JOIN expenses e ON e.id = s.expense_id
         WHERE e.room_id = ?
         GROUP BY s.member_id'
    );
    $shares->execute([$roomId]);
    foreach ($shares->fetchAll() as $row) {
        $id = (int) $row['member_id'];
        if (isset($balances[$id])) {
            $balances[$id]['share_cents'] = (int) $row['total'];
        }
    }

    $out = db()->prepare('SELECT from_member_id, SUM(amount_cents) AS total FROM settlements WHERE room_id = ? GROUP BY from_member_id');
    $out->execute([$roomId]);
    foreach ($out->fetchAll() as $row) {
        $id = (int) $row['from_member_id'];
        if (isset($balances[$id])) {
            $balances[$id]['settled_out_cents'] = (int) $row['total'];
        }
    }

    $in = db()->prepare('SELECT to_member_id, SUM(amount_cents) AS total FROM settlements WHERE room_id = ? GROUP BY to_member_id');
    $in->execute([$roomId]);
    foreach ($in->fetchAll() as $row) {
        $id = (int) $row['to_member_id'];
        if (isset($balances[$id])) {
            $balances[$id]['settled_in_cents'] = (int) $row['total'];
        }
    }

    foreach ($balances as &$row) {
        $row['balance_cents'] = $row['paid_cents'] - $row['share_cents'] + $row['settled_out_cents'] - $row['settled_in_cents'];
        $row['paid'] = from_cents($row['paid_cents']);
        $row['share'] = from_cents($row['share_cents']);
        $row['balance'] = from_cents($row['balance_cents']);
        $row['owes'] = $row['balance_cents'] < 0;
        $row['is_owed'] = $row['balance_cents'] > 0;
        $row['pending'] = from_cents(abs($row['balance_cents']));
        $row['label'] = balance_label($row['balance_cents']);
    }
    unset($row);

    return array_values($balances);
}

function balance_label(int $cents): string
{
    if ($cents > 0) {
        return 'is owed ' . format_money($cents);
    }
    if ($cents < 0) {
        return 'owes ' . format_money($cents);
    }
    return 'settled up';
}

function suggested_payments(array $balances): array
{
    $debtors = [];
    $creditors = [];
    foreach ($balances as $row) {
        if ($row['balance_cents'] < -1) {
            $debtors[] = ['id' => $row['id'], 'name' => $row['name'], 'left' => -$row['balance_cents']];
        } elseif ($row['balance_cents'] > 1) {
            $creditors[] = ['id' => $row['id'], 'name' => $row['name'], 'left' => $row['balance_cents']];
        }
    }

    usort($debtors, fn($a, $b) => $b['left'] <=> $a['left']);
    usort($creditors, fn($a, $b) => $b['left'] <=> $a['left']);

    $payments = [];
    $i = 0;
    $j = 0;
    while ($i < count($debtors) && $j < count($creditors)) {
        $pay = min($debtors[$i]['left'], $creditors[$j]['left']);
        if ($pay > 0) {
            $payments[] = [
                'from_id' => $debtors[$i]['id'],
                'from' => $debtors[$i]['name'],
                'to_id' => $creditors[$j]['id'],
                'to' => $creditors[$j]['name'],
                'amount_cents' => $pay,
                'amount' => from_cents($pay),
            ];
        }
        $debtors[$i]['left'] -= $pay;
        $creditors[$j]['left'] -= $pay;
        if ($debtors[$i]['left'] <= 0) {
            $i++;
        }
        if ($creditors[$j]['left'] <= 0) {
            $j++;
        }
    }
    return $payments;
}

function settle_member(int $roomId, int $memberId): array
{
    $balances = member_balances($roomId);
    $target = null;
    foreach ($balances as $row) {
        if ($row['id'] === $memberId) {
            $target = $row;
            break;
        }
    }
    if (!$target) {
        throw new RuntimeException('Member not found.');
    }
    if ($target['balance_cents'] >= 0) {
        throw new RuntimeException($target['name'] . ' has nothing pending to settle.');
    }

    $remaining = -$target['balance_cents'];
    $creditors = array_values(array_filter($balances, fn($row) => $row['id'] !== $memberId && $row['balance_cents'] > 0));
    usort($creditors, fn($a, $b) => $b['balance_cents'] <=> $a['balance_cents']);

    if (!$creditors) {
        throw new RuntimeException('No one is currently owed money.');
    }

    $pdo = db();
    $stmt = $pdo->prepare(
        'INSERT INTO settlements (room_id, from_member_id, to_member_id, amount_cents) VALUES (?, ?, ?, ?)'
    );
    $created = [];
    foreach ($creditors as $creditor) {
        if ($remaining <= 0) {
            break;
        }
        $pay = min($remaining, $creditor['balance_cents']);
        if ($pay <= 0) {
            continue;
        }
        $stmt->execute([$roomId, $memberId, $creditor['id'], $pay]);
        $created[] = [
            'from' => $target['name'],
            'to' => $creditor['name'],
            'amount' => from_cents($pay),
        ];
        $remaining -= $pay;
    }

    if ($remaining > 0 && $created) {
        $lastId = (int) $pdo->lastInsertId();
        $pdo->prepare('UPDATE settlements SET amount_cents = amount_cents + ? WHERE id = ?')->execute([$remaining, $lastId]);
        $created[count($created) - 1]['amount'] = from_cents(to_cents($created[count($created) - 1]['amount']) + $remaining);
    }

    return $created;
}

function split_expense(int $expenseId, array $members, int $amountCents): void
{
    $n = count($members);
    if ($n < 1) {
        throw new RuntimeException('A room needs members before adding expenses.');
    }
    $base = intdiv($amountCents, $n);
    $rem = $amountCents % $n;
    $stmt = db()->prepare('INSERT INTO expense_shares (expense_id, member_id, share_cents) VALUES (?, ?, ?)');
    foreach (array_values($members) as $i => $member) {
        $share = $base + ($i < $rem ? 1 : 0);
        $stmt->execute([$expenseId, (int) $member['id'], $share]);
    }
}

function fetch_room_expense(int $roomId, int $expenseId): array
{
    $stmt = db()->prepare('SELECT * FROM expenses WHERE id = ? AND room_id = ?');
    $stmt->execute([$expenseId, $roomId]);
    $expense = $stmt->fetch();
    if (!$expense) {
        throw new InvalidArgumentException('Expense not found.');
    }
    return $expense;
}

function assert_expense_owner(array $expense, int $memberId): void
{
    $owner = (int) ($expense['added_by'] ?? $expense['paid_by'] ?? 0);
    if ($owner !== $memberId) {
        throw new InvalidArgumentException('Only the person who added this expense can change it.');
    }
}

function update_expense(int $roomId, int $expenseId, int $amountCents, int $paidBy, int $actorMemberId): void
{
    if ($amountCents < 1) {
        throw new InvalidArgumentException('Enter an amount greater than 0.');
    }
    $expense = fetch_room_expense($roomId, $expenseId);
    assert_expense_owner($expense, $actorMemberId);
    $payerCheck = db()->prepare('SELECT id FROM members WHERE id = ? AND room_id = ?');
    $payerCheck->execute([$paidBy, $roomId]);
    if (!$payerCheck->fetch()) {
        throw new InvalidArgumentException('Payer is not in this room.');
    }

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->prepare('UPDATE expenses SET amount_cents = ?, paid_by = ? WHERE id = ? AND room_id = ?')
            ->execute([$amountCents, $paidBy, $expenseId, $roomId]);
        $pdo->prepare('DELETE FROM expense_shares WHERE expense_id = ?')->execute([$expenseId]);
        split_expense($expenseId, fetch_members($roomId), $amountCents);
        if (!empty($expense['item_id'])) {
            $pdo->prepare('UPDATE items SET last_amount_cents = ? WHERE id = ?')
                ->execute([$amountCents, (int) $expense['item_id']]);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

function delete_room_expense(int $roomId, int $expenseId, int $actorMemberId): void
{
    $expense = fetch_room_expense($roomId, $expenseId);
    assert_expense_owner($expense, $actorMemberId);
    $pdo = db();
    $pdo->prepare('DELETE FROM expense_shares WHERE expense_id = ?')->execute([$expenseId]);
    $pdo->prepare('DELETE FROM expenses WHERE id = ? AND room_id = ?')->execute([$expenseId, $roomId]);
}

function fetch_expenses(int $roomId, ?int $viewerMemberId = null): array
{
    $stmt = db()->prepare(
        'SELECT e.id, e.item_id, e.added_by, e.title, e.emoji, e.amount_cents, e.created_at, m.id AS payer_id, m.name AS payer
         FROM expenses e
         INNER JOIN members m ON m.id = e.paid_by
         WHERE e.room_id = ?
         ORDER BY e.created_at DESC, e.id DESC'
    );
    $stmt->execute([$roomId]);
    $rows = $stmt->fetchAll();
    foreach ($rows as &$row) {
        $row['id'] = (int) $row['id'];
        $row['item_id'] = $row['item_id'] !== null ? (int) $row['item_id'] : null;
        $row['added_by'] = (int) ($row['added_by'] ?? $row['payer_id']);
        $row['amount'] = from_cents((int) $row['amount_cents']);
        $row['payer_id'] = (int) $row['payer_id'];
        $row['can_edit'] = $viewerMemberId !== null && $row['added_by'] === $viewerMemberId;
        unset($row['amount_cents']);
    }
    return $rows;
}

function fetch_settlements(int $roomId): array
{
    $stmt = db()->prepare(
        'SELECT s.id, s.amount_cents, s.created_at, a.name AS from_name, b.name AS to_name
         FROM settlements s
         INNER JOIN members a ON a.id = s.from_member_id
         INNER JOIN members b ON b.id = s.to_member_id
         WHERE s.room_id = ?
         ORDER BY s.created_at DESC, s.id DESC'
    );
    $stmt->execute([$roomId]);
    $rows = $stmt->fetchAll();
    foreach ($rows as &$row) {
        $row['id'] = (int) $row['id'];
        $row['amount'] = from_cents((int) $row['amount_cents']);
        unset($row['amount_cents']);
    }
    return $rows;
}

function room_export(int $roomId, string $roomName, array $balances): string
{
    $lines = [APP_NAME . ' — ' . $roomName, date('j M Y'), ''];
    $lines[] = 'Balances';
    foreach ($balances as $row) {
        $lines[] = '• ' . $row['name'] . ' — ' . $row['label'];
    }
    $payments = suggested_payments($balances);
    $lines[] = '';
    if ($payments) {
        $lines[] = 'Settle like this';
        foreach ($payments as $pay) {
            $lines[] = '• ' . $pay['from'] . ' → ' . $pay['to'] . '  ' . CURRENCY . ' ' . $pay['amount'];
        }
    } else {
        $lines[] = 'Everyone is settled up.';
    }
    return implode("\n", $lines);
}

function room_state(): array
{
    $member = require_member();
    $roomId = (int) $member['room_id'];
    $room = fetch_room($roomId);
    if (!$room) {
        json_response(['ok' => false, 'error' => 'Room not found.'], 404);
    }
    $balances = member_balances($roomId);
    $adminUserId = (int) ($room['admin_user_id'] ?? 0);
    foreach ($balances as &$row) {
        $row['is_admin'] = $adminUserId > 0 && (int) ($row['user_id'] ?? 0) === $adminUserId;
        unset($row['user_id']);
    }
    unset($row);
    $meBalance = null;
    foreach ($balances as $row) {
        if ($row['id'] === (int) $member['id']) {
            $meBalance = $row;
            break;
        }
    }
    $isAdmin = is_room_admin($room, current_user_id());
    return [
        'ok' => true,
        'room' => ['id' => (int) $room['id'], 'name' => $room['name']],
        'me' => [
            'id' => (int) $member['id'],
            'name' => $member['name'],
            'username' => $meBalance['username'] ?? '',
            'is_admin' => $isAdmin,
            'balance_cents' => $meBalance['balance_cents'] ?? 0,
            'balance' => $meBalance['balance'] ?? '0.00',
            'label' => $meBalance['label'] ?? 'settled up',
            'owes' => $meBalance['owes'] ?? false,
            'is_owed' => $meBalance['is_owed'] ?? false,
            'pending' => $meBalance['pending'] ?? '0.00',
        ],
        'members' => $balances,
        'items' => fetch_items($roomId),
        'expenses' => fetch_expenses($roomId, (int) $member['id']),
        'settlements' => fetch_settlements($roomId),
        'payments' => suggested_payments($balances),
        'export_text' => room_export($roomId, $room['name'], $balances),
        'currency' => CURRENCY,
        'bathroom' => bathroom_state($roomId),
    ];
}
