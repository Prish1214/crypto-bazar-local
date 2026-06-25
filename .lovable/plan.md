# Plan — Wallet, Ads, Escrow & Deal Room Overhaul

A large, multi-part change touching schema, server functions, and the Deal Room UI. Grouped into 4 phases so each ships verifiable behavior.

## Phase 1 — Wallet & Ad Ownership Rules

**Sell-ad balance validation**
- Frontend (`src/routes/listings.new.tsx`): fetch current wallet; if `type === "sell"`, require `available_amount ≤ wallet.balance`. Disable submit when balance is 0. Inline error + helper text.
- Backend (new migration `docs/schema-v8-sellad-guard.sql`): add `BEFORE INSERT/UPDATE` trigger `enforce_sell_listing_balance` on `listings` — if `type='sell'`, ensure `available_amount ≤ wallets.balance` for `user_id`. Buy ads bypass.

**Ad ownership for accept/decline**
- Add SQL policy + RPC `respond_to_deal(_deal_id, _action)` (`accept` | `decline`) — `SECURITY DEFINER`, asserts `auth.uid() = listing.user_id` (the ad owner), not just `seller_id`.
- Tighten `deals` UPDATE policy: only ad owner can move `pending → accepted/cancelled`.
- Replace any client `.update({status:'accepted'})` calls with `respond_to_deal` RPC.

**Auto-escrow on accept**
- Inside `respond_to_deal` when accepting a sell-side ad: atomically move `amount_usdt` from seller's `wallets.balance` → `wallets.escrow_balance`, insert `escrow_lock` transaction, set deal `status='escrow_funded'`, `locked_at=now()`. Fail if insufficient balance.
- Cancel path (`decline` or later cancel): refund escrow → balance via existing/new RPC `cancel_deal_refund`.
- Remove the existing manual "Lock escrow" UI step.

## Phase 2 — Deal Flow Simplification

**Drop Identity Verification step**
- Remove `verified` status usage from UI flow. New chain:
  `escrow_funded → meeting_scheduled → arrived → cash_sent → completed`.
- `src/components/deal/panels.tsx`: delete `PresenceVerification` panel from active flow (keep file but unused) and skip directly from QR-verified to Cash Handover.
- State machine in `deals.$dealId.tsx`: after both `*_qr_verified_at` set, jump to cash handover.

**Live-camera-only proof**
- New component `src/components/deal/live-camera-capture.tsx` using `navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}})`, draws frame to canvas, overlays timestamp + date + "LIVE" badge, exports JPEG Blob.
- `CashHandoverPanel`: replace `<input type="file">` with this component. No `accept="image/*"` fallback, no gallery picker.
- Server: keep upload through existing `uploadDealFile`; filename suffix `-live.jpg`.

**Timer fix**
- In `DealInfoCard` (or wherever countdown lives): stop interval when `status ∈ {completed, cancelled}` or when `meeting_at` passed and stage advanced. Hide countdown entirely post-completion.

## Phase 3 — Mobile-First Deal Room

Rewrite `src/routes/deals.$dealId.tsx` as a single-column, mobile-first layout (works on desktop too).

Visible cards in order:
1. **Status header** (sticky top): deal code, big status pill, "who acts next" line.
2. **Deal Information**: amount, rate, total, meeting time/location.
3. **Counterparty**: avatar, name, trust score, rating, tap-to-view profile.
4. **Current Action Required**: ONE primary CTA card driven by state machine (Accept/Decline, Propose meeting, I've Arrived, Scan QR, Upload Live Proof, Confirm Cash Received, Rate). Sticky bottom action button on mobile.
5. **Chat** (collapsible, expanded by default).

Removed/collapsed by default: progress timeline (collapsible "Steps"), escrow card folded into status header chip, secondary panels hidden until their turn.

**Completed/cancelled view** — render `<CompletedDealView />` showing only:
- Deal Information (read-only)
- Counterparty
- Result badge (Completed ✓ / Cancelled ✗) + completion time + tx ids
- Chat history (read-only)

No escrow card, no timers, no verification panels, no progress controls.

**Mobile polish**
- `min-h-11` touch targets, `text-base` minimum, sticky CTA with `pb-[env(safe-area-inset-bottom)]`.
- Collapsible sections via existing `Collapsible` primitive.
- Test viewports: 360×800 and 412×915.

## Phase 4 — Verification

- Add Playwright smoke: load `/listings/new` with empty wallet → Sell disabled.
- Manual check Deal Room at mobile viewport: only one primary action visible, chat reachable, completed deal shows clean view.
- Run typecheck/build after each phase.

## Technical Notes

- New SQL file: `docs/schema-v8-sellad-guard.sql` — user must run in Supabase SQL Editor.
- New RPCs: `respond_to_deal(uuid, text)`, `cancel_deal_refund(uuid)`.
- Existing `complete_deal_release` already handles escrow → counterparty on completion; reuse.
- Live capture requires HTTPS (preview & published both OK).
- No new packages needed.

## Out of Scope

- Rebuilding chat encryption.
- Admin dispute screens.
- Push notifications.

## Deliverables

- 1 migration SQL block (user runs).
- ~2 new components (LiveCameraCapture, CompletedDealView).
- Rewritten `deals.$dealId.tsx`, updated `listings.new.tsx`, updated panels.
- Updated client calls to use new RPCs.
