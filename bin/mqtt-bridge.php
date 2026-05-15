<?php
declare(strict_types=1);

/**
 * MedDrop MQTT bridge — long-running daemon.
 *
 * Subscribes to topics published by the Arduino dispenser and writes the
 * resulting state changes directly to MariaDB. No HTTP hop — the bridge runs
 * on the same Pi as the database, so going through the REST API would just
 * add latency and a failure surface.
 *
 * Topics handled (configurable in config/config.php → mqtt.topics):
 *   pill/status  — dispense confirmation                → mark dose dispensed + notification
 *   pill/error   — dispense failure                     → log + warning notification
 *   rfid/scan    — RFID card was presented              → audit log
 *
 * Run manually (dev):
 *   php bin/mqtt-bridge.php
 *
 * Pi production (systemd unit example — /etc/systemd/system/meddrop-mqtt.service):
 *   [Unit]
 *   Description=MedDrop MQTT bridge
 *   After=network.target mariadb.service mosquitto.service
 *
 *   [Service]
 *   Type=simple
 *   ExecStart=/usr/bin/php /home/pi/meddrop/bin/mqtt-bridge.php
 *   Restart=always
 *   RestartSec=5
 *   User=pi
 *
 *   [Install]
 *   WantedBy=multi-user.target
 *
 * Then: sudo systemctl enable --now meddrop-mqtt
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("MQTT bridge is CLI-only.\n");
}

require_once __DIR__ . '/../api/Database.php';
require_once __DIR__ . '/../api/Request.php';
require_once __DIR__ . '/../api/Response.php';

date_default_timezone_set(Database::config()['app']['timezone']);

$cfg    = Database::config()['mqtt'];
$topics = [
    $cfg['topics']['dispense_status'],
    $cfg['topics']['dispense_error'],
    $cfg['topics']['rfid_scan'],
];

// Build the mosquitto_sub command. -F '%j' emits one JSON envelope per line:
//   {"tst":"...","topic":"...","qos":1,"retain":0,"payloadlen":N,"payload":"<json>"}
// This is safer than '%t %p' because payload bytes are JSON-escaped.
$parts = [
    'mosquitto_sub',
    '-h', escapeshellarg($cfg['host']),
    '-p', (string) (int) $cfg['port'],
    '-q', '1',
    // Do not escapeshellarg '%j'. On Windows, escapeshellarg replaces % with
    // a space, turning '%j' into ' j' and breaking the JSON envelope parser
    // below. '%j' has no shell-special meaning when passed bare.
    '-F', '%j',
];
foreach ($topics as $t) {
    $parts[] = '-t';
    $parts[] = escapeshellarg($t);
}
if (!empty($cfg['username'])) {
    $parts[] = '-u';
    $parts[] = escapeshellarg($cfg['username']);
    if (!empty($cfg['password'])) {
        $parts[] = '-P';
        $parts[] = escapeshellarg($cfg['password']);
    }
}

$cmd = implode(' ', $parts);
log_line('Starting subscriber: ' . $cmd);

$proc = popen($cmd, 'r');
if (!$proc) {
    fwrite(STDERR, "Failed to start mosquitto_sub. Is it installed?\n");
    exit(1);
}

while (!feof($proc)) {
    $line = fgets($proc);
    if ($line === false) {
        continue;
    }
    $line = trim($line);
    if ($line === '') {
        continue;
    }

    $envelope = json_decode($line, true);
    if (!is_array($envelope) || !isset($envelope['topic'], $envelope['payload'])) {
        log_line('Skipping bad envelope: ' . $line);
        continue;
    }

    $topic   = (string) $envelope['topic'];
    $payload = json_decode((string) $envelope['payload'], true);
    if (!is_array($payload)) {
        log_line("Bad JSON payload on $topic: " . $envelope['payload']);
        continue;
    }

    try {
        dispatch($topic, $payload);
    } catch (Throwable $e) {
        log_line("Handler error on $topic: " . $e->getMessage());
    }
}

pclose($proc);
log_line('Subscriber exited');

// -----------------------------------------------------------------------------

function dispatch(string $topic, array $payload): void
{
    $topics = Database::config()['mqtt']['topics'];
    switch ($topic) {
        case $topics['dispense_status']:
            handle_dispense_status($payload);
            break;
        case $topics['dispense_error']:
            handle_dispense_error($payload);
            break;
        case $topics['rfid_scan']:
            handle_rfid_scan($payload);
            break;
        default:
            log_line("Unknown topic: $topic");
    }
}

/**
 * Arduino confirmed a successful dispense.
 * Expected payload: { doseEventId, slot, status:"dispensed", pills_dispensed?, timestamp }
 */
function handle_dispense_status(array $data): void
{
    $doseEventId = (int) ($data['doseEventId'] ?? 0);
    if ($doseEventId <= 0) {
        log_line('Missing doseEventId in dispense status');
        return;
    }

    $pdo  = Database::pdo();
    $stmt = $pdo->prepare("
        SELECT de.id, de.user_id, de.medication_id, de.scheduled_at, de.status,
               m.name AS med_name, m.remaining_pills, m.pills_per_dose
        FROM dose_events de
        JOIN medications m ON m.id = de.medication_id
        WHERE de.id = ?
    ");
    $stmt->execute([$doseEventId]);
    $event = $stmt->fetch();

    if (!$event) {
        log_line("Unknown dose_event $doseEventId");
        return;
    }
    if ($event['status'] === 'dispensed') {
        log_line("dose_event $doseEventId already dispensed — ignoring duplicate");
        return;
    }

    $pillsDispensed = (int) ($data['pills_dispensed'] ?? $event['pills_per_dose']);
    $pillsDispensed = max(0, min(10, $pillsDispensed));

    $pdo->beginTransaction();
    try {
        $pdo->prepare("
            UPDATE dose_events
            SET status = 'dispensed', dispensed_at = NOW(), pills_dispensed = ?
            WHERE id = ?
        ")->execute([$pillsDispensed, $doseEventId]);

        $newRemaining = max(0, (int) $event['remaining_pills'] - $pillsDispensed);
        $pdo->prepare("
            UPDATE medications SET remaining_pills = ? WHERE id = ?
        ")->execute([$newRemaining, (int) $event['medication_id']]);

        $clock = date('g:i A');
        $title = $event['med_name'] . ' dispensed';
        $desc  = period_label($event['scheduled_at']) . " dose at $clock";

        $pdo->prepare("
            INSERT INTO notifications
                (user_id, type, title, description, related_medication_id, related_dose_event_id)
            VALUES (?, 'success', ?, ?, ?, ?)
        ")->execute([
            (int) $event['user_id'], $title, $desc,
            (int) $event['medication_id'], $doseEventId,
        ]);

        $pdo->prepare("
            INSERT INTO device_events (event_type, medication_id, payload_json)
            VALUES ('dispense_ok', ?, ?)
        ")->execute([(int) $event['medication_id'], json_encode($data)]);

        $pdo->commit();
        log_line("dispense_ok dose_event=$doseEventId remaining={$newRemaining}");
    } catch (Throwable $e) {
        $pdo->rollBack();
        log_line('Failed to process dispense_ok: ' . $e->getMessage());
    }
}

/**
 * Arduino reported a dispense failure (jam, no pill detected, etc).
 * Expected payload: { doseEventId, slot, reason, timestamp }
 *
 * Does NOT flip the dose to 'missed' here — the scheduler will do that after
 * the miss window expires. The bridge just records the error and notifies.
 */
function handle_dispense_error(array $data): void
{
    $doseEventId = (int) ($data['doseEventId'] ?? 0);
    $reason      = (string) ($data['reason'] ?? 'unknown');

    if ($doseEventId <= 0) {
        log_line('Missing doseEventId in dispense error');
        return;
    }

    $pdo  = Database::pdo();
    $stmt = $pdo->prepare("
        SELECT de.user_id, de.medication_id, m.name AS med_name
        FROM dose_events de
        JOIN medications m ON m.id = de.medication_id
        WHERE de.id = ?
    ");
    $stmt->execute([$doseEventId]);
    $event = $stmt->fetch();
    if (!$event) {
        log_line("Unknown dose_event $doseEventId in dispense_error");
        return;
    }

    $pdo->prepare("
        INSERT INTO notifications
            (user_id, type, title, description, related_medication_id, related_dose_event_id)
        VALUES (?, 'warning', 'Dispense issue', ?, ?, ?)
    ")->execute([
        (int) $event['user_id'],
        $event['med_name'] . ' — ' . $reason,
        (int) $event['medication_id'],
        $doseEventId,
    ]);

    $pdo->prepare("
        INSERT INTO device_events (event_type, medication_id, payload_json)
        VALUES ('dispense_fail', ?, ?)
    ")->execute([(int) $event['medication_id'], json_encode($data)]);

    log_line("dispense_fail dose_event=$doseEventId reason=$reason");
}

/**
 * RFID card scanned. For now, audit only — the Arduino itself enforces RFID
 * authorization before dispensing. Future work: cross-check rfid_uid against
 * users.rfid_uid and emit a security notification on mismatch.
 *
 * Expected payload: { rfid_uid, timestamp }
 */
function handle_rfid_scan(array $data): void
{
    $rfidUid = (string) ($data['rfid_uid'] ?? '');
    Database::pdo()->prepare("
        INSERT INTO device_events (event_type, payload_json)
        VALUES ('rfid_scan', ?)
    ")->execute([json_encode($data)]);
    log_line("rfid_scan uid=$rfidUid");
}

// -----------------------------------------------------------------------------

function period_label(string $scheduledAt): string
{
    $hour = (int) date('G', strtotime($scheduledAt));
    if ($hour < 12) return 'Morning';
    if ($hour < 18) return 'Afternoon';
    return 'Evening';
}

function log_line(string $msg): void
{
    fwrite(STDOUT, '[mqtt-bridge ' . date('H:i:s') . '] ' . $msg . "\n");
}
