import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Wallet as WalletIcon, ArrowDownToLine, ArrowUpFromLine, Lock, Loader2 } from "lucide-react";
import { PageShell, RequireAuth } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { db, fmtUSDT, type Transaction, type Wallet } from "@/lib/db";
import { toast } from "sonner";

export const Route = createFileRoute("/wallet")({
  head: () => ({ meta: [{ title: "Wallet — CryptoBazar" }] }),
  component: () => <RequireAuth><WalletPage /></RequireAuth>,
});

function WalletPage() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    if (!user) return;
    const [{ data: w }, { data: t }] = await Promise.all([
      db.from("wallets").select("*").eq("user_id", user.id).maybeSingle(),
      db.from("transactions").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
    ]);
    setWallet((w as Wallet) ?? null);
    setTxs((t ?? []) as Transaction[]);
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [user?.id]);

  const move = async (kind: "deposit" | "withdraw") => {
    if (!user || !wallet) return;
    const v = parseFloat(amount);
    if (!v || v <= 0) return toast.error("Enter a valid amount");
    if (kind === "withdraw" && v > Number(wallet.balance)) return toast.error("Insufficient balance");

    setBusy(true);
    try {
      const newBal = kind === "deposit" ? Number(wallet.balance) + v : Number(wallet.balance) - v;
      const { error: e1 } = await db.from("wallets").update({ balance: newBal, updated_at: new Date().toISOString() }).eq("user_id", user.id);
      if (e1) throw e1;
      const { error: e2 } = await db.from("transactions").insert({
        user_id: user.id,
        type: kind,
        amount: v,
        description: kind === "deposit" ? "Manual deposit (demo)" : "Withdrawal request",
      });
      if (e2) throw e2;
      toast.success(kind === "deposit" ? "Deposited" : "Withdrawn");
      setAmount("");
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Operation failed");
    } finally {
      setBusy(false);
    }
  };

  if (!wallet) {
    return (
      <PageShell>
        <div className="glass-panel grid place-items-center rounded-2xl p-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <h1 className="mb-6 font-display text-3xl font-bold">Wallet</h1>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="glass-strong lg:col-span-2 rounded-2xl p-7">
          <div className="mb-1 inline-flex items-center gap-2 text-xs text-muted-foreground">
            <WalletIcon className="h-3.5 w-3.5" /> Available balance
          </div>
          <div className="font-display text-5xl font-bold text-gradient-primary">
            {fmtUSDT(wallet.balance)}
          </div>
          <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" /> {fmtUSDT(wallet.escrow_balance)} locked in escrow
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-[1fr_auto_auto]">
            <div>
              <Label htmlFor="amt">Amount</Label>
              <Input id="amt" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="100.00" />
            </div>
            <div className="self-end">
              <Button disabled={busy} onClick={() => move("deposit")} variant="hero">
                <ArrowDownToLine className="h-4 w-4" /> Deposit
              </Button>
            </div>
            <div className="self-end">
              <Button disabled={busy} onClick={() => move("withdraw")} variant="glass">
                <ArrowUpFromLine className="h-4 w-4" /> Withdraw
              </Button>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Demo deposits credit your in-app balance directly. Real USDT on-chain deposits / withdrawals
            require connecting a TRC-20 wallet integration.
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-6">
          <h3 className="font-display text-lg font-semibold">Recent activity</h3>
          <div className="mt-4 space-y-2">
            {txs.length === 0 && <p className="text-sm text-muted-foreground">No transactions yet.</p>}
            {txs.map((t) => (
              <div key={t.id} className="glass-strong flex items-center justify-between rounded-lg px-3 py-2 text-sm">
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
