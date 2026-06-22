import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Pause, Play, Trash2, Loader2 } from "lucide-react";
import { PageShell, RequireAuth } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { db, fmtFiat, type Listing } from "@/lib/db";
import { toast } from "sonner";

export const Route = createFileRoute("/listings/")({
  head: () => ({ meta: [{ title: "My Listings — CryptoBazar" }] }),
  component: () => <RequireAuth><MyListings /></RequireAuth>,
});

function MyListings() {
  const { user } = useAuth();
  const [items, setItems] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await db.from("listings").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    setItems((data ?? []) as Listing[]);
    setLoading(false);
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [user?.id]);

  const toggle = async (l: Listing) => {
    const next = l.status === "active" ? "paused" : "active";
    const { error } = await db.from("listings").update({ status: next }).eq("id", l.id);
    if (error) return toast.error(error.message);
    toast.success(`Listing ${next}`);
    refresh();
  };

  const remove = async (l: Listing) => {
    if (!confirm("Delete this listing?")) return;
    const { error } = await db.from("listings").delete().eq("id", l.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    refresh();
  };

  return (
    <PageShell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">My Listings</h1>
          <p className="text-sm text-muted-foreground">Manage your active buy & sell offers.</p>
        </div>
        <Link to="/listings/new"><Button variant="hero"><Plus className="h-4 w-4" /> New listing</Button></Link>
      </div>

      {loading ? (
        <div className="glass-panel grid place-items-center rounded-2xl p-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : items.length === 0 ? (
        <div className="glass-panel rounded-2xl p-12 text-center">
          <p className="text-muted-foreground">No listings yet. Create your first one.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((l) => (
            <div key={l.id} className="glass-panel flex flex-col gap-3 rounded-xl p-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <Badge variant="outline" className={l.type === "sell" ? "border-primary/30 text-primary" : "border-accent/30 text-accent"}>
                  {l.type === "sell" ? "SELL" : "BUY"}
                </Badge>
                <div>
                  <div className="font-display font-semibold">{fmtFiat(l.price_per_usdt)} / USDT</div>
                  <div className="text-xs text-muted-foreground">
                    {l.city} · {Number(l.available_amount).toFixed(0)} USDT available · {Number(l.min_amount).toFixed(0)} - {Number(l.max_amount).toFixed(0)} limits
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={l.status === "active" ? "default" : "secondary"}>{l.status}</Badge>
                <Button size="sm" variant="glass" onClick={() => toggle(l)}>
                  {l.status === "active" ? <><Pause className="h-3 w-3" /> Pause</> : <><Play className="h-3 w-3" /> Resume</>}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove(l)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
