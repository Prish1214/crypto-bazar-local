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
      <div className="mb-5">
        <h1 className="font-display text-[26px] font-bold leading-tight">Chats</h1>
        <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="h-3 w-3" /> End-to-end encrypted · separate from deal rooms
        </p>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search @username to start chatting"
          className="h-11 rounded-2xl border-transparent bg-secondary/70 pl-10 text-[14px] focus-visible:border-primary/40 focus-visible:bg-card"
        />
      </div>

      {q.trim().length >= 2 && (
        <div className="mb-4 overflow-hidden rounded-2xl border border-border bg-card shadow-sm animate-fade-in">
          {searching && <p className="px-4 py-3 text-xs text-muted-foreground">Searching…</p>}
          {!searching && results.length === 0 && (
            <p className="px-4 py-3 text-xs text-muted-foreground">No users found for "{q}"</p>
          )}
          <ul className="divide-y divide-border/60">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => startChat(r.id)}
                  disabled={starting === r.id}
                  className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-secondary/60"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar profile={r} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">@{r.username}</div>
                      {r.full_name && <div className="truncate text-xs text-muted-foreground">{r.full_name}</div>}
                    </div>
                  </div>
                  {starting === r.id
                    ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                    : <Button size="sm" variant="ghost" className="shrink-0">Chat</Button>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Recent</h2>
      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : convs.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10">
            <MessageSquare className="h-6 w-6 text-primary" />
          </div>
          <p className="mt-4 text-sm font-semibold">No conversations yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Search a username above to start chatting.</p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {convs.map((c) => (
            <li key={c.id}>
              <Link
                to="/chat/$conversationId"
                params={{ conversationId: c.id }}
                className="flex items-center gap-3 rounded-2xl border border-transparent bg-card px-3.5 py-3 shadow-sm transition-all hover:border-border hover:shadow-md active:scale-[0.99]"
              >
                <Avatar profile={c.other} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-[14px] font-semibold">@{c.other?.username ?? "unknown"}</div>
                    <div className="shrink-0 text-[10px] font-medium text-muted-foreground">
                      {formatRelative(c.last_message_at)}
                    </div>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {c.last_message_preview ?? "Say hello 👋"}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatRelative(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const yest = new Date(now); yest.setDate(yest.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
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
