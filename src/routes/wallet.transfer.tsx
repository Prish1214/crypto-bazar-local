import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowLeftRight, Search, Loader2 } from "lucide-react";
import { PageShell, RequireAuth } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { db, ensureWallet, fmtUSDT, type Profile, type Wallet } from "@/lib/db";
import { toast } from "sonner";

export const Route = createFileRoute("/wallet/transfer")({
  head: () => ({ meta: [{ title: "Transfer — CryptoBazar" }] }),
  component: () => <RequireAuth><TransferPage /></RequireAuth>,
});

function TransferPage() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [username, setUsername] = useState("");
  const [recipient, setRecipient] = useState<Profile | null>(null);
  const [lookup, setLookup] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    ensureWallet(user.id).then(setWallet).catch((e) => toast.error(e.message));
  }, [user?.id]);

  const findRecipient = async () => {
    const u = username.trim().replace(/^@/, "");
    if (!u) return;
    setLookup(true); setRecipient(null);
    try {
      const { data } = await db.from("profiles")
        .select("id, username, full_name, avatar_url, verified")
        .ilike("username", u).maybeSingle();
      if (!data) return toast.error("No user found with that username");
      if (data.id === user?.id) return toast.error("You can't transfer to yourself");
      setRecipient(data as Profile);
    } finally { setLookup(false); }
  };

  const submit = async () => {
    if (!user || !wallet || !recipient) return;
    const v = parseFloat(amount);
    if (!v || v <= 0) return toast.error("Enter a valid amount");
    if (v > Number(wallet.balance)) return toast.error("Insufficient balance");

    setBusy(true);
    try {
      // Fetch recipient wallet (ensure it exists — they may not have one yet)
      let rw = (await db.from("wallets").select("*").eq("user_id", recipient.id).maybeSingle()).data as Wallet | null;
      if (!rw) {
        const { data: created } = await db.from("wallets").insert({ user_id: recipient.id } as any).select("*").single();
        rw = created as Wallet;
      }
      if (!rw) throw new Error("Recipient wallet missing");

      // Debit sender
      const { error: e1 } = await db.from("wallets")
        .update({ balance: Number(wallet.balance) - v, updated_at: new Date().toISOString() })
        .eq("user_id", user.id);
      if (e1) throw e1;

      // Credit recipient
      const { error: e2 } = await db.from("wallets")
        .update({ balance: Number(rw.balance) + v, updated_at: new Date().toISOString() })
        .eq("user_id", recipient.id);
      if (e2) throw e2;

      const desc = note.trim() || `Transfer ${user.id === recipient.id ? "" : ""}`.trim();
      await db.from("transactions").insert([
        { user_id: user.id, type: "transfer", amount: v, description: `Sent to @${recipient.username} ${note ? "· " + note : ""}`.trim() },
        { user_id: recipient.id, type: "transfer", amount: v, description: `Received from @${(user.user_metadata as any)?.username ?? "user"} ${note ? "· " + note : ""}`.trim() },
      ]);

      toast.success(`Sent ${fmtUSDT(v)} to @${recipient.username}`);
      setAmount(""); setNote("");
      setWallet({ ...wallet, balance: Number(wallet.balance) - v });
    } catch (e: any) {
      toast.error(e.message ?? "Transfer failed");
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
            <ArrowLeftRight className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">Transfer USDT</h1>
            <p className="text-sm text-muted-foreground">
              Available: <span className="font-mono">{wallet ? fmtUSDT(wallet.balance) : "—"}</span>
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <Label htmlFor="user">Recipient username</Label>
            <div className="flex gap-2">
              <Input id="user" value={username} onChange={(e) => setUsername(e.target.value)}
                placeholder="@username" onKeyDown={(e) => e.key === "Enter" && findRecipient()} />
              <Button onClick={findRecipient} variant="glass" disabled={lookup}>
                {lookup ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {recipient && (
            <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-50/50 p-3 text-sm dark:bg-emerald-950/20">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 font-semibold text-primary">
                {(recipient.full_name ?? recipient.username ?? "?").slice(0, 1).toUpperCase()}
              </div>
              <div>
                <div className="font-medium">@{recipient.username}</div>
                <div className="text-xs text-muted-foreground">{recipient.full_name ?? "—"}</div>
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="amt">Amount (USDT)</Label>
            <Input id="amt" type="number" min="0" step="0.01" value={amount}
              onChange={(e) => setAmount(e.target.value)} placeholder="25.00" />
          </div>
          <div>
            <Label htmlFor="note">Note (optional)</Label>
            <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="What's this for?" rows={2} />
          </div>

          <Button disabled={busy || !recipient} onClick={submit} variant="hero" className="w-full">
            Send {amount && `${fmtUSDT(parseFloat(amount) || 0)}`}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Transfers are instant and free between CryptoBazar accounts.
          </p>
        </div>
      </div>
    </PageShell>
  );
}
