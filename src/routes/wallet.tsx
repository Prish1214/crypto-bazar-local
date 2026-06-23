import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Wallet as WalletIcon, ArrowDownToLine, ArrowUpFromLine,
  ArrowLeftRight, Lock, Loader2,
} from "lucide-react";
import { PageShell, RequireAuth } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { db, ensureWallet, fmtUSDT, type Transaction, type Wallet } from "@/lib/db";
import { toast } from "sonner";

export const Route = createFileRoute("/wallet")({
  head: () => ({ meta: [{ title: "Wallet — CryptoBazar" }] }),
  component: () => <RequireAuth><WalletPage /></RequireAuth>,
});

function WalletPage() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!user) return;
      try {
        const w = await ensureWallet(user.id);
        setWallet(w);
        const { data: t } = await db.from("transactions").select("*")
          .eq("user_id", user.id).order("created_at", { ascending: false }).limit(15);
        setTxs((t ?? []) as Transaction[]);
      } catch (e: any) {
        toast.error(e.message ?? "Wallet load failed");
      } finally {
        setLoading(false);
      }
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
    { to: "/wallet/deposit",  label: "Deposit",  icon: ArrowDownToLine, variant: "hero"  as const, desc: "Top up via NOWPayments" },
    { to: "/wallet/withdraw", label: "Withdraw", icon: ArrowUpFromLine, variant: "glass" as const, desc: "Send USDT to your wallet" },
    { to: "/wallet/transfer", label: "Transfer", icon: ArrowLeftRight,  variant: "glass" as const, desc: "Send to another username" },
  ];

  return (
    <PageShell>
      <h1 className="mb-6 font-display text-3xl font-bold">Wallet</h1>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-7 shadow-sm lg:col-span-2">
          <div className="mb-1 inline-flex items-center gap-2 text-xs text-muted-foreground">
            <WalletIcon className="h-3.5 w-3.5" /> Available balance
          </div>
          <div className="font-display text-5xl font-bold text-gradient-primary">
            {fmtUSDT(wallet.balance)}
          </div>
          <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" /> {fmtUSDT(wallet.escrow_balance)} locked in escrow
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {actions.map((a) => (
              <Link key={a.to} to={a.to} className="block">
                <div className="group h-full rounded-xl border border-border bg-background p-4 transition hover:border-primary/50 hover:shadow-md">
                  <Button variant={a.variant} size="sm" className="w-full">
                    <a.icon className="h-4 w-4" /> {a.label}
                  </Button>
                  <p className="mt-2 text-xs text-muted-foreground">{a.desc}</p>
                </div>
              </Link>
            ))}
          </div>
          <p className="mt-4 text-[11px] text-muted-foreground">
            Deposits and withdrawals will route through NOWPayments once
            connected. Transfers move USDT instantly between CryptoBazar
            accounts.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h3 className="font-display text-lg font-semibold">Recent activity</h3>
          <div className="mt-4 space-y-2">
            {txs.length === 0 && <p className="text-sm text-muted-foreground">No transactions yet.</p>}
            {txs.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <div>
                  <div className="font-medium capitalize">{t.type.replace("_", " ")}</div>
                  <div className="text-[11px] text-muted-foreground">{new Date(t.created_at).toLocaleString()}</div>
                </div>
                <div className={`font-mono ${["deposit", "escrow_release", "trade"].includes(t.type) ? "text-primary" : "text-muted-foreground"}`}>
                  {Number(t.amount).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
          <Link to="/transactions" className="mt-4 block text-center text-xs text-primary hover:underline">
            View full history →
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
