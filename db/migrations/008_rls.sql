ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_invoices ON invoices;
CREATE POLICY tenant_invoices ON invoices
  USING (merchant_id::text = current_setting('app.current_merchant_id', true));

DROP POLICY IF EXISTS tenant_ledger_entries ON ledger_entries;
CREATE POLICY tenant_ledger_entries ON ledger_entries
  USING (merchant_id::text = current_setting('app.current_merchant_id', true));

DROP POLICY IF EXISTS tenant_webhooks ON webhooks;
CREATE POLICY tenant_webhooks ON webhooks
  USING (merchant_id::text = current_setting('app.current_merchant_id', true));

DROP POLICY IF EXISTS tenant_webhook_deliveries ON webhook_deliveries;
CREATE POLICY tenant_webhook_deliveries ON webhook_deliveries
  USING (
    EXISTS (
      SELECT 1
      FROM webhooks
      WHERE webhooks.id = webhook_deliveries.webhook_id
        AND webhooks.merchant_id::text = current_setting('app.current_merchant_id', true)
    )
  );
