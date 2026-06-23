import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUpFromLine, Info } from "lucide-react";
import { PageShell, RequireAuth } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { db, ensureWallet, fmtUSDT, type Wallet } from "@/lib/db";
import { toast } from "sonner";

export const Route = createFileRoute("/wallet/withdraw")({
  head: () => ({ meta: [{ title: "Withdraw — CryptoBazar" }] }),
  component: () => <RequireAuth><WithdrawPage /></RequireAuth>,
});

function WithdrawPage() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [amount, setAmount] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    ensureWallet(user.id).then(setWallet).catch((e) => toast.error(e.message));
  }, [user?.id]);

  const submit = async () => {
    if (!user || !wallet) return;
    const v = parseFloat(amount);
    if (!v || v <= 0) return toast.error("Enter a valid amount");
    if (v > Number(wallet.balance)) return toast.error("Insufficient balance");
    if (!address.trim() || address.trim().length < 10) return toast.error("Enter a valid TRC-20 address");

    setBusy(true);
    try {
      const newBal = Number(wallet.balance) - v;
      const { error: e1 } = await db.from("wallets")
        .update({ balance: newBal, updated_at: new Date().toISOString() })
        .eq("user_id", user.id);
      if (e1) throw e1;
      await db.from("transactions").insert({
        user_id: user.id, type: "withdraw", amount: v,
        description: `Withdrawal to ${address.slice(0, 6)}…${address.slice(-4)} (NOWPayments pending)`,
      });
      toast.success(`Withdrawal of ${fmtUSDT(v)} queued`);
      setAmount(""); setAddress("");
      setWallet({ ...wallet, balance: newBal });
    } catch (e: any) {
      toast.error(e.message ?? "Withdraw failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell>
      <Link to="/wallet" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to wallet
      </Link>

      <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-7 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10">
            <ArrowUpFromLine className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">Withdraw USDT</h1>
            <p className="text-sm text-muted-foreground">
              Available: <span className="font-mono">{wallet ? fmtUSDT(wallet.balance) : "—"}</span>
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <Label htmlFor="addr">TRC-20 destination address</Label>
            <Input id="addr" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="TXyz…" />
          </div>
          <div>
            <Label htmlFor="amt">Amount (USDT)</Label>
            <Input id="amt" type="number" min="0" step="0.01" value={amount}
              onChange={(e) => setAmount(e.target.value)} placeholder="50.00" />
          </div>
          <Button disabled={busy} onClick={submit} variant="hero" className="w-full">
            Request Withdrawal
          </Button>
        </div>

        <div className="mt-5 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-50/50 p-3 text-xs text-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            On-chain payouts will be processed via <b>NOWPayments</b>. Until the
            integration is connected, requests are recorded as transactions and
            debited from your in-app balance.
          </div>
        </div>
      </div>
    </PageShell>
  );
}
