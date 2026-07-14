import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shield, Fingerprint, Mail, Smartphone, Key, LogOut, ChevronRight, CheckCircle2, AlertTriangle } from "lucide-react";
import { PageShell, RequireAuth } from "@/components/site-chrome";
import { useAuth } from "@/hooks/use-auth";
import { db } from "@/lib/db";
import { isBiometricEnrolledLocally } from "@/lib/deal-code";
import { toast } from "sonner";

export const Route = createFileRoute("/security")({
  head: () => ({ meta: [{ title: "Security — CryptoBazar" }] }),
  component: () => <RequireAuth><SecurityPage /></RequireAuth>,
});

function SecurityPage() {
  const { user, signOut } = useAuth();
  const [dealCodeSet, setDealCodeSet] = useState<boolean | null>(null);
  const [biometricOn, setBiometricOn] = useState(false);
  const [lastSignIn, setLastSignIn] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await db.from("profiles")
        .select("deal_code_set_at, biometric_enabled")
        .eq("id", user.id).maybeSingle();
      setDealCodeSet(!!data?.deal_code_set_at);
      const localBio = await isBiometricAvailable(user.id).catch(() => false);
      setBiometricOn(!!data?.biometric_enabled && localBio);
    })();
    setLastSignIn(user.last_sign_in_at ?? null);
  }, [user?.id]);

  return (
    <PageShell>
      <div className="mx-auto max-w-2xl space-y-4 pb-6">
        <header className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-lg font-bold sm:text-xl">Security</h1>
              <p className="text-xs text-muted-foreground">Sign-in, sessions & verification</p>
            </div>
          </div>
        </header>

        <section className="space-y-2">
          <div className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Authorization</div>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <StatusRow
              icon={Key}
              title="Deal Code"
              desc={dealCodeSet ? "6-digit release code is active" : "Not set — required for escrow releases"}
              status={dealCodeSet ? "ok" : "warn"}
              to="/settings/deal-code"
              cta={dealCodeSet ? "Change" : "Set up"}
            />
            <StatusRow
              icon={Fingerprint}
              title="Biometric unlock"
              desc={biometricOn ? "Fingerprint / Face ID enabled on this device" : "Optional device-only unlock"}
              status={biometricOn ? "ok" : "off"}
              to="/settings/deal-code"
              cta="Manage"
            />
          </div>
        </section>

        <section className="space-y-2">
          <div className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Account</div>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <InfoRow icon={Mail} title="Email" desc={user?.email ?? "—"} />
            <InfoRow
              icon={Smartphone}
              title="Last sign-in"
              desc={lastSignIn ? new Date(lastSignIn).toLocaleString() : "—"}
            />
          </div>
        </section>

        <section className="space-y-2">
          <div className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tips</div>
          <div className="space-y-2">
            <Tip>Never share your Deal Code, email OTP, or magic link with anyone — CryptoBazar staff will never ask.</Tip>
            <Tip>Always verify the counterparty's rating and completed trades before meeting in person.</Tip>
            <Tip>Sign out on shared devices and enable biometric unlock on your personal phone.</Tip>
          </div>
        </section>

        <button
          onClick={async () => {
            await signOut();
            toast.success("Signed out");
            window.location.replace("/auth");
          }}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/5 py-3 text-sm font-semibold text-red-600 hover:bg-red-500/10"
        >
          <LogOut className="h-4 w-4" /> Sign out of this device
        </button>

        <Link to="/me" className="flex items-center justify-center gap-1 py-2 text-xs text-muted-foreground">
          Back to profile <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
    </PageShell>
  );
}

function StatusRow({ icon: Icon, title, desc, status, to, cta }: { icon: any; title: string; desc: string; status: "ok" | "warn" | "off"; to: string; cta: string }) {
  const badge =
    status === "ok" ? { cls: "bg-emerald-500/10 text-emerald-600", Icon: CheckCircle2, text: "Active" } :
    status === "warn" ? { cls: "bg-amber-500/10 text-amber-600", Icon: AlertTriangle, text: "Action needed" } :
    { cls: "bg-muted text-muted-foreground", Icon: Shield, text: "Off" };
  return (
    <div className="flex items-center gap-3 border-b border-border/60 p-3.5 last:border-b-0">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{title}</span>
          <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${badge.cls}`}>
            <badge.Icon className="h-2.5 w-2.5" /> {badge.text}
          </span>
        </div>
        <div className="truncate text-[11px] text-muted-foreground">{desc}</div>
      </div>
      <Link to={to} className="shrink-0 rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold text-foreground hover:bg-secondary">
        {cta}
      </Link>
    </div>
  );
}

function InfoRow({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-border/60 p-3.5 last:border-b-0">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
        <div className="truncate text-sm font-semibold">{desc}</div>
      </div>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 text-xs leading-relaxed text-muted-foreground">
      • {children}
    </div>
  );
}
