<?php
/**
 * Database — PDO singleton with transaction helpers.
 */
class Database
{
    private static ?PDO $pdo = null;

    public static function get(): PDO
    {
        if (self::$pdo === null) {
            $dsn = sprintf(
                'mysql:host=%s;port=%s;dbname=%s;charset=%s',
                DB_HOST, DB_PORT, DB_NAME, DB_CHARSET
            );
            $options = [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
                PDO::MYSQL_ATTR_FOUND_ROWS   => true,
            ];
            try {
                self::$pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
                self::$pdo->exec("SET time_zone = '+05:30'");
            } catch (PDOException $e) {
                http_response_code(503);
                die(json_encode([
                    'success' => false,
                    'message' => 'Database unavailable. Please try again later.',
                ]));
            }
        }
        return self::$pdo;
    }

    public static function begin(): void   { self::get()->beginTransaction(); }
    public static function commit(): void  { self::get()->commit(); }
    public static function rollback(): void
    {
        if (self::get()->inTransaction()) {
            self::get()->rollBack();
        }
    }
    public static function lastId(): int   { return (int) self::get()->lastInsertId(); }

    /** Execute a prepared statement and return it */
    public static function run(string $sql, array $params = []): PDOStatement
    {
        $stmt = self::get()->prepare($sql);
        $stmt->execute($params);
        return $stmt;
    }

    /** Fetch single row */
    public static function row(string $sql, array $params = []): ?array
    {
        $row = self::run($sql, $params)->fetch();
        return $row ?: null;
    }

    /** Fetch all rows */
    public static function all(string $sql, array $params = []): array
    {
        return self::run($sql, $params)->fetchAll();
    }

    /** Fetch single scalar value */
    public static function value(string $sql, array $params = []): mixed
    {
        return self::run($sql, $params)->fetchColumn();
    }
}
