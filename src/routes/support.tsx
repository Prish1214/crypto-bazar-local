import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { LifeBuoy, ChevronRight, Mail, MessageCircle, Shield, Search, ChevronDown } from "lucide-react";
import { PageShell, RequireAuth } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/support")({
  head: () => ({ meta: [{ title: "Help & Support — KryptoBazar" }] }),
  component: () => <RequireAuth><SupportPage /></RequireAuth>,
});

const FAQS: { q: string; a: string; cat: string }[] = [
  { cat: "Deals", q: "How does escrow work?", a: "When a deal starts, the seller's USDT is locked in escrow. Once the buyer pays cash and the seller confirms with their Deal Code, USDT is released to the buyer's wallet automatically." },
  { cat: "Deals", q: "What is a Deal Code?", a: "A private 6-digit code only you know. It's required to authorize any USDT release. Optionally you can unlock it with Fingerprint / Face ID on your device." },
  { cat: "Deals", q: "What happens if there's a dispute?", a: "Open a dispute from the Deal Room. Our team reviews chat, QR proofs, and uploaded evidence, then rules within 24 hours." },
  { cat: "Wallet", q: "Why is my deposit taking time?", a: "Deposits are credited after the required network confirmations for the chain you used (typically 1–3 minutes for TRC-20, 2–10 for ERC-20)." },
  { cat: "Wallet", q: "Are there withdrawal fees?", a: "The estimated blockchain fee is shown on the confirmation screen. You always receive exactly the amount displayed — platform covers any shortfall." },
  { cat: "Account", q: "How do I get verified?", a: "Complete your profile and request KYC from Settings. An admin reviews your submission and the Verified badge appears on your profile once approved." },
  { cat: "Account", q: "How do I change my Deal Code?", a: "Go to Me → Deal Code & biometrics → Change Deal Code. We'll email you a magic link to authorize the change." },
  { cat: "Security", q: "How do I keep my account safe?", a: "Never share your Deal Code, email OTP, or password. Enable biometric unlock. Always verify counterparty ratings before meeting in person." },
];

function SupportPage() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<number | null>(0);
  const filtered = FAQS.filter((f) => (f.q + f.a + f.cat).toLowerCase().includes(q.toLowerCase()));

  return (
    <PageShell>
      <div className="mx-auto max-w-2xl space-y-4 pb-6">
        <header className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary">
              <LifeBuoy className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-lg font-bold sm:text-xl">Help & Support</h1>
              <p className="text-xs text-muted-foreground">FAQs, contact & safety tips</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-2.5">
          <a href="mailto:support@cryptobazar.app" className="rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/40">
            <Mail className="h-5 w-5 text-primary" />
            <div className="mt-2 text-sm font-semibold">Email us</div>
            <div className="text-[11px] text-muted-foreground">support@cryptobazar.app</div>
          </a>
          <Link to="/chat" className="rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/40">
            <MessageCircle className="h-5 w-5 text-primary" />
            <div className="mt-2 text-sm font-semibold">In-app chat</div>
            <div className="text-[11px] text-muted-foreground">Reply within 24h</div>
          </Link>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search FAQs" className="pl-9" />
        </div>

        <section className="space-y-2">
          <div className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Frequently asked</div>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {filtered.map((f, i) => (
              <button
                key={f.q}
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full border-b border-border/60 p-4 text-left last:border-b-0 hover:bg-secondary/40"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">{f.cat}</div>
                    <div className="text-sm font-semibold">{f.q}</div>
                  </div>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition ${open === i ? "rotate-180" : ""}`} />
                </div>
                {open === i && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{f.a}</p>}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="p-6 text-center text-xs text-muted-foreground">No FAQs match "{q}"</div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-amber-500/40 bg-amber-50/70 p-4 dark:bg-amber-950/20">
          <div className="flex gap-2">
            <Shield className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="text-xs">
              <div className="font-semibold text-amber-900 dark:text-amber-200">Safety first</div>
              <p className="mt-1 text-amber-900/80 dark:text-amber-200/80">
                KryptoBazar staff will never ask for your Deal Code, password, or email OTP. Always meet
                counterparties in a safe public place.
              </p>
            </div>
          </div>
        </section>

        <Link to="/me" className="flex items-center justify-center gap-1 py-3 text-xs text-muted-foreground">
          Back to profile <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
    </PageShell>
  );
}
