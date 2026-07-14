import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell, Mail, MessageSquare, Handshake, Wallet as WalletIcon, Megaphone } from "lucide-react";
import { PageShell, RequireAuth } from "@/components/site-chrome";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/notifications")({
  head: () => ({ meta: [{ title: "Notifications — CryptoBazar" }] }),
  component: () => <RequireAuth><NotifPage /></RequireAuth>,
});

type Prefs = Record<string, boolean>;
const DEFAULT: Prefs = {
  push_deals: true, push_chat: true, push_wallet: true, push_marketing: false,
  email_deals: true, email_wallet: true, email_marketing: false,
};

const KEY = (uid: string) => `cb.notif.prefs.${uid}`;

function NotifPage() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT);
  const [permission, setPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    if (!user) return;
    try {
      const raw = localStorage.getItem(KEY(user.id));
      if (raw) setPrefs({ ...DEFAULT, ...JSON.parse(raw) });
    } catch {}
    if (typeof Notification !== "undefined") setPermission(Notification.permission);
  }, [user?.id]);

  const set = (k: keyof Prefs, v: boolean) => {
    if (!user) return;
    const next = { ...prefs, [k]: v };
    setPrefs(next);
    try { localStorage.setItem(KEY(user.id), JSON.stringify(next)); } catch {}
  };

  const requestPush = async () => {
    if (typeof Notification === "undefined") return toast.error("Push not supported on this device");
    const r = await Notification.requestPermission();
    setPermission(r);
    if (r === "granted") toast.success("Push notifications enabled");
    else toast.info("You can enable them later from browser settings");
  };

  return (
    <PageShell>
      <div className="mx-auto max-w-2xl space-y-4 pb-6">
        <header className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-lg font-bold sm:text-xl">Notifications</h1>
              <p className="text-xs text-muted-foreground">Alerts & communication</p>
            </div>
          </div>
        </header>

        {permission !== "granted" && (
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <Bell className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">Enable push notifications</div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Get real-time alerts when a buyer sends cash or a counterparty replies.
                </p>
              </div>
              <button onClick={requestPush} className="shrink-0 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                Enable
              </button>
            </div>
          </div>
        )}

        <Section title="Push notifications" icon={Bell}>
          <Toggle icon={Handshake} title="Deal updates" desc="New offers, escrow, dispute alerts" on={prefs.push_deals} onChange={(v) => set("push_deals", v)} />
          <Toggle icon={MessageSquare} title="Chat messages" desc="Direct messages from counterparties" on={prefs.push_chat} onChange={(v) => set("push_chat", v)} />
          <Toggle icon={WalletIcon} title="Wallet activity" desc="Deposits, withdrawals & transfers" on={prefs.push_wallet} onChange={(v) => set("push_wallet", v)} />
          <Toggle icon={Megaphone} title="Announcements" desc="Product news & promotions" on={prefs.push_marketing} onChange={(v) => set("push_marketing", v)} />
        </Section>

        <Section title="Email notifications" icon={Mail}>
          <Toggle icon={Handshake} title="Deal updates" desc="Escrow lifecycle & disputes" on={prefs.email_deals} onChange={(v) => set("email_deals", v)} />
          <Toggle icon={WalletIcon} title="Wallet activity" desc="Deposit / withdrawal confirmations" on={prefs.email_wallet} onChange={(v) => set("email_wallet", v)} />
          <Toggle icon={Megaphone} title="Announcements" desc="Occasional product updates" on={prefs.email_marketing} onChange={(v) => set("email_marketing", v)} />
        </Section>

        <p className="px-2 text-center text-[10px] text-muted-foreground">
          Preferences are saved on this device. <Link to="/support" className="text-primary underline">Need help?</Link>
        </p>
      </div>
    </PageShell>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {title}
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">{children}</div>
    </section>
  );
}

function Toggle({ icon: Icon, title, desc, on, onChange }: { icon: any; title: string; desc: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3 border-b border-border/60 p-3.5 last:border-b-0">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{title}</div>
        <div className="truncate text-[11px] text-muted-foreground">{desc}</div>
      </div>
      <Switch checked={on} onCheckedChange={onChange} />
    </div>
  );
}
