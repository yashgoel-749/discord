"use client";

import { Headphones, Mic, Video, MonitorUp, ArrowRight } from "lucide-react";
import type { Room } from "@/lib/model";
import type { Mode } from "./use-relay";

export function VoiceRoom({
  room,
  mode,
  busy,
  error,
  switching,
  onJoin,
}: {
  room: Room;
  mode: Mode;
  busy: boolean;
  error: string;
  switching: boolean;
  onJoin: () => void;
}) {
  return (
    <section className="voice-empty">
      <div className="voice-art">
        <Headphones size={64} strokeWidth={1.5} />
        <span>✦</span>
        <i />
      </div>
      <span className="eyebrow">LESS TYPING. MORE CONNECTING.</span>
      <h1>Pull up a chair.</h1>
      <p>
        Welcome to <strong>{room.name}</strong>. Drop in for a conversation,
        <br />
        share your screen, or simply hang out.
      </p>
      <div className="voice-capabilities">
        <span>
          <Mic size={18} /> Voice
        </span>
        <span>
          <Video size={18} /> Video
        </span>
        <span>
          <MonitorUp size={18} /> Screen sharing
        </span>
      </div>
      <button className="primary-button" onClick={onJoin} disabled={busy}>
        {busy ? "Connecting…" : switching ? "Switch voice channel" : "Join conversation"}
        <ArrowRight size={18} />
      </button>
      {error && (
        <p className="voice-notice" role="alert">
          {error}
        </p>
      )}
      <small>
        {mode === "demo"
          ? "LOCAL DEMO · VOICE IS NOT CONNECTED"
          : switching
            ? "Your current call stays connected until you choose to switch."
            : "Stay in voice while browsing chats and communities."}
      </small>
    </section>
  );
}
