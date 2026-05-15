<?php
declare(strict_types=1);

/**
 * Notification endpoints (drives the bell-icon dropdown):
 *   GET    /api/v1/notifications?unread_only=0  — list newest first (auth)
 *   DELETE /api/v1/notifications/{id}           — dismiss one (auth)
 *   DELETE /api/v1/notifications                — clear all (auth)
 *   PATCH  /api/v1/notifications/{id}/read      — mark as read (auth)
 *
 * Notifications are created by the scheduler and MQTT bridge — not by the
 * frontend. This controller is mostly read + delete.
 *
 * Auto-purge of rows older than 30 days happens in bin/scheduler.php.
 */
class NotificationController
{
    public function index(array $params): void
    {
        $user       = Auth::requireUser();
        $userId     = (int) $user['id'];
        $unreadOnly = Request::query('unread_only') === '1';

        $sql  = "SELECT * FROM notifications WHERE user_id = ?";
        $args = [$userId];
        if ($unreadOnly) {
            $sql .= " AND is_read = 0";
        }
        $sql .= " ORDER BY created_at DESC, id DESC LIMIT 100";

        $stmt = Database::pdo()->prepare($sql);
        $stmt->execute($args);
        $rows = $stmt->fetchAll();

        $stmt = Database::pdo()->prepare("
            SELECT COUNT(*) FROM notifications
            WHERE user_id = ? AND is_read = 0
        ");
        $stmt->execute([$userId]);
        $unreadCount = (int) $stmt->fetchColumn();

        Response::json([
            'notifications' => array_map([self::class, 'serialize'], $rows),
            'unreadCount'   => $unreadCount,
        ]);
    }

    public function destroy(array $params): void
    {
        $user = Auth::requireUser();
        $id   = (int) $params['id'];

        $stmt = Database::pdo()->prepare("
            DELETE FROM notifications WHERE id = ? AND user_id = ?
        ");
        $stmt->execute([$id, (int) $user['id']]);

        if ($stmt->rowCount() === 0) {
            Response::error('NOT_FOUND', 'Notification not found', 404);
        }

        Response::noContent();
    }

    public function destroyAll(array $params): void
    {
        $user = Auth::requireUser();

        $stmt = Database::pdo()->prepare("DELETE FROM notifications WHERE user_id = ?");
        $stmt->execute([(int) $user['id']]);

        Response::noContent();
    }

    public function markRead(array $params): void
    {
        $user = Auth::requireUser();
        $id   = (int) $params['id'];

        $check = Database::pdo()->prepare("
            SELECT id FROM notifications WHERE id = ? AND user_id = ? LIMIT 1
        ");
        $check->execute([$id, (int) $user['id']]);
        if (!$check->fetch()) {
            Response::error('NOT_FOUND', 'Notification not found', 404);
        }

        $upd = Database::pdo()->prepare("UPDATE notifications SET is_read = 1 WHERE id = ?");
        $upd->execute([$id]);

        Response::noContent();
    }

    private static function serialize(array $row): array
    {
        return [
            'id'                  => (int) $row['id'],
            'type'                => $row['type'],
            'title'               => $row['title'],
            'desc'                => $row['description'],
            'time'                => self::humanTime($row['created_at']),
            'createdAt'           => $row['created_at'],
            'isRead'              => (bool) $row['is_read'],
            'relatedMedicationId' => $row['related_medication_id'] !== null
                ? (int) $row['related_medication_id']
                : null,
            'relatedDoseEventId'  => $row['related_dose_event_id'] !== null
                ? (int) $row['related_dose_event_id']
                : null,
        ];
    }

    /**
     * Format a DATETIME column into the frontend-friendly string the bell
     * dropdown shows: "Today, 8:02 AM" / "Yesterday, 8:10 PM" / "May 4, 8:00 PM".
     */
    private static function humanTime(string $createdAt): string
    {
        $ts        = strtotime($createdAt);
        $datePart  = date('Y-m-d', $ts);
        $today     = date('Y-m-d');
        $yesterday = date('Y-m-d', strtotime('-1 day'));
        $clock     = date('g:i A', $ts);

        if ($datePart === $today) {
            return "Today, $clock";
        }
        if ($datePart === $yesterday) {
            return "Yesterday, $clock";
        }
        return date('M j', $ts) . ", $clock";
    }
}
