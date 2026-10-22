import { Lock, ShieldCheck, Star, Clock, MapPin, CheckCircle2, Circle, Banknote, Send, Landmark, Copy, Eye, EyeOff, AlertTriangle, Paperclip } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useEffect, useRef, useState } from "react";
import { fmtFiat, fmtUSDT, type Deal, type Profile } from "@/lib/db";
import { trustScore, trustLabel } from "@/lib/trust";
import { maskAccount } from "@/lib/cdm"; // SAFETY: bank account numbers are masked in all UI by default.
import { Link } from "@tanstack/react-router";

// ---------- Progress Timeline ----------
export const TIMELINE: { key: string; label: string; match: (d: Deal) => boolean }[] = [
  { key: "started",     label: "Deal Started",         match: () => true },
  { key: "escrow",      label: "Escrow Locked",        match: (d) => !!d.locked_at || ["escrow_funded","meeting_proposed","meeting_scheduled","locked","arrived","verified","cash_sent","confirmed","completed","proof_uploaded"].includes(d.status) },
  { key: "meeting",     label: "Meeting Scheduled",    match: (d) => !!d.meeting_at && d.meeting_status === "confirmed" },
  { key: "arrived",     label: "Both Arrived",         match: (d) => !!d.buyer_arrived_at && !!d.seller_arrived_at },
  { key: "qr",          label: "Mutual QR Verified",   match: (d) => !!d.buyer_qr_verified_at && !!d.seller_qr_verified_at },
  { key: "cash",        label: "Cash Handed Over",     match: (d) => !!d.cash_handover_at },
  { key: "released",    label: "Escrow Released",      match: (d) => d.status === "completed" },
  { key: "completed",   label: "Trade Completed",      match: (d) => d.status === "completed" },
];

const COMPACT_STEPS = [
  { key: "escrow", label: "Escrow", match: (d: Deal) => !!d.locked_at || ["escrow_funded","meeting_proposed","meeting_scheduled","locked","arrived","verified","cash_sent","confirmed","completed"].includes(d.status) },
  { key: "meet", label: "Meet", match: (d: Deal) => !!d.meeting_at && d.meeting_status === "confirmed" },
  { key: "verify", label: "Verify", match: (d: Deal) => !!d.buyer_qr_verified_at && !!d.seller_qr_verified_at },
  { key: "cash", label: "Cash", match: (d: Deal) => !!d.cash_handover_at },
  { key: "release", label: "Release", match: (d: Deal) => d.status === "completed" },
];

export function CompactDealSteps({ deal }: { deal: Deal }) {
  const states = COMPACT_STEPS.map((s) => ({ ...s, done: s.match(deal) }));
  const firstOpen = states.findIndex((s) => !s.done);
  const activeIdx = firstOpen === -1 ? states.length - 1 : firstOpen;
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {states.map((s, idx) => {
        const active = idx === activeIdx;
        return (
          <div key={s.key} className="min-w-0">
            <div className={`h-1.5 rounded-full ${s.done ? "bg-success" : active ? "bg-primary" : "bg-border"}`} />
            <div className={`mt-1 truncate text-center text-[10px] font-semibold ${s.done ? "text-success" : active ? "text-primary" : "text-muted-foreground"}`}>
              {s.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function EscrowProgressCard({ deal }: { deal: Deal }) {
  const locked = !!deal.locked_at && deal.status !== "cancelled";
  const released = deal.status === "completed";
  const net = Number(deal.amount_usdt) - Number(deal.fee_usdt ?? 0);
  return (
    <div className="app-card-compact">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase text-primary">
            <Lock className="h-3.5 w-3.5" /> Escrow progress
          </div>
          <div className="mt-1 truncate font-display text-lg font-bold">{fmtUSDT(deal.amount_usdt)}</div>
          <p className="text-[11px] text-muted-foreground">
            {released ? `${fmtUSDT(net)} released to buyer` : locked ? "Funds locked until seller confirms cash" : "Waiting for seller acceptance"}
          </p>
        </div>
        <div className={`grid h-10 w-10 place-items-center rounded-[var(--radius-control)] ${released ? "bg-success/10 text-success" : locked ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}>
          {released ? <Send className="h-5 w-5" /> : locked ? <ShieldCheck className="h-5 w-5" /> : <Banknote className="h-5 w-5" />}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
        <div className="rounded-[var(--radius-control)] bg-secondary/60 p-2">
          <div className="font-semibold">Locked</div>
          <div className={locked ? "text-success" : "text-muted-foreground"}>{locked ? "Yes" : "Pending"}</div>
        </div>
        <div className="rounded-[var(--radius-control)] bg-secondary/60 p-2">
          <div className="font-semibold">Platform fee (0%)</div>
          <div className="font-mono text-muted-foreground">{fmtUSDT(deal.fee_usdt)}</div>
        </div>
        <div className="rounded-[var(--radius-control)] bg-secondary/60 p-2">
          <div className="font-semibold">Buyer gets</div>
          <div className="font-mono text-primary">{fmtUSDT(net)}</div>
        </div>
      </div>
    </div>
  );
}

export function ProgressTimeline({ deal }: { deal: Deal }) {
  const states = TIMELINE.map((t) => ({ ...t, done: t.match(deal) }));
  const activeIdx = states.findIndex((s) => !s.done);
  return (
    <div className="p-1">
      <h3 className="font-display text-sm font-semibold tracking-tight">Deal Progress</h3>
      <ol className="mt-4 space-y-3">
        {states.map((s, i) => {
          const isActive = i === activeIdx;
          return (
            <li key={s.key} className="flex items-start gap-3">
              <div className="relative mt-0.5">
                {s.done ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                ) : isActive ? (
                  <div className="grid h-5 w-5 place-items-center">
                    <span className="h-3 w-3 animate-pulse rounded-full bg-primary" />
                  </div>
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground/40" />
                )}
                {i < states.length - 1 && (
                  <div className={`absolute left-1/2 top-5 h-6 w-px -translate-x-1/2 ${s.done ? "bg-emerald-600/50" : "bg-border"}`} />
                )}
              </div>
              <div className="pb-2">
                <div className={`text-sm ${s.done ? "font-medium text-foreground" : isActive ? "font-medium text-primary" : "text-muted-foreground"}`}>
                  {s.label}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ---------- Escrow Status Card ----------
export function EscrowStatusCard({ deal }: { deal: Deal }) {
  const active = !!deal.locked_at && deal.status !== "completed" && deal.status !== "cancelled";
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/5 to-primary/0 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
          <Lock className="h-4 w-4" /> Escrow
        </div>
        <Badge variant={active ? "default" : "secondary"} className={active ? "bg-emerald-600 hover:bg-emerald-600" : ""}>
          {active ? "ACTIVE" : deal.status === "completed" ? "RELEASED" : "PENDING"}
        </Badge>
      </div>
      <div className="mt-3 font-display text-2xl font-bold">{fmtUSDT(deal.amount_usdt)}</div>
      <p className="mt-1 text-xs text-muted-foreground">
        {active ? "Funds Secured in KryptoBazar Escrow" : deal.status === "completed" ? "USDT released to buyer" : "Awaiting seller to fund escrow"}
      </p>
    </div>
  );
}

// ---------- Deal Info Card ----------
export function DealInfoCard({ deal }: { deal: Deal }) {
  return (
    <div className="app-card-compact">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold tracking-tight">Deal Information</h3>
        <span className="rounded-md bg-secondary px-2 py-0.5 font-mono text-xs">{deal.deal_code ?? "—"}</span>
      </div>
      <dl className="mt-3 space-y-2 text-sm">
        <Row label="Amount" value={fmtUSDT(deal.amount_usdt)} />
        <Row label="Locked Rate" value={fmtFiat(deal.price_per_usdt)} />
        <Row label="Total Value" value={fmtFiat(deal.total_fiat)} accent />
        <Row label="Platform Fee (0%)" value={fmtUSDT(deal.fee_usdt)} />
        {deal.meeting_at && (
          <Row label="Meeting" value={new Date(deal.meeting_at).toLocaleString()} />
        )}
      </dl>
      {deal.locked_at && (
        <div className="mt-3 flex items-center gap-2 rounded-[var(--radius-control)] bg-secondary/50 px-3 py-2 text-xs">
          <Lock className="h-3.5 w-3.5 text-primary" />
          <span className="font-medium">DEAL LOCKED</span>
          <span className="text-muted-foreground">— no modifications allowed</span>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={accent ? "font-display text-base font-bold text-primary" : "font-mono"}>{value}</dd>
    </div>
  );
}

// ---------- Trust Header (counterparty) ----------
export function TrustHeader({ counter }: { counter: Profile | null | undefined }) {
  if (!counter) return null;
  const score = trustScore(counter);
  const t = trustLabel(score);
  return (
    <Link to="/merchant/$userId" params={{ userId: counter.id }} className="app-card-compact block transition hover:border-primary/40">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Counterparty</div>
          <div className="mt-1 flex items-center gap-1.5 font-display text-base font-semibold">
            @{counter.username ?? counter.full_name ?? "merchant"}
            {counter.verified && <ShieldCheck className="h-4 w-4 text-primary" />}
          </div>
          <div className={`mt-0.5 text-xs font-medium ${t.color}`}>{t.label} merchant</div>
        </div>
        <div className="text-right">
          <div className="font-display text-2xl font-bold text-emerald-600">{score}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Trust /100</div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <Stat label="Trades" value={counter.total_trades ?? 0} />
        <Stat label="Success" value={`${counter.total_trades ? Math.round(((counter.completed_trades ?? 0) / counter.total_trades) * 100) : 0}%`} />
        <Stat label="Rating" value={<span className="inline-flex items-center gap-0.5"><Star className="h-3 w-3 fill-warning text-warning" />{Number(counter.rating ?? 0).toFixed(1)}</span>} />
      </div>
    </Link>
  );
}
function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-[var(--radius-control)] bg-secondary/40 px-2 py-1.5">
      <div className="font-display text-sm font-semibold">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

// ---------- Meeting Card ----------
export function MeetingCard({
  deal, isBuyer, isSeller, onPropose, onAccept, onReject,
}: {
  deal: Deal;
  isBuyer: boolean;
  isSeller: boolean;
  onPropose: (when: string, location: string) => void;
  onAccept: () => void;
  onReject: () => void;
}) {
  const [when, setWhen] = useState("");
  const [loc, setLoc] = useState(deal.meeting_location ?? "");

  const canRespond =
    deal.meeting_status === "proposed" && deal.meeting_proposed_by && deal.meeting_proposed_by !== (isBuyer ? deal.buyer_id : deal.seller_id);

  if (deal.meeting_status === "confirmed" && deal.meeting_at) {
    return (
      <div className="rounded-[var(--radius-card)] border border-success/30 bg-success/10 p-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
          <Clock className="h-4 w-4" /> Meeting Confirmed
        </div>
        <div className="mt-2 font-display text-lg font-bold">{new Date(deal.meeting_at).toLocaleString()}</div>
        <div className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" />{deal.meeting_location}</div>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-card p-4 shadow-sm">
      <h3 className="font-display text-sm font-semibold tracking-tight">Meeting Scheduler</h3>
      {canRespond ? (
        <>
          <p className="mt-2 text-sm">Proposed: <strong>{deal.meeting_at && new Date(deal.meeting_at).toLocaleString()}</strong></p>
          <p className="text-xs text-muted-foreground">{deal.meeting_location}</p>
          <div className="mt-3 flex gap-2">
            <Button variant="hero" size="sm" onClick={onAccept}>Accept</Button>
            <Button variant="ghost" size="sm" onClick={onReject}>Reject</Button>
          </div>
        </>
      ) : (
        <>
          <div className="mt-3 space-y-2">
            <div>
              <Label className="text-xs">Date & time</Label>
              <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Meeting location</Label>
              <Input value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="Cafe / landmark in your city" />
            </div>
            <Button variant="hero" className="w-full" size="sm" disabled={!when || !loc} onClick={() => onPropose(new Date(when).toISOString(), loc)}>
              {deal.meeting_status === "proposed" ? "Suggest Alternative" : "Propose Meeting"}
            </Button>
            {deal.meeting_status === "proposed" && (
              <p className="text-xs text-muted-foreground">Waiting for the other party to respond…</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ---------- Arrival Check-In ----------
export function ArrivalCheckIn({
  deal, isBuyer, onArrive,
}: { deal: Deal; isBuyer: boolean; onArrive: (lat: number | null, lng: number | null) => void }) {
  const arrived = isBuyer ? !!deal.buyer_arrived_at : !!deal.seller_arrived_at;
  const otherArrived = isBuyer ? !!deal.seller_arrived_at : !!deal.buyer_arrived_at;
  const [busy, setBusy] = useState(false);

  const checkIn = () => {
    setBusy(true);
    if (!navigator.geolocation) {
      onArrive(null, null);
      setBusy(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => { onArrive(pos.coords.latitude, pos.coords.longitude); setBusy(false); },
      () => { onArrive(null, null); setBusy(false); },
      { timeout: 8000 },
    );
  };

  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-card p-4 shadow-sm">
      <h3 className="font-display text-sm font-semibold tracking-tight">Arrival Check-In</h3>
      <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs">
        <div className={`rounded-[var(--radius-control)] border px-2 py-2 ${deal.buyer_arrived_at ? "border-success/30 bg-success/10 text-success" : "border-border"}`}>
          <div className="font-semibold">Buyer</div>
          <div>{deal.buyer_arrived_at ? "Arrived" : "Pending"}</div>
        </div>
        <div className={`rounded-[var(--radius-control)] border px-2 py-2 ${deal.seller_arrived_at ? "border-success/30 bg-success/10 text-success" : "border-border"}`}>
          <div className="font-semibold">Seller</div>
          <div>{deal.seller_arrived_at ? "Arrived" : "Pending"}</div>
        </div>
      </div>
      {!arrived && (
        <Button variant="hero" className="mt-3 w-full" size="sm" onClick={checkIn} disabled={busy}>
          <MapPin className="h-4 w-4" /> {busy ? "Locating…" : "I Have Arrived"}
        </Button>
      )}
      {arrived && !otherArrived && (
        <p className="mt-3 text-center text-xs text-muted-foreground">Waiting for the other party to arrive…</p>
      )}
    </div>
  );
}

// ---------- Presence Verification ----------
export function PresenceVerification({
  deal, isBuyer, onUploadSelfie,
}: { deal: Deal; isBuyer: boolean; onUploadSelfie: (file: File) => Promise<void> }) {
  const mySelfie = isBuyer ? deal.buyer_selfie_url : deal.seller_selfie_url;
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h3 className="font-display text-sm font-semibold tracking-tight">Live Presence Verification</h3>
      <p className="mt-1 text-xs text-muted-foreground">Take a quick selfie at the meeting point.</p>
      {mySelfie ? (
        <div className="mt-3 flex items-center gap-2 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" /> Selfie submitted
        </div>
      ) : (
        <>
          <input ref={inputRef} type="file" accept="image/*" capture="user" className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0]; if (!f) return;
              setBusy(true); try { await onUploadSelfie(f); } finally { setBusy(false); }
            }} />
          <Button variant="hero" size="sm" className="mt-3 w-full" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? "Uploading…" : "Capture Selfie"}
          </Button>
        </>
      )}
    </div>
  );
}

// ---------- Cash Handover (live camera only) ----------
import { LiveCameraCapture } from "./live-camera-capture";

export function CashHandoverPanel({
  deal, onSubmit,
}: { deal: Deal; onSubmit: (photo: File | null, notes: string) => Promise<void> }) {
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  if (deal.cash_handover_at) {
    return (
      <div className="rounded-[var(--radius-card)] border border-success/30 bg-success/10 p-4 text-sm">
        <div className="font-semibold text-emerald-700">Cash handed over</div>
        <div className="text-xs text-muted-foreground">{new Date(deal.cash_handover_at).toLocaleString()}</div>
      </div>
    );
  }
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-card p-4 shadow-sm">
      <h3 className="font-display text-sm font-semibold tracking-tight">Cash Handover</h3>
      <p className="mt-1 text-xs text-muted-foreground">Hand the cash over, then capture a live photo as proof.</p>
      <div className="mt-3 space-y-3">
        <Textarea placeholder="Optional notes (denomination breakdown, witness, etc.)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <LiveCameraCapture
          busy={busy}
          onCapture={async (file) => {
            setBusy(true);
            try { await onSubmit(file, notes); } finally { setBusy(false); }
          }}
        />
      </div>
    </div>
  );
}

// ---------- Seller Confirm ----------
export function SellerConfirmPanel({
  deal, onConfirm, onDispute,
}: { deal: Deal; onConfirm: () => Promise<void>; onDispute: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  if (deal.seller_confirmed_at) {
    return (
      <div className="rounded-[var(--radius-card)] border border-success/30 bg-success/10 p-4 text-sm">
        <div className="font-semibold text-emerald-700">Cash receipt confirmed</div>
        <div className="text-xs text-muted-foreground">Escrow released to buyer.</div>
      </div>
    );
  }
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-card p-4 shadow-sm">
      <h3 className="font-display text-sm font-semibold tracking-tight">Seller Confirmation</h3>
      <p className="mt-1 text-xs text-muted-foreground">The buyer marked cash as handed over.</p>
      {!confirming ? (
        <div className="mt-3 flex gap-2">
          <Button variant="hero" size="sm" className="flex-1" onClick={() => setConfirming(true)}>Cash Received</Button>
          <Button variant="ghost" size="sm" onClick={onDispute}>Not Received</Button>
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="text-sm font-medium">Do you confirm cash has been received?</p>
          <p className="mt-1 text-xs text-muted-foreground">Releasing escrow will instantly transfer USDT to the buyer.</p>
          <div className="mt-3 flex gap-2">
            <Button variant="hero" size="sm" className="flex-1" disabled={busy} onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }}>
              {busy ? "Releasing…" : "Confirm & Release"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// CDM (Cash Deposit Machine) panels
// SAFETY (do not remove): a receipt image never proves payment. Escrow
// is only released by the seller's explicit confirmation after they
// verify the actual bank credit. Bank details are masked by default.
// =====================================================================
const CDM_STEPS = [
  { key: "escrow", label: "Escrow", match: (d: Deal) => !!d.locked_at || (d.status !== "pending" && d.status !== "cancelled") },
  { key: "deposit", label: "Deposit", match: (d: Deal) => !!d.cdm_receipt_uploaded_at },
  { key: "verify", label: "Verify", match: (d: Deal) => !!d.cdm_verified_at || !!d.seller_confirmed_at || d.status === "completed" },
  { key: "release", label: "Release", match: (d: Deal) => d.status === "completed" },
];

export function CdmDealSteps({ deal }: { deal: Deal }) {
  const states = CDM_STEPS.map((s) => ({ ...s, done: s.match(deal) }));
  const firstOpen = states.findIndex((s) => !s.done);
  const activeIdx = firstOpen === -1 ? states.length - 1 : firstOpen;
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {states.map((s, idx) => {
        const active = idx === activeIdx;
        return (
          <div key={s.key} className="min-w-0">
            <div className={`h-1.5 rounded-full ${s.done ? "bg-success" : active ? "bg-primary" : "bg-border"}`} />
            <div className={`mt-1 truncate text-center text-[10px] font-semibold ${s.done ? "text-success" : active ? "text-primary" : "text-muted-foreground"}`}>
              {s.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const CDM_TIMELINE: { key: string; label: string; match: (d: Deal) => boolean }[] = [
  { key: "started",  label: "Deal Started",              match: () => true },
  { key: "escrow",   label: "Escrow Locked",            match: (d) => !!d.locked_at || (d.status !== "pending" && d.status !== "cancelled") },
  { key: "deposit",  label: "Buyer Deposited at CDM",   match: (d) => !!d.cdm_receipt_uploaded_at },
  { key: "verify",   label: "Seller Verifying Bank Credit", match: (d) => !!d.cdm_receipt_uploaded_at },
  { key: "released", label: "Escrow Released",          match: (d) => d.status === "completed" },
  { key: "completed", label: "Trade Completed",         match: (d) => d.status === "completed" },
];

export function CdmTimeline({ deal }: { deal: Deal }) {
  const states = CDM_TIMELINE.map((t) => ({ ...t, done: t.match(deal) }));
  const activeIdx = states.findIndex((s) => !s.done);
  return (
    <div className="p-1">
      <h3 className="font-display text-sm font-semibold tracking-tight">CDM Deal Progress</h3>
      <ol className="mt-4 space-y-3">
        {states.map((s, i) => {
          const isActive = i === activeIdx;
          return (
            <li key={s.key} className="flex items-start gap-3">
              <div className="relative mt-0.5">
                {s.done ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                ) : isActive ? (
                  <div className="grid h-5 w-5 place-items-center">
                    <span className="h-3 w-3 animate-pulse rounded-full bg-primary" />
                  </div>
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground/40" />
                )}
                {i < states.length - 1 && (
                  <div className={`absolute left-1/2 top-5 h-6 w-px -translate-x-1/2 ${s.done ? "bg-emerald-600/50" : "bg-border"}`} />
                )}
              </div>
              <div className="pb-2">
                <div className={`text-sm ${s.done ? "font-medium text-foreground" : isActive ? "font-medium text-primary" : "text-muted-foreground"}`}>
                  {s.label}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function CdmSafetyWarning() {
  return (
    <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-50 p-2.5 text-[11px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>A deposit receipt is <b>not</b> proof of payment. The seller independently verifies the actual bank credit before escrow is released — never trust a photo alone.</span>
    </div>
  );
}

// ---------- CDM Deposit (buyer) ----------
export function CdmDepositPanel({
  deal, onSubmit,
}: { deal: Deal; onSubmit: (file: File) => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (label: string, value: string | null | undefined) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch { /* clipboard unavailable */ }
  };

  if (deal.cdm_receipt_url) {
    return (
      <div className="rounded-2xl border border-success/30 bg-success/10 p-4 text-sm">
        <div className="flex items-center gap-2 font-semibold text-emerald-700">
          <CheckCircle2 className="h-4 w-4" /> Deposit receipt uploaded
        </div>
        <p className="mt-1 text-xs text-emerald-700/80">
          Awaiting seller verification. The seller must confirm the actual bank credit before escrow releases — usually a few minutes after the deposit lands.
        </p>
        {deal.cdm_receipt_uploaded_at && (
          <div className="mt-1 text-[11px] text-muted-foreground">Uploaded {new Date(deal.cdm_receipt_uploaded_at).toLocaleString()}</div>
        )}
        <a href={deal.cdm_receipt_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          <Paperclip className="h-3 w-3" /> View receipt
        </a>
      </div>
    );
  }

  const acct = revealed ? (deal.cdm_bank_account ?? "—") : maskAccount(deal.cdm_bank_account);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Landmark className="h-4 w-4 text-primary" /> CDM Deposit
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Deposit the exact amount at any Cash Deposit Machine that accepts {deal.cdm_bank_name ?? "the seller's bank"} deposits.
      </p>

      <div className="mt-3 rounded-xl bg-secondary/60 p-3 text-center">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Deposit exactly</div>
        <div className="font-display text-2xl font-bold text-gradient-primary">{fmtFiat(deal.total_fiat)}</div>
        <div className="text-[11px] text-muted-foreground">for {fmtUSDT(deal.amount_usdt)}</div>
      </div>

      <div className="mt-3 rounded-xl border border-border p-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold">Seller's bank details</div>
          <button type="button" onClick={() => setRevealed((v) => !v)} className="inline-flex items-center gap-1 text-[11px] font-medium text-primary">
            {revealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />} {revealed ? "Hide" : "Reveal"}
          </button>
        </div>
        <dl className="mt-2 space-y-1.5 text-xs">
          <CdmRow label="Bank" value={deal.cdm_bank_name} onCopy={() => copy("bank", deal.cdm_bank_name)} copied={copied === "bank"} />
          <CdmRow label="Account" value={acct} mono onCopy={() => copy("acct", deal.cdm_bank_account)} copied={copied === "acct"} />
          <CdmRow label="IFSC" value={deal.cdm_ifsc} mono onCopy={() => copy("ifsc", deal.cdm_ifsc)} copied={copied === "ifsc"} />
          <CdmRow label="Holder" value={deal.cdm_holder_name} onCopy={() => copy("holder", deal.cdm_holder_name)} copied={copied === "holder"} />
        </dl>
        {deal.listing?.cdm_instructions && (
          <p className="mt-2 whitespace-pre-wrap rounded-lg bg-secondary/60 p-2 text-[11px] text-muted-foreground">{deal.listing.cdm_instructions}</p>
        )}
        {!deal.cdm_bank_account && (
          <p className="mt-2 text-[11px] font-medium text-amber-600">Bank details appear as soon as the seller accepts the deal.</p>
        )}
      </div>

      <CdmSafetyWarning />

      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0]; if (!f) return;
          setBusy(true); try { await onSubmit(f); } finally { setBusy(false); e.target.value = ""; }
        }} />
      <Button variant="hero" className="mt-3 w-full" size="sm" disabled={busy || !deal.cdm_bank_account} onClick={() => inputRef.current?.click()}>
        {busy ? "Uploading…" : "Upload deposit receipt"}
      </Button>
      <p className="mt-1.5 text-center text-[10px] text-muted-foreground">The receipt also lands in the Deal Room chat.</p>
    </div>
  );
}

function CdmRow({ label, value, mono, onCopy, copied }: { label: string; value: string | null; mono?: boolean; onCopy: () => void; copied: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-1.5">
        <span className={mono ? "font-mono" : ""}>{value ?? "—"}</span>
        {value && (
          <button type="button" onClick={onCopy} className="text-muted-foreground hover:text-primary" aria-label={`Copy ${label}`}>
            {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        )}
      </dd>
    </div>
  );
}

// ---------- CDM Seller Verification ----------
export function CdmSellerVerifyPanel({
  deal, onConfirm,
}: { deal: Deal; onConfirm: () => Promise<void> }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Landmark className="h-4 w-4 text-primary" /> Verify CDM deposit
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        The buyer uploaded a deposit receipt for <b>{fmtFiat(deal.total_fiat)}</b>. Check your bank app or passbook and confirm the money actually arrived.
      </p>
      <CdmSafetyWarning />
      {deal.cdm_receipt_url && (
        <a href={deal.cdm_receipt_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          <Paperclip className="h-3 w-3" /> View buyer's receipt
        </a>
      )}
      <Button variant="hero" className="mt-3 w-full" size="sm" onClick={onConfirm}>
        Credit received — release escrow
      </Button>
      <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
        Didn't receive the credit? Open a dispute from the actions below — escrow stays locked.
      </p>
    </div>
  );
}
