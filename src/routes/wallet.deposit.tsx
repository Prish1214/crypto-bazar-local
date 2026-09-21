import { createFileRoute, Link } from "@tanstack/react-router";
import { apiUrl } from "@/lib/api-base";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, ArrowDownToLine, Copy, Check, Loader2, AlertTriangle } from "lucide-react";
import { PageShell, RequireAuth } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/wallet/deposit")({
  head: () => ({ meta: [{ title: "Deposit USDT — KryptoBazar" }] }),
  component: () => <RequireAuth><DepositPage /></RequireAuth>,
});

type Network = { id: "trc20" | "bep20" | "erc20" | "polygon"; label: string; chain: string; min: number };

const NETWORKS: Network[] = [
  { id: "trc20",   label: "USDT · TRC20",   chain: "Tron",     min: 1 },
  { id: "bep20",   label: "USDT · BEP20",   chain: "BNB Chain", min: 1 },
  { id: "erc20",   label: "USDT · ERC20",   chain: "Ethereum", min: 10 },
  { id: "polygon", label: "USDT · Polygon", chain: "Polygon",  min: 1 },
];

function DepositPage() {
  const { user } = useAuth();
  const [network, setNetwork] = useState<Network>(NETWORKS[0]);
  const [address, setAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancel = false;
    setAddress(null); setError(null); setLoading(true);
    (async () => {
      try {
        const { data: existing } = await supabase
          .from("deposit_addresses")
          .select("address")
          .eq("user_id", user.id)
          .eq("network", network.id)
          .maybeSingle();
        if (cancel) return;
        if (existing?.address) {
          setAddress(existing.address);
          setLoading(false);
          return;
        }
        // Ask backend to provision one via NOWPayments.
        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token;
        const r = await fetch(apiUrl("/api/wallet/deposit-address"), {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ network: network.id }),
        });
        const text = await r.text();
        let j: any = {};
        try { j = text ? JSON.parse(text) : {}; } catch {
          throw new Error(
            r.status === 404
              ? "Deposit endpoint not deployed yet. Please refresh in a moment."
              : `Server error (${r.status}): ${text.slice(0, 120)}`,
          );
        }
        if (cancel) return;
        if (!r.ok) throw new Error(j.error || `Could not generate address (${r.status})`);
        setAddress(j.address);
      } catch (e: any) {
        if (!cancel) setError(e.message);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [user?.id, network.id]);

  const copy = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    toast.success("Address copied");
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <PageShell>
      <Link to="/wallet" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to wallet
      </Link>

      <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-7 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10">
            <ArrowDownToLine className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">Deposit USDT</h1>
            <p className="text-sm text-muted-foreground">Send USDT to your permanent KryptoBazar address.</p>
          </div>
        </div>

        <div className="mb-5">
          <label className="mb-2 block text-sm font-medium">Select Network</label>
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

        <div className="rounded-xl border border-border bg-background p-5">
          {loading && (
            <div className="grid place-items-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="mt-2 text-xs text-muted-foreground">Generating address…</p>
            </div>
          )}

          {error && !loading && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-50/50 p-3 text-sm text-red-700 dark:bg-red-950/20 dark:text-red-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>{error}</div>
            </div>
          )}

          {address && !loading && (
            <div className="flex flex-col items-center gap-4">
              <div className="rounded-lg bg-white p-3">
                <QRCodeSVG value={address} size={180} level="M" />
              </div>
              <div className="w-full">
                <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Your {network.label} address</div>
                <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-3">
                  <code className="flex-1 break-all text-xs">{address}</code>
                  <Button size="sm" variant="glass" onClick={copy}>
                    {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-5 space-y-2 rounded-lg border border-amber-500/30 bg-amber-50/50 p-3 text-xs text-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
          <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div>
            Send only <b>USDT on {network.chain} ({network.id.toUpperCase()})</b> to this address. Sending any other coin or wrong network will result in permanent loss.
          </div></div>
          <div>• Minimum deposit: <b>{network.min} USDT</b></div>
          <div>• Your balance will be credited automatically after blockchain confirmation.</div>
          <div>• This address is permanent and tied to your account.</div>
        </div>
      </div>
    </PageShell>
  );
}
