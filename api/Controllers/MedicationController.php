<?php
declare(strict_types=1);

require_once __DIR__ . '/../MqttPublisher.php';

/**
 * Medication endpoints:
 *   GET  /api/v1/medications              — return the 3 slot rows (auth)
 *   PUT  /api/v1/medications/{id}         — edit name/time/dosage (auth)
 *   POST /api/v1/medications/{id}/refill  — refill to 7 + tell Arduino + clear refill notifs
 *
 * Mid-day edit behaviour: when `time` changes, today's dose_event for this
 * medication is shifted to the new scheduled_at IF its status is still
 * `upcoming` or `pending`. Doses already `dispensed` or `missed` are left alone.
 */
class MedicationController
{
    public function index(array $params): void
    {
        $user = Auth::requireUser();

        $stmt = Database::pdo()->prepare("
            SELECT id, slot_number, name, dose_time, pills_per_dose, remaining_pills,
                   created_at, updated_at
            FROM medications
            WHERE user_id = ?
            ORDER BY slot_number
        ");
        $stmt->execute([(int) $user['id']]);
        $rows = $stmt->fetchAll();

        Response::json([
            'medications' => array_map([self::class, 'serialize'], $rows),
        ]);
    }

    public function update(array $params): void
    {
        $user = Auth::requireUser();
        $id   = (int) $params['id'];

        $stmt = Database::pdo()->prepare("
            SELECT * FROM medications WHERE id = ? AND user_id = ? LIMIT 1
        ");
        $stmt->execute([$id, (int) $user['id']]);
        $med = $stmt->fetch();
        if (!$med) {
            Response::error('NOT_FOUND', 'Medication not found', 404);
        }

        $body   = Request::jsonBody();
        $errors = [];

        $name = trim((string) ($body['name'] ?? ''));
        if ($name === '' || strlen($name) > 100) {
            $errors['name'] = 'Name must be 1–100 characters';
        }
        $time = (string) ($body['time'] ?? '');
        if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $time)) {
            $errors['time'] = 'Time must be HH:MM (24-hour)';
        }
        $dosage = filter_var(
            $body['dosage'] ?? null,
            FILTER_VALIDATE_INT,
            ['options' => ['min_range' => 1, 'max_range' => 10]]
        );
        if ($dosage === false) {
            $errors['dosage'] = 'Dosage must be 1–10';
        }

        if (!empty($errors)) {
            Response::error('VALIDATION_ERROR', 'One or more fields are invalid', 422, $errors);
        }

        $pdo = Database::pdo();
        $pdo->beginTransaction();
        try {
            $pdo->prepare("
                UPDATE medications
                SET name = ?, dose_time = ?, pills_per_dose = ?
                WHERE id = ?
            ")->execute([$name, $time . ':00', $dosage, $id]);

            // If the time changed, shift the time-of-day on every upcoming or
            // pending dose_event — today's row plus all future rows. Dispensed
            // and missed events are immutable (we never edit history).
            $newDoseTime = $time . ':00';
            if ($newDoseTime !== $med['dose_time']) {
                $pdo->prepare("
                    UPDATE dose_events
                    SET scheduled_at = CONCAT(DATE(scheduled_at), ' ', ?)
                    WHERE medication_id = ?
                      AND status IN ('upcoming', 'pending')
                      AND DATE(scheduled_at) >= CURDATE()
                ")->execute([$newDoseTime, $id]);
            }

            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        // Return the freshly updated row.
        $stmt = $pdo->prepare("SELECT * FROM medications WHERE id = ?");
        $stmt->execute([$id]);
        Response::json(['medication' => self::serialize($stmt->fetch())]);
    }

    /**
     * Refill — set remaining_pills back to 7, tell the Arduino to reset its
     * top-layer servo for this slot, and clear any outstanding "Refill needed"
     * notifications for this medication.
     */
    public function refill(array $params): void
    {
        $user = Auth::requireUser();
        $id   = (int) $params['id'];

        $pdo  = Database::pdo();
        $stmt = $pdo->prepare("
            SELECT id, slot_number FROM medications
            WHERE id = ? AND user_id = ? LIMIT 1
        ");
        $stmt->execute([$id, (int) $user['id']]);
        $med = $stmt->fetch();
        if (!$med) {
            Response::error('NOT_FOUND', 'Medication not found', 404);
        }

        $pdo->beginTransaction();
        try {
            $pdo->prepare("UPDATE medications SET remaining_pills = 7 WHERE id = ?")
                ->execute([$id]);

            // Clear any outstanding "Refill needed" notifications for this med.
            $pdo->prepare("
                DELETE FROM notifications
                WHERE user_id = ?
                  AND related_medication_id = ?
                  AND title = 'Refill needed'
            ")->execute([(int) $user['id'], $id]);

            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        // Tell the Arduino — fire-and-forget. If the broker is unreachable we
        // still consider the refill successful (DB is source of truth; user
        // can click again later to retry the device-side reset).
        $refillTopic = Database::config()['mqtt']['topics']['refill'] ?? 'pill/refill';
        $ok = MqttPublisher::publish($refillTopic, [
            'slot'      => (int) $med['slot_number'],
            'timestamp' => date('c'),
        ]);
        if (!$ok) {
            error_log("[refill] MQTT publish failed for med {$id} slot {$med['slot_number']} — DB updated anyway");
        }

        // Return the freshly updated row.
        $row = $pdo->prepare("SELECT * FROM medications WHERE id = ?");
        $row->execute([$id]);
        Response::json([
            'medication'    => self::serialize($row->fetch()),
            'mqttDelivered' => $ok,
        ]);
    }

    /**
     * Shape the medications.* row for the JSON API.
     * dose_time is stored as TIME (HH:MM:SS) but the frontend works in HH:MM.
     */
    private static function serialize(array $row): array
    {
        return [
            'id'             => (int) $row['id'],
            'slot'           => (int) $row['slot_number'],
            'name'           => $row['name'],
            'time'           => substr($row['dose_time'], 0, 5),
            'dosage'         => (int) $row['pills_per_dose'],
            'remainingPills' => (int) $row['remaining_pills'],
            'updatedAt'      => $row['updated_at'],
        ];
    }
}
