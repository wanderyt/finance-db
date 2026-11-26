// How a line item relates to sales tax. Matches new-finance's fin_items.tax_status.
// Taxable goods receive a share of the record's tax, exempt goods do not, and tax lines hold the tax amount.
export const TAX_STATUSES = ['taxable', 'exempt', 'tax'] as const;
export type TaxStatus = (typeof TAX_STATUSES)[number];

export const TAX_STATUS_LABELS: Record<TaxStatus, string> = {
  taxable: '计税',
  exempt: '免税',
  tax: '税',
};

export function isTaxStatus(value: unknown): value is TaxStatus {
  return TAX_STATUSES.includes(value as TaxStatus);
}
