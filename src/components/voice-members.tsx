"use client";

import { useEffect, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import {
  voicePresenceSchema,
  type VoicePresence,
  type VoiceChannelView,
} from "@/lib/voice-presence";
import { Avatar } from "./primitives";
import { responseData, type Mode } from "./use-relay";

type PresenceView = { phase: "ready"; value: VoicePresence } | { phase: "unavailable" };

export function useVoicePresence({
  mode,
  viewerId,
  serverId,
}: {
  mode: Mode;
  viewerId: string | null;
  serverId: string | null;
}) {
  const scopeKey =
    mode === "connected" && viewerId && serverId ? JSON.stringify([viewerId, serverId]) : null;
  const [snapshot, setSnapshot] = useState<{ scopeKey: string; view: PresenceView } | null>(null);

  useEffect(() => {
    setSnapshot(null);
    if (!scopeKey || !serverId) return;
    const controller = new AbortController();
    let timer: number | undefined;
    let inFlight = false;
    async function refresh() {
      if (controller.signal.aborted || document.hidden || inFlight) return;
      inFlight = true;
      window.clearTimeout(timer);
      try {
        const response = await fetch(`/api/voice?serverId=${encodeURIComponent(serverId ?? "")}`, {
          cache: "no-store",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]),
        });
        const value = voicePresenceSchema.parse(await responseData(response));
        if (value.serverId !== serverId) throw new Error("Voice community did not match");
        if (!controller.signal.aborted && scopeKey)
          setSnapshot({ scopeKey, view: { phase: "ready", value } });
      } catch {
        if (!controller.signal.aborted && scopeKey)
          setSnapshot({ scopeKey, view: { phase: "unavailable" } });
      } finally {
        inFlight = false;
        if (!controller.signal.aborted) timer = window.setTimeout(() => void refresh(), 3000);
      }
    }
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    void refresh();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [scopeKey, serverId]);

  return (roomId: string): VoiceChannelView => {
    if (mode === "demo") return { phase: "disabled" };
    if (!scopeKey || snapshot?.scopeKey !== scopeKey) return { phase: "loading" };
    if (snapshot.view.phase === "unavailable") return snapshot.view;
    return snapshot.view.value.channels[roomId] ?? { phase: "loading" };
  };
}

export function VoiceMembers({
  channelName,
  presence,
}: {
  channelName: string;
  presence: VoiceChannelView;
}) {
  if (presence.phase !== "ready")
    return (
      <p className="voice-members-status">
        {presence.phase === "loading"
          ? "Checking voice…"
          : presence.phase === "disabled"
            ? "Live voice unavailable in demo"
            : "Voice members unavailable"}
      </p>
    );
  if (!presence.members.length) return <p className="voice-members-status">No one in voice</p>;
  return (
    <ul className="voice-members" aria-label={`${channelName} participants`}>
      {presence.members.map((member) => (
        <li key={member.id}>
          <Avatar user={member} size="small" showStatus={false} />
          <span className="voice-member-name" title={member.name}>
            <span>{member.name}</span>
            <small className="public-username">@{member.username}</small>
          </span>
          {member.microphone === "muted" ? (
            <MicOff
              size={14}
              role="img"
              aria-label="Microphone muted"
              className="voice-member-muted"
            />
          ) : (
            <Mic size={14} role="img" aria-label="Microphone on" className="voice-member-live" />
          )}
        </li>
      ))}
    </ul>
  );
}
