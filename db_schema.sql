-- ============================================================
--  Card Game MySQL Schema  (2–4 players per session)
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------------------
-- 1. Сессии (игровые партии)
-- ----------------------------------------
CREATE TABLE `sessions` (
    `id`          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `name`        VARCHAR(100)  NOT NULL COMMENT 'Название сессии',
    `status`      ENUM('waiting','playing','finished','cancelled')
                  NOT NULL DEFAULT 'waiting',
    `max_players` TINYINT UNSIGNED NOT NULL DEFAULT 4,
    `current_players` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `deck_type`   VARCHAR(50)   NOT NULL DEFAULT 'standard'  COMMENT 'Тип колоды',
    `created_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                               ON UPDATE CURRENT_TIMESTAMP,
    KEY `idx_sessions_name` (`name`),
    CHECK (`max_players` BETWEEN 2 AND 4)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------
-- 2. Игроки в сессии
-- ----------------------------------------
CREATE TABLE `players` (
    `id`          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `session_id`  BIGINT UNSIGNED NOT NULL,
    `nickname`    VARCHAR(30)     NOT NULL,
    `avatar`      VARCHAR(255)    DEFAULT NULL,
    `score`       INT             NOT NULL DEFAULT 0,
    `is_ready`    TINYINT(1)      NOT NULL DEFAULT 0,
    `joined_at`   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY `idx_players_session` (`session_id`),
    CONSTRAINT `fk_players_session`
        FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE KEY `uk_players_session_nickname` (`session_id`,`nickname`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------
-- 3. Типы карт (справочник колоды)
-- ----------------------------------------
CREATE TABLE `cards` (
    `id`         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `name`       VARCHAR(50)     NOT NULL,
    `suit`       VARCHAR(20)     DEFAULT NULL COMMENT 'Масть: hearts, diamonds, clubs, spades',
    `value`      VARCHAR(10)     NOT NULL COMMENT 'Значение: A, K, Q, J, 10 …',
    `power`      INT             NOT NULL DEFAULT 0 COMMENT 'Сила карты для сравнения',
    `image_url`  VARCHAR(255)    DEFAULT NULL,
    `created_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------
-- 4. Колода (набор карт для конкретной сессии)
-- ----------------------------------------
CREATE TABLE `decks` (
    `id`         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `session_id` BIGINT UNSIGNED NOT NULL,
    `type`       ENUM('main','discard','draw')
                 NOT NULL DEFAULT 'main',
    `card_id`    BIGINT UNSIGNED NOT NULL,
    `position`   INT             NOT NULL COMMENT 'Позиция в колоде / сбросе',
    `created_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY `idx_decks_session` (`session_id`),
    CONSTRAINT `fk_decks_session`
        FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_decks_card`
        FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------
-- 5. Карты в руке у игрока
-- ----------------------------------------
CREATE TABLE `player_cards` (
    `id`         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `player_id`  BIGINT UNSIGNED NOT NULL,
    `deck_id`    BIGINT UNSIGNED DEFAULT NULL COMMENT 'Откуда взята карта',
    `card_id`    BIGINT UNSIGNED NOT NULL,
    `hand_order` SMALLINT UNSIGNED DEFAULT NULL COMMENT 'Порядок в руке (NULL = не раздана)',
    `played_at`  DATETIME        DEFAULT NULL COMMENT 'Когда сыграна',
    `created_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY `idx_player_cards_player` (`player_id`),
    KEY `idx_player_cards_card`   (`card_id`),
    CONSTRAINT `fk_player_cards_player`
        FOREIGN KEY (`player_id`) REFERENCES `players`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_player_cards_deck`
        FOREIGN KEY (`deck_id`) REFERENCES `decks`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `fk_player_cards_card`
        FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------
-- 6. Раунды внутри сессии
-- ----------------------------------------
CREATE TABLE `rounds` (
    `id`            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `session_id`    BIGINT UNSIGNED NOT NULL,
    `round_number`  INT UNSIGNED NOT NULL COMMENT 'Номер раунда 1..N',
    `dealer_id`     BIGINT UNSIGNED DEFAULT NULL COMMENT 'Дилер текущего раунда',
    `started_at`    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `finished_at`   DATETIME       DEFAULT NULL,
    `status`        ENUM('pending','active','finished')
                    NOT NULL DEFAULT 'pending',
    KEY `idx_rounds_session` (`session_id`),
    CONSTRAINT `fk_rounds_session`
        FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_rounds_dealer`
        FOREIGN KEY (`dealer_id`) REFERENCES `players`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------
-- 7. Действия игроков в раунде
-- ----------------------------------------
CREATE TABLE `round_actions` (
    `id`          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `round_id`    BIGINT UNSIGNED NOT NULL,
    `player_id`   BIGINT UNSIGNED NOT NULL,
    `player_card_id` BIGINT UNSIGNED DEFAULT NULL COMMENT 'player_cards.id',
    `action_type` ENUM('play','pass','draw','discard')
                  NOT NULL,
    `played_at`   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `metadata`    JSON            DEFAULT NULL COMMENT 'Доп. данные (например, ID сыгранных карт)',
    KEY `idx_round_actions_round`   (`round_id`),
    KEY `idx_round_actions_player`  (`player_id`),
    CONSTRAINT `fk_round_actions_round`
        FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_round_actions_player`
        FOREIGN KEY (`player_id`) REFERENCES `players`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_round_actions_pcard`
        FOREIGN KEY (`player_card_id`) REFERENCES `player_cards`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
