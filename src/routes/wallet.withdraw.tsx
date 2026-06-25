import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUpFromLine, AlertTriangle, Loader2 } from "lucide-react";
import { PageShell, RequireAuth } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { ensureWallet, fmtUSDT, type Wallet } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/wallet/withdraw")({
  head: () => ({ meta: [{ title: "Withdraw USDT — CryptoBazar" }] }),
  component: () => <RequireAuth><WithdrawPage /></RequireAuth>,
});

const NETWORKS = [
  { id: "trc20",   label: "USDT · TRC20",   chain: "Tron",      min: 5 },
  { id: "bep20",   label: "USDT · BEP20",   chain: "BNB Chain", min: 1 },
  { id: "erc20",   label: "USDT · ERC20",   chain: "Ethereum",  min: 20 },
  { id: "polygon", label: "USDT · Polygon", chain: "Polygon",   min: 1 },
] as const;

function WithdrawPage() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [network, setNetwork] = useState<(typeof NETWORKS)[number]>(NETWORKS[0]);
  const [amount, setAmount] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    ensureWallet(user.id).then(setWallet).catch((e) => toast.error(e.message));
  }, [user?.id]);

  const amt = parseFloat(amount || "0");
  const insufficient = wallet ? amt > Number(wallet.balance) : false;
  const belowMin = amt > 0 && amt < network.min;

  const submit = async () => {
    if (!user || !wallet) return;
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");
    if (insufficient) return toast.error("Insufficient balance");
    if (belowMin) return toast.error(`Minimum withdrawal on ${network.chain} is ${network.min} USDT`);
    if (address.trim().length < 10) return toast.error("Enter a valid destination address");

    setBusy(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const r = await fetch("/api/wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ network: network.id, address: address.trim(), amount: amt }),
      });
      const text = await r.text();
      let j: any = {};
      try { j = text ? JSON.parse(text) : {}; } catch { j = { error: text || `HTTP ${r.status}` }; }
      if (!r.ok) throw new Error(j.error || `Withdrawal failed (HTTP ${r.status})`);
      toast.success(`Withdrawal of ${fmtUSDT(amt)} submitted`, {
        description: "You'll receive USDT once the network confirms the payout.",
      });
      setAmount(""); setAddress("");
      setWallet({ ...wallet, balance: Number(wallet.balance) - amt });
    } catch (e: any) {
      toast.error(e.message);
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
        <div className="mb-5 flex items-center gap-3">
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

        <div className="mb-4">
          <Label className="mb-2 block">Network</Label>
          <div className="grid grid-cols-2 gap-2">
            {NETWORKS.map((n) => (
              <button key={n.id} onClick={() => setNetwork(n)}
                className={`rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                  network.id === n.id
                    ? "border-primary bg-primary/10 ring-1 ring-primary"
                    : "border-border bg-background hover:border-primary/40"
                }`}>
                <div className="font-medium">{n.label}</div>
                <div className="text-[11px] text-muted-foreground">{n.chain} · min {n.min} USDT</div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <Label htmlFor="addr">Destination address</Label>
            <Input id="addr" value={address} onChange={(e) => setAddress(e.target.value)}
              placeholder={network.id === "trc20" ? "TXyz…" : "0x…"} />
          </div>
          <div>
            <Label htmlFor="amt">Amount (USDT)</Label>
            <Input id="amt" type="number" min="0" step="0.01" value={amount}
              onChange={(e) => setAmount(e.target.value)} placeholder={String(network.min)} />
            {insufficient && <p className="mt-1 text-xs text-red-500">Insufficient balance</p>}
            {belowMin && <p className="mt-1 text-xs text-amber-600">Below minimum ({network.min} USDT)</p>}
          </div>

          <div className="rounded-lg border border-border bg-background p-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-mono">{amt ? amt.toFixed(2) : "0.00"} USDT</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Network fee</span><span className="font-mono text-muted-foreground">calculated by network</span></div>
            <div className="mt-1 border-t border-border pt-1 flex justify-between font-medium"><span>You'll receive (est.)</span><span className="font-mono">~{amt ? amt.toFixed(2) : "0.00"} USDT</span></div>
          </div>

          <Button disabled={busy || insufficient || belowMin || !amt} onClick={submit} variant="hero" className="w-full">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Request Withdrawal"}
          </Button>
        </div>

        <div className="mt-5 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-50/50 p-3 text-xs text-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>Double-check the destination address and network. Withdrawals to the wrong network are unrecoverable.</div>
        </div>
      </div>
    </PageShell>
  );
}
