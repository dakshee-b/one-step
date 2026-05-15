<?php
/**
 * MedDrop application configuration.
 *
 * Edit DB credentials if your local MariaDB setup differs from the Homebrew default.
 * Macs running `brew install mariadb` start MariaDB with user=root and no password.
 *
 * For Raspberry Pi production deployment, change:
 *   - db.password (set a real password)
 *   - device.shared_secret (regenerate with: php -r "echo bin2hex(random_bytes(32));")
 *   - app.env = 'production'
 */

return [

    // -------------------------------------------------------------------
    // App
    // -------------------------------------------------------------------
    'app' => [
        'name'                  => 'MedDrop',
        'timezone'              => 'America/Toronto',
        'env'                   => 'development',
        'session_lifetime_days' => 7,
    ],

    // -------------------------------------------------------------------
    // Database (MariaDB)
    // -------------------------------------------------------------------
    'db' => [
        'host'     => '127.0.0.1',
        'port'     => 3306,
        'name'     => 'meddrop',
        'user'     => 'meddrop',
        'password' => 'meddrop',
    ],

    // -------------------------------------------------------------------
    // Hardware capacity
    // 3 slots × 7 pills = 21 pills system total
    // -------------------------------------------------------------------
    'capacity' => [
        'slots'            => 3,
        'pills_per_slot'   => 7,
        'system_total'     => 21,
        'refill_threshold' => 2,
    ],

    // -------------------------------------------------------------------
    // Scheduler timing windows (in minutes)
    // -------------------------------------------------------------------
    'scheduler' => [
        'upcoming_window_minutes'     => 30,
        'miss_window_minutes'         => 30,
        'notification_retention_days' => 30,
    ],

    // -------------------------------------------------------------------
    // Profile photo uploads
    // -------------------------------------------------------------------
    'uploads' => [
        'photo_dir'          => __DIR__ . '/../public/uploads/photos',
        'photo_url_prefix'   => '/uploads/photos',
        'photo_max_bytes'    => 2 * 1024 * 1024,
        'photo_allowed_mime' => ['image/jpeg', 'image/png', 'image/webp'],
    ],

    // -------------------------------------------------------------------
    // MQTT (Mosquitto broker on the Pi)
    // -------------------------------------------------------------------
    'mqtt' => [
        'host'     => '127.0.0.1',
        'port'     => 1883,
        'username' => null,
        'password' => null,
        'client_id_prefix' => 'meddrop',
        'topics' => [
            'dispense_command' => 'pill/dispense',
            'dispense_status'  => 'pill/status',
            'dispense_error'   => 'pill/error',
            'rfid_scan'        => 'rfid/scan',
            'device_boot'      => 'device/boot',
        ],
    ],

    // -------------------------------------------------------------------
    // Internal device endpoints — shared secret with the MQTT bridge.
    // The bridge sends header: X-Device-Secret: <value>
    // REPLACE THIS BEFORE DEPLOYING TO THE PI.
    // -------------------------------------------------------------------
    'device' => [
        'shared_secret' => 'DEV_ONLY_REPLACE_ME_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
    ],

];
