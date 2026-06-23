import { Lock, ShieldCheck, Star, Clock, MapPin, CheckCircle2, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useEffect, useRef, useState } from "react";
import { fmtFiat, fmtUSDT, type Deal, type Profile } from "@/lib/db";
import { trustScore, trustLabel } from "@/lib/trust";
import { Link } from "@tanstack/react-router";

// ---------- Progress Timeline ----------
export const TIMELINE: { key: string; label: string; match: (d: Deal) => boolean }[] = [
  { key: "started",     label: "Deal Started",      match: (d) => true },
  { key: "escrow",      label: "Escrow Locked",     match: (d) => !!d.locked_at || ["escrow_funded","meeting_proposed","meeting_scheduled","locked","arrived","verified","cash_sent","confirmed","completed","proof_uploaded"].includes(d.status) },
  { key: "meeting",     label: "Meeting Scheduled", match: (d) => !!d.meeting_at && d.meeting_status === "confirmed" },
  { key: "locked",      label: "Deal Locked",       match: (d) => ["locked","arrived","verified","cash_sent","confirmed","completed"].includes(d.status) },
  { key: "arrived",     label: "Both Arrived",      match: (d) => !!d.buyer_arrived_at && !!d.seller_arrived_at },
  { key: "verified",    label: "Identity Verified", match: (d) => !!d.buyer_selfie_url && !!d.seller_selfie_url },
  { key: "cash",        label: "Cash Handed Over",  match: (d) => !!d.cash_handover_at },
  { key: "confirmed",   label: "Seller Confirmed",  match: (d) => !!d.seller_confirmed_at },
  { key: "released",    label: "Escrow Released",   match: (d) => d.status === "completed" },
  { key: "completed",   label: "Trade Completed",   match: (d) => d.status === "completed" },
];

export function ProgressTimeline({ deal }: { deal: Deal }) {
  const states = TIMELINE.map((t) => ({ ...t, done: t.match(deal) }));
  const activeIdx = states.findIndex((s) => !s.done);
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
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
        {active ? "Funds Secured in CryptoBazar Escrow" : deal.status === "completed" ? "USDT released to buyer" : "Awaiting seller to fund escrow"}
      </p>
    </div>
  );
}

// ---------- Deal Info Card ----------
export function DealInfoCard({ deal }: { deal: Deal }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold tracking-tight">Deal Information</h3>
        <span className="rounded-md bg-secondary px-2 py-0.5 font-mono text-xs">{deal.deal_code ?? "—"}</span>
      </div>
      <dl className="mt-4 space-y-2 text-sm">
        <Row label="Amount" value={fmtUSDT(deal.amount_usdt)} />
        <Row label="Locked Rate" value={fmtFiat(deal.price_per_usdt)} />
        <Row label="Total Value" value={fmtFiat(deal.total_fiat)} accent />
        <Row label="Platform Fee" value={fmtUSDT(deal.fee_usdt)} />
        {deal.meeting_at && (
          <Row label="Meeting" value={new Date(deal.meeting_at).toLocaleString()} />
        )}
      </dl>
      {deal.locked_at && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-secondary/50 px-3 py-2 text-xs">
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
    <Link to="/merchant/$userId" params={{ userId: counter.id }} className="block rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:border-primary/40">
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
    <div className="rounded-lg bg-secondary/40 px-2 py-1.5">
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
      <div className="rounded-2xl border border-emerald-600/30 bg-emerald-50/50 p-5 shadow-sm dark:bg-emerald-950/20">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
          <Clock className="h-4 w-4" /> Meeting Confirmed
        </div>
        <div className="mt-2 font-display text-lg font-bold">{new Date(deal.meeting_at).toLocaleString()}</div>
        <div className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" />{deal.meeting_location}</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
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
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h3 className="font-display text-sm font-semibold tracking-tight">Arrival Check-In</h3>
      <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs">
        <div className={`rounded-lg border px-2 py-2 ${deal.buyer_arrived_at ? "border-emerald-600/30 bg-emerald-50/50 text-emerald-700 dark:bg-emerald-950/20" : "border-border"}`}>
          <div className="font-semibold">Buyer</div>
          <div>{deal.buyer_arrived_at ? "Arrived" : "Pending"}</div>
        </div>
        <div className={`rounded-lg border px-2 py-2 ${deal.seller_arrived_at ? "border-emerald-600/30 bg-emerald-50/50 text-emerald-700 dark:bg-emerald-950/20" : "border-border"}`}>
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

// ---------- Cash Handover ----------
export function CashHandoverPanel({
  deal, onSubmit,
}: { deal: Deal; onSubmit: (photo: File | null, notes: string) => Promise<void> }) {
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  if (deal.cash_handover_at) {
    return (
      <div className="rounded-2xl border border-emerald-600/30 bg-emerald-50/50 p-5 text-sm dark:bg-emerald-950/20">
        <div className="font-semibold text-emerald-700">Cash handed over</div>
        <div className="text-xs text-muted-foreground">{new Date(deal.cash_handover_at).toLocaleString()}</div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h3 className="font-display text-sm font-semibold tracking-tight">Cash Handover</h3>
      <p className="mt-1 text-xs text-muted-foreground">Hand the cash over, then upload proof.</p>
      <div className="mt-3 space-y-2">
        <Input type="file" accept="image/*,video/*" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
        <Textarea placeholder="Optional notes (denomination breakdown, witness, etc.)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <Button variant="hero" className="w-full" size="sm" disabled={busy} onClick={async () => { setBusy(true); try { await onSubmit(photo, notes); } finally { setBusy(false); } }}>
          {busy ? "Submitting…" : "Cash Handed Over"}
        </Button>
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
      <div className="rounded-2xl border border-emerald-600/30 bg-emerald-50/50 p-5 text-sm dark:bg-emerald-950/20">
        <div className="font-semibold text-emerald-700">Cash receipt confirmed</div>
        <div className="text-xs text-muted-foreground">Escrow released to buyer.</div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
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
