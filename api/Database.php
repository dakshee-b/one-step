<?php
declare(strict_types=1);

/**
 * PDO singleton for MariaDB.
 *
 * One connection per HTTP request. Uses exception error mode and assoc fetch by default.
 * Server timezone is aligned to config.app.timezone if the tzinfo tables are loaded —
 * otherwise we fall back to the OS clock, which is fine when the host is set to
 * America/Toronto (Mac dev) or after running `mysql_tzinfo_to_sql` on the Pi.
 */
class Database
{
    private static ?PDO $instance = null;
    private static ?array $config = null;

    /**
     * Get the shared PDO connection. Lazy-connects on first call.
     */
    public static function pdo(): PDO
    {
        if (self::$instance === null) {
            self::$instance = self::connect();
        }
        return self::$instance;
    }

    /**
     * Get the loaded application config (cached after first read).
     */
    public static function config(): array
    {
        if (self::$config === null) {
            self::$config = require __DIR__ . '/../config/config.php';
        }
        return self::$config;
    }

    private static function connect(): PDO
    {
        $cfg = self::config();
        $db  = $cfg['db'];

        $dsn = sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
            $db['host'],
            (int) $db['port'],
            $db['name']
        );

        $pdo = new PDO($dsn, $db['user'], $db['password'], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);

        // Align MariaDB session timezone with the app timezone.
        // Requires tzinfo tables — load on the Pi with:
        //   mysql_tzinfo_to_sql /usr/share/zoneinfo | sudo mysql mysql
        try {
            $stmt = $pdo->prepare("SET time_zone = ?");
            $stmt->execute([$cfg['app']['timezone']]);
        } catch (PDOException $e) {
            // Named tz not available — rely on OS clock instead. Silent fallback.
        }

        return $pdo;
    }
}
