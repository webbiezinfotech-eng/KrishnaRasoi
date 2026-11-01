<?php
/**
 * Raw ESC/POS over TCP (port 9100) — works with most 80mm thermal printers.
 */
class EscposPrinter
{
    private $fp = null;
    private int $lineWidth;
    private ?string $lastError = null;

    public function __construct(int $lineWidth = 48)
    {
        $this->lineWidth = max(32, min(64, $lineWidth));
    }

    public function getLastError(): ?string
    {
        return $this->lastError;
    }

    public function connect(string $host, int $port = 9100, float $timeout = 5.0): bool
    {
        $this->lastError = null;
        $errno  = 0;
        $errstr = '';
        $this->fp = @fsockopen($host, $port, $errno, $errstr, $timeout);
        if ($this->fp === false) {
            $this->lastError = $errstr !== '' ? "{$errstr} (errno {$errno})" : "Connection failed (errno {$errno})";
            return false;
        }
        stream_set_timeout($this->fp, (int)ceil($timeout));
        return true;
    }

    public function close(): void
    {
        if ($this->fp) {
            fclose($this->fp);
            $this->fp = null;
        }
    }

    private function write(string $bytes): void
    {
        if ($this->fp) {
            $written = @fwrite($this->fp, $bytes);
            if ($written === false) {
                throw new RuntimeException('Failed to write to printer.');
            }
        }
    }

    public function init(): void
    {
        $this->write("\x1b\x40");
    }

    public function text(string $line): void
    {
        $safe = $this->sanitize($line);
        $this->write($safe . "\n");
    }

    public function bold(bool $on = true): void
    {
        $this->write("\x1b\x45" . chr($on ? 1 : 0));
    }

    public function align(string $mode = 'left'): void
    {
        $n = match ($mode) {
            'center' => 1,
            'right'  => 2,
            default  => 0,
        };
        $this->write("\x1b\x61" . chr($n));
    }

    public function feed(int $lines = 1): void
    {
        if ($lines > 0) {
            $this->write(str_repeat("\n", $lines));
        }
    }

    public function cut(): void
    {
        $this->feed(3);
        $this->write("\x1d\x56\x00");
    }

    public function separator(): void
    {
        $this->text(str_repeat('-', $this->lineWidth));
    }

    public function twoColumn(string $left, string $right): void
    {
        $left  = $this->sanitize($left);
        $right = $this->sanitize($right);
        $maxLeft = max(1, $this->lineWidth - strlen($right) - 1);
        if (strlen($left) > $maxLeft) {
            $left = substr($left, 0, $maxLeft);
        }
        $spaces = max(1, $this->lineWidth - strlen($left) - strlen($right));
        $this->text($left . str_repeat(' ', $spaces) . $right);
    }

    private function sanitize(string $text): string
    {
        $text = str_replace(["\r", "\n", "\t"], ' ', $text);
        $converted = @iconv('UTF-8', 'ISO-8859-1//TRANSLIT//IGNORE', $text);
        return $converted !== false ? $converted : preg_replace('/[^\x20-\x7E]/', '', $text);
    }
}
