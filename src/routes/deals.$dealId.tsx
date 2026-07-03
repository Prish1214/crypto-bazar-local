import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Loader2, Check, X, Lock, Star, AlertOctagon, Clock, ChevronDown,
  MessageSquare, ListChecks, ShieldCheck,
} from "lucide-react";
import { PageShell, RequireAuth } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useAuth } from "@/hooks/use-auth";
import {
  db, fetchDealWithContext, sendSystemMessage, uploadDealFile, fmtUSDT, fmtFiat,
  type Deal, type DealStatus, type Message,
} from "@/lib/db";
import { toast } from "sonner";
import {
  ProgressTimeline, DealInfoCard, TrustHeader, CompactDealSteps, EscrowProgressCard,
  MeetingCard, ArrivalCheckIn,
  CashHandoverPanel, SellerConfirmPanel,
} from "@/components/deal/panels";
import { ChatPanel } from "@/components/deal/chat-panel";
import { MutualQRVerification } from "@/components/deal/qr-verification";
import { DisputeButton } from "@/components/deal/dispute-button";
import { DealDetailsDialog } from "@/components/deal/deal-details-dialog";
import { DealCodeReleaseDialog } from "@/components/deal/deal-code-release-dialog";

export const Route = createFileRoute("/deals/$dealId")({
  head: () => ({ meta: [{ title: "Deal Room — CryptoBazar" }] }),
  component: () => <RequireAuth><DealRoom /></RequireAuth>,
});

const TERMINAL: DealStatus[] = ["completed", "cancelled"];

function DealRoom() {
  const { dealId } = useParams({ from: "/deals/$dealId" });
  const { user } = useAuth();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [hasReview, setHasReview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const hydratedDeal = await fetchDealWithContext(dealId);
      setDeal(hydratedDeal);
      if (!hydratedDeal) setLoadError("This deal room is not available for your account, or the deal was removed.");
      const { data: msgs } = await db.from("messages").select("*").eq("deal_id", dealId).order("created_at");
      setMessages((msgs ?? []) as Message[]);
      if (user) {
        const { data: r } = await db.from("reviews").select("id").eq("deal_id", dealId).eq("reviewer_id", user.id).maybeSingle();
        setHasReview(!!r);
      }
    } catch (error: any) {
      setDeal(null); setMessages([]);
      setLoadError(error?.message ?? "Deal room could not be loaded.");
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [dealId, user?.id]);

  useEffect(() => {
    const ch = db
      .channel(`deal-${dealId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `deal_id=eq.${dealId}` },
        (payload) => setMessages((m) => [...m, payload.new as Message]))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `deal_id=eq.${dealId}` }, () => load())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "deals", filter: `id=eq.${dealId}` }, () => load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "disputes", filter: `deal_id=eq.${dealId}` }, () => load())
      .subscribe();
    return () => { db.removeChannel(ch); };
    // eslint-disable-next-line
  }, [dealId]);

  if (loading || !user) {
    return <PageShell><div className="grid place-items-center rounded-2xl border border-border bg-card p-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div></PageShell>;
  }

  if (!deal) {
    return (
      <PageShell>
        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
          <Badge variant="destructive" className="mb-4">Deal room unavailable</Badge>
          <h1 className="font-display text-2xl font-bold tracking-tight">This deal could not be opened</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{loadError ?? "The deal may not exist, or your account may not be listed as buyer or seller."}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="hero" onClick={load}>Try again</Button>
            <Button variant="outline" onClick={() => history.back()}>Back</Button>
          </div>
        </div>
      </PageShell>
    );
  }

  const isBuyer = user.id === deal.buyer_id;
  const isSeller = user.id === deal.seller_id;
  const counter = isBuyer ? deal.seller : deal.buyer;
  const isOwner = !!deal.listing && deal.listing.user_id === user.id;
  const terminal = TERMINAL.includes(deal.status);

  // ---- mutation helpers ----
  const patch = async (extra: Partial<Deal> & { status?: DealStatus }, systemMsg?: string) => {
    const { error } = await db.from("deals").update({ ...extra, updated_at: new Date().toISOString() } as any).eq("id", dealId);
    if (error) { toast.error(error.message); return false; }
    if (systemMsg) await sendSystemMessage(dealId, user.id, systemMsg);
    return true;
  };

  const respond = async (action: "accept" | "decline") => {
    const { error } = await (db as any).rpc("respond_to_deal", { _deal_id: dealId, _action: action });
    if (error) { toast.error(error.message); return; }
    toast.success(action === "accept" ? "Deal accepted — escrow locked" : "Deal declined");
    await load();
  };

  const cancel = () => patch({ status: "cancelled" }, "Deal cancelled.");
  const proposeMeeting = async (when: string, location: string) => {
    await patch({
      meeting_at: when, meeting_location: location, meeting_proposed_by: user.id,
      meeting_status: "proposed", status: "meeting_proposed",
    } as any, `Meeting proposed for ${new Date(when).toLocaleString()} at ${location}.`);
  };
  const acceptMeeting = () => patch({ meeting_status: "confirmed", status: "meeting_scheduled" } as any, "Meeting confirmed.");
  const rejectMeeting = () => patch({ meeting_status: "rejected", status: "escrow_funded" } as any, "Meeting proposal rejected — please propose another time.");

  const checkIn = async (lat: number | null, lng: number | null) => {
    const key = isBuyer ? "buyer" : "seller";
    const update: any = {
      [`${key}_arrived_at`]: new Date().toISOString(),
      [`${key}_arrival_lat`]: lat,
      [`${key}_arrival_lng`]: lng,
    };
    const otherArrived = isBuyer ? deal.seller_arrived_at : deal.buyer_arrived_at;
    update.status = otherArrived ? "arrived" : "locked";
    await patch(update, `${isBuyer ? "Buyer" : "Seller"} arrived at meeting point.`);
  };

  const markQRVerified = async () => {
    const key = isBuyer ? "buyer_qr_verified_at" : "seller_qr_verified_at";
    const otherKey = isBuyer ? "seller_qr_verified_at" : "buyer_qr_verified_at";
    const update: any = { [key]: new Date().toISOString() };
    if (deal[otherKey]) update.status = "verified";
    await patch(update, `${isBuyer ? "Buyer" : "Seller"} verified counterparty via QR.`);
  };

  const submitCashHandover = async (photo: File | null, notes: string) => {
    let cash_photo_url: string | null = null;
    if (photo) {
      const r = await uploadDealFile(dealId, user.id, photo, "jpg");
      cash_photo_url = r.url;
    }
    await patch({
      cash_photo_url, cash_notes: notes || null,
      cash_handover_at: new Date().toISOString(),
      status: "cash_sent",
    } as any, "Buyer marked cash as handed over.");
  };

  const [releaseOpen, setReleaseOpen] = useState(false);
  const releaseEscrow = async () => { setReleaseOpen(true); };
  const onReleased = async () => {
    const amt = Number(deal!.amount_usdt);
    const fee = Number(deal!.fee_usdt);
    const net = amt - fee;
    await sendSystemMessage(dealId, user.id, `Escrow released — ${fmtUSDT(net)} sent to buyer. Trade completed.`);
    await load();
  };

  const submitReview = async () => {
    if (hasReview) return;
    const { error } = await db.from("reviews").insert({
      deal_id: dealId, reviewer_id: user.id,
      reviewee_id: isBuyer ? deal.seller_id : deal.buyer_id,
      rating, comment,
    });
    if (error) return toast.error(error.message);
    toast.success("Review submitted");
    setHasReview(true);
  };

  const nextAction = getNextAction(deal.status, isBuyer, isSeller, isOwner);
  const bothQRVerified = !!deal.buyer_qr_verified_at && !!deal.seller_qr_verified_at;

  // ----- COMPLETED / CANCELLED VIEW (clean) -----
  if (terminal) {
    return (
      <PageShell>
        <CompletedDealView
          deal={deal} counter={counter} messages={messages}
          isBuyer={isBuyer} hasReview={hasReview} rating={rating} setRating={setRating}
          comment={comment} setComment={setComment} onSubmitReview={submitReview}
        />
      </PageShell>
    );
  }

  // ----- ACTIVE DEAL — mobile-first single column, sticky CTA -----
  const actionProps = {
    deal, isBuyer, isSeller, isOwner, bothQRVerified,
    onAccept: () => respond("accept"),
    onDecline: () => respond("decline"),
    onPropose: proposeMeeting, onAcceptMeeting: acceptMeeting, onRejectMeeting: rejectMeeting,
    onArrive: checkIn, onQR: markQRVerified,
    onCash: submitCashHandover, onConfirm: releaseEscrow,
  };
  const PrimaryAction = renderPrimaryAction(actionProps);

  return (
    <PageShell>
      <div className="sticky top-0 z-20 -mx-3 mb-3 border-b border-border bg-background/95 px-3 py-2.5 backdrop-blur md:mx-0 md:rounded-[var(--radius-card)] md:border md:bg-card md:px-4 md:py-4 md:shadow-sm">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="border-primary/30 font-mono text-[10px] text-primary">{deal.deal_code ?? "—"}</Badge>
              <Badge className="text-[10px] uppercase">{deal.status.replace(/_/g, " ")}</Badge>
              {deal.locked_at && <Badge variant="secondary" className="gap-1 text-[10px]"><Lock className="h-3 w-3" /> Locked</Badge>}
              {deal.status === "disputed" && <Badge variant="destructive" className="gap-1 text-[10px]"><AlertOctagon className="h-3 w-3" /> Review</Badge>}
            </div>
            <h1 className="mt-1 truncate font-display text-base font-bold tracking-tight sm:text-xl">
              {isBuyer ? "Buying" : "Selling"} {fmtUSDT(deal.amount_usdt)}
            </h1>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[10px] uppercase text-muted-foreground">Total</div>
            <div className="font-mono text-sm font-semibold text-primary">{fmtFiat(deal.total_fiat)}</div>
          </div>
        </div>
        <div className="mt-2"><CompactDealSteps deal={deal} /></div>
        <p className="mt-2 text-xs font-medium text-primary">{nextAction}</p>
      </div>

      <div className="space-y-3 pb-[24rem] md:pb-4">
        <EscrowProgressCard deal={deal} />

        {/* Counterparty */}
        <TrustHeader counter={counter} />

        {PrimaryAction && (
          <div className="hidden rounded-[var(--radius-card)] border-2 border-primary/40 bg-primary/[0.04] p-1 shadow-sm md:block">
            <div className="rounded-[var(--radius-control)] bg-card p-4">{PrimaryAction}</div>
          </div>
        )}

        <DealInfoCard deal={deal} />

        {/* Live meeting countdown — only when relevant */}
        {!terminal && deal.meeting_at && deal.meeting_status === "confirmed" &&
          !deal.cash_handover_at && (
            <MeetingCountdown deal={deal} />
        )}

        {/* Chat */}
        <Collapsible defaultOpen>
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-left">
              <span className="inline-flex items-center gap-2 text-sm font-semibold">
                <MessageSquare className="h-4 w-4 text-primary" /> Chat ({messages.length})
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="border-t border-border">
                <ChatPanel dealId={dealId} userId={user.id} messages={messages} />
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>

        {/* Progress (collapsible secondary) */}
        <Collapsible>
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-left">
              <span className="inline-flex items-center gap-2 text-sm font-semibold">
                <ListChecks className="h-4 w-4 text-primary" /> Deal Steps
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="border-t border-border p-3">
                <ProgressTimeline deal={deal} />
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>

        {/* Secondary actions */}
        <div className="flex flex-wrap items-center gap-2">
          <DealDetailsDialog deal={deal} />
          {(isBuyer || isSeller) && !["pending"].includes(deal.status) && (
            <DisputeButton dealId={dealId} userId={user.id} />
          )}
          {["pending", "escrow_funded", "meeting_proposed", "meeting_scheduled"].includes(deal.status) && (
            <Button variant="ghost" size="sm" onClick={cancel}>Cancel deal</Button>
          )}
        </div>
      </div>
      {PrimaryAction && (
        <div className="fixed inset-x-0 bottom-[calc(3.35rem+env(safe-area-inset-bottom))] z-30 px-3 md:hidden">
          <div className="app-sticky-action mx-auto max-h-[54vh] max-w-lg overflow-y-auto p-3">
            {renderPrimaryAction(actionProps)}
          </div>
        </div>
      )}
      <DealCodeReleaseDialog
        open={releaseOpen}
        onOpenChange={setReleaseOpen}
        dealId={dealId}
        amountLabel={fmtUSDT(Number(deal.amount_usdt) - Number(deal.fee_usdt))}
        onReleased={onReleased}
      />
    </PageShell>
  );
}

// =====================================================================
// Primary action chooser — ONE card at a time
// =====================================================================
function renderPrimaryAction(props: {
  deal: Deal; isBuyer: boolean; isSeller: boolean; isOwner: boolean; bothQRVerified: boolean;
  onAccept: () => void; onDecline: () => void;
  onPropose: (when: string, loc: string) => void;
  onAcceptMeeting: () => void; onRejectMeeting: () => void;
  onArrive: (lat: number | null, lng: number | null) => void;
  onQR: () => Promise<void>;
  onCash: (photo: File | null, notes: string) => Promise<void>;
  onConfirm: () => Promise<void>;
}) {
  const { deal, isBuyer, isSeller, isOwner, bothQRVerified } = props;

  if (deal.status === "pending") {
    if (isOwner) {
      return (
        <div>
          <h2 className="font-display text-base font-semibold">Incoming deal request</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Accepting auto-locks <b>{fmtUSDT(deal.amount_usdt)}</b> from your wallet into escrow.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="hero" size="lg" className="min-h-11" onClick={props.onAccept}>
              <Check className="h-4 w-4" /> Accept
            </Button>
            <Button variant="outline" size="lg" className="min-h-11" onClick={props.onDecline}>
              <X className="h-4 w-4" /> Decline
            </Button>
          </div>
        </div>
      );
    }
    return <WaitingCard title="Waiting for ad owner" text="The ad owner will accept or decline your request shortly." />;
  }

  // Meeting scheduling phase — only until a meeting is confirmed
  if (
    ["accepted", "escrow_funded", "meeting_proposed"].includes(deal.status) ||
    (deal.status === "meeting_scheduled" && deal.meeting_status !== "confirmed")
  ) {
    return (
      <MeetingCard
        deal={deal} isBuyer={isBuyer} isSeller={isSeller}
        onPropose={props.onPropose} onAccept={props.onAcceptMeeting} onReject={props.onRejectMeeting}
      />
    );
  }

  // Once meeting is confirmed (or deal is locked/arrived) → arrival check-in
  if (
    deal.status === "meeting_scheduled" ||
    deal.status === "locked" ||
    deal.status === "arrived"
  ) {
    const meArrived = isBuyer ? !!deal.buyer_arrived_at : !!deal.seller_arrived_at;
    const otherArrived = isBuyer ? !!deal.seller_arrived_at : !!deal.buyer_arrived_at;
    if (!meArrived || !otherArrived) {
      return <ArrivalCheckIn deal={deal} isBuyer={isBuyer} onArrive={props.onArrive} />;
    }
    // both arrived → QR
    return <MutualQRVerification deal={deal} isBuyer={isBuyer} onVerified={props.onQR} />;
  }

  if (deal.status === "verified" || bothQRVerified) {
    if (deal.status === "cash_sent") {
      if (isSeller) return <SellerConfirmPanel deal={deal} onConfirm={props.onConfirm} onDispute={() => {}} />;
      return <WaitingCard title="Waiting for seller" text="Seller is confirming cash receipt to release escrow." />;
    }
    if (isBuyer) return <CashHandoverPanel deal={deal} onSubmit={props.onCash} />;
    return <WaitingCard title="Waiting for buyer" text="Buyer is handing over cash and uploading live proof." />;
  }

  if (deal.status === "cash_sent") {
    if (isSeller) return <SellerConfirmPanel deal={deal} onConfirm={props.onConfirm} onDispute={() => {}} />;
    return <WaitingCard title="Waiting for seller" text="Seller is confirming cash receipt to release escrow." />;
  }

  if (deal.status === "disputed") {
    return <WaitingCard title="Under admin review" text="An admin is reviewing this deal. Escrow is frozen." />;
  }

  return null;
}

function WaitingCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="text-center">
      <ShieldCheck className="mx-auto h-6 w-6 text-primary" />
      <h2 className="mt-2 font-display text-base font-semibold">{title}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{text}</p>
    </div>
  );
}

// =====================================================================
// Completed / Cancelled clean view
// =====================================================================
function CompletedDealView({
  deal, counter, messages, isBuyer, hasReview, rating, setRating, comment, setComment, onSubmitReview,
}: any) {
  const ok = deal.status === "completed";
  return (
    <div className="space-y-3 pb-6">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-primary/30 font-mono text-[10px] text-primary">{deal.deal_code ?? "—"}</Badge>
          <Badge className={ok ? "bg-emerald-600 hover:bg-emerald-600" : "bg-muted text-foreground"}>
            {ok ? "Completed" : "Cancelled"}
          </Badge>
        </div>
        <h1 className="mt-2 font-display text-xl font-bold">
          {isBuyer ? "Bought" : "Sold"} {fmtUSDT(deal.amount_usdt)}
        </h1>
        <p className="text-sm text-muted-foreground">for {fmtFiat(deal.total_fiat)} @ {fmtFiat(deal.price_per_usdt)}/USDT</p>
        {deal.completed_at && (
          <p className="mt-1 text-xs text-muted-foreground">on {new Date(deal.completed_at).toLocaleString()}</p>
        )}
      </div>

      <DealInfoCard deal={deal} />
      <TrustHeader counter={counter} />

      {ok && !hasReview && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h3 className="font-display text-sm font-semibold">Rate this trade</h3>
          <div className="mt-3 flex gap-1">
            {[1,2,3,4,5].map(n => (
              <button key={n} type="button" onClick={() => setRating(n)}>
                <Star className={`h-7 w-7 ${n <= rating ? "fill-warning text-warning" : "text-muted-foreground"}`} />
              </button>
            ))}
          </div>
          <Textarea className="mt-2" value={comment} onChange={(e: any) => setComment(e.target.value)} placeholder="Optional comment…" />
          <Button className="mt-2 w-full" variant="hero" size="sm" onClick={onSubmitReview}>Submit review</Button>
        </div>
      )}
      {ok && hasReview && (
        <div className="rounded-2xl border border-emerald-600/30 bg-emerald-50/50 p-4 text-sm text-emerald-700 dark:bg-emerald-950/20">
          ✓ Review submitted — thanks for keeping CryptoBazar trustworthy.
        </div>
      )}

      {/* Read-only chat history */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold">
          Chat history ({messages.length})
        </div>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto p-3 text-sm">
          {messages.length === 0 && (
            <div className="py-8 text-center text-xs text-muted-foreground">No messages exchanged.</div>
          )}
          {messages.map((m: Message) => (
            <div key={m.id} className="rounded-lg bg-secondary/40 p-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {m.kind} · {new Date(m.created_at).toLocaleString()}
              </div>
              <div className="mt-0.5 whitespace-pre-wrap break-words">{m.content}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="text-center">
        <Link to="/deals" className="text-sm font-medium text-primary hover:underline">← Back to all deals</Link>
      </div>
    </div>
  );
}

// =====================================================================
// Meeting countdown — stops on completion / cancellation
// =====================================================================
function MeetingCountdown({ deal }: { deal: Deal }) {
  const stop = useMemo(() => TERMINAL.includes(deal.status) || !!deal.cash_handover_at, [deal.status, deal.cash_handover_at]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (stop) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [stop]);

  if (stop || !deal.meeting_at || deal.meeting_status !== "confirmed") return null;

  const target = new Date(deal.meeting_at).getTime();
  const diff = target - now;
  const abs = Math.abs(diff);
  const hours = Math.floor(abs / 3_600_000);
  const minutes = Math.floor((abs % 3_600_000) / 60_000);
  const seconds = Math.floor((abs % 60_000) / 1000);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
        <Clock className="h-4 w-4" /> Meeting countdown
      </div>
      <div className="mt-2 font-mono text-2xl font-semibold tabular-nums">
        {hours.toString().padStart(2, "0")}:{minutes.toString().padStart(2, "0")}:{seconds.toString().padStart(2, "0")}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {diff >= 0 ? "until confirmed meeting" : "since scheduled meeting time"}
      </p>
    </div>
  );
}

function getNextAction(status: DealStatus, isBuyer: boolean, isSeller: boolean, isOwner: boolean) {
  if (status === "pending") return isOwner ? "Tap Accept to lock escrow, or Decline." : "Waiting for ad owner to accept your request.";
  if (status === "accepted" || status === "escrow_funded") return "Escrow is locked — propose or confirm a meeting.";
  if (status === "meeting_proposed") return "Meeting proposed — waiting for the other party to confirm.";
  if (status === "meeting_scheduled") return "Meeting confirmed — head to the meeting point.";
  if (status === "locked") return "Both parties should check in at the meeting point.";
  if (status === "arrived") return "Scan the other party's QR to verify presence.";
  if (status === "verified") return isBuyer ? "Hand over cash and capture a live proof photo." : "Wait for buyer cash handover.";
  if (status === "cash_sent") return isSeller ? "Confirm receipt to release escrow." : "Waiting for seller to confirm and release escrow.";
  if (status === "disputed") return "Escrow frozen — admin review in progress.";
  return "Deal in progress.";
}
