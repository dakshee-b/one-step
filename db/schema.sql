-- MedDrop Pill Dispenser — MariaDB schema
-- Target: MariaDB 10.5+ (Raspberry Pi 5 / macOS dev)
-- Charset: utf8mb4, Engine: InnoDB, Timezone: America/Toronto (set per-connection in PHP)
--
-- Apply with:
--   mysql -u root -p < db/schema.sql
--
-- Drops and recreates the meddrop database from scratch. Do NOT run on production
-- data without a backup.

DROP DATABASE IF EXISTS meddrop;
CREATE DATABASE meddrop CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE meddrop;

-- ---------------------------------------------------------------------------
-- users — single-user device, but table supports the standard multi-row shape
-- for future-proofing. Registration endpoint enforces "max 1 row".
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id                  INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  username            VARCHAR(50)       NOT NULL,
  password_hash       VARCHAR(255)      NOT NULL,
  age                 TINYINT UNSIGNED  NOT NULL,
  medical_history     TEXT              NOT NULL,
  caregiver_name      VARCHAR(100)      NOT NULL,
  allergies           TEXT              NULL,
  rfid_uid            VARCHAR(32)       NOT NULL,
  profile_photo_path  VARCHAR(255)      NULL,
  created_at          DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP
                                                 ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username),
  UNIQUE KEY uq_users_rfid_uid (rfid_uid),
  CONSTRAINT chk_users_age CHECK (age BETWEEN 1 AND 120)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- medications — exactly 3 rows per user, one per hardware slot.
-- Slot capacity = 7 pills (3 slots × 7 = 21 system total).
-- ---------------------------------------------------------------------------
CREATE TABLE medications (
  id                INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  user_id           INT UNSIGNED      NOT NULL,
  slot_number       TINYINT UNSIGNED  NOT NULL,
  name              VARCHAR(100)      NOT NULL,
  dose_time         TIME              NOT NULL,
  pills_per_dose    TINYINT UNSIGNED  NOT NULL,
  remaining_pills   TINYINT UNSIGNED  NOT NULL DEFAULT 7,
  created_at        DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP
                                               ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_medications_user_slot (user_id, slot_number),
  CONSTRAINT fk_medications_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_medications_slot CHECK (slot_number BETWEEN 1 AND 3),
  CONSTRAINT chk_medications_dose CHECK (pills_per_dose BETWEEN 1 AND 10),
  CONSTRAINT chk_medications_remaining CHECK (remaining_pills BETWEEN 0 AND 7)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- dose_events — source of truth for adherence (weekly/monthly views) and
-- the per-medication status badge on the dashboard.
-- One row per scheduled dose per day, created by the scheduler.
--
-- State machine:
--   upcoming  → pending     (T − 30 min)
--   pending   → dispensed   (MQTT confirmation)
--   pending   → missed      (T + 30 min, no confirmation)
-- ---------------------------------------------------------------------------
CREATE TABLE dose_events (
  id               INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  user_id          INT UNSIGNED      NOT NULL,
  medication_id    INT UNSIGNED      NOT NULL,
  scheduled_at     DATETIME          NOT NULL,
  status           ENUM('upcoming','pending','dispensed','missed')
                                     NOT NULL DEFAULT 'upcoming',
  command_sent_at  DATETIME          NULL,
  dispensed_at     DATETIME          NULL,
  pills_dispensed  TINYINT UNSIGNED  NULL,
  created_at       DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP
                                              ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_dose_events_med_time (medication_id, scheduled_at),
  KEY idx_dose_events_user_time (user_id, scheduled_at),
  KEY idx_dose_events_status (status),
  CONSTRAINT fk_dose_events_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_dose_events_medication FOREIGN KEY (medication_id)
    REFERENCES medications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- notifications — drives the bell dropdown in the dashboard header.
-- Types map 1:1 to frontend colour bands (success/info/warning/danger).
-- Auto-purged after 30 days by scheduler.
-- ---------------------------------------------------------------------------
CREATE TABLE notifications (
  id                    INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  user_id               INT UNSIGNED  NOT NULL,
  type                  ENUM('success','info','warning','danger') NOT NULL,
  title                 VARCHAR(150)  NOT NULL,
  description           VARCHAR(255)  NOT NULL,
  related_medication_id INT UNSIGNED  NULL,
  related_dose_event_id INT UNSIGNED  NULL,
  is_read               TINYINT(1)    NOT NULL DEFAULT 0,
  created_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notifications_user_created (user_id, created_at DESC),
  KEY idx_notifications_created (created_at),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_medication FOREIGN KEY (related_medication_id)
    REFERENCES medications(id) ON DELETE SET NULL,
  CONSTRAINT fk_notifications_dose_event FOREIGN KEY (related_dose_event_id)
    REFERENCES dose_events(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- sessions — opaque server-issued tokens (256-bit hex). Simpler than JWT
-- for a single-Pi deployment; revocation is just a DELETE.
-- ---------------------------------------------------------------------------
CREATE TABLE sessions (
  id          CHAR(64)      NOT NULL,
  user_id     INT UNSIGNED  NOT NULL,
  expires_at  DATETIME      NOT NULL,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sessions_user (user_id),
  KEY idx_sessions_expires (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- device_events — audit log of raw MQTT traffic from the Arduino.
-- Optional but useful for debugging hardware misbehaviour.
-- ---------------------------------------------------------------------------
CREATE TABLE device_events (
  id             BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  event_type     VARCHAR(40)      NOT NULL,
  medication_id  INT UNSIGNED     NULL,
  payload_json   JSON             NOT NULL,
  created_at     DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_device_events_type_created (event_type, created_at),
  CONSTRAINT fk_device_events_medication FOREIGN KEY (medication_id)
    REFERENCES medications(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
