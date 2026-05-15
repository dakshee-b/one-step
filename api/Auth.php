<?php
declare(strict_types=1);

/**
 * Authentication helpers — session-token based.
 *
 * A session is a 64-char hex token stored in the `sessions` table. The frontend
 * sends it in the `Authorization: Bearer <token>` header on every authenticated
 * request.
 */
class Auth
{
    /**
     * Validate the Bearer token and return the user row.
     * Sends 401 and exits if the token is missing, invalid, or expired.
     */
    public static function requireUser(): array
    {
        $user = self::currentUser();
        if ($user === null) {
            Response::error('UNAUTHORIZED', 'Authentication required', 401);
        }
        return $user;
    }

    /**
     * Return the current user row, or null if unauthenticated.
     */
    public static function currentUser(): ?array
    {
        $token = Request::bearerToken();
        if ($token === null) {
            return null;
        }

        $stmt = Database::pdo()->prepare("
            SELECT u.*
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.id = ? AND s.expires_at > NOW()
            LIMIT 1
        ");
        $stmt->execute([$token]);
        $user = $stmt->fetch();
        return $user ?: null;
    }

    /**
     * Issue a new session for the given user. Returns the token + lifetime.
     */
    public static function createSession(int $userId): array
    {
        $cfg = Database::config();
        $token = bin2hex(random_bytes(32));
        $lifetimeDays = (int) $cfg['app']['session_lifetime_days'];

        $stmt = Database::pdo()->prepare("
            INSERT INTO sessions (id, user_id, expires_at)
            VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))
        ");
        $stmt->execute([$token, $userId, $lifetimeDays]);

        return [
            'token'           => $token,
            'expires_in_days' => $lifetimeDays,
        ];
    }

    public static function deleteSession(string $token): void
    {
        $stmt = Database::pdo()->prepare("DELETE FROM sessions WHERE id = ?");
        $stmt->execute([$token]);
    }

    /**
     * Remove expired sessions. Called from the scheduler cron.
     */
    public static function purgeExpired(): int
    {
        $stmt = Database::pdo()->prepare("DELETE FROM sessions WHERE expires_at <= NOW()");
        $stmt->execute();
        return $stmt->rowCount();
    }

    /**
     * Serialize a user row for API responses. Strips password_hash and converts
     * the stored photo filename into a public URL.
     */
    public static function publicUserRow(array $user): array
    {
        $cfg = Database::config();
        $photoUrl = null;
        if (!empty($user['profile_photo_path'])) {
            $photoUrl = $cfg['uploads']['photo_url_prefix'] . '/' . basename($user['profile_photo_path']);
        }
        return [
            'id'              => (int) $user['id'],
            'username'        => $user['username'],
            'age'             => (int) $user['age'],
            'medicalHistory'  => $user['medical_history'],
            'caregiverName'   => $user['caregiver_name'],
            'allergies'       => $user['allergies'],
            'rfidUid'         => $user['rfid_uid'],
            'profilePhotoUrl' => $photoUrl,
            'createdAt'       => $user['created_at'],
        ];
    }
}
