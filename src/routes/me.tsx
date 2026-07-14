import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ShieldCheck, Star, Pencil, ChevronRight, LogOut, Wallet as WalletIcon,
  ListOrdered, Shield, Bell, ReceiptText, LifeBuoy, FileText, LayoutDashboard,
  TrendingUp, TrendingDown, Clock, MessageCircle, Award, Zap, Repeat,
  BarChart3, Activity, CheckCircle2, Circle, Crown,
} from "lucide-react";
import { PageShell, RequireAuth } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { db, fmtUSDT, type Deal, type Profile } from "@/lib/db";

export const Route = createFileRoute("/me")({
  head: () => ({ meta: [{ title: "My Profile — CryptoBazar" }] }),
  component: () => <RequireAuth><MePage /></RequireAuth>,
});

interface Stats {
  totalVolume: number; buyVolume: number; sellVolume: number;
  vol30: number; usdtBought: number; usdtSold: number;
  largestTrade: number; avgTradeSize: number;
  todaysDeals: number; monthDeals: number;
  successRate: number; completionRate: number;
  avgReleaseMs: number | null; avgResponseMs: number | null;
  disputes: number; repeatCounterparties: number;
  activeListings: number;
}

const EMPTY: Stats = {
  totalVolume: 0, buyVolume: 0, sellVolume: 0, vol30: 0,
  usdtBought: 0, usdtSold: 0, largestTrade: 0, avgTradeSize: 0,
  todaysDeals: 0, monthDeals: 0, successRate: 0, completionRate: 0,
  avgReleaseMs: null, avgResponseMs: null, disputes: 0,
  repeatCounterparties: 0, activeListings: 0,
};

function MePage() {
  const { user, signOut } = useAuth();
  const [p, setP] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [activeListings, setActiveListings] = useState(0);
  const [reviews, setReviews] = useState<any[]>([]);
  const [disputes, setDisputes] = useState(0);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [pr, ur, dr, lr, rr, dispR] = await Promise.all([
        db.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        db.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle(),
        db.from("deals").select("*").or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`).order("created_at", { ascending: false }),
        db.from("listings").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "active"),
        db.from("reviews").select("*").eq("reviewee_id", user.id).order("created_at", { ascending: false }).limit(5),
        db.from("disputes").select("id", { count: "exact", head: true }).or(`opened_by.eq.${user.id}`),
      ]);
      setP((pr.data as Profile) ?? null);
      setIsAdmin(!!ur.data);
      setDeals((dr.data ?? []) as Deal[]);
      setActiveListings(lr.count ?? 0);
      setReviews(rr.data ?? []);
      setDisputes(dispR.count ?? 0);
    })();
  }, [user?.id]);

  const stats: Stats = useMemo(() => {
    if (!user || deals.length === 0) return { ...EMPTY, activeListings, disputes };
    const now = Date.now();
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const ms30 = now - 30 * 86400_000;

    let totalVolume = 0, buyVolume = 0, sellVolume = 0, vol30 = 0;
    let usdtBought = 0, usdtSold = 0, largestTrade = 0;
    let completedCount = 0, todaysDeals = 0, monthDeals = 0;
    let releaseTimes: number[] = [], responseTimes: number[] = [];
    const counterCount = new Map<string, number>();

    for (const d of deals) {
      const created = new Date(d.created_at).getTime();
      const isBuyer = d.buyer_id === user.id;
      const counter = isBuyer ? d.seller_id : d.buyer_id;
      counterCount.set(counter, (counterCount.get(counter) ?? 0) + 1);

      if (created >= dayStart.getTime()) todaysDeals++;
      if (created >= monthStart.getTime()) monthDeals++;

      if (d.status === "completed") {
        completedCount++;
        const amt = Number(d.amount_usdt) || 0;
        totalVolume += amt;
        if (isBuyer) { buyVolume += amt; usdtBought += amt; }
        else { sellVolume += amt; usdtSold += amt; }
        if (created >= ms30) vol30 += amt;
        if (amt > largestTrade) largestTrade = amt;

        if (d.completed_at && d.cash_handover_at) {
          releaseTimes.push(new Date(d.completed_at).getTime() - new Date(d.cash_handover_at).getTime());
        }
        if (d.locked_at) {
          responseTimes.push(new Date(d.locked_at).getTime() - created);
        }
      }
    }
    const total = deals.length;
    const cancelled = deals.filter((d) => d.status === "cancelled").length;
    const repeatCounterparties = [...counterCount.values()].filter((n) => n >= 2).length;

    return {
      totalVolume, buyVolume, sellVolume, vol30, usdtBought, usdtSold,
      largestTrade, avgTradeSize: completedCount ? totalVolume / completedCount : 0,
      todaysDeals, monthDeals,
      successRate: total ? Math.round((completedCount / total) * 100) : 0,
      completionRate: total ? Math.round(((total - cancelled) / total) * 100) : 0,
      avgReleaseMs: releaseTimes.length ? releaseTimes.reduce((a, b) => a + b, 0) / releaseTimes.length : null,
      avgResponseMs: responseTimes.length ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : null,
      disputes, repeatCounterparties, activeListings,
    };
  }, [deals, user?.id, activeListings, disputes]);

  if (!user || !p) {
    return <PageShell><div className="h-40 animate-pulse rounded-2xl bg-muted/40" /></PageShell>;
  }

  const displayName = p.full_name || p.username || (user.email?.split("@")[0] ?? "User");
  const initial = displayName.slice(0, 1).toUpperCase();
  const memberSince = new Date(p.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric" });
  const verifLevel = p.verified ? "Level 2 · KYC Verified" : "Level 1 · Email Verified";

  return (
    <PageShell>
      <div className="mx-auto max-w-2xl space-y-4 pb-6">
        {/* Identity card */}
        <section className="relative overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full opacity-40 blur-3xl"
            style={{ background: "radial-gradient(circle, oklch(0.72 0.17 255 / 0.55), transparent 70%)" }}
          />
          <div className="relative flex items-start gap-4">
            <div className="relative shrink-0">
              {p.avatar_url ? (
                <img src={p.avatar_url} alt={displayName} className="h-16 w-16 rounded-2xl object-cover ring-2 ring-primary/30" />
              ) : (
                <div className="grid h-16 w-16 place-items-center rounded-2xl bg-[image:var(--gradient-primary)] font-display text-2xl font-bold text-primary-foreground ring-2 ring-primary/30">
                  {initial}
                </div>
              )}
              <span className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full border-2 border-card bg-emerald-500">
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h1 className="truncate font-display text-lg font-bold sm:text-xl">{displayName}</h1>
                {p.verified && <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />}
                {isAdmin && <Crown className="h-4 w-4 shrink-0 text-amber-500" />}
              </div>
              {p.username && <div className="truncate text-xs text-muted-foreground">@{p.username}</div>}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Online</span>
                <span>·</span>
                <span>Member since {memberSince}</span>
              </div>
              <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                <ShieldCheck className="h-3 w-3" /> {verifLevel}
              </div>
            </div>
            <Link to="/settings">
              <Button size="sm" variant="outline" className="h-8 rounded-full px-3 text-xs">
                <Pencil className="h-3 w-3" /> Edit
              </Button>
            </Link>
          </div>
        </section>

        {/* Trading Reputation */}
        <Section title="Trading Reputation" icon={Award}>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <StatChip
              icon={Star}
              label="Rating"
              value={Number(p.rating ?? 0).toFixed(2)}
              sub={`${p.total_trades ?? 0} trades`}
              tone="amber"
            />
            <StatChip
              icon={CheckCircle2}
              label="Completed"
              value={String(p.completed_trades ?? 0)}
              sub="all-time"
              tone="emerald"
            />
            <StatChip
              icon={Activity}
              label="Completion"
              value={`${stats.completionRate}%`}
              sub="rate"
              tone="primary"
            />
            <StatChip
              icon={Zap}
              label="Avg release"
              value={fmtDuration(stats.avgReleaseMs)}
              sub="time"
              tone="primary"
            />
            <StatChip
              icon={MessageCircle}
              label="Avg response"
              value={fmtDuration(stats.avgResponseMs)}
              sub="time"
              tone="primary"
            />
            <StatChip
              icon={Repeat}
              label="Repeat traders"
              value={String(stats.repeatCounterparties)}
              sub={`${stats.disputes} disputes`}
              tone={stats.disputes ? "rose" : "emerald"}
            />
          </div>
        </Section>

        {/* Trading Analytics */}
        <Section title="Trading Analytics" icon={BarChart3}>
          <div className="grid gap-2.5">
            <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/8 to-primary/0 p-4">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Total Volume</div>
              <div className="mt-1 font-display text-2xl font-bold">{fmtUSDT(stats.totalVolume)}</div>
              <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1"><TrendingUp className="h-3 w-3 text-emerald-500" /> {fmtUSDT(stats.vol30)} last 30d</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <MiniStat icon={TrendingDown} tone="emerald" label="Buy volume" value={fmtUSDT(stats.buyVolume)} sub={`${fmtUSDT(stats.usdtBought)} bought`} />
              <MiniStat icon={TrendingUp} tone="rose" label="Sell volume" value={fmtUSDT(stats.sellVolume)} sub={`${fmtUSDT(stats.usdtSold)} sold`} />
              <MiniStat icon={Crown} tone="amber" label="Largest trade" value={fmtUSDT(stats.largestTrade)} sub="peak deal" />
              <MiniStat icon={BarChart3} tone="primary" label="Avg size" value={fmtUSDT(stats.avgTradeSize)} sub="per deal" />
            </div>
          </div>
        </Section>

        {/* Performance */}
        <Section title="Performance" icon={Zap}>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <PerfCard label="Today's deals" value={String(stats.todaysDeals)} />
            <PerfCard label="This month" value={String(stats.monthDeals)} />
            <PerfCard label="Active listings" value={String(stats.activeListings)} />
            <PerfCard label="Success rate" value={`${stats.successRate}%`} />
          </div>
        </Section>

        {/* Feedback */}
        <Section
          title="Feedback & Reviews"
          icon={Star}
          right={<Link to="/merchant/$userId" params={{ userId: user.id }} className="text-xs font-medium text-primary">View all</Link>}
        >
          {reviews.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/50 p-6 text-center text-xs text-muted-foreground">
              No reviews yet — complete your first trade to earn feedback.
            </div>
          ) : (
            <div className="space-y-2">
              {reviews.map((r) => (
                <div key={r.id} className="rounded-2xl border border-border bg-card p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {(r.reviewer?.full_name ?? r.reviewer?.username ?? "?").slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{r.reviewer?.full_name ?? r.reviewer?.username ?? "Anonymous"}</div>
                        <div className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</div>
                      </div>
                    </div>
                    <div className="flex shrink-0">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={i < (r.rating ?? 0) ? "h-3.5 w-3.5 fill-amber-400 text-amber-400" : "h-3.5 w-3.5 text-muted"} />
                      ))}
                    </div>
                  </div>
                  {r.comment && <p className="mt-1.5 text-xs text-muted-foreground">{r.comment}</p>}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Menu */}
        <Section title="Account">
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <MenuItem to="/wallet" icon={WalletIcon} title="Wallet history" subtitle="Balances & escrow" />
            <MenuItem to="/listings" icon={ListOrdered} title="My listings" subtitle="Manage buy & sell offers" />
            <MenuItem to="/transactions" icon={ReceiptText} title="Transaction history" subtitle="Deposits, withdrawals, transfers" />
            <MenuItem to="/settings/deal-code" icon={Shield} title="Deal Code & biometrics" subtitle="Change PIN · Face ID / Fingerprint" />
          </div>
        </Section>

        <Section title="Preferences">
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <MenuItem to="/settings" icon={Shield} title="Security" subtitle="Sign-in, sessions & verification" />
            <MenuItem to="/settings" icon={Bell} title="Notifications" subtitle="Alerts & communication" />
            {isAdmin && (
              <MenuItem to="/admin" icon={LayoutDashboard} title="Admin panel" subtitle="Users, disputes, analytics" />
            )}
          </div>
        </Section>

        <Section title="Support & Legal">
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <MenuItem to="/settings" icon={LifeBuoy} title="Help & support" subtitle="FAQs & contact" />
            <MenuItem to="/settings" icon={FileText} title="Terms & privacy" subtitle="Legal documents" />
          </div>
        </Section>

        <button
          onClick={async () => { await signOut(); window.location.replace("/auth"); }}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/5 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-500/10"
        >
          <LogOut className="h-4 w-4" /> Log out
        </button>

        <div className="text-center text-[10px] text-muted-foreground">CryptoBazar · v1.0</div>
      </div>
    </PageShell>
  );
}

function Section({ title, icon: Icon, right, children }: { title: string; icon?: any; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {Icon && <Icon className="h-3.5 w-3.5" />} {title}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

type Tone = "primary" | "emerald" | "amber" | "rose";
const toneMap: Record<Tone, string> = {
  primary: "bg-primary/10 text-primary",
  emerald: "bg-emerald-500/10 text-emerald-600",
  amber: "bg-amber-500/10 text-amber-600",
  rose: "bg-rose-500/10 text-rose-600",
};

function StatChip({ icon: Icon, label, value, sub, tone = "primary" }: { icon: any; label: string; value: string; sub?: string; tone?: Tone }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className={`inline-grid h-7 w-7 place-items-center rounded-lg ${toneMap[tone]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="mt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-display text-sm font-bold leading-tight">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function MiniStat({ icon: Icon, label, value, sub, tone = "primary" }: { icon: any; label: string; value: string; sub?: string; tone?: Tone }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <div className={`grid h-7 w-7 place-items-center rounded-lg ${toneMap[tone]}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      </div>
      <div className="mt-1.5 truncate font-display text-sm font-bold">{value}</div>
      {sub && <div className="truncate text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function PerfCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 text-center">
      <div className="font-display text-xl font-bold">{value}</div>
      <div className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function MenuItem({
  to, icon: Icon, title, subtitle,
}: { to: string; icon: any; title: string; subtitle?: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 border-b border-border/60 p-3.5 last:border-b-0 transition hover:bg-secondary/50 active:bg-secondary">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{title}</div>
        {subtitle && <div className="truncate text-[11px] text-muted-foreground">{subtitle}</div>}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

function fmtDuration(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}
