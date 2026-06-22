import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, ArrowRight } from "lucide-react";
import { PageShell, RequireAuth } from "@/components/site-chrome";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { db, type Deal, type Transaction } from "@/lib/db";

export const Route = createFileRoute("/transactions")({
  head: () => ({ meta: [{ title: "History — CryptoBazar" }] }),
  component: () => <RequireAuth><History /></RequireAuth>,
});

function History() {
  const { user } = useAuth();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!user) return;
      const [{ data: d }, { data: t }] = await Promise.all([
        db.from("deals")
          .select("*, listing:listings(*), buyer:profiles!deals_buyer_id_fkey(full_name), seller:profiles!deals_seller_id_fkey(full_name)")
          .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
          .order("created_at", { ascending: false }).limit(50),
        db.from("transactions").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100),
      ]);
      setDeals((d ?? []) as any);
      setTxs((t ?? []) as Transaction[]);
      setLoading(false);
    })();
  }, [user?.id]);

  if (loading) return <PageShell><div className="glass-panel grid place-items-center rounded-2xl p-16"><Loader2 className="h-6 w-6 animate-spin" /></div></PageShell>;

  return (
    <PageShell>
      <h1 className="mb-6 font-display text-3xl font-bold">Transaction History</h1>
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <h2 className="mb-3 font-display text-lg font-semibold">Deals</h2>
          <div className="space-y-2">
            {deals.length === 0 && <div className="glass-panel rounded-xl p-8 text-center text-sm text-muted-foreground">No deals yet</div>}
            {deals.map((d) => {
              const role = d.buyer_id === user!.id ? "Buy" : "Sell";
              return (
                <Link key={d.id} to="/deals/$dealId" params={{ dealId: d.id }} className="glass-panel flex items-center justify-between rounded-xl p-4 hover:border-primary/30">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="border-primary/30 text-primary">{role}</Badge>
                      <span className="font-display font-semibold">{Number(d.amount_usdt).toFixed(2)} USDT</span>
                      <Badge variant="secondary">{d.status.replace("_", " ")}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {new Date(d.created_at).toLocaleString()} · {(d as any)[role === "Buy" ? "seller" : "buyer"]?.full_name ?? "—"}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              );
            })}
          </div>
        </div>

        <div>
          <h2 className="mb-3 font-display text-lg font-semibold">Wallet movements</h2>
          <div className="space-y-2">
            {txs.length === 0 && <div className="glass-panel rounded-xl p-8 text-center text-sm text-muted-foreground">No movements</div>}
            {txs.map((t) => (
              <div key={t.id} className="glass-panel flex items-center justify-between rounded-xl p-3">
                <div>
                  <div className="text-sm font-medium capitalize">{t.type.replace("_", " ")}</div>
                  <div className="text-[11px] text-muted-foreground">{new Date(t.created_at).toLocaleString()}</div>
                  {t.description && <div className="text-[11px] text-muted-foreground">{t.description}</div>}
                </div>
                <div className={`font-mono ${["deposit","escrow_release","trade"].includes(t.type) ? "text-primary" : "text-muted-foreground"}`}>
                  {Number(t.amount).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
