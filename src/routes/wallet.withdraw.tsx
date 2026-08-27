import { createFileRoute, Link } from "@tanstack/react-router";
import { apiUrl } from "@/lib/api-base";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUpFromLine, AlertTriangle, Loader2, Clock3, CheckCircle2, XCircle } from "lucide-react";
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
  const { user, session } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [network, setNetwork] = useState<(typeof NETWORKS)[number]>(NETWORKS[0]);
  const [amount, setAmount] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [networkFee, setNetworkFee] = useState<number | null>(null);
  const [feeLoading, setFeeLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    refreshWalletData(user.id).catch((e) => toast.error(e.message));
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    const run = async () => {
      const token = session?.access_token ?? (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) return;
      await fetch(apiUrl("/api/wallet/withdraw"), { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
      if (user) await refreshWalletData(user.id).catch(() => null);
    };
    run();
    const timer = window.setInterval(run, 30_000);
    return () => window.clearInterval(timer);
  }, [user?.id, session?.access_token]);

  const amt = parseFloat(amount || "0");

  useEffect(() => {
    if (!amt || amt <= 0) { setNetworkFee(null); return; }
    let cancel = false;
    setFeeLoading(true);
    const t = window.setTimeout(async () => {
      try {
        const token = session?.access_token ?? (await supabase.auth.getSession()).data.session?.access_token;
        if (!token) return;
        const r = await fetch(apiUrl(`/api/wallet/withdraw?estimate=1&network=${network.id}&amount=${amt}`), { headers: { Authorization: `Bearer ${token}` } });
        const j = await r.json().catch(() => ({}));
        if (!cancel) setNetworkFee(typeof j.fee === "number" ? j.fee : null);
      } finally {
        if (!cancel) setFeeLoading(false);
      }
    }, 350);
    return () => { cancel = true; window.clearTimeout(t); };
  }, [amt, network.id, session?.access_token]);

  const fee = networkFee ?? 0;
  const receiveAmount = Math.max(0, Math.floor(((amt - fee) + Number.EPSILON) * 100_000_000) / 100_000_000);
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
      const token = session?.access_token ?? (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) throw new Error("Your login session expired. Please sign in again, then retry.");
      const r = await fetch(apiUrl("/api/wallet/withdraw"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ network: network.id, address: address.trim(), amount: amt }),
      });
      const text = await r.text();
      let j: any = {};
      try { j = text ? JSON.parse(text) : {}; } catch { j = { error: text || `HTTP ${r.status}` }; }
      if (!r.ok) throw new Error(j.error || `Withdrawal failed (HTTP ${r.status})`);
      toast.success(j.status === "processing" ? "Withdrawal queued" : "Withdrawal submitted", {
        description: j.message ?? `${receiveAmount.toFixed(8)} USDT withdrawal is now processing.`,
      });
      setAmount(""); setAddress("");
      await refreshWalletData(user.id);
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
            <Input id="amt" type="number" min="0" step="0.00000001" value={amount}
              onChange={(e) => setAmount(e.target.value)} placeholder={String(network.min)} />
            {insufficient && <p className="mt-1 text-xs text-red-500">Insufficient balance</p>}
            {belowMin && <p className="mt-1 text-xs text-amber-600">Below minimum ({network.min} USDT)</p>}
          </div>

          <div className="rounded-lg border border-border bg-background p-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Wallet debit</span><span className="font-mono">{amt ? fmtUSDT(amt) : "0.00 USDT"}</span></div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Network fee ({network.chain})</span>
              <span className="font-mono">
                {amt ? (feeLoading ? "estimating…" : networkFee != null ? `-${networkFee.toFixed(8)} USDT` : "shown by network") : "0.00000000 USDT"}
              </span>
            </div>
            <div className="mt-1 border-t border-border pt-1 flex justify-between font-medium">
              <span>You receive</span>
              <span className="font-mono">
                {amt ? (networkFee != null ? `${receiveAmount.toFixed(8)} USDT` : `~${amt.toFixed(8)} USDT`) : "0.00000000 USDT"}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">Only the on-chain network fee is deducted. No platform service fee.</p>
          </div>


          <Button disabled={busy || insufficient || belowMin || !amt} onClick={submit} variant="hero" className="w-full">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Request Withdrawal"}
          </Button>
        </div>

        <div className="mt-5 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-50/50 p-3 text-xs text-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>Double-check the destination address and network. Withdrawals to the wrong network are unrecoverable.</div>
        </div>

        {withdrawals.length > 0 && (
          <div className="mt-5 rounded-xl border border-border bg-background p-4">
            <h2 className="mb-3 text-sm font-semibold">Recent withdrawals</h2>
            <div className="space-y-2">
              {withdrawals.map((w) => (
                <div key={w.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-xs">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 font-medium capitalize">
                      {statusIcon(displayWithdrawalStatus(w))} {withdrawalStatusLabel(w)}
                    </div>
                    <div className="truncate text-muted-foreground">
                      {w.network?.toUpperCase()} · {String(w.address).slice(0, 8)}…{String(w.address).slice(-6)}
                    </div>
                    {w.tx_hash && <div className="truncate text-[10px] text-muted-foreground">Tx {String(w.tx_hash).slice(0, 10)}…{String(w.tx_hash).slice(-8)}</div>}
                  </div>
                  <div className="text-right font-mono">
                    <div>{Number(w.net_amount ?? 0).toFixed(8)} USDT</div>
                    <div className="text-[10px] text-muted-foreground">{new Date(w.created_at).toLocaleDateString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );

  async function refreshWalletData(userId: string) {
    const [w, rows] = await Promise.all([
      ensureWallet(userId),
      supabase
        .from("withdrawals")
        .select("id, network, address, amount, fee, net_amount, status, tx_hash, created_at, updated_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(6),
    ]);
    setWallet(w);
    setWithdrawals(rows.data ?? []);
  }
}

function statusIcon(status: string) {
  if (status === "completed") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />;
  if (status === "failed" || status === "rejected") return <XCircle className="h-3.5 w-3.5 text-red-600" />;
  return <Clock3 className="h-3.5 w-3.5 text-amber-600" />;
}

function displayWithdrawalStatus(w: any) {
  return w.status === "completed" && !w.tx_hash ? "processing" : String(w.status ?? "processing");
}

function withdrawalStatusLabel(w: any) {
  const status = displayWithdrawalStatus(w);
  if (status === "completed") return "Sent on-chain";
  if (status === "processing") return "Processing payout";
  return status.replace("_", " ");
}
