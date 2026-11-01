import { useEffect, useRef, useState } from "react";
import type { Conversation as VoiceSession } from "@elevenlabs/client";
import { Mic, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "./WorkspaceGate";
import type { OrganizerThread } from "@/lib/organizer";

export function OrganizerVoice({ thread }: { thread: OrganizerThread | "discover" }) {
  const { db, organizationId, role } = useWorkspace();
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("Checking voice configuration…");
  const [phase, setPhase] = useState<"idle" | "starting" | "live">("idle");
  const [transcript, setTranscript] = useState<{ speaker: string; text: string }[]>([]);
  const session = useRef<VoiceSession | null>(null);
  const generation = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const allowed = ["owner", "admin", "organizer"].includes(role);
  async function request(action: "status" | "start", signal: AbortSignal) {
    const { data } = await db.auth.getSession();
    if (!data.session) throw new Error("Sign in again to use voice.");
    const response = await fetch("/api/organizer/voice", { method: "POST", signal, headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify({ organizationId, thread, action }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Voice is unavailable.");
    return body;
  }
  function stop() {
    generation.current += 1;
    pending.current?.abort();
    const active = session.current; session.current = null;
    void active?.endSession().catch(() => {});
    setPhase("idle"); setStatus("Voice stopped");
  }
  useEffect(() => {
    const current = ++generation.current;
    const abort = new AbortController(); pending.current = abort;
    setReady(false); setTranscript([]); setPhase("idle");
    setStatus(allowed ? "Checking voice configuration…" : "Voice demo disabled — organization editor access required.");
    if (allowed) void request("status", abort.signal).then(body => {
      if (current !== generation.current) return;
      setReady(body.configured === true);
      setStatus(body.configured ? "Voice ready · preparation only" : body.reason);
    }).catch(error => { if (!abort.signal.aborted) setStatus(error.message); });
    return () => {
      generation.current += 1; abort.abort(); pending.current?.abort();
      const active = session.current; session.current = null;
      void active?.endSession().catch(() => {});
    };
  }, [organizationId, thread, role, db]);
  async function start() {
    if (!ready || !allowed || phase !== "idle") return;
    const current = ++generation.current;
    const abort = new AbortController(); pending.current = abort;
    setPhase("starting"); setStatus("Connecting voice…");
    try {
      const body = await request("start", abort.signal);
      if (current !== generation.current) return;
      if (!body.configured || !body.conversationToken) { setReady(false); throw new Error(body.reason ?? "Voice demo disabled."); }
      if (body.organizationId !== organizationId || body.thread !== thread) throw new Error("Voice conversation scope changed.");
      const { Conversation } = await import("@elevenlabs/client");
      if (current !== generation.current) return;
      // The SDK requests microphone access here, only after the user's Start.
      const active = await Conversation.startSession({
        conversationToken: body.conversationToken, connectionType: "webrtc", textOnly: false,
        clientTools: {}, useWakeLock: false,
        onMessage: event => {
          if (current === generation.current) setTranscript(rows => [...rows.slice(-199), { speaker: event.source === "user" ? "You" : "Civi", text: event.message }]);
        },
        onDisconnect: () => { if (current === generation.current) { session.current = null; setPhase("idle"); setStatus("Voice disconnected"); } },
        onError: () => { if (current === generation.current) { stop(); setStatus("Voice connection interrupted. Try again."); } },
      });
      if (current !== generation.current) { await active.endSession(); return; }
      session.current = active; setPhase("live"); setStatus("Live voice · preparation only");
    } catch (error) {
      if (current === generation.current) { setPhase("idle"); setStatus(error instanceof Error ? error.message : "Voice could not start."); }
    }
  }
  return <section aria-label="Organizer voice" className="border-y border-border bg-background py-4 text-foreground">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="text-sm font-semibold">Organizer voice</h3><p role="status" className="text-sm text-muted-foreground">{status}</p></div>
      <div className="flex flex-wrap gap-2">
        {phase === "idle" ? <Button size="sm" variant="outline" disabled={!ready || !allowed} onClick={() => void start()}><Mic />Start voice</Button> : <Button size="sm" variant="outline" onClick={stop}><Square />Stop voice</Button>}
        <Button size="sm" variant="ghost" disabled={!transcript.length} onClick={() => setTranscript([])}><Trash2 />Clear transcript</Button>
      </div>
    </div>
    <p className="mt-2 text-xs text-muted-foreground">Start shares microphone audio with ElevenLabs. No calls, messages, posts, bookings, or payments. Phone outreach disabled.</p>
    {transcript.length > 0 && <div aria-label="Voice transcript" aria-live="polite" className="mt-3 max-h-64 space-y-2 overflow-y-auto text-sm">{transcript.map((row, index) => <p key={index}><strong>{row.speaker}: </strong>{row.text}</p>)}</div>}
  </section>;
}