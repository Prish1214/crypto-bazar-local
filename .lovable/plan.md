
## Goal
Make the Deal Room the heart of CryptoBazar. Premium fintech UI (Binance/Telegram-grade), full 14-step flow, escrow, in-app chat only — no external contact sharing.

## Scope (v1, all on existing Supabase)

### 1. Schema additions (`docs/schema.sql` + new migration)
Extend `deals` table:
- `deal_code` text unique (e.g. `CM-847293`, auto-generated)
- `meeting_proposed_by`, `meeting_status` (`proposed|confirmed|rejected`)
- `locked_at` timestamptz (deal-lock snapshot)
- `buyer_arrived_at`, `seller_arrived_at` timestamptz
- `buyer_arrival_lat/lng`, `seller_arrival_lat/lng` numeric
- `buyer_selfie_url`, `seller_selfie_url` text
- `buyer_location_photo_url`, `seller_location_photo_url` text
- `cash_photo_url`, `cash_video_url`, `cash_notes` text
- `cash_handover_at`, `seller_confirmed_at` timestamptz

Extend `messages`:
- `kind` enum: `text|voice|image|location|note|system`
- `attachment_url`, `lat`, `lng`, `duration_ms`

New deal status values: add `meeting_proposed`, `locked`, `arrived`, `verified`, `cash_sent`, `confirmed` to existing flow.

Storage bucket: `deal-evidence` (private), RLS scoped to deal participants.

Auto-generate `deal_code` via trigger.

### 2. New components (`src/components/deal/`)
- `EscrowStatusCard` — locked amount, status pill, animated lock icon
- `DealInfoCard` — deal code, amount, locked rate, total, timer
- `MeetingCard` — propose/accept/reject UI with date/time/location
- `ProgressTimeline` — vertical visual timeline of all 14 steps with active/done/pending states
- `ArrivalCheckIn` — "I Have Arrived" button + GPS capture
- `PresenceVerification` — selfie + optional location photo upload
- `CashHandoverPanel` — buyer evidence upload (photo/video/notes)
- `SellerConfirmPanel` — "Cash Received" / "Not Received" + final confirmation dialog
- `ChatPanel` — premium chat: text, image, voice (MediaRecorder), location share, system messages, E2E badge
- `TrustHeader` — merchant card with trust score, badges, ranking

### 3. Refactor `src/routes/deals.$dealId.tsx`
Three-column desktop layout (single-column mobile):
- Left: ProgressTimeline + EscrowStatusCard
- Center: ChatPanel (primary focus)
- Right: DealInfoCard → MeetingCard → ArrivalCheckIn → PresenceVerification → CashHandoverPanel → SellerConfirmPanel (state-driven, only relevant section active)

State machine drives which panel is enabled. All transitions write a `system` message to chat ("Escrow locked", "Meeting confirmed for…", "Buyer arrived", etc.).

### 4. Settlement logic (existing `releaseEscrow` extended)
On seller final confirm → release USDT minus 0.1% fee → mark `completed` → trigger reputation update (trades count, success rate, volume, trust score recompute) → prompt mutual rating.

### 5. Trust score
Compute from `profiles`: `trust_score = round( (rating/5 * 60) + (success_rate * 30) + min(total_trades,50)/50 * 10 )`. Display as 95/100.

### 6. Anti-leak chat filter
Client-side regex strips phone numbers, emails, @handles, t.me/wa.me links from outgoing messages → replaced with `[hidden — keep chat in CryptoBazar]`. Toast warns sender.

### 7. Storage + RLS
Private `deal-evidence` bucket. Path: `{deal_id}/{user_id}/{filename}`. Policy: only buyer/seller of that deal can read/write.

## Technical notes
- E2E messaging label uses client-side AES-GCM with per-deal key derived from `deal_id + both user ids` stored locally; messages stored ciphertext in DB. (v1 pragmatic E2E — true zero-knowledge requires key exchange UI; can iterate.)
- Voice notes: `MediaRecorder` → webm → upload to bucket.
- Geolocation: `navigator.geolocation.getCurrentPosition`.
- Timer: 30-min countdown from `meeting_at`.
- Realtime: existing `postgres_changes` channel covers deals + messages.

## Out of scope (v1)
- Biometric auth (noted as future)
- Dispute arbitration UI (status exists; admin review later)
- Native mobile camera (uses web file input + getUserMedia)

## Deliverables
- 1 migration SQL block (user runs in Supabase)
- 1 storage bucket
- ~10 new components
- Rewritten Deal Room route
- Updated `db.ts` types
- Chat sanitizer util
- Trust score util
