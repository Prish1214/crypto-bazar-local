import { describe, expect, it } from "bun:test";
import { isCdmReleaseReady } from "./cdm";

const verifiedReceipt = {
  payment_method: "cdm",
  cdm_receipt_url: "receipt-image-url",
  cdm_receipt_uploaded_at: "2026-11-25T04:13:00.000Z",
  cdm_verified_at: "2026-11-25T04:20:00.000Z",
};

describe("CDM escrow release gate", () => {
  it("requires a saved receipt and upload timestamp", () => {
    expect(isCdmReleaseReady({ ...verifiedReceipt, cdm_receipt_url: null })).toBe(false);
    expect(isCdmReleaseReady({ ...verifiedReceipt, cdm_receipt_uploaded_at: null })).toBe(false);
  });

  it("requires the seller's explicit bank-credit confirmation", () => {
    expect(isCdmReleaseReady({ ...verifiedReceipt, cdm_verified_at: null })).toBe(false);
  });

  it("allows CDM release after the receipt and seller confirmation are both saved", () => {
    expect(isCdmReleaseReady(verifiedReceipt)).toBe(true);
  });

  it("leaves the existing in-person cash release path unchanged", () => {
    expect(isCdmReleaseReady({ payment_method: "cash" })).toBe(true);
  });
});