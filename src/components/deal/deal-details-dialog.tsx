import { useEffect, useMemo, useState } from "react";
import {
  AlertOctagon, Clock, FileCheck2, History,
  Loader2, Lock, ReceiptText, ShieldCheck, type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  db, fmtUSDT, type Deal, type Dispute, type Message, type Transaction,
} from "@/lib/db";
import { cn } from "@/lib/utils";

interface Props {
  deal: Deal;
  trigger?: ReactNode;
}

type VerificationLog = {
  label: string;
  at: string | null;
  detail: string;
  tone?: "success" | "warning" | "default";
};

export function DealDetailsDialog({ deal, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [systemMessages, setSystemMessages] = useState<Message[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);

  const load = async () => {
    setLoading(true);
    const [{ data: tx }, { data: messages }, { data: disputeRows }] = await Promise.all([
      db.from("transactions").select("*").eq("deal_id", deal.id).order("created_at", { ascending: true }),
      db.from("messages").select("*").eq("deal_id", deal.id).eq("kind", "system").order("created_at", { ascending: true }),
      db.from("disputes").select("*").eq("deal_id", deal.id).order("created_at", { ascending: true }),
    ]);
    setTransactions((tx ?? []) as Transaction[]);
    setSystemMessages((messages ?? []) as Message[]);
    setDisputes((disputeRows ?? []) as Dispute[]);
    setLoading(false);
  };

  useEffect(() => {
    if (!open) return;
    load();
    const channel = db
      .channel(`deal-details-${deal.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions", filter: `deal_id=eq.${deal.id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `deal_id=eq.${deal.id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "disputes", filter: `deal_id=eq.${deal.id}` }, load)
      .subscribe();
    return () => { db.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, deal.id]);

  const verificationLogs = useMemo<VerificationLog[]>(() => [
    { label: "Buyer arrival", at: deal.buyer_arrived_at, detail: locationText(deal.buyer_arrival_lat, deal.buyer_arrival_lng), tone: deal.buyer_arrived_at ? "success" : "default" },
    { label: "Seller arrival", at: deal.seller_arrived_at, detail: locationText(deal.seller_arrival_lat, deal.seller_arrival_lng), tone: deal.seller_arrived_at ? "success" : "default" },
    { label: "Buyer selfie", at: deal.buyer_selfie_url ? deal.updated_at ?? deal.created_at : null, detail: deal.buyer_selfie_url ? "Uploaded" : "Pending", tone: deal.buyer_selfie_url ? "success" : "default" },
    { label: "Seller selfie", at: deal.seller_selfie_url ? deal.updated_at ?? deal.created_at : null, detail: deal.seller_selfie_url ? "Uploaded" : "Pending", tone: deal.seller_selfie_url ? "success" : "default" },
    { label: "Cash handover", at: deal.cash_handover_at, detail: deal.cash_photo_url ? "Evidence uploaded" : deal.cash_handover_at ? "Marked by buyer" : "Pending", tone: deal.cash_handover_at ? "success" : "default" },
    { label: "Seller confirmation", at: deal.seller_confirmed_at, detail: deal.seller_confirmed_at ? "Cash receipt confirmed" : "Pending", tone: deal.seller_confirmed_at ? "success" : "default" },
  ], [deal]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <ReceiptText className="h-4 w-4" /> Deal details
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Deal Details
            <Badge variant="outline" className="font-mono text-primary">{deal.deal_code ?? deal.id.slice(0, 8)}</Badge>
            <Badge variant="secondary" className="capitalize">{deal.status.replace(/_/g, " ")}</Badge>
          </DialogTitle>
          <DialogDescription>
            Full escrow, verification, settlement, and dispute record for this trade.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-3">
          <SummaryTile icon={Lock} label="Escrow amount" value={fmtUSDT(deal.amount_usdt)} />
          <SummaryTile icon={ShieldCheck} label="Platform fee (0%)" value={fmtUSDT(deal.fee_usdt)} />
          <SummaryTile icon={Clock} label="Opened" value={new Date(deal.created_at).toLocaleString()} />
        </div>

        {loading ? (
          <div className="grid place-items-center rounded-xl border border-border p-10">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <DetailSection icon={History} title="Trade history">
              {systemMessages.length === 0 ? (
                <EmptyLine text="No system history recorded yet." />
              ) : systemMessages.map((m) => (
                <TimelineLine key={m.id} at={m.created_at} title={m.content} />
              ))}
            </DetailSection>

            <DetailSection icon={ReceiptText} title="Escrow balance changes">
              {transactions.length === 0 ? (
                <EmptyLine text="No escrow transactions recorded yet." />
              ) : transactions.map((t) => (
                <TimelineLine
                  key={t.id}
                  at={t.created_at}
                  title={`${t.type.replace(/_/g, " ")} · ${fmtUSDT(t.amount)}`}
                  description={t.description ?? undefined}
                />
              ))}
            </DetailSection>

            <DetailSection icon={FileCheck2} title="Verification logs">
              {verificationLogs.map((log) => (
                <TimelineLine
                  key={log.label}
                  at={log.at}
                  title={log.label}
                  description={log.detail}
                  done={log.tone === "success"}
                />
              ))}
            </DetailSection>

            <DetailSection icon={AlertOctagon} title="Settlement / dispute outcome">
              {deal.status === "completed" && (
                <TimelineLine at={deal.completed_at} title="Trade completed" description="Escrow released and settlement finalized." done />
              )}
              {deal.status === "cancelled" && (
                <TimelineLine at={deal.updated_at ?? deal.created_at} title="Deal cancelled" description="No further escrow movement is allowed." />
              )}
              {disputes.length === 0 && deal.status !== "completed" && deal.status !== "cancelled" ? (
                <EmptyLine text="No disputes or final settlement yet." />
              ) : disputes.map((d) => (
                <TimelineLine
                  key={d.id}
                  at={d.created_at}
                  title={`Dispute ${d.status.replace(/_/g, " ")}`}
                  description={d.admin_notes ?? d.reason}
                />
              ))}
            </DetailSection>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SummaryTile({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" /> {label}
      </div>
      <div className="mt-2 font-display text-lg font-semibold">{value}</div>
    </div>
  );
}

function DetailSection({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h3 className="flex items-center gap-2 font-display text-sm font-semibold">
        <Icon className="h-4 w-4 text-primary" /> {title}
      </h3>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function TimelineLine({ at, title, description, done }: { at: string | null; title: string; description?: string; done?: boolean }) {
  return (
    <div className="flex gap-3 text-sm">
      <div className={cn("mt-1 h-2.5 w-2.5 rounded-full", done ? "bg-success" : at ? "bg-primary" : "bg-border")} />
      <div className="min-w-0 flex-1">
        <div className="font-medium capitalize leading-snug">{title}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {at ? new Date(at).toLocaleString() : "Pending"}
          {description ? ` · ${description}` : ""}
        </div>
      </div>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <div className="rounded-lg bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">{text}</div>;
}

function locationText(lat: number | null, lng: number | null) {
  if (lat == null || lng == null) return "Location not captured";
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}