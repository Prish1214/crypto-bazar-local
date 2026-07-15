import { createFileRoute } from "@tanstack/react-router";
import { userFromRequest, admin } from "@/lib/supabase.server";
import { withCorsHandlers } from "@/lib/cors";

export const Route = createFileRoute("/api/deal-code/biometric")({
  server: {
    handlers: withCorsHandlers({
      POST: async ({ request }: { request: Request }) => {
        const auth = await userFromRequest(request);
        if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as { enabled?: boolean };
        const sb = admin();
        const { error } = await sb.from("profiles")
          .update({ biometric_enabled: !!body.enabled })
          .eq("id", auth.user.id);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ ok: true });
      },
    }),
  },
});
