import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldCheck, Star, MapPin, Loader2, Calendar } from "lucide-react";
import { PageShell } from "@/components/site-chrome";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db, fmtFiat, type Listing, type Profile } from "@/lib/db";

export const Route = createFileRoute("/merchant/$userId")({
  head: () => ({ meta: [{ title: "Merchant — KryptoBazar" }] }),
  component: MerchantPage,
});

function MerchantPage() {
  const { userId } = useParams({ from: "/merchant/$userId" });
  const [profile, setProfile] = useState<Profile | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: l }, { data: r }] = await Promise.all([
        db.from("profiles").select("*").eq("id", userId).maybeSingle(),
        db.from("listings").select("*").eq("user_id", userId).eq("status", "active").order("created_at", { ascending: false }),
        db.from("reviews").select("*, reviewer:profiles!reviews_reviewer_id_fkey(full_name, username)").eq("reviewee_id", userId).order("created_at", { ascending: false }).limit(20),
      ]);
      setProfile((p as Profile) ?? null);
      setListings((l ?? []) as Listing[]);
      setReviews(r ?? []);
    })();
  }, [userId]);

  if (!profile) return <PageShell><div className="glass-panel grid place-items-center rounded-2xl p-16"><Loader2 className="h-6 w-6 animate-spin" /></div></PageShell>;

  return (
    <PageShell>
      <div className="glass-strong mb-5 flex flex-col items-start gap-5 rounded-2xl p-6 md:flex-row md:items-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[image:var(--gradient-primary)] font-display text-2xl font-bold text-primary-foreground">
          {(profile.full_name ?? "U")[0]}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-bold">{profile.full_name ?? profile.username}</h1>
            {profile.verified && <Badge className="bg-primary/20 text-primary border-0"><ShieldCheck className="mr-1 h-3 w-3" />Verified</Badge>}
          </div>
          <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Star className="h-3 w-3 fill-warning text-warning" /> {Number(profile.rating).toFixed(2)} rating</span>
            <span>· {profile.completed_trades}/{profile.total_trades} trades</span>
            {profile.city && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {profile.city}</span>}
            <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> Joined {new Date(profile.created_at).toLocaleDateString()}</span>
          </div>
          {profile.bio && <p className="mt-3 text-sm text-muted-foreground">{profile.bio}</p>}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <h2 className="mb-3 font-display text-lg font-semibold">Active listings</h2>
          {listings.length === 0 ? (
            <div className="glass-panel rounded-xl p-8 text-center text-sm text-muted-foreground">No active listings</div>
          ) : (
            <div className="space-y-3">
              {listings.map((l) => (
                <div key={l.id} className="glass-panel flex items-center justify-between rounded-xl p-4">
                  <div>
                    <Badge variant="outline" className="border-primary/30 text-primary">{l.type === "sell" ? "SELL" : "BUY"}</Badge>
                    <div className="mt-1 font-display font-semibold">{fmtFiat(l.price_per_usdt)} / USDT</div>
                    <div className="text-xs text-muted-foreground">{l.city} · {Number(l.min_amount).toFixed(0)}-{Number(l.max_amount).toFixed(0)} USDT</div>
                  </div>
                  <Link to="/deals/new/$listingId" params={{ listingId: l.id }}>
                    <Button variant="hero" size="sm">Trade</Button>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-3 font-display text-lg font-semibold">Reviews ({reviews.length})</h2>
          <div className="space-y-3">
            {reviews.length === 0 && <div className="glass-panel rounded-xl p-8 text-center text-sm text-muted-foreground">No reviews yet</div>}
            {reviews.map((r) => (
              <div key={r.id} className="glass-panel rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{r.reviewer?.full_name ?? r.reviewer?.username ?? "Anonymous"}</span>
                  <div className="flex">{Array.from({ length: r.rating }).map((_, i) => <Star key={i} className="h-3.5 w-3.5 fill-warning text-warning" />)}</div>
                </div>
                {r.comment && <p className="mt-2 text-sm text-muted-foreground">{r.comment}</p>}
                <div className="mt-1 text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
