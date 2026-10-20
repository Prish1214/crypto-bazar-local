// Cash Deposit Machine (CDM) support.
//
// SAFETY RULES (do not remove):
// - Live CDM deals stay disabled (CDM_LIVE_ENABLED = false) until a
//   VERIFIED CDM machine directory and verified banking rules exist.
// - Never invent or hardcode machine locations. The CDM map must show a
//   "no verified data" state until a real, verified directory is connected.
// - A receipt image never proves payment. Escrow is only released by the
//   seller's explicit confirmation after they verify the bank credit.
// - Bank account numbers are masked in all UI by default.
export const CDM_LIVE_ENABLED = false;

/** Mask a bank account number, keeping only the last 4 digits visible. */
export function maskAccount(account: string | null | undefined): string {
  const digits = (account ?? "").replace(/\D/g, "");
  if (!digits) return "—";
  if (digits.length <= 4) return `••••${digits}`;
  return `••••••${digits.slice(-4)}`;
}

export const isCdmDeal = (paymentMethod?: string | null): boolean =>
  paymentMethod === "cdm";
