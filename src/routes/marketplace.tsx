import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, MapPin, Star, ShieldCheck, ArrowDownUp, Loader2 } from "lucide-react";
import { PageShell } from "@/components/site-chrome";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { db, fmtFiat, type Listing, type ListingType } from "@/lib/db";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/marketplace")({
  head: () => ({ meta: [{ title: "Marketplace — CryptoBazar" }] }),
  component: Marketplace,
});

function Marketplace() {
  const { user } = useAuth();
  const [tab, setTab] = useState<ListingType>("sell");
  const [city, setCity] = useState("");
  const [myCity, setMyCity] = useState<string>("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  // Prefill city filter from signed-in user's profile city
  useEffect(() => {
    if (!user) { setMyCity(""); return; }
    (async () => {
      const { data } = await db.from("profiles").select("city").eq("id", user.id).maybeSingle();
      const c = (data as any)?.city ?? "";
      if (c) {
        setMyCity(c);
        setCity((prev) => prev || c);
      }
    })();
  }, [user]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: listings, error } = await db
        .from("listings")
        .select("*")
        .eq("status", "active")
        .eq("type", tab)
        .order("featured", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) {
        console.error("[marketplace] listings error:", error);
        setItems([]);
        setLoading(false);
        return;
      }
      const list = (listings ?? []) as Listing[];
      const ids = Array.from(new Set(list.map((l) => l.user_id)));
      let profilesById: Record<string, any> = {};
      if (ids.length) {
        const { data: profiles } = await db.from("profiles").select("*").in("id", ids);
        profilesById = Object.fromEntries((profiles ?? []).map((p: any) => [p.id, p]));
      }
      setItems(list.map((l) => ({ ...l, profiles: profilesById[l.user_id] ?? null })));
      setLoading(false);
    })();
  }, [tab]);

  const filtered = useMemo(() => {
    return items.filter((l) => {
      if (city && !l.city.toLowerCase().includes(city.toLowerCase())) return false;
      if (query) {
        const q = query.toLowerCase();
        const hit =
          l.city.toLowerCase().includes(q) ||
          (l.notes ?? "").toLowerCase().includes(q) ||
          (l.profiles?.full_name ?? "").toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [items, city, query]);

  return (
    <PageShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Marketplace</h1>
          <p className="text-sm text-muted-foreground">
            {tab === "sell" ? "Buy USDT from local merchants" : "Sell USDT to local buyers"}
          </p>
        </div>
        <Link to="/listings/new">
          <Button variant="hero">+ Create listing</Button>
        </Link>
      </div>

      <div className="glass-panel mb-5 flex flex-col gap-3 rounded-2xl p-4 md:flex-row md:items-center">
        <div className="inline-flex rounded-lg bg-secondary/40 p-1">
          <button
            onClick={() => setTab("sell")}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${tab === "sell" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            Buy USDT
          </button>
          <button
            onClick={() => setTab("buy")}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${tab === "buy" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            Sell USDT
          </button>
        </div>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search merchant, notes…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="relative md:w-56">
          <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div className="glass-panel grid place-items-center rounded-2xl p-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-panel rounded-2xl p-16 text-center">
          <ArrowDownUp className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <h3 className="font-display text-lg font-semibold">No listings yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Be the first — create a listing for your city.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((l) => (
            <ListingCard key={l.id} listing={l} disabled={!user || user.id === l.user_id} />
          ))}
        </div>
      )}
    </PageShell>
  );
}

function ListingCard({ listing, disabled }: { listing: Listing; disabled: boolean }) {
  const p = listing.profiles;
  return (
    <div className="glass-panel group rounded-2xl p-5 transition hover:border-primary/40 hover:shadow-[var(--shadow-glow)]">
      <div className="mb-3 flex items-center justify-between">
        <Link to="/merchant/$userId" params={{ userId: listing.user_id }} className="flex items-center gap-2 hover:opacity-80">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-sm font-semibold uppercase">
            {(p?.full_name ?? p?.username ?? "U")[0]}
          </div>
          <div>
            <div className="flex items-center gap-1 text-sm font-medium">
              {p?.full_name ?? p?.username ?? "Merchant"}
              {p?.verified && <ShieldCheck className="h-3.5 w-3.5 text-primary" />}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Star className="h-3 w-3 fill-warning text-warning" /> {Number(p?.rating ?? 0).toFixed(1)} · {p?.completed_trades ?? 0} trades
            </div>
          </div>
        </Link>
        <Badge variant="outline" className="border-primary/30 text-primary">
          {listing.type === "sell" ? "Selling" : "Buying"}
        </Badge>
      </div>

      <div className="my-4 flex items-baseline gap-2">
        <span className="font-display text-2xl font-bold text-gradient-primary">
          {fmtFiat(listing.price_per_usdt)}
        </span>
        <span className="text-xs text-muted-foreground">/ USDT</span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <Info label="Available" value={`${Number(listing.available_amount).toFixed(0)} USDT`} />
        <Info label="Limits" value={`${Number(listing.min_amount).toFixed(0)} - ${Number(listing.max_amount).toFixed(0)}`} />
        <Info label="City" value={listing.city} />
        <Info label="Meet" value={listing.meeting_location ?? "—"} />
      </div>

      <Link to="/deals/new/$listingId" params={{ listingId: listing.id }} className="mt-5 block">
        <Button className="w-full" variant={disabled ? "outline" : "hero"} disabled={disabled}>
          {listing.type === "sell" ? "Buy now" : "Sell now"}
        </Button>
      </Link>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-strong rounded-lg px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate font-medium">{value}</div>
    </div>
  );
}
