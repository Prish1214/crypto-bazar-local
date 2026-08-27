import { createFileRoute } from "@tanstack/react-router";
import { userFromRequest } from "@/lib/supabase.server";

export const Route = createFileRoute("/api/wallet/transfer")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await userFromRequest(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });

        const { recipient_username, amount, note } = (await request
          .json()
          .catch(() => ({}))) as {
          recipient_username?: string;
          amount?: number | string;
          note?: string;
        };
        const amt = Number(amount);
        if (!recipient_username) return Response.json({ error: "Recipient required" }, { status: 400 });
        if (!Number.isFinite(amt) || amt <= 0) return Response.json({ error: "Invalid amount" }, { status: 400 });

        const { error } = await auth.client.rpc("internal_transfer", {
          _recipient_username: recipient_username,
          _amount: amt,
          _note: note ?? null,
        });
        if (error) return Response.json({ error: error.message }, { status: 400 });
        return Response.json({ ok: true });
      },
    },
  },
});
