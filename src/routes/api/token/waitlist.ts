import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { withCorsHandlers } from "@/lib/cors.server";
import { admin } from "@/lib/supabase.server";

// BEP20 (BSC) address: 0x followed by 40 hex characters.
const Input = z.object({
  wallet: z
    .string()
    .trim()
    .regex(/^0x[0-9a-fA-F]{40}$/, "Enter a valid BEP20 wallet address (starts with 0x)."),
});

function dbCode(err: unknown): string | undefined {
  return (err as { code?: string } | null)?.code;
}

export const Route = createFileRoute("/api/token/waitlist")({
  server: {
    handlers: withCorsHandlers({
      POST: async ({ request }) => {
        const parsed = Input.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return Response.json(
            { error: "Enter a valid BEP20 wallet address (starts with 0x)." },
            { status: 400 },
          );
        }
        // Normalize so 0xABC… and 0xabc… count as the same wallet.
        const wallet = parsed.data.wallet.toLowerCase();

        // Optionally link the entry to the signed-in account (one wallet per account).
        const authHeader = request.headers.get("authorization") ?? "";
        const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
        let userId: string | null = null;
        if (bearer) {
          try {
            const { data } = await admin().auth.getUser(bearer);
            userId = data?.user?.id ?? null;
          } catch {
            userId = null;
          }
        }

        try {
          // One wallet address on the whole list.
          const { data: byWallet } = await admin()
            .from("token_waitlist")
            .select("id")
            .ilike("wallet", wallet)
            .maybeSingle();
          if (byWallet) {
            return Response.json({ ok: true, message: "This wallet is already on the waitlist!" });
          }

          // One waitlist entry per account.
          if (userId) {
            const { data: byUser } = await admin()
              .from("token_waitlist")
              .select("id, wallet")
              .eq("user_id", userId)
              .maybeSingle();
            if (byUser) {
              return Response.json({ ok: true, message: "Your account is already on the waitlist!" });
            }
          }

          const { error } = await admin().from("token_waitlist").insert({
            wallet,
            user_id: userId,
            source: "web",
          });
          if (error) {
            if (dbCode(error) === "23505") {
              return Response.json({ ok: true, message: "This wallet is already on the waitlist!" });
            }
            throw error;
          }
          return Response.json({
            ok: true,
            message: "You're on the list! At launch, your earned KRYPTO is transferred to this address.",
          });
        } catch (err) {
          console.error("[token_waitlist] insert failed", err);
          return Response.json({ error: "Couldn't join right now. Please try again." }, { status: 500 });
        }
      },
    }),
  },
});
