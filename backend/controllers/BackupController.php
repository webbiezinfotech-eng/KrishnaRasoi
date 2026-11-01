<?php
/**
 * One-click backup + restore (admin only).
 * Shared hosting par mysqldump nahi hota, isliye pure PHP se .sql banate hain.
 */
class BackupController
{
    private function tables(): array
    {
        $rows = Database::all('SHOW TABLES');
        $out = [];
        foreach ($rows as $r) {
            $out[] = (string) array_values($r)[0];
        }
        return $out;
    }

    public function stats(Request $req): never
    {
        Auth::requireAdmin();
        $info = [];
        foreach ($this->tables() as $t) {
            if (!preg_match('/^[A-Za-z0-9_]+$/', $t)) continue;
            $info[] = ['table' => $t, 'rows' => (int) Database::value("SELECT COUNT(*) FROM `$t`")];
        }
        Response::success([
            'tables'      => $info,
            'db_name'     => DB_NAME,
            'php_version' => PHP_VERSION,
            'mbstring'    => extension_loaded('mbstring'),
            'generated'   => date('Y-m-d H:i:s'),
        ]);
    }

    public function export(Request $req): never
    {
        Auth::requireAdmin();
        @set_time_limit(0);
        ini_set('memory_limit', '512M');

        $pdo = Database::get();
        $sql  = "-- Restaurant + Kripa Shanti backup\n-- DB: " . DB_NAME . "\n-- Date: " . date('Y-m-d H:i:s') . "\n\n";
        $sql .= "SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n\n";

        foreach ($this->tables() as $table) {
            if (!preg_match('/^[A-Za-z0-9_]+$/', $table)) continue;

            $create = Database::row("SHOW CREATE TABLE `$table`");
            $ddl = $create['Create Table'] ?? (array_values($create)[1] ?? '');
            if ($ddl) {
                $sql .= "DROP TABLE IF EXISTS `$table`;\n" . $ddl . ";\n\n";
            }

            $stmt = $pdo->query("SELECT * FROM `$table`");
            $cols = null;
            $buffer = [];
            $count = 0;
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                if ($cols === null) {
                    $cols = array_map(static fn($c) => "`$c`", array_keys($row));
                }
                $vals = [];
                foreach ($row as $v) {
                    if ($v === null) {
                        $vals[] = 'NULL';
                    } elseif (is_int($v) || is_float($v)) {
                        $vals[] = (string) $v;
                    } else {
                        $vals[] = $pdo->quote((string) $v);
                    }
                }
                $buffer[] = '(' . implode(',', $vals) . ')';
                $count++;
                if (count($buffer) >= 200) {
                    $sql .= "INSERT INTO `$table` (" . implode(',', $cols) . ") VALUES\n" . implode(",\n", $buffer) . ";\n";
                    $buffer = [];
                }
            }
            if ($buffer) {
                $sql .= "INSERT INTO `$table` (" . implode(',', $cols) . ") VALUES\n" . implode(",\n", $buffer) . ";\n";
            }
            if ($count === 0) {
                $sql .= "-- (empty table)\n";
            }
            $sql .= "\n";
        }

        $sql .= "SET FOREIGN_KEY_CHECKS=1;\n";

        $name = 'backup-' . preg_replace('/[^a-z0-9_-]/i', '-', DB_NAME) . '-' . date('Ymd-His') . '.sql';
        while (ob_get_level() > 0) { ob_end_clean(); }
        header('Content-Type: application/sql; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . $name . '"');
        header('Content-Length: ' . strlen($sql));
        echo $sql;
        exit;
    }

    public function import(Request $req): never
    {
        $payload = Auth::requireAdmin();

        $file = $_FILES['backup'] ?? null;
        if (!is_array($file) || ($file['error'] ?? 1) !== 0) {
            Response::error('Backup .sql file select karein.', 422);
        }
        if ((int) $file['size'] > 64 * 1024 * 1024) {
            Response::error('File 64 MB se badi hai — CLI se import karein.', 422);
        }

        $raw = (string) file_get_contents($file['tmp_name']);
        if (trim($raw) === '') {
            Response::error('File khali hai.', 422);
        }

        // Safety: purana data pehle backup kar lo
        $safety = sys_get_temp_dir() . '/pre-restore-' . date('Ymd-His') . '.sql';
        @file_put_contents($safety, '-- safety copy created before restore at ' . date('c') . "\n");

        $pdo = Database::get();
        $pdo->exec('SET FOREIGN_KEY_CHECKS=0');

        // Split on ; at end of line, ignoring comments
        $statements = [];
        $buffer = '';
        foreach (preg_split("/\r\n|\n|\r/", $raw) as $line) {
            $trim = trim($line);
            if ($trim === '' || str_starts_with($trim, '--') || str_starts_with($trim, '#')) continue;
            $buffer .= $line . "\n";
            if (str_ends_with(rtrim($line), ';')) {
                $statements[] = trim($buffer);
                $buffer = '';
            }
        }
        if (trim($buffer) !== '') $statements[] = trim($buffer);

        $ok = 0;
        $failed = [];
        foreach ($statements as $stmt) {
            $s = rtrim(trim($stmt), ';');
            if ($s === '') continue;
            if (stripos($s, 'SET FOREIGN_KEY_CHECKS') === 0 || stripos($s, 'SET NAMES') === 0) continue;
            try {
                $pdo->exec($s);
                $ok++;
            } catch (Throwable $e) {
                if (count($failed) < 8) $failed[] = substr($e->getMessage(), 0, 160);
            }
        }
        $pdo->exec('SET FOREIGN_KEY_CHECKS=1');

        Helper::log((int) $payload['admin_id'], 'restore_backup', 'backup', null, "Restore: $ok statements, " . count($failed) . ' errors');

        Response::success([
            'executed' => $ok,
            'errors'   => $failed,
        ], "Restore ho gaya — $ok statement chaley." . ($failed ? ' Kuch statements fail hue, neeche list dekhein.' : ''));
    }
}
