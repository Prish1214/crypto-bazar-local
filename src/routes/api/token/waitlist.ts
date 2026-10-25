import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { withCorsHandlers } from "@/lib/cors.server";
import { admin } from "@/lib/supabase.server";

const Input = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
});

export const Route = createFileRoute("/api/token/waitlist")({
  server: {
    handlers: withCorsHandlers({
      POST: async ({ request }) => {
        const parsed = Input.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return Response.json({ error: "Please enter a valid email address." }, { status: 400 });
        }

        try {
          const { error } = await admin().from("token_waitlist").insert({
            email: parsed.data.email,
            source: "web",
          });
          if (error) {
            // Unique violation — already joined, treat as success.
            if ((error as { code?: string }).code === "23505") {
              return Response.json({ ok: true, message: "You're already on the waitlist!" });
            }
            throw error;
          }
          return Response.json({ ok: true, message: "You're on the list! We'll email you at launch." });
        } catch (err) {
          console.error("[token_waitlist] insert failed", err);
          return Response.json({ error: "Couldn't join right now. Please try again." }, { status: 500 });
        }
      },
    }),
  },
});
