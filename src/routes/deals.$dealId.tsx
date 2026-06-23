import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Check, X, Lock, ShieldCheck, Star } from "lucide-react";
import { PageShell, RequireAuth } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import {
  db, sendSystemMessage, uploadDealFile, fmtUSDT, fmtFiat,
  type Deal, type DealStatus, type Message,
} from "@/lib/db";
import { toast } from "sonner";
import {
  ProgressTimeline, EscrowStatusCard, DealInfoCard, TrustHeader,
  MeetingCard, ArrivalCheckIn, PresenceVerification,
  CashHandoverPanel, SellerConfirmPanel,
} from "@/components/deal/panels";
import { ChatPanel } from "@/components/deal/chat-panel";

export const Route = createFileRoute("/deals/$dealId")({
  head: () => ({ meta: [{ title: "Deal Room — CryptoBazar" }] }),
  component: () => <RequireAuth><DealRoom /></RequireAuth>,
});

function DealRoom() {
  const { dealId } = useParams({ from: "/deals/$dealId" });
  const { user } = useAuth();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [hasReview, setHasReview] = useState(false);

  const load = async () => {
    const { data } = await db.from("deals")
      .select("*, listing:listings(*), buyer:profiles!deals_buyer_id_fkey(*), seller:profiles!deals_seller_id_fkey(*)")
      .eq("id", dealId).maybeSingle();
    setDeal((data as any) ?? null);
    const { data: msgs } = await db.from("messages").select("*").eq("deal_id", dealId).order("created_at");
    setMessages((msgs ?? []) as Message[]);
    if (user) {
      const { data: r } = await db.from("reviews").select("id").eq("deal_id", dealId).eq("reviewer_id", user.id).maybeSingle();
      setHasReview(!!r);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [dealId, user?.id]);

  useEffect(() => {
    const ch = db
      .channel(`deal-${dealId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `deal_id=eq.${dealId}` },
        (payload) => setMessages((m) => [...m, payload.new as Message]))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "deals", filter: `id=eq.${dealId}` },
        () => load())
      .subscribe();
    return () => { db.removeChannel(ch); };
    // eslint-disable-next-line
  }, [dealId]);

  if (!deal || !user) {
    return <PageShell><div className="grid place-items-center rounded-2xl border border-border bg-card p-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div></PageShell>;
  }

  const isBuyer = user.id === deal.buyer_id;
  const isSeller = user.id === deal.seller_id;
  const counter = isBuyer ? deal.seller : deal.buyer;

  // ---- mutation helpers ----
  const patch = async (extra: Partial<Deal> & { status?: DealStatus }, systemMsg?: string) => {
    const { error } = await db.from("deals").update({ ...extra, updated_at: new Date().toISOString() } as any).eq("id", dealId);
    if (error) { toast.error(error.message); return false; }
    if (systemMsg) await sendSystemMessage(dealId, user.id, systemMsg);
    return true;
  };

  const accept = () => patch({ status: "accepted" }, "Seller accepted the deal.");
  const cancel = () => patch({ status: "cancelled" }, "Deal cancelled.");
  const dispute = () => patch({ status: "disputed" }, "Dispute opened — admin review required.");

  const fundEscrow = async () => {
    const { data: w } = await db.from("wallets").select("*").eq("user_id", user.id).maybeSingle();
    if (!w) return toast.error("Wallet missing");
    const amt = Number(deal.amount_usdt);
    if (Number(w.balance) < amt) return toast.error("Insufficient balance — deposit first");
    const { error: e1 } = await db.from("wallets").update({
      balance: Number(w.balance) - amt,
      escrow_balance: Number(w.escrow_balance) + amt,
      updated_at: new Date().toISOString(),
    }).eq("user_id", user.id);
    if (e1) return toast.error(e1.message);
    await db.from("transactions").insert({ user_id: user.id, deal_id: dealId, type: "escrow_lock", amount: amt, description: "Locked in escrow" });
    await patch({ status: "escrow_funded", locked_at: new Date().toISOString() } as any, `Escrow locked — ${fmtUSDT(amt)} secured by CryptoBazar.`);
  };

  const proposeMeeting = async (when: string, location: string) => {
    await patch({
      meeting_at: when, meeting_location: location, meeting_proposed_by: user.id,
      meeting_status: "proposed", status: "meeting_proposed",
    } as any, `Meeting proposed for ${new Date(when).toLocaleString()} at ${location}.`);
  };
  const acceptMeeting = () => patch({ meeting_status: "confirmed", status: "meeting_scheduled" } as any, "Meeting confirmed.");
  const rejectMeeting = () => patch({ meeting_status: "rejected", status: "escrow_funded" } as any, "Meeting proposal rejected — please propose another time.");

  const lockDeal = () => patch({ status: "locked" } as any, "Deal locked — no further modifications allowed.");

  const checkIn = async (lat: number | null, lng: number | null) => {
    const key = isBuyer ? "buyer" : "seller";
    const update: any = {
      [`${key}_arrived_at`]: new Date().toISOString(),
      [`${key}_arrival_lat`]: lat,
      [`${key}_arrival_lng`]: lng,
    };
    const both = isBuyer ? deal.seller_arrived_at : deal.buyer_arrived_at;
    if (both) update.status = "arrived";
    await patch(update, `${isBuyer ? "Buyer" : "Seller"} arrived at meeting point.`);
  };

  const uploadSelfie = async (file: File) => {
    const { url } = await uploadDealFile(dealId, user.id, file, file.name.split(".").pop() ?? "jpg");
    const key = isBuyer ? "buyer_selfie_url" : "seller_selfie_url";
    const update: any = { [key]: url };
    const otherUrl = isBuyer ? deal.seller_selfie_url : deal.buyer_selfie_url;
    if (otherUrl) update.status = "verified";
    await patch(update, `${isBuyer ? "Buyer" : "Seller"} verified presence with a selfie.`);
  };

  const submitCashHandover = async (photo: File | null, notes: string) => {
    let cash_photo_url: string | null = null;
    if (photo) {
      const r = await uploadDealFile(dealId, user.id, photo, photo.name.split(".").pop() ?? "jpg");
      cash_photo_url = r.url;
    }
    await patch({
      cash_photo_url, cash_notes: notes || null,
      cash_handover_at: new Date().toISOString(),
      status: "cash_sent",
    } as any, "Buyer marked cash as handed over.");
  };

  const releaseEscrow = async () => {
    const amt = Number(deal.amount_usdt);
    const fee = Number(deal.fee_usdt);
    const net = amt - fee;
    const [{ data: sw }, { data: bw }] = await Promise.all([
      db.from("wallets").select("*").eq("user_id", deal.seller_id).maybeSingle(),
      db.from("wallets").select("*").eq("user_id", deal.buyer_id).maybeSingle(),
    ]);
    if (!sw || !bw) return toast.error("Wallets missing");
    await db.from("wallets").update({ escrow_balance: Number(sw.escrow_balance) - amt, updated_at: new Date().toISOString() }).eq("user_id", deal.seller_id);
    await db.from("wallets").update({ balance: Number(bw.balance) + net, updated_at: new Date().toISOString() }).eq("user_id", deal.buyer_id);
    await db.from("transactions").insert([
      { user_id: deal.seller_id, deal_id: dealId, type: "escrow_release", amount: amt, description: "Released to buyer" },
      { user_id: deal.buyer_id, deal_id: dealId, type: "trade", amount: net, description: "USDT received" },
      { user_id: deal.seller_id, deal_id: dealId, type: "fee", amount: fee, description: "Platform fee" },
    ]);
    // bump reputation (best-effort, RLS-safe on profile owner only — also done client-side for visibility)
    await bumpStats(deal.buyer_id, amt);
    await bumpStats(deal.seller_id, amt);
    await patch({
      status: "completed",
      seller_confirmed_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    } as any, `Escrow released — ${fmtUSDT(net)} sent to buyer. Trade completed.`);
  };

  const bumpStats = async (uid: string, amt: number) => {
    const { data: p } = await db.from("profiles").select("total_trades, completed_trades, trade_volume").eq("id", uid).maybeSingle();
    if (!p) return;
    await db.from("profiles").update({
      total_trades: (p as any).total_trades + 1,
      completed_trades: (p as any).completed_trades + 1,
      trade_volume: Number((p as any).trade_volume) + amt,
      updated_at: new Date().toISOString(),
    }).eq("id", uid);
  };

  const submitReview = async () => {
    if (hasReview) return;
    const { error } = await db.from("reviews").insert({
      deal_id: dealId,
      reviewer_id: user.id,
      reviewee_id: isBuyer ? deal.seller_id : deal.buyer_id,
      rating, comment,
    });
    if (error) return toast.error(error.message);
    toast.success("Review submitted");
    setHasReview(true);
  };

  // ---- which action card to highlight ----
  const showMeeting = ["escrow_funded", "meeting_proposed", "meeting_scheduled"].includes(deal.status);
  const showLockBtn = deal.status === "meeting_scheduled" && deal.meeting_status === "confirmed";
  const showArrival = ["locked", "arrived"].includes(deal.status);
  const showVerify  = ["arrived", "verified"].includes(deal.status) && (!deal.buyer_selfie_url || !deal.seller_selfie_url || deal.status !== "verified");
  const showCash    = deal.status === "verified" && isBuyer;
  const showConfirm = deal.status === "cash_sent" && isSeller;

  return (
    <PageShell>
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-primary/30 font-mono text-primary">{deal.deal_code ?? "—"}</Badge>
            <Badge className="uppercase">{deal.status.replace("_", " ")}</Badge>
            {deal.locked_at && <Badge variant="secondary" className="gap-1"><Lock className="h-3 w-3" /> LOCKED</Badge>}
          </div>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight">
            {isBuyer ? "Buying" : "Selling"} {fmtUSDT(deal.amount_usdt)}
          </h1>
          <p className="text-sm text-muted-foreground">for {fmtFiat(deal.total_fiat)} @ {fmtFiat(deal.price_per_usdt)}/USDT</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {deal.status === "pending" && isSeller && (
            <>
              <Button variant="hero" size="sm" onClick={accept}><Check className="h-4 w-4" /> Accept Deal</Button>
              <Button variant="ghost" size="sm" onClick={cancel}><X className="h-4 w-4" /> Decline</Button>
            </>
          )}
          {deal.status === "accepted" && isSeller && (
            <Button variant="hero" size="sm" onClick={fundEscrow}><Lock className="h-4 w-4" /> Fund Escrow</Button>
          )}
          {showLockBtn && (
            <Button variant="hero" size="sm" onClick={lockDeal}><Lock className="h-4 w-4" /> Lock Deal</Button>
          )}
          {["pending", "accepted", "escrow_funded", "meeting_proposed", "meeting_scheduled"].includes(deal.status) && (
            <Button variant="ghost" size="sm" onClick={cancel}>Cancel</Button>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[280px_1fr_320px]">
        {/* LEFT: timeline + escrow */}
        <aside className="space-y-4">
          <EscrowStatusCard deal={deal} />
          <ProgressTimeline deal={deal} />
        </aside>

        {/* CENTER: chat */}
        <main>
          <ChatPanel dealId={dealId} userId={user.id} messages={messages} />
        </main>

        {/* RIGHT: state panels */}
        <aside className="space-y-4">
          <TrustHeader counter={counter} />
          <DealInfoCard deal={deal} />

          {showMeeting && (
            <MeetingCard
              deal={deal} isBuyer={isBuyer} isSeller={isSeller}
              onPropose={proposeMeeting} onAccept={acceptMeeting} onReject={rejectMeeting}
            />
          )}

          {showArrival && <ArrivalCheckIn deal={deal} isBuyer={isBuyer} onArrive={checkIn} />}
          {showVerify && <PresenceVerification deal={deal} isBuyer={isBuyer} onUploadSelfie={uploadSelfie} />}
          {showCash && <CashHandoverPanel deal={deal} onSubmit={submitCashHandover} />}
          {showConfirm && <SellerConfirmPanel deal={deal} onConfirm={releaseEscrow} onDispute={dispute} />}

          {deal.status === "completed" && !hasReview && (
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <h3 className="font-display text-sm font-semibold">Rate this trade</h3>
              <div className="mt-3 flex gap-1">
                {[1,2,3,4,5].map(n => (
                  <button key={n} type="button" onClick={() => setRating(n)}>
                    <Star className={`h-7 w-7 ${n <= rating ? "fill-warning text-warning" : "text-muted-foreground"}`} />
                  </button>
                ))}
              </div>
              <Textarea className="mt-2" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional comment…" />
              <Button className="mt-2 w-full" variant="hero" size="sm" onClick={submitReview}>Submit review</Button>
            </div>
          )}
          {deal.status === "completed" && hasReview && (
            <div className="rounded-2xl border border-emerald-600/30 bg-emerald-50/50 p-5 text-sm text-emerald-700 dark:bg-emerald-950/20">
              ✓ Review submitted — thanks for keeping CryptoBazar trustworthy.
            </div>
          )}
        </aside>
      </div>
    </PageShell>
  );
}
