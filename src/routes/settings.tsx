import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Save, Shield, ChevronRight, LogOut, LayoutDashboard, Mail } from "lucide-react";
import { PageShell, RequireAuth } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { db, type Profile } from "@/lib/db";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — CryptoBazar" }] }),
  component: SettingsRoute,
});

function SettingsRoute() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname !== "/settings") return <RequireAuth><Outlet /></RequireAuth>;
  return <RequireAuth><Settings /></RequireAuth>;
}

function Settings() {
  const { user, signOut } = useAuth();
  const [p, setP] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    (async () => {
      if (!user) return;
      const [{ data: prof }, { data: role }] = await Promise.all([
        db.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        db.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle(),
      ]);
      setP((prof as Profile) ?? null);
      setIsAdmin(!!role);
    })();
  }, [user?.id]);

  if (!p) return <PageShell><div className="grid place-items-center rounded-2xl border border-border bg-card p-16"><Loader2 className="h-6 w-6 animate-spin" /></div></PageShell>;

  const save = async () => {
    setBusy(true);
    const { error } = await db.from("profiles").update({
      full_name: p.full_name, username: p.username, city: p.city, phone: p.phone, bio: p.bio, avatar_url: p.avatar_url,
      updated_at: new Date().toISOString(),
    }).eq("id", p.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Profile saved");
  };

  return (
    <PageShell>
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="font-display text-2xl font-bold md:text-3xl">Settings</h1>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-full bg-primary/10 font-semibold text-primary">
              {(p.full_name ?? user!.email ?? "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{p.full_name || p.username || "Unnamed"}</div>
              <div className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                <Mail className="h-3 w-3" /> {user!.email}
              </div>
            </div>
            {isAdmin && (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">ADMIN</span>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <SettingsLink to="/settings/deal-code" icon={Shield} title="Deal Code & biometric" subtitle="Change 6-digit release code · Face ID / Fingerprint" />
          {isAdmin && (
            <SettingsLink to="/admin" icon={LayoutDashboard} title="Admin panel" subtitle="Users, disputes, wallet adjustments" />
          )}
        </div>

        <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-display text-base font-semibold">Profile</h2>
          <Row label="Full name"><Input value={p.full_name ?? ""} onChange={(e) => setP({ ...p, full_name: e.target.value })} /></Row>
          <Row label="Username"><Input value={p.username ?? ""} onChange={(e) => setP({ ...p, username: e.target.value })} /></Row>
          <Row label="City"><Input value={p.city ?? ""} onChange={(e) => setP({ ...p, city: e.target.value })} /></Row>
          <Row label="Phone"><Input value={p.phone ?? ""} onChange={(e) => setP({ ...p, phone: e.target.value })} /></Row>
          <Row label="Avatar URL"><Input value={p.avatar_url ?? ""} onChange={(e) => setP({ ...p, avatar_url: e.target.value })} placeholder="https://…" /></Row>
          <Row label="Bio"><Textarea value={p.bio ?? ""} onChange={(e) => setP({ ...p, bio: e.target.value })} /></Row>
          <Button variant="hero" onClick={save} disabled={busy} className="w-full sm:w-auto"><Save className="h-4 w-4" /> Save changes</Button>
        </div>

        <Button
          variant="outline"
          className="w-full border-red-500/40 text-red-600 hover:bg-red-500/10 hover:text-red-600"
          onClick={async () => { await signOut(); window.location.replace("/auth"); }}
        >
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </div>
    </PageShell>
  );
}

function SettingsLink({
  to, icon: Icon, title, subtitle,
}: { to: string; icon: React.ComponentType<{ className?: string }>; title: string; subtitle: string }) {
  return (
    <Link to={to} className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/40">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-xs text-muted-foreground">{subtitle}</div>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
