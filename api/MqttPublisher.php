<?php
declare(strict_types=1);

/**
 * Thin wrapper around the `mosquitto_pub` CLI tool.
 *
 * Why exec instead of a PHP MQTT library? No Composer dependency needed —
 * the Mosquitto broker installation already ships with `mosquitto_pub` on
 * both macOS (`brew install mosquitto`) and Raspberry Pi
 * (`apt install mosquitto-clients`). For one-shot publish-and-forget calls
 * from the scheduler, exec is fast enough and removes a moving part.
 */
class MqttPublisher
{
    /**
     * Publish a JSON payload to the given topic. Returns true on success.
     */
    public static function publish(string $topic, array $payload): bool
    {
        $cfg     = Database::config()['mqtt'];
        $message = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

        // Write payload to a temp file and use `-f` instead of `-m`.
        // Why: PHP's escapeshellarg() on Windows replaces " with spaces, which
        // destroys JSON quoting. `-f file` bypasses shell escaping entirely
        // and behaves the same on Windows, macOS, and Linux.
        $tmpFile = tempnam(sys_get_temp_dir(), 'meddrop_mqtt_');
        file_put_contents($tmpFile, $message);

        $parts = [
            'mosquitto_pub',
            '-h', escapeshellarg($cfg['host']),
            '-p', (string) (int) $cfg['port'],
            '-q', '1',
            '-t', escapeshellarg($topic),
            '-f', escapeshellarg($tmpFile),
        ];

        if (!empty($cfg['username'])) {
            $parts[] = '-u';
            $parts[] = escapeshellarg($cfg['username']);
            if (!empty($cfg['password'])) {
                $parts[] = '-P';
                $parts[] = escapeshellarg($cfg['password']);
            }
        }

        $cmd = implode(' ', $parts) . ' 2>&1';
        exec($cmd, $output, $exitCode);
        @unlink($tmpFile);

        if ($exitCode !== 0) {
            error_log(sprintf(
                "[MqttPublisher] publish failed (exit %d) topic=%s output=%s",
                $exitCode,
                $topic,
                implode("\n", $output)
            ));
        }

        return $exitCode === 0;
    }
}
