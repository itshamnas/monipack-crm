/** One list of reasons a deal is lost, used everywhere (pipeline, call queue, reports). */
export const LOST_REASONS = [
  { id: 'price', label: 'Price too high' },
  { id: 'quantity', label: 'Quantity / minimum order did not fit' },
  { id: 'availability', label: 'Out of stock / we cannot supply' },
  { id: 'competitor', label: 'Bought from a competitor' },
  { id: 'logistics', label: 'Delivery time or logistics' },
  { id: 'postponed', label: 'Customer postponed' },
  { id: 'no_response', label: 'No response / wrong number' },
  { id: 'not_genuine', label: 'Not a real enquiry' },
  { id: 'other', label: 'Other reason' },
];
const BY_ID = Object.fromEntries(LOST_REASONS.map((r) => [r.id, r.label]));
export const lostReasonLabel = (v) => (v ? BY_ID[v] || String(v) : 'Reason not recorded');
