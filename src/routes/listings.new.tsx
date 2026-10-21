import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell, RequireAuth } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { db, ensureWallet, fmtUSDT, type Wallet } from "@/lib/db";
import { toast } from "sonner";
import { AlertTriangle, Landmark } from "lucide-react";

export const Route = createFileRoute("/listings/new")({
  head: () => ({ meta: [{ title: "Create listing — KryptoBazar" }] }),
  component: () => <RequireAuth><NewListing /></RequireAuth>,
});

function NewListing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [type, setType] = useState<"sell" | "buy">("sell");
  const [city, setCity] = useState("");
  const [price, setPrice] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [available, setAvailable] = useState("");
  const [meeting, setMeeting] = useState("");
  const [timings, setTimings] = useState("");
  const [notes, setNotes] = useState("");
  const [cdmOn, setCdmOn] = useState(false);
  const [bankName, setBankName] = useState("");
  const [acctNo, setAcctNo] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [holder, setHolder] = useState("");
  const [cdmInstructions, setCdmInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [wallet, setWallet] = useState<Wallet | null>(null);

  useEffect(() => {
    if (!user) return;
    ensureWallet(user.id).then(setWallet).catch(() => setWallet(null));
  }, [user?.id]);

  const balance = Number(wallet?.balance ?? 0);
  const maxN = parseFloat(max || "0");
  const availableN = parseFloat(available || "0");

  const sellBlocked = type === "sell" && balance <= 0;
  const sellOverBalance =
    type === "sell" && balance > 0 && (maxN > balance || availableN > balance);
  const sellInvalid = sellBlocked || sellOverBalance;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (sellInvalid) {
      toast.error(
        sellBlocked
          ? "Deposit USDT before creating a Sell ad"
          : `Sell amount cannot exceed your balance (${fmtUSDT(balance)})`,
      );
      return;
    }
    const cdmActive = type === "sell" && cdmOn;
    if (cdmActive && (!bankName.trim() || !acctNo.trim() || !ifsc.trim() || !holder.trim())) {
      toast.error("Fill in your bank details to accept CDM deposits");
      return;
    }
    setBusy(true);
    try {
      if (cdmActive) {
        // Full account numbers live in the owner-only bank_accounts table.
        const { error: bankErr } = await db.from("bank_accounts").upsert({
          user_id: user.id,
          bank_name: bankName.trim(),
          account_number: acctNo.trim(),
          ifsc: ifsc.trim().toUpperCase(),
          holder_name: holder.trim(),
        }, { onConflict: "user_id" });
        if (bankErr) throw bankErr;
      }
      const { error } = await db.from("listings").insert({
        user_id: user.id,
        type,
        status: "active",
        city,
        price_per_usdt: parseFloat(price),
        min_amount: parseFloat(min),
        max_amount: parseFloat(max),
        available_amount: parseFloat(available),
        meeting_location: meeting || null,
        available_timings: timings || null,
        notes: notes || null,
        // Ads are publicly readable — only masked, non-sensitive fields here.
        ...(cdmActive ? {
          cdm_enabled: true,
          cdm_bank_name: bankName.trim(),
          cdm_bank_account_last4: acctNo.replace(/\D/g, "").slice(-4),
          cdm_ifsc: ifsc.trim().toUpperCase(),
          cdm_holder_name: holder.trim(),
          cdm_instructions: cdmInstructions || null,
        } : { cdm_enabled: false }),
      });
      if (error) throw error;
      toast.success("Listing created");
      navigate({ to: "/listings" });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell>
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 font-display text-3xl font-bold">Create listing</h1>
        <form onSubmit={submit} className="glass-strong space-y-5 rounded-2xl p-6">
          <div>
            <Label>I want to</Label>
            <div className="mt-2 inline-flex rounded-lg bg-secondary/40 p-1">
              <button type="button" onClick={() => setType("sell")} className={`rounded-md px-4 py-1.5 text-sm font-medium ${type === "sell" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                Sell USDT for cash
              </button>
              <button type="button" onClick={() => setType("buy")} className={`rounded-md px-4 py-1.5 text-sm font-medium ${type === "buy" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                Buy USDT with cash
              </button>
            </div>
            {wallet && (
              <p className="mt-2 text-xs text-muted-foreground">
                Wallet balance: <span className="font-mono font-semibold text-foreground">{fmtUSDT(balance)}</span>
                {type === "sell" && " — Sell ads require sufficient USDT in your wallet."}
              </p>
            )}
          </div>

          {type === "sell" && sellBlocked && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-semibold">No USDT in your wallet</div>
                <div className="mt-0.5">Deposit funds before listing a Sell ad. You can still create Buy ads.</div>
              </div>
            </div>
          )}
          {type === "sell" && sellOverBalance && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Sell amount cannot exceed your available balance of <b>{fmtUSDT(balance)}</b>.</span>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="City"><Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Mumbai" required /></Field>
            <Field label="Price per USDT (INR)"><Input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="89.50" required /></Field>
            <Field label="Min amount (USDT)"><Input type="number" step="1" value={min} onChange={(e) => setMin(e.target.value)} placeholder="100" required /></Field>
            <Field label="Max amount (USDT)"><Input type="number" step="1" value={max} onChange={(e) => setMax(e.target.value)} placeholder="5000" required /></Field>
            <Field label="Available USDT"><Input type="number" step="1" value={available} onChange={(e) => setAvailable(e.target.value)} placeholder="5000" required /></Field>
            <Field label="Available timings"><Input value={timings} onChange={(e) => setTimings(e.target.value)} placeholder="Mon–Fri, 10am–7pm" /></Field>
          </div>

          <Field label="Meeting location"><Input value={meeting} onChange={(e) => setMeeting(e.target.value)} placeholder="Bandra West, near station" /></Field>
          <Field label="Notes (optional)"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Cash only. Please carry ID." /></Field>

          {type === "sell" && (
            <div className="rounded-xl border border-border p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-semibold"><Landmark className="h-4 w-4 text-primary" /> Accept CDM deposits</div>
                  <p className="mt-0.5 text-xs text-muted-foreground">Buyers can pay by depositing cash into your bank account at a Cash Deposit Machine — no in-person meeting.</p>
                </div>
                <button type="button" role="switch" aria-checked={cdmOn} onClick={() => setCdmOn((v) => !v)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition ${cdmOn ? "bg-primary" : "bg-secondary"}`}>
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-card shadow transition-all ${cdmOn ? "left-[1.375rem]" : "left-0.5"}`} />
                </button>
              </div>
              {cdmOn && (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <Field label="Bank name"><Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="HDFC Bank" /></Field>
                  <Field label="Account number"><Input value={acctNo} onChange={(e) => setAcctNo(e.target.value)} inputMode="numeric" placeholder="Full account number" /></Field>
                  <Field label="IFSC code"><Input value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase())} placeholder="HDFC0001234" /></Field>
                  <Field label="Account holder name"><Input value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="As in your bank records" /></Field>
                  <div className="md:col-span-2">
                    <Field label="CDM instructions (optional)"><Textarea value={cdmInstructions} onChange={(e) => setCdmInstructions(e.target.value)} placeholder="e.g. Use any CDM branch; keep the receipt slip." /></Field>
                  </div>
                  <p className="text-[11px] text-muted-foreground md:col-span-2">
                    Your full account number is stored privately and shared only with buyers whose deals you accept. Ads show only the bank name and last 4 digits.
                  </p>
                </div>
              )}
            </div>
          )}

          <Button type="submit" variant="hero" className="w-full" disabled={busy || sellInvalid}>
            {busy ? "Creating…" : sellBlocked ? "Deposit USDT to publish Sell ad" : "Publish listing"}
          </Button>
        </form>
      </div>
    </PageShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
