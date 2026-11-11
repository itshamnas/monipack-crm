CREATE INDEX IF NOT EXISTS idx_quotations_lead ON quotations (lead_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads (created_at);
