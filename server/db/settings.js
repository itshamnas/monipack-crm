import { query } from './pool.js';

const DEFAULT_SETTINGS = {
  companyName: 'Morooj Nizwa International LLC',
  companyNameAr: 'شركة مروج نزوى العالمية ش.م.م',
  brandName: 'Monipack',
  website: 'www.monipack.com',
  shopUrl: 'www.shop.monipack.com',
  phone: '+968 79062219',
  complaintPhone: '+968 9715 0774',
  email: 'info@monipack.com',
  supportEmail: 'customersupport@monipack.com',
  headquarters: 'Ghala, Muscat, Sultanate of Oman',
  currency: 'OMR',
  quoteValidityDays: 30,
  exportRestrictedRole: 'admin',
  enableAuditLogs: true,
  defaultTerms: [
    'All prices are quoted in Omani Rial (OMR).',
    'Quotation validity: 30 days from date of issue.',
    'Payment terms: As per agreed commercial credit terms.',
    'Delivery: Fast delivery across all Oman Wilayats upon confirmed PO.',
  ],
};

export async function getSettings() {
  const { rows } = await query("SELECT value FROM settings WHERE key = 'main'");
  if (!rows[0]) {
    // Insert default settings
    await query(
      "INSERT INTO settings (key, value) VALUES ('main', $1) ON CONFLICT (key) DO NOTHING",
      [JSON.stringify(DEFAULT_SETTINGS)]
    );
    return { ...DEFAULT_SETTINGS };
  }
  const settings = rows[0].value;
  // Ensure defaultTerms exists
  if (!settings.defaultTerms || !Array.isArray(settings.defaultTerms)) {
    settings.defaultTerms = DEFAULT_SETTINGS.defaultTerms;
  }
  return settings;
}

export async function updateSettings(updates) {
  const current = await getSettings();
  const merged = { ...current, ...updates, updatedAt: new Date().toISOString() };
  await query(
    `INSERT INTO settings (key, value) VALUES ('main', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = now()`,
    [JSON.stringify(merged)]
  );
  return merged;
}
