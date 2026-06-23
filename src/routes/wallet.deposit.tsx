import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ArrowDownToLine, Info } from "lucide-react";
import { PageShell, RequireAuth } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { db, ensureWallet, fmtUSDT } from "@/lib/db";
import { toast } from "sonner";

export const Route = createFileRoute("/wallet/deposit")({
  head: () => ({ meta: [{ title: "Deposit — CryptoBazar" }] }),
  component: () => <RequireAuth><DepositPage /></RequireAuth>,
});

function DepositPage() {
  const { user } = useAuth();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!user) return;
    const v = parseFloat(amount);
    if (!v || v <= 0) return toast.error("Enter a valid amount");
    setBusy(true);
    try {
      const w = await ensureWallet(user.id);
      const newBal = Number(w.balance) + v;
      const { error: e1 } = await db.from("wallets")
        .update({ balance: newBal, updated_at: new Date().toISOString() })
        .eq("user_id", user.id);
      if (e1) throw e1;
      await db.from("transactions").insert({
        user_id: user.id, type: "deposit", amount: v,
        description: "Manual deposit (NOWPayments pending integration)",
      });
      toast.success(`Deposited ${fmtUSDT(v)}`);
      setAmount("");
    } catch (e: any) {
      toast.error(e.message ?? "Deposit failed");
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
            <ArrowDownToLine className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">Deposit USDT</h1>
            <p className="text-sm text-muted-foreground">Add funds to your CryptoBazar wallet.</p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <Label htmlFor="amt">Amount (USDT)</Label>
            <Input id="amt" type="number" min="0" step="0.01" value={amount}
              onChange={(e) => setAmount(e.target.value)} placeholder="100.00" />
          </div>
          <Button disabled={busy} onClick={submit} variant="hero" className="w-full">
            Confirm Deposit
          </Button>
        </div>

        <div className="mt-5 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-50/50 p-3 text-xs text-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            On-chain deposits will be processed via <b>NOWPayments</b> (TRC-20
            USDT). Connect the integration to enable real deposits — this page
            currently credits your in-app balance for testing.
          </div>
        </div>
      </div>
    </PageShell>
  );
}
