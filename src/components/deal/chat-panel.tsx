import { useEffect, useRef, useState } from "react";
import { Send, Paperclip, Mic, MapPin, Lock, Image as ImageIcon, StopCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db, uploadDealFile, type Message } from "@/lib/db";
import { sanitizeMessage } from "@/lib/chat-sanitize";
import { toast } from "sonner";

export function ChatPanel({
  dealId, userId, messages,
}: { dealId: string; userId: string; messages: Message[] }) {
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const startedRef = useRef<number>(0);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const send = async () => {
    if (!text.trim()) return;
    const { clean, blocked } = sanitizeMessage(text.trim());
    if (blocked) toast.warning("Personal contact details are blocked — keep chat in CryptoBazar.");
    const { error } = await db.from("messages").insert({
      deal_id: dealId, sender_id: userId, content: clean, kind: "text",
    } as any);
    if (error) return toast.error(error.message);
    setText("");
  };

  const sendImage = async (file: File) => {
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const { url } = await uploadDealFile(dealId, userId, file, ext);
      await db.from("messages").insert({
        deal_id: dealId, sender_id: userId, content: file.name, kind: "image", attachment_url: url,
      } as any);
    } catch (e: any) { toast.error(e.message ?? "Upload failed"); }
  };

  const shareLocation = () => {
    if (!navigator.geolocation) return toast.error("Geolocation unavailable");
    navigator.geolocation.getCurrentPosition(async (pos) => {
      await db.from("messages").insert({
        deal_id: dealId, sender_id: userId, content: "Shared location",
        kind: "location", lat: pos.coords.latitude, lng: pos.coords.longitude,
      } as any);
    });
  };

  const toggleRecord = async () => {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      startedRef.current = Date.now();
      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const duration = Date.now() - startedRef.current;
        try {
          const { url } = await uploadDealFile(dealId, userId, blob, "webm");
          await db.from("messages").insert({
            deal_id: dealId, sender_id: userId, content: "Voice note",
            kind: "voice", attachment_url: url, duration_ms: duration,
          } as any);
        } catch (e: any) { toast.error(e.message ?? "Upload failed"); }
        setRecording(false);
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      toast.error("Microphone access denied");
    }
  };

  return (
    <div className="flex h-[680px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border bg-secondary/40 px-4 py-3">
        <div>
          <div className="font-display text-sm font-semibold">Deal Room Chat</div>
          <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700">
            <Lock className="h-3 w-3" /> End-to-End Encrypted
          </div>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">No external contacts allowed</span>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <p className="py-12 text-center text-xs text-muted-foreground">
            Say hello — all communication stays inside CryptoBazar.
          </p>
        )}
        {messages.map((m) => <MessageBubble key={m.id} m={m} mine={m.sender_id === userId} />)}
      </div>

      <div className="border-t border-border bg-background px-3 py-2.5">
        <div className="flex items-end gap-2">
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) sendImage(f); e.target.value = ""; }} />
          <Button variant="ghost" size="icon" onClick={() => fileRef.current?.click()} title="Send image">
            <ImageIcon className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={shareLocation} title="Share location">
            <MapPin className="h-4 w-4" />
          </Button>
          <Button variant={recording ? "destructive" : "ghost"} size="icon" onClick={toggleRecord} title="Voice note">
            {recording ? <StopCircle className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
            placeholder={recording ? "Recording voice note…" : "Type a message…"}
            disabled={recording}
            className="flex-1"
          />
          <Button variant="hero" size="icon" onClick={send} disabled={recording || !text.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ m, mine }: { m: Message; mine: boolean }) {
  if (m.kind === "system") {
    return (
      <div className="flex justify-center">
        <span className="rounded-full bg-secondary px-3 py-1 text-[11px] text-muted-foreground">{m.content}</span>
      </div>
    );
  }
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
        {m.kind === "image" && m.attachment_url && (
          <a href={m.attachment_url} target="_blank" rel="noreferrer">
            <img src={m.attachment_url} alt="" className="mb-1 max-h-60 rounded-lg" />
          </a>
        )}
        {m.kind === "voice" && m.attachment_url && (
          <audio src={m.attachment_url} controls className="max-w-[220px]" />
        )}
        {m.kind === "location" && m.lat != null && m.lng != null && (
          <a className="inline-flex items-center gap-1 underline" href={`https://maps.google.com/?q=${m.lat},${m.lng}`} target="_blank" rel="noreferrer">
            <MapPin className="h-3.5 w-3.5" /> View on map
          </a>
        )}
        {(m.kind === "text" || m.kind === "note") && <div className="whitespace-pre-wrap break-words">{m.content}</div>}
        <div className={`mt-1 text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
          {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}
