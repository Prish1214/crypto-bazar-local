import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Send, Image as ImageIcon, MapPin, Lock, Loader2, Check, CheckCheck, Plus } from "lucide-react";
import { RequireAuth } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { encryptForConversation, decryptForConversation } from "@/lib/private-chat";
import { sanitizeMessage } from "@/lib/chat-sanitize";
import { toast } from "sonner";

export const Route = createFileRoute("/chat/$conversationId")({
  head: () => ({ meta: [{ title: "Chat — KryptoBazar" }] }),
  component: () => (
    <RequireAuth>
      <ChatThread />
    </RequireAuth>
  ),
});

interface PrivateMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  kind: "text" | "image" | "location";
  attachment_url: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
}

interface Conversation { id: string; user_a: string; user_b: string }
interface Profile { id: string; username: string | null; full_name: string | null; avatar_url: string | null }

function ChatThread() {
  const { conversationId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [other, setOther] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [decrypted, setDecrypted] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showActions, setShowActions] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    (async () => {
      const { data: c, error: cErr } = await supabase
        .from("private_conversations")
        .select("id,user_a,user_b").eq("id", conversationId).maybeSingle();
      if (cErr || !c) { toast.error("Conversation not found"); navigate({ to: "/chat" }); return; }
      const otherId = (c as any).user_a === user.id ? (c as any).user_b : (c as any).user_a;
      const [{ data: p }, { data: ms }] = await Promise.all([
        supabase.from("profiles").select("id,username,full_name,avatar_url").eq("id", otherId).maybeSingle(),
        supabase.from("private_messages").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: true }),
      ]);
      if (!mounted) return;
      setOther((p as Profile) ?? null);
      setMessages((ms ?? []) as PrivateMessage[]);
      setLoading(false);
    })();

    const ch = supabase
      .channel(`pc-${conversationId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "private_messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          setMessages((prev) => {
            const m = payload.new as PrivateMessage;
            if (prev.some((x) => x.id === m.id)) return prev;
            return [...prev, m];
          });
        },
      ).subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [conversationId, user?.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const updates: Record<string, string> = {};
      for (const m of messages) {
        if (m.kind === "text" && !(m.id in decrypted)) {
          updates[m.id] = await decryptForConversation(conversationId, m.content);
        }
      }
      if (!cancelled && Object.keys(updates).length) setDecrypted((p) => ({ ...p, ...updates }));
    })();
    return () => { cancelled = true; };
  }, [messages, conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  // Auto-grow textarea
  useEffect(() => {
    const el = taRef.current; if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  }, [text]);

  const send = async () => {
    if (!text.trim() || !user) return;
    const { clean, blocked } = sanitizeMessage(text.trim());
    if (blocked) toast.warning("Personal contact details were blocked — keep chat in KryptoBazar.");
    setSending(true);
    try {
      const enc = await encryptForConversation(conversationId, clean);
      const { error } = await supabase.from("private_messages").insert({
        conversation_id: conversationId, sender_id: user.id, content: enc, kind: "text",
      } as any);
      if (error) throw error;
      setText("");
    } catch (e: any) { toast.error(e?.message ?? "Send failed"); }
    finally { setSending(false); }
  };

  const sendImage = async (file: File) => {
    if (!user) return;
    setShowActions(false);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${user.id}/${conversationId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("chat-attachments").upload(path, file);
      if (upErr) throw upErr;
      const { data } = await supabase.storage.from("chat-attachments").createSignedUrl(path, 60 * 60 * 24 * 30);
      await supabase.from("private_messages").insert({
        conversation_id: conversationId, sender_id: user.id, content: file.name, kind: "image",
        attachment_url: data?.signedUrl ?? null,
      } as any);
    } catch (e: any) { toast.error(e?.message ?? "Upload failed"); }
  };

  const shareLocation = () => {
    if (!user) return;
    setShowActions(false);
    if (!navigator.geolocation) return toast.error("Geolocation unavailable");
    navigator.geolocation.getCurrentPosition(async (pos) => {
      await supabase.from("private_messages").insert({
        conversation_id: conversationId, sender_id: user.id, content: "Shared live location",
        kind: "location", lat: pos.coords.latitude, lng: pos.coords.longitude,
      } as any);
    }, () => toast.error("Could not get location"));
  };

  // Group by day; compute last "seen" message from other side to imply delivered/read for my messages
  const grouped = useMemo(() => groupByDay(messages), [messages]);
  const lastOtherIdx = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].sender_id !== user?.id) return i;
    return -1;
  }, [messages, user?.id]);

  return (
    <div className="flex h-[100dvh] flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border bg-card/95 px-3 py-3 backdrop-blur-md">
        <Link to="/chat">
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <Avatar profile={other} ring />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">@{other?.username ?? "loading"}</div>
          <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-emerald-600">
            <Lock className="h-3 w-3" /> End-to-end encrypted
          </div>
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {loading ? (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="grid h-full place-items-center px-6 text-center">
            <div>
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-secondary">
                <Lock className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="mt-4 text-sm font-medium">Say hello to @{other?.username}</p>
              <p className="mt-1 text-xs text-muted-foreground">Messages are encrypted. Never share OTPs or banking passwords.</p>
            </div>
          </div>
        ) : (
          grouped.map((g) => (
            <div key={g.label} className="space-y-1.5">
              <div className="my-3 flex items-center justify-center">
                <span className="rounded-full bg-secondary px-3 py-1 text-[10px] font-medium tracking-wide text-muted-foreground">
                  {g.label}
                </span>
              </div>
              {g.items.map((m, i) => {
                const globalIdx = messages.indexOf(m);
                const mine = m.sender_id === user?.id;
                const prev = g.items[i - 1];
                const next = g.items[i + 1];
                const groupedTop = prev && prev.sender_id === m.sender_id;
                const groupedBottom = next && next.sender_id === m.sender_id;
                const seen = mine && lastOtherIdx > globalIdx;
                return (
                  <Bubble
                    key={m.id}
                    m={m}
                    mine={mine}
                    groupedTop={!!groupedTop}
                    groupedBottom={!!groupedBottom}
                    seen={seen}
                    displayText={
                      m.kind === "text"
                        ? decrypted[m.id] ?? (m.content.startsWith("pc:v1:") ? "…" : m.content)
                        : m.content
                    }
                  />
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-border bg-card px-2 pt-2"
           style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)" }}>
        {showActions && (
          <div className="mb-2 flex gap-2 px-1 animate-fade-in">
            <QuickAction icon={ImageIcon} label="Photo" onClick={() => fileRef.current?.click()} />
            <QuickAction icon={MapPin} label="Location" onClick={shareLocation} />
          </div>
        )}
        <div className="flex items-end gap-1.5">
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) sendImage(f); e.target.value = ""; }} />
          <button
            type="button"
            onClick={() => setShowActions((v) => !v)}
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition-all ${showActions ? "rotate-45 bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}
            aria-label="Attach"
          >
            <Plus className="h-5 w-5" />
          </button>
          <div className="flex flex-1 items-end rounded-3xl bg-secondary px-3 py-1.5">
            <textarea
              ref={taRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              rows={1}
              placeholder="Message"
              className="max-h-[140px] w-full resize-none bg-transparent py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={send}
            disabled={sending || !text.trim()}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-all disabled:opacity-50 active:scale-95"
            aria-label="Send"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

function QuickAction({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 rounded-2xl bg-secondary px-4 py-2.5 text-[11px] text-foreground transition hover:bg-secondary/80 active:scale-95"
    >
      <Icon className="h-5 w-5 text-primary" />
      {label}
    </button>
  );
}

function Bubble({
  m, mine, displayText, groupedTop, groupedBottom, seen,
}: { m: PrivateMessage; mine: boolean; displayText: string; groupedTop: boolean; groupedBottom: boolean; seen: boolean }) {
  const radius = mine
    ? `rounded-2xl ${groupedTop ? "rounded-tr-md" : ""} ${groupedBottom ? "rounded-br-md" : ""}`
    : `rounded-2xl ${groupedTop ? "rounded-tl-md" : ""} ${groupedBottom ? "rounded-bl-md" : ""}`;
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"} ${groupedTop ? "mt-0.5" : "mt-1.5"} animate-fade-in`}>
      <div
        className={`max-w-[78%] px-3.5 py-2 text-[14px] leading-snug ${radius} ${
          mine ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" : "bg-secondary text-foreground"
        }`}
      >
        {m.kind === "image" && m.attachment_url && (
          <a href={m.attachment_url} target="_blank" rel="noreferrer">
            <img src={m.attachment_url} alt="" className="mb-1 max-h-64 rounded-lg" />
          </a>
        )}
        {m.kind === "location" && m.lat != null && m.lng != null && (
          <a className={`inline-flex items-center gap-1 underline ${mine ? "text-primary-foreground" : "text-primary"}`}
             href={`https://maps.google.com/?q=${m.lat},${m.lng}`} target="_blank" rel="noreferrer">
            <MapPin className="h-3.5 w-3.5" /> View on map
          </a>
        )}
        {m.kind === "text" && <div className="whitespace-pre-wrap break-words">{displayText}</div>}
        <div className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
          <span>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          {mine && (seen
            ? <CheckCheck className="h-3 w-3" />
            : <Check className="h-3 w-3" />)}
        </div>
      </div>
    </div>
  );
}

function Avatar({ profile, ring = false }: { profile: Profile | null; ring?: boolean }) {
  const initial = (profile?.username || profile?.full_name || "?").slice(0, 1).toUpperCase();
  const ringCls = ring ? "ring-2 ring-primary/40" : "";
  if (profile?.avatar_url) {
    return <img src={profile.avatar_url} alt="" className={`h-9 w-9 rounded-full object-cover ${ringCls}`} />;
  }
  return (
    <div className={`grid h-9 w-9 place-items-center rounded-full bg-primary/20 text-sm font-semibold text-primary ${ringCls}`}>
      {initial}
    </div>
  );
}

function groupByDay(messages: PrivateMessage[]) {
  const groups: { label: string; items: PrivateMessage[] }[] = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yest = new Date(today); yest.setDate(yest.getDate() - 1);
  for (const m of messages) {
    const d = new Date(m.created_at); const day = new Date(d); day.setHours(0, 0, 0, 0);
    let label: string;
    if (day.getTime() === today.getTime()) label = "Today";
    else if (day.getTime() === yest.getTime()) label = "Yesterday";
    else label = d.toLocaleDateString([], { month: "short", day: "numeric", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(m);
    else groups.push({ label, items: [m] });
  }
  return groups;
}
