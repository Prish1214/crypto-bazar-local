import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, MapPin, Star, ShieldCheck, ArrowDownUp, Loader2, Wallet as WalletIcon } from "lucide-react";
import { PageShell } from "@/components/site-chrome";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { db, fmtFiat, type Listing, type ListingType } from "@/lib/db";
import { useAuth } from "@/hooks/use-auth";

type SortKey = "price_asc" | "price_desc" | "trades" | "completion";


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
  const [amount, setAmount] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("price_asc");
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
    const amt = parseFloat(amount);
    const hasAmt = Number.isFinite(amt) && amt > 0;
    const passed = items.filter((l) => {
      if (city && !l.city.toLowerCase().includes(city.toLowerCase())) return false;
      if (query) {
        const q = query.toLowerCase();
        const hit =
          l.city.toLowerCase().includes(q) ||
          (l.notes ?? "").toLowerCase().includes(q) ||
          (l.profiles?.full_name ?? "").toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (hasAmt) {
        const min = Number(l.min_amount ?? 0);
        const max = Number(l.max_amount ?? 0);
        const avail = Number(l.available_amount ?? 0);
        // amount must fit within min/max and not exceed available
        if (min && amt < min) return false;
        if (max && amt > max) return false;
        if (avail && amt > avail) return false;
      }
      return true;
    });

    const sorted = [...passed];
    sorted.sort((a, b) => {
      if (sort === "price_asc") return Number(a.price_per_usdt) - Number(b.price_per_usdt);
      if (sort === "price_desc") return Number(b.price_per_usdt) - Number(a.price_per_usdt);
      if (sort === "trades") return Number(b.profiles?.completed_trades ?? 0) - Number(a.profiles?.completed_trades ?? 0);
      if (sort === "completion") {
        const rate = (p: any) => {
          const t = Number(p?.total_trades ?? 0);
          const c = Number(p?.completed_trades ?? 0);
          return t > 0 ? c / t : 0;
        };
        return rate(b.profiles) - rate(a.profiles);
      }
      return 0;
    });
    return sorted;
  }, [items, city, query, amount, sort]);


  return (
    <PageShell>
      {/* Header */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-bold tracking-tight md:text-2xl">Marketplace</h1>
          <p className="truncate text-xs text-muted-foreground">
            {tab === "sell" ? "Buy USDT from local merchants" : "Sell USDT to local buyers"}
          </p>
        </div>
        <Link to="/listings/new">
          <Button variant="hero" size="sm">+ New</Button>
        </Link>
      </div>

      {/* Tabs (Binance-style segmented) */}
      <div className="mb-3 grid grid-cols-2 rounded-xl bg-secondary p-1">
        <button
          onClick={() => setTab("sell")}
          className={`rounded-lg py-2 text-sm font-semibold transition ${tab === "sell" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}
        >Buy USDT</button>
        <button
          onClick={() => setTab("buy")}
          className={`rounded-lg py-2 text-sm font-semibold transition ${tab === "buy" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}
        >Sell USDT</button>
      </div>

      {/* Filters */}
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_200px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-10 pl-9" placeholder="Search merchant, notes…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="relative">
          <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-10 pl-9" placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
      </div>

      {/* Sort + Amount filter */}
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_200px]">
        <div className="relative">
          <WalletIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-10 pl-9 pr-14"
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            placeholder={tab === "sell" ? "Amount to buy (USDT)" : "Amount to sell (USDT)"}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          {amount && (
            <button
              type="button"
              onClick={() => setAmount("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-0.5 text-[10px] font-semibold text-muted-foreground hover:text-foreground"
            >Clear</button>
          )}
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          aria-label="Sort listings"
        >
          <option value="price_asc">Price: Low → High</option>
          <option value="price_desc">Price: High → Low</option>
          <option value="trades">Most trades</option>
          <option value="completion">Best completion rate</option>
        </select>
      </div>

      {myCity && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span>
            <span className="font-medium text-foreground">{city || "All cities"}</span>
            {city && city.toLowerCase() === myCity.toLowerCase() && " · your city"}
          </span>
          {city ? (
            <button onClick={() => setCity("")} className="font-medium text-primary hover:underline">Show all</button>
          ) : (
            <button onClick={() => setCity(myCity)} className="font-medium text-primary hover:underline">Only {myCity}</button>
          )}
        </div>
      )}

      {loading ? (
        <div className="grid place-items-center rounded-2xl border border-border bg-card p-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <ArrowDownUp className="mx-auto mb-3 h-7 w-7 text-muted-foreground" />
          <h3 className="font-display text-base font-semibold">No listings yet</h3>
          <p className="mt-1 text-xs text-muted-foreground">Be the first — create a listing for your city.</p>
        </div>
      ) : (
        <div className="grid gap-2 md:grid-cols-2 md:gap-3 lg:grid-cols-3">
          {filtered.map((l) => (
            <ListingRow key={l.id} listing={l} disabled={!user || user.id === l.user_id} />
          ))}
        </div>
      )}
    </PageShell>
  );
}

function ListingRow({ listing, disabled }: { listing: Listing; disabled: boolean }) {
  const p = listing.profiles;
  return (
    <div className="group flex flex-col rounded-2xl border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/40 hover:shadow-md">
      {/* Merchant row */}
      <div className="flex items-center justify-between gap-2">
        <Link to="/merchant/$userId" params={{ userId: listing.user_id }} className="flex min-w-0 items-center gap-2 hover:opacity-80">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold uppercase text-primary">
            {(p?.full_name ?? p?.username ?? "U")[0]}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1 truncate text-sm font-semibold">
              <span className="truncate">{p?.full_name ?? p?.username ?? "Merchant"}</span>
              {p?.verified && <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" />}
            </div>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Star className="h-2.5 w-2.5 fill-warning text-warning" /> {Number(p?.rating ?? 0).toFixed(1)} · {p?.completed_trades ?? 0} trades
            </div>
          </div>
        </Link>
        <Badge variant="outline" className={`shrink-0 border-primary/30 text-[10px] ${listing.type === "sell" ? "text-success" : "text-primary"}`}>
          {listing.type === "sell" ? "SELL" : "BUY"}
        </Badge>
      </div>

      {/* Price + meta */}
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Price</div>
          <div className="font-display text-xl font-bold text-foreground">
            {fmtFiat(listing.price_per_usdt)}
            <span className="ml-1 text-[10px] font-medium text-muted-foreground">/USDT</span>
          </div>
        </div>
        <div className="text-right text-[11px] leading-tight text-muted-foreground">
          <div><span className="text-foreground">{Number(listing.available_amount).toFixed(0)}</span> available</div>
          <div>{Number(listing.min_amount).toFixed(0)}–{Number(listing.max_amount).toFixed(0)} limit</div>
          <div className="inline-flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" /> {listing.city}</div>
        </div>
      </div>

      <Link to="/deals/new/$listingId" params={{ listingId: listing.id }} className="mt-3">
        <Button className="w-full" variant={disabled ? "outline" : "hero"} disabled={disabled} size="sm">
          {listing.type === "sell" ? "Buy now" : "Sell now"}
        </Button>
      </Link>
    </div>
  );
}
