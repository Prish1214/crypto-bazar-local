import { useEffect, useRef } from "react";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { BellRing } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { db, type Deal } from "@/lib/db";

/**
 * Mounts a global realtime subscription for the signed-in user, popping a
 * toast (with "Open" action) whenever a new deal is created against them
 * or a deal they're in changes status. Place once near the app root.
 */
export function DealNotifier() {
  const { user } = useAuth();
  const router = useRouter();
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    seen.current.clear();

    const open = (dealId: string) =>
      router.navigate({ to: "/deals/$dealId", params: { dealId } });

    const onInsert = (payload: any) => {
      const d = payload.new as Deal;
      if (seen.current.has(`new-${d.id}`)) return;
      seen.current.add(`new-${d.id}`);
      const role = d.seller_id === user.id ? "seller" : "buyer";
      toast.success(
        role === "seller" ? "New deal request received" : "Deal created",
        {
          description:
            role === "seller"
              ? `A buyer wants ${Number(d.amount_usdt).toFixed(2)} USDT — review now.`
              : `Your deal for ${Number(d.amount_usdt).toFixed(2)} USDT is open.`,
          duration: 8000,
          action: { label: "Open", onClick: () => open(d.id) },
        },
      );
    };

    const announceExistingActiveDeals = async () => {
      const { data } = await db
        .from("deals")
        .select("id, deal_code, amount_usdt, status, buyer_id, seller_id, created_at")
        .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
        .in("status", [
          "pending", "accepted", "escrow_funded", "meeting_proposed",
          "meeting_scheduled", "locked", "arrived", "verified", "cash_sent",
          "confirmed", "proof_uploaded", "disputed",
        ] as any)
        .order("created_at", { ascending: false })
        .limit(1);

      const d = data?.[0] as Deal | undefined;
      if (!d || seen.current.has(`active-${d.id}-${d.status}`)) return;
      seen.current.add(`active-${d.id}-${d.status}`);
      toast("Active deal needs attention", {
        icon: <BellRing className="h-4 w-4" />,
        description: `${d.deal_code ?? d.id.slice(0, 8)} · ${Number(d.amount_usdt).toFixed(2)} USDT · ${d.status.replace(/_/g, " ")}`,
        duration: 7000,
        action: { label: "Open", onClick: () => open(d.id) },
      });
    };

    const onUpdate = (payload: any) => {
      const d = payload.new as Deal;
      const prev = payload.old as Deal;
      if (!prev || d.status === prev.status) return;
      const key = `upd-${d.id}-${d.status}`;
      if (seen.current.has(key)) return;
      seen.current.add(key);
      toast(`Deal ${d.deal_code ?? d.id.slice(0, 6)}: ${d.status.replace(/_/g, " ")}`, {
        description: "Tap to open the deal room.",
        duration: 6000,
        action: { label: "Open", onClick: () => open(d.id) },
      });
    };

    announceExistingActiveDeals();
    const poll = window.setInterval(announceExistingActiveDeals, 15000);

    const ch = db
      .channel(`notif-${user.id}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "deals", filter: `seller_id=eq.${user.id}` },
        onInsert)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "deals", filter: `buyer_id=eq.${user.id}` },
        onInsert)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "deals", filter: `seller_id=eq.${user.id}` },
        onUpdate)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "deals", filter: `buyer_id=eq.${user.id}` },
        onUpdate)
      .subscribe();

    return () => {
      window.clearInterval(poll);
      db.removeChannel(ch);
    };
  }, [user?.id, router]);

  return null;
}
