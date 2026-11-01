<?php
class SettingsController
{
    private function hasLogoColumn(): bool
    {
        return true; // setting_value is LONGTEXT after the migration
    }

    private function settingsMap(): array
    {
        $map = [];
        try {
            foreach (Database::all('SELECT setting_key, setting_value FROM settings') as $r) {
                $map[$r['setting_key']] = $r['setting_value'];
            }
        } catch (Throwable $e) {
            return [];
        }
        return $map;
    }

    private function upsert(string $key, string $value, string $group, string $label, string $inputType, int $sort): void
    {
        $row = Database::row('SELECT id FROM settings WHERE setting_key = ?', [$key]);
        if ($row) {
            Database::run('UPDATE settings SET setting_value = ? WHERE setting_key = ?', [$value, $key]);
            return;
        }
        Database::run(
            'INSERT INTO settings (setting_key, setting_value, setting_group, label, input_type, sort_order)
             VALUES (?, ?, ?, ?, ?, ?)',
            [$key, $value, $group, $label, $inputType, $sort]
        );
    }

    public function index(Request $req): never
    {
        Auth::requireAdmin();

        $rows = Database::all(
            'SELECT * FROM settings ORDER BY setting_group ASC, sort_order ASC, id ASC'
        );

        Response::success($rows);
    }

    /** Invoice-safe public subset (staff only, no admin): house name, GST, logo. */
    public function publicSettings(Request $req): never
    {
        Auth::requireStaff();
        $m = $this->settingsMap();

        Response::success([
            'guest_house_name'    => $m['guest_house_name']    ?? 'Kripa Shanti Atithi Bhavan',
            'guest_house_address' => $m['guest_house_address'] ?? '',
            'guest_house_phone'   => $m['guest_house_phone']   ?? '',
            'restaurant_name'     => $m['restaurant_name']     ?? 'Restaurant Manager',
            'gst_number'          => $m['gst_number']          ?? '',
            'tax_percentage'      => (float)($m['tax_percentage'] ?? 0),
            'invoice_prefix'      => $m['invoice_prefix']      ?? 'KS',
            'invoice_format'      => $m['invoice_format']      ?? 'a4',
            'logo_data'           => $m['logo_data']           ?? '',
            'logo'                => $m['logo']                ?? ($m['logo_url'] ?? ''),
        ]);
    }

    public function update(Request $req): never
    {
        Auth::requireAdmin();

        $data = $req->body();
        if (empty($data) || !is_array($data)) {
            Response::error('No settings data provided.', 422);
        }

        if (isset($data['guest_house_commission'])) {
            if (!is_numeric($data['guest_house_commission'])) {
                Response::error('Guest house commission percentage must be a valid number.', 422);
            }
            $commissionPct = (float)$data['guest_house_commission'];
            if ($commissionPct < 0 || $commissionPct > 100) {
                Response::error('Guest house commission percentage must be between 0 and 100.', 422);
            }
        }
        if (isset($data['tax_percentage'])) {
            $tax = (float)$data['tax_percentage'];
            if ($tax < 0 || $tax > 100) {
                Response::error('Tax percentage must be between 0 and 100.', 422);
            }
        }

        $allowedKeys = Database::all('SELECT setting_key FROM settings');
        $allowed     = array_column($allowedKeys, 'setting_key');

        Database::begin();
        try {
            $stmt = Database::get()->prepare(
                'UPDATE settings SET setting_value = ? WHERE setting_key = ?'
            );
            foreach ($data as $key => $value) {
                if (!in_array($key, $allowed, true)) continue;
                $stmt->execute([(string)$value, $key]);
            }
            Database::commit();
        } catch (Throwable $e) {
            Database::rollback();
            Response::serverError('Failed to update settings.');
        }

        Response::success(null, 'Settings updated successfully.');
    }

    /** Logo upload — PNG / JPG / JPEG only, resized and stored as a data URI (works on every server). */
    public function uploadLogo(Request $req): never
    {
        Auth::requireAdmin();

        $file = $_FILES['logo'] ?? null;
        $dataUri = '';

        if (is_array($file) && ($file['error'] ?? 1) === 0) {
            if ((int)$file['size'] > 4 * 1024 * 1024) {
                Response::error('Logo 4 MB se chhota hona chahiye.', 422);
            }
            $info = @getimagesize($file['tmp_name']);
            $mime = $info['mime'] ?? '';
            if (!in_array($mime, ['image/png', 'image/jpeg'], true)) {
                Response::error('Sirf PNG, JPG ya JPEG logo allowed hai.', 422);
            }
            $dataUri = $this->toDataUri($file['tmp_name'], $mime);
        } else {
            $raw = $req->bodyStr('logo_base64');
            if ($raw !== '' && preg_match('#^data:image/(png|jpeg|jpg);base64,#i', $raw)) {
                $dataUri = preg_replace('#^data:image/jpg#i', 'data:image/jpeg', $raw);
            }
        }

        if ($dataUri === '') {
            Response::error('Logo file nahi mili. PNG ya JPG select karein.', 422);
        }

        $this->upsert('logo_data', $dataUri, 'invoice', 'Invoice Logo', 'image', 90);

        Response::success(['logo_data' => $dataUri], 'Logo update ho gaya.');
    }

    private function toDataUri(string $path, string $mime): string
    {
        if (function_exists('imagecreatetruecolor')) {
            $src = $mime === 'image/png'
                ? @imagecreatefrompng($path)
                : @imagecreatefromjpeg($path);
            if ($src) {
                $w = imagesx($src);
                $h = imagesy($src);
                $maxW = 600;
                if ($w > $maxW && $h > 0) {
                    $nw  = $maxW;
                    $nh  = (int)round($h * $maxW / $w);
                    $dst = imagecreatetruecolor($nw, $nh);
                    imagealphablending($dst, false);
                    imagesavealpha($dst, true);
                    imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
                    imagedestroy($src);
                    $src = $dst;
                }
                ob_start();
                if ($mime === 'image/png') {
                    imagepng($src, null, 8);
                    $outMime = 'image/png';
                } else {
                    imagejpeg($src, null, 82);
                    $outMime = 'image/jpeg';
                }
                $bin = ob_get_clean();
                imagedestroy($src);
                if ($bin) {
                    return 'data:' . $outMime . ';base64,' . base64_encode($bin);
                }
            }
        }

        $bin = @file_get_contents($path);
        if ($bin === false) {
            Response::serverError('Logo read nahi ho paya.');
        }
        return 'data:' . $mime . ';base64,' . base64_encode($bin);
    }
}
