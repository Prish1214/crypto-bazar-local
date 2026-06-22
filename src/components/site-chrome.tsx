import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Shield, Coins, Users } from "lucide-react";

export function SiteHeader() {
  const { user, signOut } = useAuth();
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

        <nav className="hidden items-center gap-1 md:flex">
          <Link to="/" className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
            Home
          </Link>
          <a href="#how" className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
            How it works
          </a>
          <a href="#features" className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
            Features
          </a>
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {user.email}
              </span>
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
