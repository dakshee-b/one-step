<?php
declare(strict_types=1);

/**
 * Profile endpoints:
 *   GET    /api/v1/profile        — return the full profile (auth)
 *   PUT    /api/v1/profile        — update text fields (auth)
 *   POST   /api/v1/profile/photo  — multipart upload, field name "photo" (auth)
 *   DELETE /api/v1/profile/photo  — remove the current photo (auth)
 *
 * Note: rfid_uid is intentionally NOT editable here. Per the project decision,
 * RFID is set once at registration and any change would need to be pushed to
 * the Arduino — deferred until the hardware sync flow is built.
 */
class ProfileController
{
    public function show(array $params): void
    {
        $user = Auth::requireUser();
        Response::json(['user' => Auth::publicUserRow($user)]);
    }

    public function update(array $params): void
    {
        $user   = Auth::requireUser();
        $body   = Request::jsonBody();
        $errors = [];

        $username = trim((string) ($body['username'] ?? ''));
        if ($username === '' || strlen($username) > 50) {
            $errors['username'] = 'Username must be 1–50 characters';
        }

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

        if (!empty($errors)) {
            Response::error('VALIDATION_ERROR', 'One or more fields are invalid', 422, $errors);
        }

        try {
            $stmt = Database::pdo()->prepare("
                UPDATE users
                SET username = ?, age = ?, medical_history = ?, caregiver_name = ?, allergies = ?
                WHERE id = ?
            ");
            $stmt->execute([
                $username,
                $age,
                $medicalHistory,
                $caregiverName,
                $allergies,
                (int) $user['id'],
            ]);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') {
                Response::error('CONFLICT', 'Username is already in use', 409);
            }
            throw $e;
        }

        $stmt = Database::pdo()->prepare("SELECT * FROM users WHERE id = ?");
        $stmt->execute([(int) $user['id']]);
        Response::json(['user' => Auth::publicUserRow($stmt->fetch())]);
    }

    public function uploadPhoto(array $params): void
    {
        $user = Auth::requireUser();
        $cfg  = Database::config();

        if (!isset($_FILES['photo'])) {
            Response::error('VALIDATION_ERROR', 'No photo uploaded — expected multipart field "photo"', 422);
        }

        $file = $_FILES['photo'];

        if ($file['error'] !== UPLOAD_ERR_OK) {
            $messages = [
                UPLOAD_ERR_INI_SIZE   => 'File exceeds server max size',
                UPLOAD_ERR_FORM_SIZE  => 'File exceeds form max size',
                UPLOAD_ERR_PARTIAL    => 'File only partially uploaded',
                UPLOAD_ERR_NO_FILE    => 'No file uploaded',
                UPLOAD_ERR_NO_TMP_DIR => 'Missing temp directory',
                UPLOAD_ERR_CANT_WRITE => 'Failed to write file to disk',
                UPLOAD_ERR_EXTENSION  => 'Upload blocked by a PHP extension',
            ];
            Response::error('UPLOAD_FAILED', $messages[$file['error']] ?? 'Upload error', 400);
        }

        if ($file['size'] > $cfg['uploads']['photo_max_bytes']) {
            Response::error(
                'FILE_TOO_LARGE',
                sprintf('Photo exceeds maximum size of %d bytes', $cfg['uploads']['photo_max_bytes']),
                413
            );
        }

        // Sniff MIME from file contents, not the client-provided $_FILES['photo']['type'].
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mime  = $finfo->file($file['tmp_name']);
        if (!in_array($mime, $cfg['uploads']['photo_allowed_mime'], true)) {
            Response::error(
                'INVALID_FILE_TYPE',
                'Photo must be one of: ' . implode(', ', $cfg['uploads']['photo_allowed_mime']),
                415
            );
        }

        $ext = [
            'image/jpeg' => 'jpg',
            'image/png'  => 'png',
            'image/webp' => 'webp',
        ][$mime];

        $dir = $cfg['uploads']['photo_dir'];
        if (!is_dir($dir) && !mkdir($dir, 0755, true)) {
            Response::error('STORAGE_ERROR', 'Failed to create upload directory', 500);
        }

        $filename = bin2hex(random_bytes(16)) . '.' . $ext;
        $destPath = $dir . '/' . $filename;

        if (!move_uploaded_file($file['tmp_name'], $destPath)) {
            Response::error('STORAGE_ERROR', 'Failed to save photo', 500);
        }

        // Delete the previous photo, if any.
        if (!empty($user['profile_photo_path'])) {
            $oldPath = $dir . '/' . basename($user['profile_photo_path']);
            if (is_file($oldPath)) {
                @unlink($oldPath);
            }
        }

        $stmt = Database::pdo()->prepare("UPDATE users SET profile_photo_path = ? WHERE id = ?");
        $stmt->execute([$filename, (int) $user['id']]);

        Response::json([
            'profilePhotoUrl' => $cfg['uploads']['photo_url_prefix'] . '/' . $filename,
        ]);
    }

    public function deletePhoto(array $params): void
    {
        $user = Auth::requireUser();
        $cfg  = Database::config();

        if (!empty($user['profile_photo_path'])) {
            $path = $cfg['uploads']['photo_dir'] . '/' . basename($user['profile_photo_path']);
            if (is_file($path)) {
                @unlink($path);
            }
        }

        $stmt = Database::pdo()->prepare("UPDATE users SET profile_photo_path = NULL WHERE id = ?");
        $stmt->execute([(int) $user['id']]);

        Response::noContent();
    }
}
