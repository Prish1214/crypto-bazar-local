import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Loader2, Users, ListOrdered, Handshake, AlertOctagon, ShieldCheck, ShieldOff,
  Ban, CheckCircle2, Trash2, XCircle, Search, ReceiptText, Wallet as WalletIcon,
  Crown, Eye, TrendingUp, ArrowDownToLine, ArrowUpFromLine, LifeBuoy, Activity, Percent,
} from "lucide-react";
import { PageShell, RequireAuth } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { db, fmtUSDT, type Dispute, type Profile, type Listing, type Deal, type Transaction, type Wallet } from "@/lib/db";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — CryptoBazar" }] }),
  component: () => <RequireAuth><Admin /></RequireAuth>,
});

type WalletRow = Wallet & { profile?: Profile | null };

function Admin() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [stats, setStats] = useState({
    users: 0, listings: 0, deals: 0, activeDeals: 0,
    disputes: 0, volume: 0, escrowHeld: 0, fees: 0,
  });
  const [users, setUsers] = useState<Profile[]>([]);
  const [wallets, setWallets] = useState<Record<string, Wallet>>({});
  const [adminIds, setAdminIds] = useState<Set<string>>(new Set());
  const [listings, setListings] = useState<Listing[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [search, setSearch] = useState("");
  const [adjust, setAdjust] = useState<{ user: Profile; amount: string; note: string } | null>(null);
  const [resolveDp, setResolveDp] = useState<{ dp: Dispute; notes: string } | null>(null);
  const [analytics, setAnalytics] = useState<any | null>(null);
  const [merchants, setMerchants] = useState<any[] | null>(null);
  const [analyticsErr, setAnalyticsErr] = useState<string | null>(null);

  const refresh = async () => {
    if (!user) return;
    const { data: role } = await db.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    const admin = !!role;
    setIsAdmin(admin);
    if (!admin) return;

    const [
      { data: usr }, { data: wal }, { data: roles },
      { data: lst }, { data: dls }, { data: trx }, { data: dis },
      { count: uCount }, { count: lCount }, { count: dCount }, { count: aCount }, { count: dpCount },
    ] = await Promise.all([
      db.from("profiles").select("*").order("created_at", { ascending: false }).limit(500),
      db.from("wallets").select("*"),
      db.from("user_roles").select("user_id, role").eq("role", "admin"),
      db.from("listings").select("*").order("created_at", { ascending: false }).limit(200),
      db.from("deals").select("*").order("created_at", { ascending: false }).limit(200),
      db.from("transactions").select("*").order("created_at", { ascending: false }).limit(200),
      db.from("disputes").select("*").order("created_at", { ascending: false }),
      db.from("profiles").select("*", { count: "exact", head: true }),
      db.from("listings").select("*", { count: "exact", head: true }),
      db.from("deals").select("*", { count: "exact", head: true }),
      db.from("deals").select("*", { count: "exact", head: true })
        .not("status", "in", "(completed,cancelled)"),
      db.from("disputes").select("*", { count: "exact", head: true }).in("status", ["open", "reviewing"]),
    ]);

    const wmap: Record<string, Wallet> = {};
    (wal as Wallet[] | null ?? []).forEach((w) => { wmap[w.user_id] = w; });

    const volume = (dls as Deal[] | null ?? [])
      .filter((d) => d.status === "completed")
      .reduce((s, d) => s + Number(d.amount_usdt || 0), 0);
    const fees = (dls as Deal[] | null ?? [])
      .filter((d) => d.status === "completed")
      .reduce((s, d) => s + Number(d.fee_usdt || 0), 0);
    const escrowHeld = Object.values(wmap).reduce((s, w) => s + Number(w.escrow_balance || 0), 0);

    setUsers((usr ?? []) as Profile[]);
    setWallets(wmap);
    setAdminIds(new Set((roles ?? []).map((r: any) => r.user_id)));
    setListings((lst ?? []) as Listing[]);
    setDeals((dls ?? []) as Deal[]);
    setTxs((trx ?? []) as Transaction[]);
    setDisputes((dis ?? []) as Dispute[]);
    setStats({
      users: uCount ?? 0, listings: lCount ?? 0, deals: dCount ?? 0,
      activeDeals: aCount ?? 0, disputes: dpCount ?? 0,
      volume, escrowHeld, fees,
    });

    // Analytics (RPC) — surfaced in the Analytics tab.
    const [a, m] = await Promise.all([
      db.rpc("admin_analytics" as any),
      db.rpc("admin_merchant_analytics" as any, { _limit: 100 }),
    ]);
    if (a.error) setAnalyticsErr(a.error.message); else { setAnalytics(a.data as any); setAnalyticsErr(null); }
    if (!m.error) setMerchants((m.data as any) ?? []);
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [user?.id]);

  const userById = useMemo(() => {
    const m = new Map<string, Profile>();
    users.forEach((u) => m.set(u.id, u));
    return m;
  }, [users]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      (u.full_name ?? "").toLowerCase().includes(q) ||
      (u.username ?? "").toLowerCase().includes(q) ||
      (u.city ?? "").toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q),
    );
  }, [users, search]);

  // ---------- actions ----------
  const toggleVerify = async (p: Profile) => {
    const { error } = await db.from("profiles").update({ verified: !p.verified }).eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success(p.verified ? "User unverified" : "User verified");
    setUsers(users.map((u) => u.id === p.id ? { ...u, verified: !p.verified } : u));
  };

  const toggleBan = async (p: Profile) => {
    const banned = !(p as any).banned;
    const { error } = await db.from("profiles").update({ banned } as any).eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success(banned ? "User banned" : "Ban lifted");
    setUsers(users.map((u) => u.id === p.id ? ({ ...u, banned } as any) : u));
  };

  const toggleAdmin = async (p: Profile) => {
    const grant = !adminIds.has(p.id);
    const { error } = await db.rpc("admin_set_role" as any, { _user_id: p.id, _role: "admin", _grant: grant });
    if (error) return toast.error(error.message);
    toast.success(grant ? "Admin role granted" : "Admin role revoked");
    const next = new Set(adminIds);
    if (grant) next.add(p.id); else next.delete(p.id);
    setAdminIds(next);
  };

  const submitAdjust = async () => {
    if (!adjust) return;
    const n = parseFloat(adjust.amount);
    if (!Number.isFinite(n) || n === 0) return toast.error("Enter a non-zero amount");
    const { error } = await db.rpc("admin_adjust_wallet" as any, {
      _user_id: adjust.user.id, _amount: n, _note: adjust.note || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Wallet adjusted");
    setAdjust(null);
    refresh();
  };

  const moderateListing = async (l: Listing, action: "pause" | "active" | "delete") => {
    if (action === "delete") {
      if (!confirm("Delete this listing?")) return;
      const { error } = await db.from("listings").delete().eq("id", l.id);
      if (error) return toast.error(error.message);
      toast.success("Listing deleted");
    } else {
      const { error } = await db.from("listings").update({ status: action }).eq("id", l.id);
      if (error) return toast.error(error.message);
      toast.success(`Listing ${action}`);
    }
    refresh();
  };

  const forceCancelDeal = async (d: Deal) => {
    const reason = prompt("Reason for force-cancel?");
    if (!reason) return;
    const { error } = await db.rpc("admin_force_cancel_deal" as any, { _deal_id: d.id, _reason: reason });
    if (error) return toast.error(error.message);
    toast.success("Deal cancelled, escrow refunded");
    refresh();
  };

  const submitResolve = async (outcome: "resolved_buyer" | "resolved_seller" | "cancelled") => {
    if (!resolveDp) return;
    const { error } = await db.rpc("admin_resolve_dispute" as any, {
      _dispute_id: resolveDp.dp.id, _outcome: outcome, _notes: resolveDp.notes || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Dispute resolved");
    setResolveDp(null);
    refresh();
  };

  if (isAdmin === null) return <PageShell><div className="grid place-items-center rounded-2xl p-16"><Loader2 className="h-6 w-6 animate-spin" /></div></PageShell>;

  if (!isAdmin) return (
    <PageShell>
      <div className="rounded-2xl border border-border bg-card p-12 text-center shadow-sm">
        <AlertOctagon className="mx-auto mb-3 h-10 w-10 text-warning" />
        <h2 className="font-display text-xl font-bold">Admin access only</h2>
        <p className="mt-2 text-sm text-muted-foreground">Your account doesn't have the admin role.</p>
      </div>
    </PageShell>
  );

  return (
    <PageShell>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold">Admin Console</h1>
        <Button size="sm" variant="glass" onClick={refresh}>Refresh</Button>
      </div>

      {/* Stats grid */}
      <div className="mb-6 grid gap-3 md:grid-cols-4">
        <StatCard icon={Users} label="Users" value={stats.users.toString()} />
        <StatCard icon={ListOrdered} label="Listings" value={stats.listings.toString()} />
        <StatCard icon={Handshake} label="Deals (active / total)" value={`${stats.activeDeals} / ${stats.deals}`} />
        <StatCard icon={AlertOctagon} label="Open disputes" value={stats.disputes.toString()} accent={stats.disputes > 0} />
        <StatCard icon={ReceiptText} label="Completed volume" value={fmtUSDT(stats.volume)} />
        <StatCard icon={WalletIcon} label="Escrow held" value={fmtUSDT(stats.escrowHeld)} />
        <StatCard icon={Crown} label="Fees collected" value={fmtUSDT(stats.fees)} />
        <StatCard icon={ShieldCheck} label="Admins" value={adminIds.size.toString()} />
      </div>

      <Tabs defaultValue="disputes">
        <TabsList className="mb-4 grid w-full grid-cols-2 md:grid-cols-5">
          <TabsTrigger value="disputes">Disputes {stats.disputes > 0 && <Badge variant="destructive" className="ml-2">{stats.disputes}</Badge>}</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="listings">Listings</TabsTrigger>
          <TabsTrigger value="deals">Deals</TabsTrigger>
          <TabsTrigger value="txs">Transactions</TabsTrigger>
        </TabsList>

        {/* DISPUTES */}
        <TabsContent value="disputes" className="space-y-2">
          {disputes.length === 0 && <Empty msg="No disputes" />}
          {disputes.map((dp) => {
            const d = deals.find((x) => x.id === dp.deal_id);
            const buyer = d && userById.get(d.buyer_id);
            const seller = d && userById.get(d.seller_id);
            const active = dp.status === "open" || dp.status === "reviewing";
            return (
              <div key={dp.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-display text-sm font-semibold">
                      {d ? fmtUSDT(d.amount_usdt) : "—"} · {buyer?.full_name ?? buyer?.username ?? "buyer"} ↔ {seller?.full_name ?? seller?.username ?? "seller"}
                    </div>
                    <div className="text-[11px] text-muted-foreground">Opened {new Date(dp.created_at).toLocaleString()}</div>
                  </div>
                  <Badge variant={active ? "destructive" : "secondary"}>{dp.status.toUpperCase()}</Badge>
                </div>
                <div className="mt-2 rounded-md bg-muted/40 p-2 text-xs"><b>Reason:</b> {dp.reason}</div>
                {dp.evidence_url && (
                  <a href={dp.evidence_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-primary hover:underline">View evidence →</a>
                )}
                {dp.admin_notes && <div className="mt-1 text-xs text-muted-foreground"><b>Notes:</b> {dp.admin_notes}</div>}
                {active && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="hero" onClick={() => setResolveDp({ dp, notes: "" })}>Review & resolve</Button>
                    <a className="text-xs text-primary underline self-center" href={`/deals/${dp.deal_id}`} target="_blank" rel="noreferrer">Open deal →</a>
                  </div>
                )}
              </div>
            );
          })}
        </TabsContent>

        {/* USERS */}
        <TabsContent value="users" className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search by name, username, city, or ID…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="space-y-2">
            {filteredUsers.map((u) => {
              const w = wallets[u.id];
              const banned = (u as any).banned === true;
              const adm = adminIds.has(u.id);
              return (
                <div key={u.id} className="rounded-xl border border-border bg-card p-3 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        {u.full_name ?? u.username ?? u.id.slice(0, 8)}
                        {u.verified && <Badge className="h-5 px-1.5 text-[10px]" variant="secondary">VERIFIED</Badge>}
                        {adm && <Badge className="h-5 px-1.5 text-[10px] bg-amber-500/20 text-amber-700">ADMIN</Badge>}
                        {banned && <Badge className="h-5 px-1.5 text-[10px]" variant="destructive">BANNED</Badge>}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        @{u.username ?? "—"} · {u.city ?? "—"} · {u.completed_trades}/{u.total_trades} trades · {fmtUSDT(u.trade_volume)}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Wallet: <b>{fmtUSDT(w?.balance ?? 0)}</b> · Escrow: {fmtUSDT(w?.escrow_balance ?? 0)}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Button size="sm" variant="glass" onClick={() => toggleVerify(u)} title="Verify">
                        {u.verified ? <ShieldOff className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
                      </Button>
                      <Button size="sm" variant="glass" onClick={() => setAdjust({ user: u, amount: "", note: "" })} title="Adjust wallet">
                        <WalletIcon className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="glass" onClick={() => toggleAdmin(u)} title="Toggle admin">
                        <Crown className={`h-3 w-3 ${adm ? "text-amber-600" : ""}`} />
                      </Button>
                      <Button size="sm" variant={banned ? "glass" : "destructive"} onClick={() => toggleBan(u)} title="Ban">
                        <Ban className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* LISTINGS */}
        <TabsContent value="listings" className="space-y-2">
          {listings.length === 0 && <Empty msg="No listings" />}
          {listings.map((l) => {
            const owner = userById.get(l.user_id);
            return (
              <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3 shadow-sm">
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    <Badge variant={l.type === "sell" ? "default" : "secondary"} className="mr-2">{l.type.toUpperCase()}</Badge>
                    {fmtUSDT(l.available_amount)} @ ₹{l.price_per_usdt} · {l.city}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    By {owner?.full_name ?? owner?.username ?? l.user_id.slice(0, 8)} · status: <b>{l.status}</b>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  {l.status !== "paused" && <Button size="sm" variant="glass" onClick={() => moderateListing(l, "pause")}>Pause</Button>}
                  {l.status !== "active" && <Button size="sm" variant="glass" onClick={() => moderateListing(l, "active")}>Activate</Button>}
                  <Button size="sm" variant="destructive" onClick={() => moderateListing(l, "delete")}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </div>
            );
          })}
        </TabsContent>

        {/* DEALS */}
        <TabsContent value="deals" className="space-y-2">
          {deals.length === 0 && <Empty msg="No deals" />}
          {deals.map((d) => {
            const buyer = userById.get(d.buyer_id);
            const seller = userById.get(d.seller_id);
            const closed = d.status === "completed" || d.status === "cancelled";
            return (
              <div key={d.id} className="rounded-xl border border-border bg-card p-3 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      {fmtUSDT(d.amount_usdt)} · {buyer?.full_name ?? buyer?.username ?? "buyer"} ↔ {seller?.full_name ?? seller?.username ?? "seller"}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {new Date(d.created_at).toLocaleString()} · {d.deal_code ?? d.id.slice(0, 8)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={closed ? "secondary" : d.status === "disputed" ? "destructive" : "default"}>
                      {d.status.toUpperCase()}
                    </Badge>
                    <a className="text-primary" href={`/deals/${d.id}`} target="_blank" rel="noreferrer" title="Open"><Eye className="h-4 w-4" /></a>
                    {!closed && (
                      <Button size="sm" variant="destructive" onClick={() => forceCancelDeal(d)}>
                        <XCircle className="h-3 w-3" /> Cancel
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </TabsContent>

        {/* TXS */}
        <TabsContent value="txs" className="space-y-1">
          {txs.length === 0 && <Empty msg="No transactions" />}
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-left">
                <tr><th className="p-2">When</th><th className="p-2">User</th><th className="p-2">Type</th><th className="p-2 text-right">Amount</th><th className="p-2">Note</th></tr>
              </thead>
              <tbody>
                {txs.map((t) => {
                  const u = userById.get(t.user_id);
                  return (
                    <tr key={t.id} className="border-t border-border">
                      <td className="p-2 whitespace-nowrap">{new Date(t.created_at).toLocaleString()}</td>
                      <td className="p-2">{u?.full_name ?? u?.username ?? t.user_id.slice(0, 8)}</td>
                      <td className="p-2"><Badge variant="secondary" className="text-[10px]">{t.type}</Badge></td>
                      <td className="p-2 text-right font-mono">{fmtUSDT(t.amount)}</td>
                      <td className="p-2 text-muted-foreground">{t.description ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* ADJUST WALLET DIALOG */}
      <Dialog open={!!adjust} onOpenChange={(o) => !o && setAdjust(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adjust wallet — {adjust?.user.full_name ?? adjust?.user.username}</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">
            Current: <b>{fmtUSDT(wallets[adjust?.user.id ?? ""]?.balance ?? 0)}</b>.
            Positive = credit, negative = debit.
          </p>
          <Input type="number" placeholder="Amount (USDT)" value={adjust?.amount ?? ""} onChange={(e) => adjust && setAdjust({ ...adjust, amount: e.target.value })} />
          <Textarea placeholder="Reason (required for audit)" value={adjust?.note ?? ""} onChange={(e) => adjust && setAdjust({ ...adjust, note: e.target.value })} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAdjust(null)}>Cancel</Button>
            <Button variant="hero" onClick={submitAdjust} disabled={!adjust?.note}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* RESOLVE DISPUTE DIALOG */}
      <Dialog open={!!resolveDp} onOpenChange={(o) => !o && setResolveDp(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Resolve dispute</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">
            <b>Reason:</b> {resolveDp?.dp.reason}
          </p>
          <Textarea placeholder="Admin notes (visible in audit log)" value={resolveDp?.notes ?? ""} onChange={(e) => resolveDp && setResolveDp({ ...resolveDp, notes: e.target.value })} />
          <DialogFooter className="flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setResolveDp(null)}>Close</Button>
            <Button variant="glass" onClick={() => submitResolve("cancelled")}><XCircle className="h-3 w-3" /> Dismiss</Button>
            <Button variant="glass" onClick={() => submitResolve("resolved_seller")}>Refund seller</Button>
            <Button variant="hero" onClick={() => submitResolve("resolved_buyer")}><CheckCircle2 className="h-3 w-3" /> Release to buyer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function StatCard({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border bg-card p-4 shadow-sm ${accent ? "border-destructive/40" : "border-border"}`}>
      <Icon className={`mb-2 h-5 w-5 ${accent ? "text-destructive" : "text-primary"}`} />
      <div className="font-display text-xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">{msg}</div>;
}
