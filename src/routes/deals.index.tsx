import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Loader2, ArrowRight, Clock, CheckCircle2, XCircle, Lock,
  AlertOctagon, ShieldCheck, MapPin,
} from "lucide-react";
import { PageShell, RequireAuth } from "@/components/site-chrome";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { db, fetchUserDeals, fmtFiat, fmtUSDT, type Deal, type DealStatus } from "@/lib/db";
import { cn } from "@/lib/utils";
import { DealDetailsDialog } from "@/components/deal/deal-details-dialog";

export const Route = createFileRoute("/deals/")({
  head: () => ({ meta: [{ title: "My Deals — CryptoBazar" }] }),
  component: () => <RequireAuth><DealsIndex /></RequireAuth>,
});

const ONGOING: DealStatus[] = [
  "pending", "accepted", "escrow_funded", "meeting_proposed",
  "meeting_scheduled", "locked", "arrived", "verified",
  "cash_sent", "confirmed", "proof_uploaded", "disputed",
];

function statusTone(s: DealStatus) {
  if (s === "completed") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (s === "cancelled") return "bg-zinc-100 text-zinc-600 border-zinc-200";
  if (s === "disputed") return "bg-rose-100 text-rose-700 border-rose-200";
  if (s === "pending") return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-primary/10 text-primary border-primary/20";
}
function statusIcon(s: DealStatus) {
  if (s === "completed") return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (s === "cancelled") return <XCircle className="h-3.5 w-3.5" />;
  if (s === "disputed") return <AlertOctagon className="h-3.5 w-3.5" />;
  if (s === "locked" || s === "verified") return <Lock className="h-3.5 w-3.5" />;
  return <Clock className="h-3.5 w-3.5" />;
}

function DealsIndex() {
  const { user } = useAuth();
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [tab, setTab] = useState<"ongoing" | "past">("ongoing");
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    try {
      setLoadError(null);
      setDeals(await fetchUserDeals(user.id));
    } catch (error: any) {
      setDeals([]);
      setLoadError(error?.message ?? "Deals could not be loaded.");
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    const ch = db
      .channel(`deals-mine-${user.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "deals", filter: `buyer_id=eq.${user.id}` },
        () => load())
      .on("postgres_changes",
        { event: "*", schema: "public", table: "deals", filter: `seller_id=eq.${user.id}` },
        () => load())
      .subscribe();
    return () => { db.removeChannel(ch); };
    // eslint-disable-next-line
  }, [user?.id]);

  if (!user || deals === null) {
    return (
      <PageShell>
        <div className="grid place-items-center rounded-2xl border border-border bg-card p-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </PageShell>
    );
  }

  const ongoing = deals.filter((d) => ONGOING.includes(d.status));
  const past = deals.filter((d) => ["completed", "cancelled"].includes(d.status));
  const visible = tab === "ongoing" ? ongoing : past;

  return (
    <PageShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">My Deals</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track ongoing escrow trades and review your full history.
          </p>
        </div>
        <Link to="/marketplace">
          <Button variant="hero" size="sm">Find new trades <ArrowRight className="h-4 w-4" /></Button>
        </Link>
      </div>

      {loadError && (
        <div className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {loadError}
        </div>
      )}

      <div className="mb-4 inline-flex rounded-xl border border-border bg-card p-1 shadow-sm">
        {(["ongoing", "past"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
              tab === t ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t === "ongoing" ? `Ongoing (${ongoing.length})` : `Past (${past.length})`}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center">
          <p className="text-sm text-muted-foreground">
            {tab === "ongoing"
              ? "No active deals right now. Start one from the marketplace."
              : "No completed deals yet — your history will appear here."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {visible.map((d) => {
            const isBuyer = d.buyer_id === user.id;
            const counter = isBuyer ? d.seller : d.buyer;
            return (
              <div
                key={d.id}
                className="group rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="border-primary/30 font-mono text-xs text-primary">
                        {d.deal_code ?? d.id.slice(0, 8)}
                      </Badge>
                      <Badge className={cn("gap-1 border", statusTone(d.status))} variant="outline">
                        {statusIcon(d.status)}
                        {d.status.replace(/_/g, " ")}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {isBuyer ? "Buying" : "Selling"}
                      </Badge>
                    </div>

                    <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="font-display text-lg font-bold">
                        {fmtUSDT(d.amount_usdt)}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        for <span className="font-mono text-foreground">{fmtFiat(d.total_fiat)}</span> @ {fmtFiat(d.price_per_usdt)}/USDT
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        {isBuyer ? "Seller:" : "Buyer:"} <span className="font-medium text-foreground">{counter?.full_name ?? counter?.username ?? "—"}</span>
                        {counter?.verified && <ShieldCheck className="h-3 w-3 text-primary" />}
                      </span>
                      {d.listing?.city && (
                        <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {d.listing.city}</span>
                      )}
                      <span>{new Date(d.created_at).toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <DealDetailsDialog deal={d} />
                    <Link to="/deals/$dealId" params={{ dealId: d.id }}>
                      <Button variant="hero" size="sm">
                        Open Room <ArrowRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
