import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send, Image as ImageIcon, MapPin, Lock, Loader2 } from "lucide-react";
import { RequireAuth } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { encryptForConversation, decryptForConversation } from "@/lib/private-chat";
import { sanitizeMessage } from "@/lib/chat-sanitize";
import { toast } from "sonner";

export const Route = createFileRoute("/chat/$conversationId")({
  head: () => ({ meta: [{ title: "Chat — CryptoBazar" }] }),
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

interface Conversation {
  id: string;
  user_a: string;
  user_b: string;
}

interface Profile {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

function ChatThread() {
  const { conversationId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [conv, setConv] = useState<Conversation | null>(null);
  const [other, setOther] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [decrypted, setDecrypted] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load conversation + messages
  useEffect(() => {
    if (!user) return;
    let mounted = true;
    (async () => {
      const { data: c, error: cErr } = await supabase
        .from("private_conversations")
        .select("id,user_a,user_b")
        .eq("id", conversationId)
        .maybeSingle();
      if (cErr || !c) {
        toast.error("Conversation not found");
        navigate({ to: "/chat" });
        return;
      }
      const otherId = (c as any).user_a === user.id ? (c as any).user_b : (c as any).user_a;
      const [{ data: p }, { data: ms }] = await Promise.all([
        supabase.from("profiles").select("id,username,full_name,avatar_url").eq("id", otherId).maybeSingle(),
        supabase.from("private_messages").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: true }),
      ]);
      if (!mounted) return;
      setConv(c as Conversation);
      setOther((p as Profile) ?? null);
      setMessages((ms ?? []) as PrivateMessage[]);
      setLoading(false);
    })();

    const ch = supabase
      .channel(`pc-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "private_messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          setMessages((prev) => {
            const m = payload.new as PrivateMessage;
            if (prev.some((x) => x.id === m.id)) return prev;
            return [...prev, m];
          });
        },
      )
      .subscribe();

    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [conversationId, user?.id]);

  // Decrypt text messages
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const updates: Record<string, string> = {};
      for (const m of messages) {
        if (m.kind === "text" && !(m.id in decrypted)) {
          updates[m.id] = await decryptForConversation(conversationId, m.content);
        }
      }
      if (!cancelled && Object.keys(updates).length) {
        setDecrypted((p) => ({ ...p, ...updates }));
      }
    })();
    return () => { cancelled = true; };
  }, [messages, conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Autoscroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const send = async () => {
    if (!text.trim() || !user) return;
    const { clean, blocked } = sanitizeMessage(text.trim());
    if (blocked) toast.warning("Personal contact details were blocked — keep chat in CryptoBazar.");
    setSending(true);
    try {
      const enc = await encryptForConversation(conversationId, clean);
      const { error } = await supabase.from("private_messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: enc,
        kind: "text",
      } as any);
      if (error) throw error;
      setText("");
    } catch (e: any) {
      toast.error(e?.message ?? "Send failed");
    } finally {
      setSending(false);
    }
  };

  const sendImage = async (file: File) => {
    if (!user) return;
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${user.id}/${conversationId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("chat-attachments").upload(path, file);
      if (upErr) throw upErr;
      const { data } = await supabase.storage.from("chat-attachments").createSignedUrl(path, 60 * 60 * 24 * 30);
      await supabase.from("private_messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: file.name,
        kind: "image",
        attachment_url: data?.signedUrl ?? null,
      } as any);
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    }
  };

  const shareLocation = () => {
    if (!user) return;
    if (!navigator.geolocation) return toast.error("Geolocation unavailable");
    navigator.geolocation.getCurrentPosition(async (pos) => {
      await supabase.from("private_messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: "Shared live location",
        kind: "location",
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      } as any);
    }, () => toast.error("Could not get location"));
  };

  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border bg-card px-3 py-3 shadow-sm">
        <Link to="/chat">
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <Avatar profile={other} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">@{other?.username ?? "loading"}</div>
          <div className="inline-flex items-center gap-1 text-[10px] text-emerald-600">
            <Lock className="h-3 w-3" /> End-to-end encrypted
          </div>
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-secondary/20 px-3 py-4">
        {loading ? (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="grid h-full place-items-center px-6 text-center">
            <div>
              <Lock className="mx-auto h-8 w-8 text-muted-foreground/40" />
              <p className="mt-3 text-sm font-medium">Say hello to @{other?.username}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Messages are encrypted. Never share OTPs or banking passwords.
              </p>
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <Bubble
              key={m.id}
              m={m}
              mine={m.sender_id === user?.id}
              displayText={
                m.kind === "text"
                  ? decrypted[m.id] ?? (m.content.startsWith("pc:v1:") ? "…" : m.content)
                  : m.content
              }
            />
          ))
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-border bg-card px-2 py-2 pb-[env(safe-area-inset-bottom,0)]">
        <div className="flex items-end gap-1.5">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) sendImage(f); e.target.value = ""; }}
          />
          <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={() => fileRef.current?.click()} title="Send image">
            <ImageIcon className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={shareLocation} title="Share live location">
            <MapPin className="h-5 w-5" />
          </Button>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
            placeholder="Message"
            className="h-10 flex-1 rounded-full bg-secondary"
          />
          <Button variant="hero" size="icon" className="h-10 w-10 shrink-0 rounded-full" onClick={send} disabled={sending || !text.trim()}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Bubble({ m, mine, displayText }: { m: PrivateMessage; mine: boolean; displayText: string }) {
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${mine ? "bg-primary text-primary-foreground" : "bg-card"}`}>
        {m.kind === "image" && m.attachment_url && (
          <a href={m.attachment_url} target="_blank" rel="noreferrer">
            <img src={m.attachment_url} alt="" className="mb-1 max-h-64 rounded-lg" />
          </a>
        )}
        {m.kind === "location" && m.lat != null && m.lng != null && (
          <a
            className={`inline-flex items-center gap-1 underline ${mine ? "text-primary-foreground" : "text-primary"}`}
            href={`https://maps.google.com/?q=${m.lat},${m.lng}`}
            target="_blank"
            rel="noreferrer"
          >
            <MapPin className="h-3.5 w-3.5" /> View on map
          </a>
        )}
        {m.kind === "text" && <div className="whitespace-pre-wrap break-words">{displayText}</div>}
        <div className={`mt-0.5 text-right text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
          {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}

function Avatar({ profile }: { profile: Profile | null }) {
  const initial = (profile?.username || profile?.full_name || "?").slice(0, 1).toUpperCase();
  if (profile?.avatar_url) {
    return <img src={profile.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />;
  }
  return (
    <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
      {initial}
    </div>
  );
}
