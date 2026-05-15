<?php
declare(strict_types=1);

/**
 * MedDrop scheduler — invoked by cron every minute.
 *
 * Responsibilities (in order, each run):
 *   1. Generate dose_events for today + 6 days ahead   (no backfill of past doses)
 *   2. Transition upcoming → pending   at  T − 30 min  (create info notification)
 *   3. Publish MQTT dispense command   at  T + 0       (mark command_sent_at)
 *   4. Transition pending → missed     at  T + 30 min  (create warning notification)
 *   5. Create refill notifications when remaining_pills ≤ threshold (max 1/day per slot)
 *   6. Auto-purge notifications older than 30 days
 *   7. Auto-purge expired sessions
 *
 * Run manually:
 *   php bin/scheduler.php
 *
 * Cron (Mac dev or Pi production):
 *   * * * * * /usr/bin/php /path/to/meddrop/bin/scheduler.php >> /var/log/meddrop-scheduler.log 2>&1
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("Scheduler is CLI-only.\n");
}

require_once __DIR__ . '/../api/Database.php';
require_once __DIR__ . '/../api/MqttPublisher.php';
require_once __DIR__ . '/../api/Request.php';
require_once __DIR__ . '/../api/Response.php';
require_once __DIR__ . '/../api/Auth.php';

date_default_timezone_set(Database::config()['app']['timezone']);

$start = microtime(true);
log_line('Tick start ' . date('Y-m-d H:i:s'));

try {
    $generated   = generate_future_dose_events(7);
    $toPending   = transition_upcoming_to_pending();
    $dispatched  = dispatch_due_doses();
    $missed      = mark_missed_doses();
    $refill      = create_refill_notifications();
    $purgedNotif = purge_old_notifications();
    $purgedSess  = Auth::purgeExpired();

    log_line(sprintf(
        'Done in %dms: generated=%d →pending=%d dispatched=%d →missed=%d refill=%d purgedNotif=%d purgedSess=%d',
        (int) ((microtime(true) - $start) * 1000),
        $generated, $toPending, $dispatched, $missed, $refill, $purgedNotif, $purgedSess
    ));
} catch (Throwable $e) {
    log_line('ERROR: ' . $e->getMessage());
    log_line($e->getTraceAsString());
    exit(1);
}

// -----------------------------------------------------------------------------
// 1. Generate dose_events for today + N days forward.
//    Past doses are NOT backfilled (per project decision).
// -----------------------------------------------------------------------------
function generate_future_dose_events(int $daysAhead): int
{
    $pdo  = Database::pdo();
    $rows = $pdo->query("SELECT id, user_id, dose_time FROM medications")->fetchAll();

    if (empty($rows)) {
        return 0;
    }

    $insert = $pdo->prepare("
        INSERT IGNORE INTO dose_events (user_id, medication_id, scheduled_at, status)
        VALUES (?, ?, ?, 'upcoming')
    ");

    $created = 0;
    $now     = time();
    for ($i = 0; $i <= $daysAhead; $i++) {
        $date = date('Y-m-d', strtotime("+$i days"));
        foreach ($rows as $med) {
            $scheduledAt = $date . ' ' . $med['dose_time'];
            if (strtotime($scheduledAt) < $now) {
                // No backfill — skip doses whose scheduled time has already passed.
                continue;
            }
            $insert->execute([$med['user_id'], $med['id'], $scheduledAt]);
            $created += $insert->rowCount();
        }
    }
    return $created;
}

// -----------------------------------------------------------------------------
// 2. upcoming → pending when within the reminder window.
//    Creates an info notification: "Upcoming dose in X min".
// -----------------------------------------------------------------------------
function transition_upcoming_to_pending(): int
{
    $pdo    = Database::pdo();
    $window = (int) Database::config()['scheduler']['upcoming_window_minutes'];

    $stmt = $pdo->prepare("
        SELECT de.id, de.user_id, de.medication_id, de.scheduled_at, m.name
        FROM dose_events de
        JOIN medications m ON m.id = de.medication_id
        WHERE de.status = 'upcoming'
          AND de.scheduled_at <= DATE_ADD(NOW(), INTERVAL ? MINUTE)
    ");
    $stmt->execute([$window]);
    $events = $stmt->fetchAll();
    if (empty($events)) {
        return 0;
    }

    $upd = $pdo->prepare("UPDATE dose_events SET status = 'pending' WHERE id = ?");
    $notif = $pdo->prepare("
        INSERT INTO notifications
            (user_id, type, title, description, related_medication_id, related_dose_event_id)
        VALUES (?, 'info', ?, ?, ?, ?)
    ");

    foreach ($events as $e) {
        $upd->execute([$e['id']]);

        $minutesLeft = (int) round((strtotime($e['scheduled_at']) - time()) / 60);
        $clock       = date('g:i A', strtotime($e['scheduled_at']));
        $title       = $minutesLeft > 0
            ? "Upcoming dose in $minutesLeft min"
            : "Time to take your dose";
        $desc        = $e['name'] . " — at $clock";

        $notif->execute([
            (int) $e['user_id'], $title, $desc, (int) $e['medication_id'], (int) $e['id'],
        ]);
    }
    return count($events);
}

// -----------------------------------------------------------------------------
// 3. Publish MQTT dispense command for any pending dose past its scheduled time
//    where the command has not yet been sent. Marks command_sent_at on success.
// -----------------------------------------------------------------------------
function dispatch_due_doses(): int
{
    $pdo   = Database::pdo();
    $topic = Database::config()['mqtt']['topics']['dispense_command'];

    // Dispatch 3 minutes BEFORE scheduled_at so the Arduino's prenotice (60s) +
    // ready-hold (120s) lands the AUTH prompt at the actual scheduled time.
    $stmt = $pdo->prepare("
        SELECT de.id, de.user_id, m.id AS medication_id, m.slot_number, m.name, m.pills_per_dose,
               u.rfid_uid
        FROM dose_events de
        JOIN medications m ON m.id = de.medication_id
        JOIN users u       ON u.id = de.user_id
        WHERE de.status = 'pending'
          AND de.command_sent_at IS NULL
          AND de.scheduled_at <= DATE_ADD(NOW(), INTERVAL 3 MINUTE)
    ");
    $stmt->execute();
    $events = $stmt->fetchAll();
    if (empty($events)) {
        return 0;
    }

    $markSent = $pdo->prepare("UPDATE dose_events SET command_sent_at = NOW() WHERE id = ?");

    $sent = 0;
    foreach ($events as $e) {
        $ok = MqttPublisher::publish($topic, [
            'doseEventId' => (int) $e['id'],
            'slot'        => (int) $e['slot_number'],
            'pill'        => $e['name'],
            'count'       => (int) $e['pills_per_dose'],
            'rfid_uid'    => (string) $e['rfid_uid'],
            'timestamp'   => date('c'),
        ]);
        if ($ok) {
            $markSent->execute([$e['id']]);
            $sent++;
        }
        // If MQTT failed, leave command_sent_at NULL — next tick will retry.
    }
    return $sent;
}

// -----------------------------------------------------------------------------
// 4. pending → missed once past the miss window with no confirmation.
//    Creates a warning notification.
// -----------------------------------------------------------------------------
function mark_missed_doses(): int
{
    $pdo  = Database::pdo();
    $miss = (int) Database::config()['scheduler']['miss_window_minutes'];

    $stmt = $pdo->prepare("
        SELECT de.id, de.user_id, de.medication_id, de.scheduled_at, m.name
        FROM dose_events de
        JOIN medications m ON m.id = de.medication_id
        WHERE de.status = 'pending'
          AND de.scheduled_at <= DATE_SUB(NOW(), INTERVAL ? MINUTE)
    ");
    $stmt->execute([$miss]);
    $events = $stmt->fetchAll();
    if (empty($events)) {
        return 0;
    }

    $upd   = $pdo->prepare("UPDATE dose_events SET status = 'missed' WHERE id = ?");
    $notif = $pdo->prepare("
        INSERT INTO notifications
            (user_id, type, title, description, related_medication_id, related_dose_event_id)
        VALUES (?, 'warning', 'Missed dose', ?, ?, ?)
    ");

    foreach ($events as $e) {
        $upd->execute([$e['id']]);
        $clock = date('g:i A', strtotime($e['scheduled_at']));
        $desc  = $e['name'] . " — at $clock";
        $notif->execute([
            (int) $e['user_id'], $desc, (int) $e['medication_id'], (int) $e['id'],
        ]);
    }
    return count($events);
}

// -----------------------------------------------------------------------------
// 5. Refill notifications — emitted at most once per slot per day.
// -----------------------------------------------------------------------------
function create_refill_notifications(): int
{
    $pdo       = Database::pdo();
    $threshold = (int) Database::config()['capacity']['refill_threshold'];

    $stmt = $pdo->prepare("
        SELECT id, user_id, name, slot_number, remaining_pills
        FROM medications
        WHERE remaining_pills <= ?
    ");
    $stmt->execute([$threshold]);
    $meds = $stmt->fetchAll();
    if (empty($meds)) {
        return 0;
    }

    $today  = date('Y-m-d');
    $check  = $pdo->prepare("
        SELECT 1 FROM notifications
        WHERE user_id = ?
          AND type = 'danger'
          AND title = 'Refill needed'
          AND related_medication_id = ?
          AND DATE(created_at) = ?
        LIMIT 1
    ");
    $insert = $pdo->prepare("
        INSERT INTO notifications
            (user_id, type, title, description, related_medication_id)
        VALUES (?, 'danger', 'Refill needed', ?, ?)
    ");

    $created = 0;
    foreach ($meds as $m) {
        $check->execute([(int) $m['user_id'], (int) $m['id'], $today]);
        if ($check->fetch()) {
            continue;
        }
        $desc = sprintf(
            '%s: only %d pill%s left in slot %d',
            $m['name'],
            (int) $m['remaining_pills'],
            ((int) $m['remaining_pills'] === 1) ? '' : 's',
            (int) $m['slot_number']
        );
        $insert->execute([(int) $m['user_id'], $desc, (int) $m['id']]);
        $created++;
    }
    return $created;
}

// -----------------------------------------------------------------------------
// 6. Auto-purge notifications older than the configured retention.
// -----------------------------------------------------------------------------
function purge_old_notifications(): int
{
    $days = (int) Database::config()['scheduler']['notification_retention_days'];
    $stmt = Database::pdo()->prepare("
        DELETE FROM notifications
        WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
    ");
    $stmt->execute([$days]);
    return $stmt->rowCount();
}

// -----------------------------------------------------------------------------
function log_line(string $msg): void
{
    fwrite(STDOUT, '[scheduler] ' . $msg . "\n");
}
