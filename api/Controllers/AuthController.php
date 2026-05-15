<?php
declare(strict_types=1);

/**
 * Auth endpoints:
 *   GET    /api/v1/auth/status   — has any user registered yet? (public)
 *   POST   /api/v1/auth/register — create the single-device user + 3 medications (public)
 *   POST   /api/v1/auth/login    — exchange username/password for a session token (public)
 *   POST   /api/v1/auth/logout   — invalidate the bearer token (auth)
 *   GET    /api/v1/auth/me       — return the current user (auth)
 */
class AuthController
{
    /**
     * GET /auth/status
     * Public. Frontend calls this on app load to decide between Login and Register.
     */
    public function status(array $params): void
    {
        $count = (int) Database::pdo()
            ->query("SELECT COUNT(*) FROM users")
            ->fetchColumn();
        Response::json(['registered' => $count > 0]);
    }

    /**
     * POST /auth/register
     * Public. Single-user device — rejects if a user already exists.
     *
     * Expected body:
     * {
     *   "username": "grahesha",
     *   "password": "min6chars",
     *   "age": 40,
     *   "medicalHistory": "diabetes",
     *   "caregiverName": "dakshee",
     *   "allergies": "panadol" | null,
     *   "rfidUid": "A1B2-C3D4",
     *   "medications": [
     *     { "slot": 1, "name": "Vitamin C", "time": "08:00", "dosage": 1 },
     *     { "slot": 2, "name": "Vitamin D", "time": "14:00", "dosage": 1 },
     *     { "slot": 3, "name": "Vitamin A", "time": "20:00", "dosage": 1 }
     *   ]
     * }
     */
    public function register(array $params): void
    {
        $pdo = Database::pdo();

        // Single-user device guard.
        $count = (int) $pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();
        if ($count > 0) {
            Response::error(
                'ALREADY_REGISTERED',
                'This device is already registered. Only one account is supported.',
                409
            );
        }

        $body = Request::jsonBody();
        $errors = [];

        // ----- Account credentials -----
        $username = trim((string) ($body['username'] ?? ''));
        if ($username === '' || strlen($username) > 50) {
            $errors['username'] = 'Username must be 1–50 characters';
        }
        $password = (string) ($body['password'] ?? '');
        if (strlen($password) < 6) {
            $errors['password'] = 'Password must be at least 6 characters';
        }

        // ----- Personal info -----
        $age = filter_var(
            $body['age'] ?? null,
            FILTER_VALIDATE_INT,
            ['options' => ['min_range' => 1, 'max_range' => 120]]
        );
        if ($age === false) {
            $errors['age'] = 'Age must be an integer between 1 and 120';
        }
        $medicalHistory = trim((string) ($body['medicalHistory'] ?? ''));
        if ($medicalHistory === '') {
            $errors['medicalHistory'] = 'Medical history is required';
        }
        $caregiverName = trim((string) ($body['caregiverName'] ?? ''));
        if ($caregiverName === '' || strlen($caregiverName) > 100) {
            $errors['caregiverName'] = 'Caregiver name must be 1–100 characters';
        }
        $allergies = isset($body['allergies']) ? trim((string) $body['allergies']) : null;
        if ($allergies === '') {
            $allergies = null;
        }
        $rfidUid = trim((string) ($body['rfidUid'] ?? ''));
        if ($rfidUid === '' || strlen($rfidUid) > 32 || !preg_match('/^[A-Fa-f0-9-]+$/', $rfidUid)) {
            $errors['rfidUid'] = 'RFID UID must be hex characters (and optional dashes), 1–32 chars';
        }

        // ----- Medications: exactly 3, slots 1/2/3 -----
        $meds = $body['medications'] ?? null;
        if (!is_array($meds) || count($meds) !== 3) {
            $errors['medications'] = 'Exactly 3 medications are required';
        } else {
            $seenSlots = [];
            foreach ($meds as $idx => $med) {
                $p = "medications[$idx]";
                if (!is_array($med)) {
                    $errors[$p] = 'Must be an object';
                    continue;
                }
                $slot = filter_var(
                    $med['slot'] ?? null,
                    FILTER_VALIDATE_INT,
                    ['options' => ['min_range' => 1, 'max_range' => 3]]
                );
                if ($slot === false) {
                    $errors["$p.slot"] = 'Slot must be 1, 2, or 3';
                } elseif (isset($seenSlots[$slot])) {
                    $errors["$p.slot"] = "Slot $slot is duplicated";
                } else {
                    $seenSlots[$slot] = true;
                }
                $name = trim((string) ($med['name'] ?? ''));
                if ($name === '' || strlen($name) > 100) {
                    $errors["$p.name"] = 'Name must be 1–100 characters';
                }
                $time = (string) ($med['time'] ?? '');
                if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $time)) {
                    $errors["$p.time"] = 'Time must be HH:MM (24-hour)';
                }
                $dosage = filter_var(
                    $med['dosage'] ?? null,
                    FILTER_VALIDATE_INT,
                    ['options' => ['min_range' => 1, 'max_range' => 10]]
                );
                if ($dosage === false) {
                    $errors["$p.dosage"] = 'Dosage must be 1–10';
                }
            }
        }

        if (!empty($errors)) {
            Response::error('VALIDATION_ERROR', 'One or more fields are invalid', 422, $errors);
        }

        // ----- Persist -----
        $cfg        = Database::config();
        $maxPerSlot = (int) $cfg['capacity']['pills_per_slot'];

        $pdo->beginTransaction();
        try {
            $userStmt = $pdo->prepare("
                INSERT INTO users
                    (username, password_hash, age, medical_history, caregiver_name, allergies, rfid_uid)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ");
            $userStmt->execute([
                $username,
                password_hash($password, PASSWORD_BCRYPT),
                $age,
                $medicalHistory,
                $caregiverName,
                $allergies,
                $rfidUid,
            ]);
            $userId = (int) $pdo->lastInsertId();

            $medStmt = $pdo->prepare("
                INSERT INTO medications
                    (user_id, slot_number, name, dose_time, pills_per_dose, remaining_pills)
                VALUES (?, ?, ?, ?, ?, ?)
            ");
            foreach ($meds as $med) {
                $medStmt->execute([
                    $userId,
                    (int) $med['slot'],
                    trim((string) $med['name']),
                    $med['time'] . ':00',  // HH:MM → HH:MM:SS
                    (int) $med['dosage'],
                    $maxPerSlot,           // slots start full
                ]);
            }

            $pdo->commit();
        } catch (PDOException $e) {
            $pdo->rollBack();
            if ($e->getCode() === '23000') {
                Response::error('CONFLICT', 'Username or RFID already in use', 409);
            }
            throw $e;
        }

        // Issue session and return.
        $session = Auth::createSession($userId);
        $stmt = $pdo->prepare("SELECT * FROM users WHERE id = ?");
        $stmt->execute([$userId]);
        $userRow = $stmt->fetch();

        Response::created([
            'user'          => Auth::publicUserRow($userRow),
            'token'         => $session['token'],
            'expiresInDays' => $session['expires_in_days'],
        ]);
    }

    /**
     * POST /auth/login
     */
    public function login(array $params): void
    {
        $body     = Request::jsonBody();
        $username = trim((string) ($body['username'] ?? ''));
        $password = (string) ($body['password'] ?? '');

        if ($username === '' || $password === '') {
            Response::error('VALIDATION_ERROR', 'Username and password are required', 422);
        }

        $stmt = Database::pdo()->prepare("SELECT * FROM users WHERE username = ? LIMIT 1");
        $stmt->execute([$username]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($password, $user['password_hash'])) {
            // Generic message — don't reveal whether the username exists.
            Response::error('INVALID_CREDENTIALS', 'Invalid username or password', 401);
        }

        $session = Auth::createSession((int) $user['id']);
        Response::json([
            'user'          => Auth::publicUserRow($user),
            'token'         => $session['token'],
            'expiresInDays' => $session['expires_in_days'],
        ]);
    }

    /**
     * POST /auth/logout — idempotent (no error if token already invalid).
     */
    public function logout(array $params): void
    {
        $token = Request::bearerToken();
        if ($token !== null) {
            Auth::deleteSession($token);
        }
        Response::noContent();
    }

    /**
     * GET /auth/me
     */
    public function me(array $params): void
    {
        $user = Auth::requireUser();
        Response::json(['user' => Auth::publicUserRow($user)]);
    }
}
