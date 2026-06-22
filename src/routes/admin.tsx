import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Users, ListOrdered, Handshake, AlertOctagon, ShieldCheck, ShieldOff } from "lucide-react";
import { PageShell, RequireAuth } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { db, type Deal, type Profile } from "@/lib/db";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — CryptoBazar" }] }),
  component: () => <RequireAuth><Admin /></RequireAuth>,
});

function Admin() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [stats, setStats] = useState({ users: 0, listings: 0, deals: 0, disputes: 0 });
  const [users, setUsers] = useState<Profile[]>([]);
  const [disputes, setDisputes] = useState<Deal[]>([]);

  useEffect(() => {
    (async () => {
      if (!user) return;
      const { data: role } = await db.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
      const admin = !!role;
      setIsAdmin(admin);
      if (!admin) return;
      const [{ count: u }, { count: l }, { count: d }, { count: dp }, { data: usr }, { data: dis }] = await Promise.all([
        db.from("profiles").select("*", { count: "exact", head: true }),
        db.from("listings").select("*", { count: "exact", head: true }),
        db.from("deals").select("*", { count: "exact", head: true }),
        db.from("deals").select("*", { count: "exact", head: true }).eq("status", "disputed"),
        db.from("profiles").select("*").order("created_at", { ascending: false }).limit(20),
        db.from("deals").select("*, buyer:profiles!deals_buyer_id_fkey(full_name), seller:profiles!deals_seller_id_fkey(full_name)").eq("status", "disputed").order("created_at", { ascending: false }),
      ]);
      setStats({ users: u ?? 0, listings: l ?? 0, deals: d ?? 0, disputes: dp ?? 0 });
      setUsers((usr ?? []) as Profile[]);
      setDisputes((dis ?? []) as any);
    })();
  }, [user?.id]);

  const toggleVerify = async (p: Profile) => {
    const { error } = await db.from("profiles").update({ verified: !p.verified }).eq("id", p.id);
    if (error) return toast.error(error.message);
    setUsers(users.map(u => u.id === p.id ? { ...u, verified: !p.verified } : u));
  };

  const resolve = async (d: Deal, outcome: "completed" | "cancelled") => {
    const { error } = await db.from("deals").update({ status: outcome }).eq("id", d.id);
    if (error) return toast.error(error.message);
    setDisputes(disputes.filter(x => x.id !== d.id));
    toast.success(`Resolved as ${outcome}`);
  };

  if (isAdmin === null) return <PageShell><div className="glass-panel grid place-items-center rounded-2xl p-16"><Loader2 className="h-6 w-6 animate-spin" /></div></PageShell>;

  if (!isAdmin) return (
    <PageShell>
      <div className="glass-panel rounded-2xl p-12 text-center">
        <AlertOctagon className="mx-auto mb-3 h-10 w-10 text-warning" />
        <h2 className="font-display text-xl font-bold">Admin access only</h2>
        <p className="mt-2 text-sm text-muted-foreground">Your account doesn't have the admin role.</p>
      </div>
    </PageShell>
  );

  return (
    <PageShell>
      <h1 className="mb-6 font-display text-3xl font-bold">Admin Dashboard</h1>

      <div className="mb-6 grid gap-3 md:grid-cols-4">
        <StatCard icon={Users} label="Users" value={stats.users} />
        <StatCard icon={ListOrdered} label="Listings" value={stats.listings} />
        <StatCard icon={Handshake} label="Total deals" value={stats.deals} />
        <StatCard icon={AlertOctagon} label="Open disputes" value={stats.disputes} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 font-display text-lg font-semibold">Disputes</h2>
          <div className="space-y-2">
            {disputes.length === 0 && <div className="glass-panel rounded-xl p-8 text-center text-sm text-muted-foreground">No open disputes</div>}
            {disputes.map((d) => (
              <div key={d.id} className="glass-panel rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <span className="font-display font-semibold">{Number(d.amount_usdt).toFixed(2)} USDT</span>
                  <Badge variant="destructive">DISPUTED</Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {(d as any).buyer?.full_name} ↔ {(d as any).seller?.full_name}
                </div>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="hero" onClick={() => resolve(d, "completed")}>Release to buyer</Button>
                  <Button size="sm" variant="glass" onClick={() => resolve(d, "cancelled")}>Refund seller</Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="mb-3 font-display text-lg font-semibold">Recent users</h2>
          <div className="space-y-2">
            {users.map((u) => (
              <div key={u.id} className="glass-panel flex items-center justify-between rounded-xl p-3">
                <div>
                  <div className="text-sm font-medium">{u.full_name ?? u.username}</div>
                  <div className="text-[11px] text-muted-foreground">{u.city ?? "—"} · {u.completed_trades} trades</div>
                </div>
                <Button size="sm" variant={u.verified ? "glass" : "hero"} onClick={() => toggleVerify(u)}>
                  {u.verified ? <><ShieldOff className="h-3 w-3" /> Unverify</> : <><ShieldCheck className="h-3 w-3" /> Verify</>}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <div className="glass-panel rounded-xl p-4">
      <Icon className="mb-2 h-5 w-5 text-primary" />
      <div className="font-display text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
