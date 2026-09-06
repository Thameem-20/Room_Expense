<?php

declare(strict_types=1);

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $dsn = 'mysql:host=' . DB_HOST . ';charset=utf8mb4';
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->exec('CREATE DATABASE IF NOT EXISTS `' . DB_NAME . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    $pdo->exec('USE `' . DB_NAME . '`');
    migrate($pdo);
    return $pdo;
}

function table_has_column(PDO $pdo, string $table, string $column): bool
{
    $stmt = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?'
    );
    $stmt->execute([DB_NAME, $table, $column]);
    return (int) $stmt->fetchColumn() > 0;
}

function migrate(PDO $pdo): void
{
    $pdo->exec(<<<SQL
        CREATE TABLE IF NOT EXISTS rooms (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(80) NOT NULL,
            name_key VARCHAR(80) NOT NULL,
            pin_hash VARCHAR(255) NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_rooms_name_key (name_key)
        ) ENGINE=InnoDB
    SQL);

    $pdo->exec(<<<SQL
        CREATE TABLE IF NOT EXISTS members (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            room_id INT UNSIGNED NOT NULL,
            name VARCHAR(80) NOT NULL,
            name_key VARCHAR(80) NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_members_room_name (room_id, name_key),
            CONSTRAINT fk_members_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
        ) ENGINE=InnoDB
    SQL);

    $pdo->exec(<<<SQL
        CREATE TABLE IF NOT EXISTS items (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            room_id INT UNSIGNED NOT NULL,
            name VARCHAR(80) NOT NULL,
            name_key VARCHAR(80) NOT NULL,
            emoji VARCHAR(16) NOT NULL,
            last_amount_cents INT UNSIGNED NULL,
            is_quick TINYINT(1) NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_items_room_name (room_id, name_key),
            CONSTRAINT fk_items_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
        ) ENGINE=InnoDB
    SQL);

    $pdo->exec(<<<SQL
        CREATE TABLE IF NOT EXISTS expenses (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            room_id INT UNSIGNED NOT NULL,
            item_id INT UNSIGNED NULL,
            title VARCHAR(80) NOT NULL,
            emoji VARCHAR(16) NOT NULL,
            amount_cents INT UNSIGNED NOT NULL,
            paid_by INT UNSIGNED NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_expenses_room_created (room_id, created_at),
            CONSTRAINT fk_expenses_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
            CONSTRAINT fk_expenses_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE SET NULL,
            CONSTRAINT fk_expenses_payer FOREIGN KEY (paid_by) REFERENCES members(id) ON DELETE RESTRICT
        ) ENGINE=InnoDB
    SQL);

    $pdo->exec(<<<SQL
        CREATE TABLE IF NOT EXISTS expense_shares (
            expense_id INT UNSIGNED NOT NULL,
            member_id INT UNSIGNED NOT NULL,
            share_cents INT UNSIGNED NOT NULL,
            PRIMARY KEY (expense_id, member_id),
            CONSTRAINT fk_shares_expense FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
            CONSTRAINT fk_shares_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE RESTRICT
        ) ENGINE=InnoDB
    SQL);

    $pdo->exec(<<<SQL
        CREATE TABLE IF NOT EXISTS users (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(24) NOT NULL,
            username_key VARCHAR(24) NOT NULL,
            display_name VARCHAR(80) NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            remember_token VARCHAR(64) NULL,
            active_room_id INT UNSIGNED NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_users_username (username_key),
            KEY idx_users_remember (remember_token)
        ) ENGINE=InnoDB
    SQL);

    if (!table_has_column($pdo, 'members', 'user_id')) {
        $pdo->exec('ALTER TABLE members ADD COLUMN user_id INT UNSIGNED NULL AFTER name_key');
        $pdo->exec('ALTER TABLE members ADD UNIQUE KEY uq_members_room_user (room_id, user_id)');
    }

    if (!table_has_column($pdo, 'rooms', 'admin_user_id')) {
        $pdo->exec('ALTER TABLE rooms ADD COLUMN admin_user_id INT UNSIGNED NULL AFTER pin_hash');
        $pdo->exec(
            'UPDATE rooms r
             INNER JOIN (
                 SELECT room_id, MIN(id) AS first_id
                 FROM members
                 WHERE user_id IS NOT NULL
                 GROUP BY room_id
             ) first_member ON first_member.room_id = r.id
             INNER JOIN members m ON m.id = first_member.first_id
             SET r.admin_user_id = m.user_id
             WHERE r.admin_user_id IS NULL'
        );
    }

    $pdo->exec(<<<SQL
        CREATE TABLE IF NOT EXISTS settlements (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            room_id INT UNSIGNED NOT NULL,
            from_member_id INT UNSIGNED NOT NULL,
            to_member_id INT UNSIGNED NOT NULL,
            amount_cents INT UNSIGNED NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_settlements_room (room_id, created_at),
            CONSTRAINT fk_settle_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
            CONSTRAINT fk_settle_from FOREIGN KEY (from_member_id) REFERENCES members(id) ON DELETE RESTRICT,
            CONSTRAINT fk_settle_to FOREIGN KEY (to_member_id) REFERENCES members(id) ON DELETE RESTRICT
        ) ENGINE=InnoDB
    SQL);

    $pdo->exec(<<<SQL
        CREATE TABLE IF NOT EXISTS bathroom_order (
            room_id INT UNSIGNED NOT NULL,
            member_id INT UNSIGNED NOT NULL,
            sort_order INT UNSIGNED NOT NULL,
            PRIMARY KEY (room_id, member_id),
            KEY idx_bathroom_pos (room_id, sort_order),
            CONSTRAINT fk_bath_order_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
            CONSTRAINT fk_bath_order_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
        ) ENGINE=InnoDB
    SQL);

    $pdo->exec(<<<SQL
        CREATE TABLE IF NOT EXISTS bathroom_logs (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            room_id INT UNSIGNED NOT NULL,
            member_id INT UNSIGNED NOT NULL,
            completed_by INT UNSIGNED NOT NULL,
            completed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_bath_logs_room (room_id, completed_at),
            CONSTRAINT fk_bath_log_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
            CONSTRAINT fk_bath_log_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
            CONSTRAINT fk_bath_log_actor FOREIGN KEY (completed_by) REFERENCES members(id) ON DELETE CASCADE
        ) ENGINE=InnoDB
    SQL);

    $pdo->exec(<<<SQL
        CREATE TABLE IF NOT EXISTS app_admins (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(120) NOT NULL,
            email_key VARCHAR(120) NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_app_admins_email (email_key)
        ) ENGINE=InnoDB
    SQL);

    seed_app_admin($pdo);
}

function seed_app_admin(PDO $pdo): void
{
    $email = 'admin@gmail.com';
    $stmt = $pdo->prepare('SELECT id FROM app_admins WHERE email_key = ?');
    $stmt->execute([mb_strtolower($email)]);
    if ($stmt->fetch()) {
        return;
    }
    $pdo->prepare('INSERT INTO app_admins (email, email_key, password_hash) VALUES (?, ?, ?)')
        ->execute([$email, mb_strtolower($email), password_hash('Th@meem20', PASSWORD_DEFAULT)]);
}
