import assert from "node:assert/strict";
import { isCdmReleaseReady } from "../src/lib/cdm.ts";

const recordedReceipt = {
  payment_method: "cdm",
  cdm_receipt_url: "receipt-image-url",
  cdm_receipt_uploaded_at: "2026-11-25T04:13:00.000Z",
  cdm_verified_at: "2026-11-25T04:20:00.000Z",
};

assert.equal(
  isCdmReleaseReady({ ...recordedReceipt, cdm_receipt_url: null }),
  false,
  "CDM release requires a saved receipt",
);
assert.equal(
  isCdmReleaseReady({ ...recordedReceipt, cdm_receipt_uploaded_at: null }),
  false,
  "CDM release requires the receipt upload timestamp",
);
assert.equal(
  isCdmReleaseReady({ ...recordedReceipt, cdm_verified_at: null }),
  false,
  "CDM release requires seller confirmation of bank credit",
);
assert.equal(isCdmReleaseReady(recordedReceipt), true);
assert.equal(isCdmReleaseReady({ payment_method: "cash" }), true);