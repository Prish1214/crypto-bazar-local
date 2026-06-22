import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Loader2, Lock, Check, X, Send, Camera, ShieldCheck, Clock, MapPin, Star,
} from "lucide-react";
import { PageShell, RequireAuth } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { db, fmtFiat, fmtUSDT, type Deal, type Message, type DealStatus } from "@/lib/db";
import { toast } from "sonner";

export const Route = createFileRoute("/deals/$dealId")({
  head: () => ({ meta: [{ title: "Deal Room — CryptoBazar" }] }),
  component: () => <RequireAuth><DealRoom /></RequireAuth>,
});

const STATUS_FLOW: DealStatus[] = [
  "pending", "accepted", "escrow_funded", "meeting_scheduled", "proof_uploaded", "completed",
];

function DealRoom() {
  const { dealId } = useParams({ from: "/deals/$dealId" });
  const { user } = useAuth();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [hasReview, setHasReview] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => { chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight }); }, [messages]);

  if (!deal || !user) return <PageShell><div className="glass-panel grid place-items-center rounded-2xl p-16"><Loader2 className="h-6 w-6 animate-spin" /></div></PageShell>;

  const isBuyer = user.id === deal.buyer_id;
  const isSeller = user.id === deal.seller_id;
  const counter = isBuyer ? deal.seller : deal.buyer;

  const send = async () => {
    if (!text.trim()) return;
    const { error } = await db.from("messages").insert({ deal_id: dealId, sender_id: user.id, content: text.trim() });
    if (error) return toast.error(error.message);
    setText("");
  };

  const setStatus = async (status: DealStatus, extra: Record<string, any> = {}) => {
    const { error } = await db.from("deals").update({ status, updated_at: new Date().toISOString(), ...extra }).eq("id", dealId);
    if (error) return toast.error(error.message);
    toast.success(`Deal ${status.replace("_", " ")}`);
  };

  const accept = () => setStatus("accepted");
  const cancel = () => setStatus("cancelled");

  const fundEscrow = async () => {
    // seller locks USDT
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
    setStatus("escrow_funded");
  };

  const scheduleMeeting = () => {
    const when = prompt("Meeting time (e.g. 2026-06-25 18:00)");
    if (!when) return;
    setStatus("meeting_scheduled", { meeting_at: new Date(when).toISOString() });
  };

  const submitProof = async () => {
    if (!proofUrl) return toast.error("Paste proof URL");
    setStatus("proof_uploaded", { proof_image_url: proofUrl, proof_uploaded_at: new Date().toISOString() });
  };

  const releaseEscrow = async () => {
    // seller releases — credit buyer, debit seller escrow, charge fee
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
    // bump profile stats
    await db.rpc("increment_trade_stats", { _buyer: deal.buyer_id, _seller: deal.seller_id, _amount: amt }).then(() => {}, () => {});
    setStatus("completed", { completed_at: new Date().toISOString() });
  };

  const dispute = () => setStatus("disputed");

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

  const stepIdx = STATUS_FLOW.indexOf(deal.status);

  return (
    <PageShell>
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          {/* Header */}
          <div className="glass-strong rounded-2xl p-6">
            <div className="flex items-start justify-between">
              <div>
                <Badge variant="outline" className="border-primary/30 text-primary">{deal.status.replace("_", " ").toUpperCase()}</Badge>
                <h1 className="mt-2 font-display text-2xl font-bold">
                  {isBuyer ? "Buying" : "Selling"} {fmtUSDT(deal.amount_usdt)}
                </h1>
                <p className="text-sm text-muted-foreground">for {fmtFiat(deal.total_fiat)}</p>
              </div>
              <Link to="/merchant/$userId" params={{ userId: counter?.id ?? "" }} className="glass-panel rounded-xl p-3 hover:border-primary/30">
                <div className="text-xs text-muted-foreground">Counterparty</div>
                <div className="mt-1 flex items-center gap-1.5 font-medium">
                  {counter?.full_name ?? "—"}
                  {counter?.verified && <ShieldCheck className="h-3.5 w-3.5 text-primary" />}
                </div>
                <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <Star className="h-3 w-3 fill-warning text-warning" />{Number(counter?.rating ?? 0).toFixed(1)}
                </div>
              </Link>
            </div>

            {/* Progress */}
            <div className="mt-6 flex items-center gap-1">
              {STATUS_FLOW.map((s, i) => (
                <div key={s} className="flex flex-1 items-center gap-1">
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${i <= stepIdx ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                    {i + 1}
                  </div>
                  {i < STATUS_FLOW.length - 1 && (
                    <div className={`h-0.5 flex-1 ${i < stepIdx ? "bg-primary" : "bg-secondary"}`} />
                  )}
                </div>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-6 gap-1 text-[10px] text-muted-foreground">
              {STATUS_FLOW.map((s) => <div key={s} className="capitalize">{s.replace("_", " ")}</div>)}
            </div>
          </div>

          {/* Actions */}
          <div className="glass-panel rounded-2xl p-5">
            <h3 className="font-display font-semibold">Next steps</h3>
            <div className="mt-4 flex flex-wrap gap-2">
              {deal.status === "pending" && isSeller && (
                <>
                  <Button variant="hero" onClick={accept}><Check className="h-4 w-4" /> Accept</Button>
                  <Button variant="ghost" onClick={cancel}><X className="h-4 w-4" /> Decline</Button>
                </>
              )}
              {deal.status === "accepted" && isSeller && (
                <Button variant="hero" onClick={fundEscrow}><Lock className="h-4 w-4" /> Fund escrow</Button>
              )}
              {deal.status === "escrow_funded" && (
                <Button variant="hero" onClick={scheduleMeeting}><Clock className="h-4 w-4" /> Schedule meeting</Button>
              )}
              {deal.status === "meeting_scheduled" && isBuyer && (
                <div className="flex w-full flex-col gap-2">
                  <Input placeholder="Proof URL (photo of receipt / cash)" value={proofUrl} onChange={(e) => setProofUrl(e.target.value)} />
                  <Button variant="hero" onClick={submitProof}><Camera className="h-4 w-4" /> Upload proof</Button>
                </div>
              )}
              {deal.status === "proof_uploaded" && isSeller && (
                <>
                  <Button variant="hero" onClick={releaseEscrow}><Check className="h-4 w-4" /> Release USDT</Button>
                  <Button variant="ghost" onClick={dispute}>Open dispute</Button>
                </>
              )}
              {["pending", "accepted", "escrow_funded", "meeting_scheduled"].includes(deal.status) && (
                <Button variant="ghost" size="sm" onClick={cancel} className="ml-auto">Cancel</Button>
              )}
              {deal.status === "completed" && !hasReview && (
                <div className="w-full">
                  <p className="mb-2 text-sm font-medium">Rate this trade</p>
                  <div className="mb-2 flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" onClick={() => setRating(n)}>
                        <Star className={`h-6 w-6 ${n <= rating ? "fill-warning text-warning" : "text-muted-foreground"}`} />
                      </button>
                    ))}
                  </div>
                  <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional comment…" />
                  <Button className="mt-2" variant="hero" onClick={submitReview}>Submit review</Button>
                </div>
              )}
              {deal.status === "completed" && hasReview && (
                <p className="text-sm text-muted-foreground">✓ Review submitted</p>
              )}
            </div>

            <div className="mt-5 grid gap-2 text-xs text-muted-foreground">
              {deal.meeting_at && <div><MapPin className="mr-1 inline h-3 w-3" />Meeting: {new Date(deal.meeting_at).toLocaleString()}</div>}
              {deal.listing?.meeting_location && <div>Location: {deal.listing.meeting_location}</div>}
            </div>
          </div>
        </div>

        {/* Chat */}
        <div className="glass-strong flex h-[640px] flex-col rounded-2xl p-5">
          <h3 className="font-display font-semibold">Chat</h3>
          <div ref={chatRef} className="mt-4 flex-1 space-y-2 overflow-y-auto pr-1">
            {messages.length === 0 && <p className="text-center text-xs text-muted-foreground">No messages yet — say hi.</p>}
            {messages.map((m) => {
              const mine = m.sender_id === user.id;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "glass-panel"}`}>
                    {m.content}
                    <div className={`mt-1 text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                      {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex gap-2">
            <Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Type a message…" />
            <Button onClick={send} variant="hero" size="icon"><Send className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
