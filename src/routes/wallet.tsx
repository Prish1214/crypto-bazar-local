import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, Lock, Loader2,
  Eye, EyeOff, TrendingUp,
} from "lucide-react";
import { PageShell, RequireAuth } from "@/components/site-chrome";
import { useAuth } from "@/hooks/use-auth";
import { db, ensureWallet, fmtUSDT, type Transaction, type Wallet } from "@/lib/db";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/wallet")({
  head: () => ({ meta: [{ title: "Wallet — KryptoBazar" }] }),
  component: WalletRoute,
});

function WalletRoute() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname !== "/wallet") return <Outlet />;
  return <RequireAuth><WalletPage /></RequireAuth>;
}

function WalletPage() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    (async () => {
      if (!user) return;
      try {
        const w = await ensureWallet(user.id);
        setWallet(w);
        const { data: t } = await db.from("transactions").select("*")
          .eq("user_id", user.id).order("created_at", { ascending: false }).limit(20);
        setTxs((t ?? []) as Transaction[]);
      } catch (e: any) {
        toast.error(e.message ?? "Wallet load failed");
      } finally { setLoading(false); }
    })();
  }, [user?.id]);

  if (loading || !wallet) {
    return (
      <PageShell>
        <div className="grid place-items-center rounded-2xl border border-border bg-card p-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </PageShell>
    );
  }

  const actions = [
    { to: "/wallet/deposit",  label: "Deposit",  icon: ArrowDownToLine },
    { to: "/wallet/withdraw", label: "Withdraw", icon: ArrowUpFromLine },
    { to: "/wallet/transfer", label: "Transfer", icon: ArrowLeftRight },
  ];

  const mask = (v: string | number) => hidden ? "••••••" : fmtUSDT(v);

  return (
    <PageShell>
      {/* Balance hero */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-[image:var(--gradient-primary)] p-5 text-primary-foreground shadow-[var(--shadow-glow)] md:p-7">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-primary-foreground/80">Total balance</span>
            <button onClick={() => setHidden(!hidden)} className="rounded-md p-1.5 text-primary-foreground/80 hover:bg-white/10">
              {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold tracking-tight md:text-5xl">{mask(wallet.balance)}</span>
            <span className="text-sm font-medium text-primary-foreground/80">USDT</span>
          </div>
          <div className="mt-1 inline-flex items-center gap-1.5 text-xs text-primary-foreground/80">
            <Lock className="h-3 w-3" /> {mask(wallet.escrow_balance)} in escrow
          </div>
        </div>
      </section>

      {/* Quick actions */}
      <section className="mt-3 grid grid-cols-3 gap-2 md:gap-3">
        {actions.map((a) => (
          <Link
            key={a.to}
            to={a.to}
            className="group flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-border bg-card py-4 shadow-sm transition-all hover:border-primary/40 hover:shadow-md active:scale-[0.98]"
          >
            <span className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              <a.icon className="h-4 w-4" />
            </span>
            <span className="text-xs font-semibold">{a.label}</span>
          </Link>
        ))}
      </section>

      {/* Recent activity */}
      <section className="mt-4 rounded-2xl border border-border bg-card shadow-sm">
        <header className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <h3 className="font-display text-sm font-semibold">Recent activity</h3>
          <Link to="/transactions" className="text-xs font-medium text-primary hover:underline">See all</Link>
        </header>
        <div className="divide-y divide-border/60">
          {txs.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">No transactions yet.</p>
          )}
          {txs.map((t) => {
            const positive = ["deposit", "escrow_release", "trade", "transfer_in"].includes(t.type);
            return (
              <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={cn(
                    "grid h-8 w-8 shrink-0 place-items-center rounded-full",
                    positive ? "bg-success/10 text-success" : "bg-muted text-muted-foreground",
                  )}>
                    <TrendingUp className={cn("h-3.5 w-3.5", !positive && "rotate-180")} />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium capitalize">{t.type.replace(/_/g, " ")}</div>
                    <div className="text-[11px] text-muted-foreground">{new Date(t.created_at).toLocaleString()}</div>
                  </div>
                </div>
                <div className={cn("shrink-0 font-mono text-sm font-semibold", positive ? "text-success" : "text-foreground")}>
                  {positive ? "+" : "−"}{fmtUSDT(t.amount)}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </PageShell>
  );
}
