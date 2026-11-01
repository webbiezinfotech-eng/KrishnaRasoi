<?php
class MessagingController
{
    public function config(Request $req): never
    {
        Auth::requireAdmin();
        CustomerService::ensureSchema();
        Response::success(MessagingService::publicConfig());
    }

    public function preview(Request $req): never
    {
        Auth::requireAdmin();
        CustomerService::ensureSchema();

        $v = Validator::make($req->body())
            ->required('message_body', 'Message')->string('message_body', 1, 2000)
            ->in('channel', ['whatsapp', 'sms'], 'Channel');
        if ($v->fails()) {
            $v2 = Validator::make($req->body())->required('message', 'Message')->string('message', 1, 2000);
            if ($v2->fails() && !isset($req->body()['message_body'])) {
                Response::unprocessable('Validation failed.', $v->errors());
            }
        }

        $body = $req->body();
        if (empty($body['message_body']) && !empty($body['message'])) {
            $body['message_body'] = $body['message'];
        }
        Response::success(CampaignService::previewPayload($body));
    }

    public function createCampaign(Request $req): never
    {
        $payload = Auth::requireAdmin();
        CustomerService::ensureSchema();

        $v = Validator::make($req->body())
            ->required('channel', 'Channel')->in('channel', ['whatsapp', 'sms'], 'Channel')
            ->string('name', 0, 150)
            ->string('idempotency_key', 0, 64);
        $body = $req->body();
        $message = trim((string) ($body['message_body'] ?? $body['message'] ?? ''));
        if ($message === '') {
            Response::unprocessable('Validation failed.', ['message_body' => ['Message is required.']]);
        }
        if ($v->fails()) {
            Response::unprocessable('Validation failed.', $v->errors());
        }

        $ids = $req->body('customer_ids');
        $selectAll = (bool) $req->body('select_all', false);
        if (!$selectAll && (!is_array($ids) || count($ids) === 0)) {
            Response::unprocessable('Validation failed.', ['customer_ids' => ['Select at least one customer.']]);
        }
        if (is_array($ids) && count($ids) > MESSAGING_MAX_RECIPIENTS) {
            Response::error('Too many recipients in this request.', 422);
        }

        $campaign = CampaignService::create($body, (int) $payload['admin_id']);
        Helper::log(
            (int) $payload['admin_id'],
            'create_campaign',
            'messaging',
            (int) $campaign['id'],
            "Campaign {$campaign['name']} ({$campaign['channel']})"
        );
        Response::created($campaign, 'Campaign created.');
    }

    public function listCampaigns(Request $req): never
    {
        Auth::requireAdmin();
        $page = max(1, $req->queryInt('page', 1));
        $limit = $req->queryInt('limit', $req->queryInt('per_page', 20));
        Response::success(MessageLogService::listCampaigns($page, $limit));
    }

    public function showCampaign(Request $req, int $id): never
    {
        Auth::requireAdmin();
        $row = CampaignService::get($id);
        if (!$row) {
            Response::notFound('Campaign not found.');
        }
        Response::success(CampaignService::formatCampaign($row, true));
    }

    public function previewCampaign(Request $req, int $id): never
    {
        Auth::requireAdmin();
        $row = CampaignService::get($id);
        if (!$row) {
            Response::notFound('Campaign not found.');
        }
        $formatted = CampaignService::formatCampaign($row, true);
        Response::success([
            'preview'          => $formatted['preview'],
            'preview_name'     => $formatted['preview_name'],
            'channel'          => $formatted['channel'],
            'total_recipients' => $formatted['total_recipients'],
            'mode'             => $formatted['mode'],
            'uses_placeholder' => str_contains((string) $row['message_body'], '{{name}}'),
        ]);
    }

    public function sendCampaign(Request $req, int $id): never
    {
        $payload = Auth::requireAdmin();
        $row = CampaignService::get($id);
        if (!$row) {
            Response::notFound('Campaign not found.');
        }

        $result = MessageQueueService::dispatch($id);
        Helper::log(
            (int) $payload['admin_id'],
            'send_campaign',
            'messaging',
            $id,
            "Queued campaign #{$id} ({$row['channel']})"
        );

        if (isset($result['success']) && $result['success'] === false) {
            Response::error((string) ($result['message'] ?? 'Campaign send failed.'), 422, [
                'test_mode' => !empty($result['test_mode']) || WhatsAppService::isTestMode(),
            ]);
        }

        Response::success($result, $result['message'] ?? 'Campaign queued.');
    }

    public function recipients(Request $req, int $id): never
    {
        Auth::requireAdmin();
        $row = CampaignService::get($id);
        if (!$row) {
            Response::notFound('Campaign not found.');
        }
        $page = max(1, $req->queryInt('page', 1));
        $limit = $req->queryInt('limit', $req->queryInt('per_page', 50));
        $status = $req->queryStr('status') ?: null;
        Response::success(MessageLogService::listRecipients($id, $page, $limit, $status));
    }

    public function processCampaign(Request $req, int $id): never
    {
        Auth::requireAdmin();
        $row = CampaignService::get($id);
        if (!$row) {
            Response::notFound('Campaign not found.');
        }
        if (empty($row['dispatched_at'])) {
            Response::error('Campaign has not been queued yet.', 409);
        }
        $batch = MessageQueueService::processBatch($id);
        $fresh = CampaignService::get($id);
        Response::success([
            'success'  => true,
            'mode'     => MessagingService::isMockMode() ? 'mock' : 'live',
            'message'  => MessagingService::isMockMode()
                ? 'Message queued for development testing'
                : 'Batch processed.',
            'batch'    => $batch,
            'campaign' => CampaignService::formatCampaign($fresh, false),
        ]);
    }

    public function whatsappHealth(Request $req): never
    {
        Auth::requireAdmin();
        $zap = new ZaptiloWhatsAppService();
        Response::success($zap->diagnose());
    }

    public function testWhatsApp(Request $req): never
    {
        $payload = Auth::requireAdmin();
        CustomerService::ensureSchema();

        if (!WhatsAppService::hasToken()) {
            Response::error('ZAPTILO_API_TOKEN is not set on the server.', 422);
        }
        $testPhone = WhatsAppService::testPhone();
        if (CustomerService::toWhatsAppNumber($testPhone) === null) {
            Response::error('ZAPTILO_TEST_PHONE is missing or invalid.', 422);
        }

        $message = trim((string) ($req->bodyStr('message') ?: 'Krishna Rasoi Restaurant WhatsApp integration test message.'));
        if (mb_strlen($message) > 2000) {
            Response::unprocessable('Validation failed.', ['message' => ['Message must not exceed 2000 characters.']]);
        }

        $result = WhatsAppService::sendTextMessage($testPhone, $message);
        MessageLogService::record(
            null,
            'whatsapp',
            $message,
            !empty($result['accepted']) ? 'SENT' : 'FAILED',
            'zaptilo',
            $result['provider_response'] ?? $result['message'] ?? null
        );
        Helper::log((int) $payload['admin_id'], 'whatsapp_test', 'messaging', null, 'Single-number Zaptilo test');

        unset($result['provider_response']);
        Response::success([
            'success'         => !empty($result['accepted']),
            'mode'            => 'test',
            'test_phone_masked' => WhatsAppService::maskedTestPhone(),
            'result'          => $result,
        ], !empty($result['accepted']) ? 'Test WhatsApp sent.' : ($result['message'] ?? 'Test WhatsApp failed.'));
    }

    public function templates(Request $req): never
    {
        Auth::requireAdmin();
        if (!WhatsAppService::hasToken()) {
            Response::error('ZAPTILO_API_TOKEN is not set on the server.', 422);
        }
        $result = WhatsAppService::getTemplates();
        $raw = $result['provider_response'] ?? [];
        $templates = [];
        if (isset($raw['data']) && is_array($raw['data'])) {
            $templates = $raw['data'];
        }
        Response::success([
            'templates' => $templates,
            'ok'        => !empty($result['success']),
            'message'   => $result['message'] ?? null,
        ]);
    }

    public function logs(Request $req): never
    {
        Auth::requireAdmin();
        $page = max(1, $req->queryInt('page', 1));
        $limit = $req->queryInt('limit', $req->queryInt('per_page', 20));
        $status = $req->queryStr('status') ?: null;
        Response::success(MessageLogService::listLogs($page, $limit, $status));
    }

    // ---- Local reusable templates (client-defined, stored in DB) ----

    public function listTemplates(Request $req): never
    {
        Auth::requireAdmin();
        MessageTemplateService::ensureSchema();
        Response::success(['templates' => MessageTemplateService::listAll($req->queryStr('channel') ?: null)]);
    }

    public function createTemplate(Request $req): never
    {
        $payload = Auth::requireAdmin();
        MessageTemplateService::ensureSchema();
        $tpl = MessageTemplateService::create($req->body(), (int) $payload['admin_id']);
        Response::created($tpl, 'Template saved.');
    }

    public function updateTemplate(Request $req, int $id): never
    {
        $payload = Auth::requireAdmin();
        MessageTemplateService::ensureSchema();
        $tpl = MessageTemplateService::update($id, $req->body(), (int) $payload['admin_id']);
        if (!$tpl) Response::notFound('Template not found.');
        Response::success($tpl, 'Template updated.');
    }

    public function deleteTemplate(Request $req, int $id): never
    {
        Auth::requireAdmin();
        MessageTemplateService::ensureSchema();
        $ok = MessageTemplateService::delete($id);
        if (!$ok) Response::notFound('Template not found.');
        Response::success(null, 'Template deleted.');
    }

    // ---- WhatsApp spend vs monthly budget (dashboard box) ----

    public function budget(Request $req): never
    {
        Auth::requireAdmin();
        CustomerService::ensureSchema();
        MessageTemplateService::ensureSchema();

        $monthStart = date('Y-m-01 00:00:00');
        $spentDb = 0.0;
        $sentThisMonth = 0;
        try {
            $spentDb = (float) Database::value(
                "SELECT COALESCE(SUM(cost_amount), 0) FROM message_recipients
                 WHERE status = 'sent' AND sent_at >= ?",
                [$monthStart]
            );
            $sentThisMonth = (int) Database::value(
                "SELECT COUNT(*) FROM message_recipients WHERE status = 'sent' AND sent_at >= ?",
                [$monthStart]
            );
        } catch (Throwable $e) {
            $spentDb = 0.0;
        }

        // Estimated spend from configured per-message rate (used when provider
        // does not return exact cost): sent_this_month * cost_per_message
        $rate = (float) Helper::setting('whatsapp_cost_per_message', 0.0);
        $estimated = $sentThisMonth * $rate;
        $spent = max($spentDb, $estimated);

        $budget = (float) Helper::setting('whatsapp_monthly_budget', 0.0);
        $monthLabel = date('F Y');

        // Last 6 months spend (estimated where no provider cost recorded)
        $history = [];
        try {
            $rows = Database::all(
                "SELECT DATE_FORMAT(sent_at, '%Y-%m') AS ym,
                        COUNT(*) AS sent,
                        COALESCE(SUM(cost_amount), 0) AS recorded_cost
                 FROM message_recipients
                 WHERE status = 'sent' AND sent_at IS NOT NULL
                 GROUP BY DATE_FORMAT(sent_at, '%Y-%m')
                 ORDER BY ym DESC
                 LIMIT 6"
            );
            foreach ($rows as $r) {
                $est = ((int) $r['sent']) * $rate;
                $history[] = [
                    'month'  => $r['ym'],
                    'sent'   => (int) $r['sent'],
                    'spend'  => max((float) $r['recorded_cost'], $est),
                ];
            }
        } catch (Throwable $e) {
            $history = [];
        }

        // Overall message stats: total sent / pending / failed
        $stats = ['sent' => 0, 'pending' => 0, 'failed' => 0];
        try {
            $stats = [
                'sent'    => (int) Database::value("SELECT COUNT(*) FROM message_recipients WHERE status = 'sent'"),
                'pending' => (int) Database::value("SELECT COUNT(*) FROM message_recipients WHERE status IN ('queued','processing')"),
                'failed'  => (int) Database::value("SELECT COUNT(*) FROM message_recipients WHERE status = 'failed'"),
            ];
        } catch (Throwable $e) {
        }

        Response::success([
            'budget'            => $budget,
            'spent'             => round($spent, 2),
            'remaining'         => $budget > 0 ? round(max(0, $budget - $spent), 2) : null,
            'over_budget'       => $budget > 0 && $spent > $budget,
            'month'             => $monthLabel,
            'sent_this_month'   => $sentThisMonth,
            'cost_per_message'  => $rate,
            'usage_percent'     => $budget > 0 ? min(100, round(($spent / $budget) * 100, 1)) : null,
            'monthly_history'   => $history,
            'message_stats'     => $stats,
        ]);
    }
}
