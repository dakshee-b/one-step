<?php
declare(strict_types=1);

/**
 * Dashboard & adherence aggregates:
 *   GET /api/v1/dashboard/overview        — top 3 stat cards
 *   GET /api/v1/dashboard/today           — per-medication status for today
 *   GET /api/v1/adherence/weekly          — weekly bar chart data (Mon–Sun)
 *   GET /api/v1/adherence/monthly         — monthly calendar dot data
 *
 * All endpoints require auth and read only — they aggregate from `dose_events`
 * (source of truth) and `medications`. The scheduler is responsible for keeping
 * dose_events populated; this controller does not generate any.
 */
class DashboardController
{
    /**
     * GET /dashboard/overview
     * Shape: { totalPillsAvailable, capacity, remainingToday, missedThisWeek }
     */
    public function overview(array $params): void
    {
        $user   = Auth::requireUser();
        $cfg    = Database::config();
        $pdo    = Database::pdo();
        $userId = (int) $user['id'];

        $stmt = $pdo->prepare("
            SELECT COALESCE(SUM(remaining_pills), 0)
            FROM medications WHERE user_id = ?
        ");
        $stmt->execute([$userId]);
        $totalRemaining = (int) $stmt->fetchColumn();

        $today = date('Y-m-d');
        $stmt = $pdo->prepare("
            SELECT COUNT(*) FROM dose_events
            WHERE user_id = ?
              AND DATE(scheduled_at) = ?
              AND status IN ('upcoming', 'pending')
        ");
        $stmt->execute([$userId, $today]);
        $remainingToday = (int) $stmt->fetchColumn();

        $weekStart = self::weekStart();
        $weekEnd   = self::addDays($weekStart, 6);
        $stmt = $pdo->prepare("
            SELECT COUNT(*) FROM dose_events
            WHERE user_id = ?
              AND scheduled_at >= ?
              AND scheduled_at <= ?
              AND status = 'missed'
        ");
        $stmt->execute([$userId, $weekStart . ' 00:00:00', $weekEnd . ' 23:59:59']);
        $missedThisWeek = (int) $stmt->fetchColumn();

        Response::json([
            'totalPillsAvailable' => $totalRemaining,
            'capacity'            => (int) $cfg['capacity']['system_total'],
            'remainingToday'      => $remainingToday,
            'missedThisWeek'      => $missedThisWeek,
        ]);
    }

    /**
     * GET /dashboard/today
     * Shape: { medications: [{ medicationId, slot, name, time, dosage, remainingPills, status, doseEventId }] }
     *
     * If today's dose_event hasn't been generated yet (e.g., scheduler hasn't
     * run since midnight), falls back to 'upcoming' so the dashboard renders.
     */
    public function today(array $params): void
    {
        $user   = Auth::requireUser();
        $userId = (int) $user['id'];
        $today  = date('Y-m-d');

        // Subquery picks at most one dose_event per medication (the latest by id)
        // so duplicate-day rows can never explode the response shape.
        $stmt = Database::pdo()->prepare("
            SELECT
                m.id, m.slot_number, m.name, m.dose_time, m.pills_per_dose, m.remaining_pills,
                de.id     AS dose_event_id,
                de.status AS dose_status
            FROM medications m
            LEFT JOIN dose_events de ON de.id = (
                SELECT id FROM dose_events
                WHERE medication_id = m.id AND DATE(scheduled_at) = ?
                ORDER BY id DESC
                LIMIT 1
            )
            WHERE m.user_id = ?
            ORDER BY m.slot_number
        ");
        $stmt->execute([$today, $userId]);
        $rows = $stmt->fetchAll();

        $result = [];
        foreach ($rows as $row) {
            $status = $row['dose_status'] ?? 'upcoming';
            $result[] = [
                'medicationId'   => (int) $row['id'],
                'slot'           => (int) $row['slot_number'],
                'name'           => $row['name'],
                'time'           => substr($row['dose_time'], 0, 5),
                'dosage'         => (int) $row['pills_per_dose'],
                'remainingPills' => (int) $row['remaining_pills'],
                'status'         => $status,
                'doseEventId'    => $row['dose_event_id'] !== null ? (int) $row['dose_event_id'] : null,
            ];
        }

        Response::json(['medications' => $result]);
    }

    /**
     * GET /adherence/weekly?week_start=YYYY-MM-DD
     * Default week_start = Monday of the current week.
     * Shape matches the frontend's WEEKLY_DATA shape exactly.
     */
    public function adherenceWeekly(array $params): void
    {
        $user   = Auth::requireUser();
        $userId = (int) $user['id'];

        $weekStart = Request::query('week_start') ?? self::weekStart();
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $weekStart) || strtotime($weekStart) === false) {
            Response::error('VALIDATION_ERROR', 'week_start must be YYYY-MM-DD', 422);
        }
        $weekEnd = self::addDays($weekStart, 6);

        $stmt = Database::pdo()->prepare("
            SELECT DATE(de.scheduled_at) AS dose_date, m.slot_number, de.status
            FROM dose_events de
            JOIN medications m ON m.id = de.medication_id
            WHERE de.user_id = ?
              AND DATE(de.scheduled_at) >= ?
              AND DATE(de.scheduled_at) <= ?
        ");
        $stmt->execute([$userId, $weekStart, $weekEnd]);
        $rows = $stmt->fetchAll();

        $dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        $byDay    = [];
        foreach ($dayNames as $d) {
            $byDay[$d] = ['p1' => 0, 'p2' => 0, 'p3' => 0, 'missed' => 0, 'upcoming' => 0];
        }
        foreach ($rows as $row) {
            $idx  = (int) date('N', strtotime($row['dose_date'])) - 1; // 0=Mon..6=Sun
            $day  = $dayNames[$idx];
            $slot = (int) $row['slot_number'];
            switch ($row['status']) {
                case 'dispensed':
                    $byDay[$day]["p$slot"] = 1;
                    break;
                case 'missed':
                    $byDay[$day]['missed']++;
                    break;
                case 'upcoming':
                case 'pending':
                    $byDay[$day]['upcoming']++;
                    break;
            }
        }

        $days = [];
        foreach ($dayNames as $d) {
            $days[] = ['day' => $d] + $byDay[$d];
        }

        $totalTaken  = 0;
        $totalMissed = 0;
        foreach ($days as $d) {
            $totalTaken  += $d['p1'] + $d['p2'] + $d['p3'];
            $totalMissed += $d['missed'];
        }
        $denom = $totalTaken + $totalMissed;
        $adherenceRate = $denom > 0 ? (int) round(($totalTaken / $denom) * 100) : 0;

        Response::json([
            'weekStart'     => $weekStart,
            'weekEnd'       => $weekEnd,
            'days'          => $days,
            'totalTaken'    => $totalTaken,
            'totalMissed'   => $totalMissed,
            'adherenceRate' => $adherenceRate,
        ]);
    }

    /**
     * GET /adherence/monthly?year=YYYY&month=MM
     * Default = current year/month.
     * Shape: { year, month, days: { "1": [bool,bool,bool], "2": [...] } }
     * `bool` per slot indicates whether that dose was dispensed.
     * Days without dose_events are omitted (matches frontend MONTHLY_DETAIL).
     */
    public function adherenceMonthly(array $params): void
    {
        $user   = Auth::requireUser();
        $userId = (int) $user['id'];

        $year  = (int) (Request::query('year')  ?? date('Y'));
        $month = (int) (Request::query('month') ?? date('n'));

        if ($year < 2020 || $year > 2100) {
            Response::error('VALIDATION_ERROR', 'year is out of supported range', 422);
        }
        if ($month < 1 || $month > 12) {
            Response::error('VALIDATION_ERROR', 'month must be 1–12', 422);
        }

        $startDate = sprintf('%04d-%02d-01', $year, $month);
        $endDate   = date('Y-m-t', strtotime($startDate));

        $stmt = Database::pdo()->prepare("
            SELECT DATE(de.scheduled_at) AS dose_date, m.slot_number, de.status
            FROM dose_events de
            JOIN medications m ON m.id = de.medication_id
            WHERE de.user_id = ?
              AND DATE(de.scheduled_at) >= ?
              AND DATE(de.scheduled_at) <= ?
        ");
        $stmt->execute([$userId, $startDate, $endDate]);
        $rows = $stmt->fetchAll();

        $byDay = [];
        foreach ($rows as $row) {
            $day  = (int) date('j', strtotime($row['dose_date']));
            $slot = (int) $row['slot_number'];
            if (!isset($byDay[$day])) {
                $byDay[$day] = [false, false, false];
            }
            if ($row['status'] === 'dispensed') {
                $byDay[$day][$slot - 1] = true;
            }
        }

        // Sort by day number for stable output (PHP keeps insertion order otherwise).
        ksort($byDay);

        Response::json([
            'year'  => $year,
            'month' => $month,
            'days'  => empty($byDay) ? (object) [] : $byDay,
        ]);
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /** ISO Monday of the week containing $date (default: today). */
    private static function weekStart(?string $date = null): string
    {
        $d         = $date ?? date('Y-m-d');
        $dayOfWeek = (int) date('N', strtotime($d)); // 1=Mon..7=Sun
        return date('Y-m-d', strtotime("$d -" . ($dayOfWeek - 1) . ' days'));
    }

    private static function addDays(string $date, int $days): string
    {
        return date('Y-m-d', strtotime("$date +$days days"));
    }
}
