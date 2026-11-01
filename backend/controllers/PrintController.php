<?php
require_once __DIR__ . '/../services/PrintService.php';

class PrintController
{
    public function health(Request $req): never
    {
        Auth::guard();
        Response::success(PrintService::health());
    }

    public function printBill(Request $req): never
    {
        Auth::requireAdmin();

        $billNumber = $req->bodyStr('bill_number');
        if (!$billNumber) {
            Response::error('bill_number is required.', 422);
        }

        PrintService::printBill($billNumber);
    }

    public function printKOT(Request $req): never
    {
        $payload = Auth::guard();

        $orderId = $req->bodyInt('order_id');
        if (!$orderId) {
            Response::error('order_id is required.', 422);
        }

        if (Auth::isWaiter($payload)) {
            $order = Database::row('SELECT order_type FROM orders WHERE id = ?', [$orderId]);
            if (!$order) {
                Response::notFound('Order not found.');
            }
            Auth::assertWaiterDineInOrder($order, $payload);
        }

        PrintService::printKOT($orderId);
    }

    public function testPrint(Request $req): never
    {
        Auth::requireAdmin();

        $type = $req->bodyStr('type') ?: 'bill';
        PrintService::testPrint($type);
    }
}
