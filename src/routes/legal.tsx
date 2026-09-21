import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { FileText, ChevronDown } from "lucide-react";
import { PageShell, RequireAuth } from "@/components/site-chrome";

export const Route = createFileRoute("/legal")({
  head: () => ({ meta: [{ title: "Terms & Privacy — KryptoBazar" }] }),
  component: () => <RequireAuth><LegalPage /></RequireAuth>,
});

const DOCS = [
  {
    title: "Terms of Service",
    updated: "Jan 2026",
    sections: [
      { h: "1. Acceptance", p: "By using KryptoBazar you agree to these Terms and our Privacy Policy. You must be 18+ and legally allowed to trade cryptocurrency in your jurisdiction." },
      { h: "2. Platform role", p: "KryptoBazar is a peer-to-peer marketplace and escrow provider. We are not a party to transactions between users and do not custody funds outside the escrow flow." },
      { h: "3. User conduct", p: "You agree not to engage in fraud, money laundering, harassment, or any activity that violates local law. Prohibited activity leads to account termination and potential legal action." },
      { h: "4. Fees", p: "Escrow, deposit and withdrawal fees are shown before confirmation. Users always receive exactly the amount displayed on the withdrawal confirmation screen." },
      { h: "5. Disputes", p: "Disputes are resolved by KryptoBazar staff using submitted chat logs, QR receipts, and evidence uploads. Decisions are final." },
      { h: "6. Termination", p: "We may suspend or terminate accounts that violate these Terms, are involved in disputes, or pose risk to other users." },
    ],
  },
  {
    title: "Privacy Policy",
    updated: "Jan 2026",
    sections: [
      { h: "Data we collect", p: "Account details (email, name, username, city, phone), profile photo, KYC documents when submitted, deal history, chat messages, and device/session data required to secure your account." },
      { h: "How we use it", p: "To operate the marketplace, authenticate you, prevent fraud, resolve disputes, and comply with legal obligations. We do not sell your personal data." },
      { h: "Storage & security", p: "Data is stored on managed cloud infrastructure with encryption in transit and at rest. Deal Codes are stored as salted hashes and never sent in plaintext." },
      { h: "Your rights", p: "You can request access, correction, or deletion of your personal data at any time by contacting support@cryptobazar.app." },
      { h: "Retention", p: "Transactional records are kept as required by anti-money-laundering regulations. Chat history is retained for dispute resolution." },
    ],
  },
  {
    title: "Refund & Cancellation Policy",
    updated: "Jan 2026",
    sections: [
      { h: "Deal cancellation", p: "Deals can be cancelled by mutual consent before escrow is released. Once USDT is released, the transaction is final." },
      { h: "Deposit reversals", p: "Blockchain deposits are irreversible. Please double-check the deposit address before sending funds." },
      { h: "Withdrawal errors", p: "Withdrawals sent to an incorrect address cannot be recovered. Verify all details before confirming." },
    ],
  },
];

function LegalPage() {
  const [open, setOpen] = useState<string | null>(DOCS[0].title);

  return (
    <PageShell>
      <div className="mx-auto max-w-2xl space-y-4 pb-6">
        <header className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-lg font-bold sm:text-xl">Terms & Privacy</h1>
              <p className="text-xs text-muted-foreground">Legal documents & policies</p>
            </div>
          </div>
        </header>

        <div className="space-y-2">
          {DOCS.map((doc) => (
            <div key={doc.title} className="overflow-hidden rounded-2xl border border-border bg-card">
              <button
                onClick={() => setOpen(open === doc.title ? null : doc.title)}
                className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-secondary/40"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{doc.title}</div>
                  <div className="text-[11px] text-muted-foreground">Updated {doc.updated}</div>
                </div>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition ${open === doc.title ? "rotate-180" : ""}`} />
              </button>
              {open === doc.title && (
                <div className="space-y-3 border-t border-border/60 p-4">
                  {doc.sections.map((s) => (
                    <div key={s.h}>
                      <div className="text-xs font-semibold text-foreground">{s.h}</div>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.p}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <p className="px-2 text-center text-[10px] text-muted-foreground">
          Questions? <Link to="/support" className="text-primary underline">Contact support</Link>
        </p>
      </div>
    </PageShell>
  );
}
