import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Search, MessageSquare, Lock, Loader2 } from "lucide-react";
import { PageShell, RequireAuth } from "@/components/site-chrome";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/chat/")({
  head: () => ({ meta: [{ title: "Private Chat — CryptoBazar" }] }),
  component: () => (
    <RequireAuth>
      <PageShell>
        <ChatInbox />
      </PageShell>
    </RequireAuth>
  ),
});

interface ConversationRow {
  id: string;
  user_a: string;
  user_b: string;
  last_message_at: string;
  last_message_preview: string | null;
  other?: { id: string; username: string | null; full_name: string | null; avatar_url: string | null } | null;
}

function ChatInbox() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [convs, setConvs] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Array<{ id: string; username: string | null; full_name: string | null; avatar_url: string | null }>>([]);
  const [searching, setSearching] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from("private_conversations")
        .select("*")
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
        .order("last_message_at", { ascending: false });
      const rows = (data ?? []) as ConversationRow[];
      const otherIds = rows.map((r) => (r.user_a === user.id ? r.user_b : r.user_a));
      let profiles: any[] = [];
      if (otherIds.length) {
        const { data: ps } = await supabase.from("profiles").select("id,username,full_name,avatar_url").in("id", otherIds);
        profiles = ps ?? [];
      }
      const map = new Map(profiles.map((p) => [p.id, p]));
      if (!mounted) return;
      setConvs(rows.map((r) => ({ ...r, other: map.get(r.user_a === user.id ? r.user_b : r.user_a) ?? null })));
      setLoading(false);
    })();

    const ch = supabase
      .channel(`pc-list-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "private_conversations" }, () => {
        // refetch on any change
        if (mounted) {
          supabase
            .from("private_conversations")
            .select("*")
            .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
            .order("last_message_at", { ascending: false })
            .then(({ data }) => {
              if (!mounted || !data) return;
              setConvs((prev) => {
                const otherMap = new Map(prev.map((p) => [p.id, p.other]));
                return (data as ConversationRow[]).map((r) => ({
                  ...r,
                  other: otherMap.get(r.id) ?? null,
                }));
              });
            });
        }
      })
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [user?.id]);

  // username search
  useEffect(() => {
    const term = q.trim().toLowerCase().replace(/^@/, "");
    if (!term || term.length < 2) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,username,full_name,avatar_url")
        .ilike("username", `%${term}%`)
        .neq("id", user!.id)
        .limit(8);
      setResults(data ?? []);
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q, user?.id]);

  const startChat = async (otherId: string) => {
    setStarting(otherId);
    try {
      const { data, error } = await supabase.rpc("start_private_conversation", { _other: otherId });
      if (error) throw error;
      navigate({ to: "/chat/$conversationId", params: { conversationId: data as string } });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not open chat");
    } finally {
      setStarting(null);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Private Chat</h1>
          <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" /> End-to-end encrypted · separate from deal rooms
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search users by @username"
            className="pl-9"
          />
        </div>

        {q.trim().length >= 2 && (
          <div className="mt-3 space-y-1">
            {searching && <p className="px-2 py-2 text-xs text-muted-foreground">Searching…</p>}
            {!searching && results.length === 0 && (
              <p className="px-2 py-2 text-xs text-muted-foreground">No users found for "{q}"</p>
            )}
            {results.map((r) => (
              <button
                key={r.id}
                onClick={() => startChat(r.id)}
                disabled={starting === r.id}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors hover:bg-secondary"
              >
                <div className="flex items-center gap-3">
                  <Avatar profile={r} />
                  <div>
                    <div className="text-sm font-medium">@{r.username}</div>
                    {r.full_name && <div className="text-xs text-muted-foreground">{r.full_name}</div>}
                  </div>
                </div>
                {starting === r.id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <Button size="sm" variant="ghost">Chat</Button>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6">
        <h2 className="px-1 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Conversations</h2>
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : convs.length === 0 ? (
            <div className="p-8 text-center">
              <MessageSquare className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="mt-3 text-sm text-muted-foreground">No conversations yet</p>
              <p className="mt-1 text-xs text-muted-foreground/70">Search a username above to start chatting.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {convs.map((c) => (
                <li key={c.id}>
                  <Link
                    to="/chat/$conversationId"
                    params={{ conversationId: c.id }}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/50"
                  >
                    <Avatar profile={c.other} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate text-sm font-semibold">
                          @{c.other?.username ?? "unknown"}
                        </div>
                        <div className="shrink-0 text-[10px] text-muted-foreground">
                          {new Date(c.last_message_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {c.last_message_preview ?? "New conversation"}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Avatar({ profile }: { profile: { username?: string | null; full_name?: string | null; avatar_url?: string | null } | null | undefined }) {
  const initial = (profile?.username || profile?.full_name || "?").slice(0, 1).toUpperCase();
  if (profile?.avatar_url) {
    return <img src={profile.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />;
  }
  return (
    <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
      {initial}
    </div>
  );
}
