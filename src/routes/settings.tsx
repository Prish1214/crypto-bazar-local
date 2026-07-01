import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Save, Shield, ChevronRight } from "lucide-react";
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
  component: () => <RequireAuth><Settings /></RequireAuth>,
});

function Settings() {
  const { user } = useAuth();
  const [p, setP] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (!user) return;
      const { data } = await db.from("profiles").select("*").eq("id", user.id).maybeSingle();
      setP((data as Profile) ?? null);
    })();
  }, [user?.id]);

  if (!p) return <PageShell><div className="glass-panel grid place-items-center rounded-2xl p-16"><Loader2 className="h-6 w-6 animate-spin" /></div></PageShell>;

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
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 font-display text-3xl font-bold">Settings</h1>
        <div className="glass-strong space-y-4 rounded-2xl p-6">
          <Row label="Full name"><Input value={p.full_name ?? ""} onChange={(e) => setP({ ...p, full_name: e.target.value })} /></Row>
          <Row label="Username"><Input value={p.username ?? ""} onChange={(e) => setP({ ...p, username: e.target.value })} /></Row>
          <Row label="City"><Input value={p.city ?? ""} onChange={(e) => setP({ ...p, city: e.target.value })} /></Row>
          <Row label="Phone"><Input value={p.phone ?? ""} onChange={(e) => setP({ ...p, phone: e.target.value })} /></Row>
          <Row label="Avatar URL"><Input value={p.avatar_url ?? ""} onChange={(e) => setP({ ...p, avatar_url: e.target.value })} placeholder="https://…" /></Row>
          <Row label="Bio"><Textarea value={p.bio ?? ""} onChange={(e) => setP({ ...p, bio: e.target.value })} /></Row>
          <Button variant="hero" onClick={save} disabled={busy}><Save className="h-4 w-4" /> Save changes</Button>
        </div>

        <Link to="/settings/deal-code" className="mt-5 flex items-center justify-between rounded-2xl border border-border bg-card p-5 shadow-sm hover:border-primary/40 transition">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Shield className="h-5 w-5" /></div>
            <div>
              <div className="font-semibold">Deal Code & biometric</div>
              <div className="text-xs text-muted-foreground">Change your 6-digit release code (email OTP required)</div>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>

        <div className="glass-panel mt-5 rounded-2xl p-6">
          <h3 className="font-display font-semibold">Account</h3>
          <p className="mt-1 text-sm text-muted-foreground">Signed in as <span className="font-mono">{user!.email}</span></p>
        </div>
      </div>
    </PageShell>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
