import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, ShieldCheck, Star, MapPin, BellRing } from "lucide-react";
import { PageShell, RequireAuth } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { db, ensureWallet, fmtFiat, fmtUSDT, sendSystemMessage, type Listing, type Wallet } from "@/lib/db";
import { toast } from "sonner";

export const Route = createFileRoute("/deals/new/$listingId")({
  head: () => ({ meta: [{ title: "Start a deal — CryptoBazar" }] }),
  component: () => <RequireAuth><StartDeal /></RequireAuth>,
});

function StartDeal() {
  const { listingId } = useParams({ from: "/deals/new/$listingId" });
  const { user } = useAuth();
  const navigate = useNavigate();
  const [listing, setListing] = useState<Listing | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [wallet, setWallet] = useState<Wallet | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await db
        .from("listings")
        .select("*")
        .eq("id", listingId)
        .maybeSingle();
      if (!data) return setListing(null);
      const { data: profile } = await db.from("profiles").select("*").eq("id", (data as any).user_id).maybeSingle();
      setListing({ ...(data as any), profiles: profile ?? null });
    })();
  }, [listingId]);

  useEffect(() => {
    if (!user) { setWallet(null); return; }
    ensureWallet(user.id).then(setWallet).catch(() => setWallet(null));
  }, [user?.id]);

  if (!listing) return <PageShell><div className="glass-panel grid place-items-center rounded-2xl p-16"><Loader2 className="h-6 w-6 animate-spin" /></div></PageShell>;

  const amt = parseFloat(amount || "0");
  const totalFiat = amt * Number(listing.price_per_usdt);
  const fee = amt * 0.001;

  // If this listing is a BUY ad, the current user is the SELLER — they must have USDT.
  const userIsSeller = listing.type === "buy";
  const balance = Number(wallet?.balance ?? 0);
  const sellShortBalance = userIsSeller && balance <= 0;
  const sellOverBalance = userIsSeller && amt > 0 && amt > balance;
  const belowMin = amt > 0 && amt < Number(listing.min_amount);
  const aboveMax = amt > 0 && amt > Number(listing.max_amount);
  const overAvailable = amt > 0 && amt > Number(listing.available_amount);
  const invalid =
    !amt || belowMin || aboveMax || overAvailable || sellShortBalance || sellOverBalance;

  const start = async () => {
    if (!user) return;
    if (user.id === listing.user_id) return toast.error("You can't deal with your own listing");
    if (belowMin || aboveMax) {
      return toast.error(`Amount must be between ${listing.min_amount} and ${listing.max_amount}`);
    }
    if (overAvailable) return toast.error("Exceeds available amount");
    if (sellShortBalance) return toast.error("Deposit USDT before selling — your wallet is empty");
    if (sellOverBalance) return toast.error(`You only have ${fmtUSDT(balance)} available to sell`);

    setBusy(true);
    try {
      const isUserBuyer = listing.type === "sell";
      const buyer_id = isUserBuyer ? user.id : listing.user_id;
      const seller_id = isUserBuyer ? listing.user_id : user.id;

      const { data: deal, error } = await db.from("deals").insert({
        listing_id: listing.id,
        buyer_id, seller_id,
        amount_usdt: amt,
        price_per_usdt: listing.price_per_usdt,
        total_fiat: totalFiat,
        fee_usdt: fee,
        status: "pending",
      }).select("id").single();
      if (error) throw error;
      if (!deal?.id) throw new Error("Deal was created but could not be opened — check permissions.");
      try {
        await sendSystemMessage((deal as any).id, user.id, "Deal started. Both parties can now track this trade in the Deal Room.");
      } catch {
        // Do not block the room from opening if the optional message log migration is not available yet.
      }
      toast.success("Deal started", {
        description: "The deal room is open and the other party will see it in Deals.",
        action: { label: "Open", onClick: () => navigate({ to: "/deals/$dealId", params: { dealId: (deal as any).id } }) },
      });
      await navigate({ to: "/deals/$dealId", params: { dealId: (deal as any).id } });
    } catch (e: any) {
      console.error("start deal failed", e);
      toast.error("Deal could not be started", {
        description: e.message ?? "Please check the database setup and try again.",
      });
    } finally {
      setBusy(false);
    }
  };

  const p = listing.profiles;

  return (
    <PageShell>
      <div className="mx-auto grid max-w-4xl gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div className="glass-strong rounded-2xl p-6">
          <h1 className="font-display text-2xl font-bold">
            {listing.type === "sell" ? "Buy USDT" : "Sell USDT"} from {p?.full_name ?? "merchant"}
          </h1>
          <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {listing.city}</span>
            <span className="inline-flex items-center gap-1"><Star className="h-3 w-3 fill-warning text-warning" /> {Number(p?.rating ?? 0).toFixed(1)}</span>
            {p?.verified && <span className="inline-flex items-center gap-1 text-primary"><ShieldCheck className="h-3 w-3" /> Verified</span>}
          </div>

          <div className="mt-6 space-y-4">
            <div>
              <Label>Amount (USDT)</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`${listing.min_amount} - ${listing.max_amount}`} />
              <p className="mt-1 text-xs text-muted-foreground">
                Limits: {Number(listing.min_amount).toFixed(0)} - {Number(listing.max_amount).toFixed(0)} USDT
              </p>
            </div>

            <div className="glass-panel rounded-xl p-4 text-sm">
              <Row label="Price / USDT" value={fmtFiat(listing.price_per_usdt)} />
              <Row label="Amount" value={amt ? fmtUSDT(amt) : "—"} />
              <Row label="Platform fee (0.1%)" value={amt ? fmtUSDT(fee) : "—"} />
              <div className="my-2 border-t border-glass-border" />
              <Row label="Total cash" value={amt ? fmtFiat(totalFiat) : "—"} accent />
            </div>

            <Button variant="hero" className="w-full" size="lg" onClick={start} disabled={busy || !amount}>
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating deal…</> : <><BellRing className="h-4 w-4" /> Start deal & open room</>}
            </Button>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-6">
          <h3 className="font-display font-semibold">Meeting details</h3>
          <p className="mt-2 text-sm text-muted-foreground">{listing.meeting_location ?? "To be agreed in chat."}</p>
          <h3 className="mt-5 font-display font-semibold">Available</h3>
          <p className="mt-2 text-sm text-muted-foreground">{listing.available_timings ?? "Anytime"}</p>
          {listing.notes && (
            <>
              <h3 className="mt-5 font-display font-semibold">Merchant notes</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{listing.notes}</p>
            </>
          )}
        </div>
      </div>
    </PageShell>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={accent ? "font-display text-lg font-bold text-gradient-primary" : "font-mono"}>{value}</span>
    </div>
  );
}
