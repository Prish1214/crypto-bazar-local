import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  Shield, Coins, Users, Store, Wallet, ListOrdered, Handshake,
  ReceiptText, Settings as SettingsIcon, LayoutDashboard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DealNotifier } from "@/components/deal-notifier";
import { db, type DealStatus } from "@/lib/db";

const navItems = [
  { to: "/marketplace", label: "Market", icon: Store },
  { to: "/deals", label: "Deals", icon: Handshake },
  { to: "/listings", label: "My Listings", icon: ListOrdered },
  { to: "/wallet", label: "Wallet", icon: Wallet },
  { to: "/transactions", label: "History", icon: ReceiptText },
] as const;

const ACTIVE_DEAL_STATUSES: DealStatus[] = [
  "pending", "accepted", "escrow_funded", "meeting_proposed",
  "meeting_scheduled", "locked", "arrived", "verified", "cash_sent",
  "confirmed", "proof_uploaded", "disputed",
];

export function SiteHeader() {
  const { user, signOut } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [activeDealsCount, setActiveDealsCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setActiveDealsCount(0);
      return;
    }

    let mounted = true;
    const loadActiveDeals = async () => {
      const { data } = await db
        .from("deals")
        .select("id,status")
        .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
        .in("status", ACTIVE_DEAL_STATUSES as any);
      if (mounted) setActiveDealsCount(data?.length ?? 0);
    };

    loadActiveDeals();
    const channel = db
      .channel(`nav-deals-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "deals", filter: `buyer_id=eq.${user.id}` }, loadActiveDeals)
      .on("postgres_changes", { event: "*", schema: "public", table: "deals", filter: `seller_id=eq.${user.id}` }, loadActiveDeals)
      .subscribe();
    const interval = window.setInterval(loadActiveDeals, 15000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
      db.removeChannel(channel);
    };
  }, [user?.id]);

  return (
    <header className="sticky top-0 z-50 w-full">
      <div className="glass-panel mx-auto mt-4 flex max-w-7xl items-center justify-between rounded-2xl px-5 py-3">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[image:var(--gradient-primary)] shadow-[var(--shadow-glow)]">
            <Coins className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-display text-lg font-bold tracking-tight">
            Crypto<span className="text-gradient-primary">Bazar</span>
          </span>
        </Link>

        {user && (
          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((n) => {
              const active = pathname.startsWith(n.to);
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <n.icon className="h-4 w-4" />
                  {n.label}
                    {n.to === "/deals" && activeDealsCount > 0 && (
                      <span className="ml-0.5 grid min-w-5 place-items-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground">
                        {activeDealsCount}
                      </span>
                    )}
                </Link>
              );
            })}
          </nav>
        )}

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <Link to="/settings">
                <Button size="icon" variant="ghost" title="Settings">
                  <SettingsIcon className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/admin">
                <Button size="icon" variant="ghost" title="Admin">
                  <LayoutDashboard className="h-4 w-4" />
                </Button>
              </Link>
              <Button size="sm" variant="ghost" onClick={signOut}>
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Link to="/auth">
                <Button size="sm" variant="ghost">Sign in</Button>
              </Link>
              <Link to="/auth">
                <Button size="sm" variant="hero">Get started</Button>
              </Link>
            </>
          )}
        </div>
      </div>

      {user && (
        <nav className="mx-auto mt-2 flex max-w-7xl items-center gap-1 overflow-x-auto px-2 md:hidden">
          {navItems.map((n) => {
            const active = pathname.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs",
                  active ? "bg-primary/10 text-primary" : "text-muted-foreground",
                )}
              >
                <n.icon className="h-3.5 w-3.5" />
                {n.label}
                  {n.to === "/deals" && activeDealsCount > 0 && (
                    <span className="grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-4 text-primary-foreground">
                      {activeDealsCount}
                    </span>
                  )}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mx-auto mt-24 max-w-7xl px-5 pb-10 pt-12">
      <div className="glass-panel rounded-2xl px-6 py-8">
        <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[image:var(--gradient-primary)]">
              <Coins className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-display font-bold">CryptoBazar</span>
            <span className="text-xs text-muted-foreground">
              · Local USDT marketplace
            </span>
          </div>
          <div className="flex items-center gap-6 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" /> Escrow protected</span>
            <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Verified merchants</span>
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground/70">
          © {new Date().getFullYear()} CryptoBazar. Trade responsibly.
        </p>
      </div>
    </footer>
  );
}

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen px-4 pb-12">
      <DealNotifier />
      <SiteHeader />
      <main className="mx-auto mt-8 max-w-7xl">{children}</main>
      <SiteFooter />
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <PageShell>
        <div className="glass-panel rounded-2xl p-12 text-center text-muted-foreground">
          Loading…
        </div>
      </PageShell>
    );
  }
  if (!user) {
    return (
      <PageShell>
        <div className="glass-panel rounded-2xl p-12 text-center">
          <h2 className="font-display text-xl font-semibold">Sign in required</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            You need an account to access this page.
          </p>
          <div className="mt-5">
            <Link to="/auth">
              <Button variant="hero">Sign in / Sign up</Button>
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }
  return <>{children}</>;
}
