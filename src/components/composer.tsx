"use client";

import { useRef, useState, useEffect, type KeyboardEvent } from "react";
import { Smile, Send, X } from "lucide-react";
import type { Room } from "@/lib/model";

export function Composer({
  room,
  busy,
  reply,
  onReplyUsed,
  onSend,
}: {
  room: Room;
  busy: boolean;
  reply: string;
  onReplyUsed: () => void;
  onSend: (content: string) => Promise<void>;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [emojiOpen, setEmojiOpen] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const draft = drafts[room.id] ?? "";
  const setDraft = (value: string) => setDrafts((previous) => ({ ...previous, [room.id]: value }));
  useEffect(() => {
    if (reply) {
      setDrafts((previous) => ({ ...previous, [room.id]: `${previous[room.id] ?? ""}@${reply} ` }));
      onReplyUsed();
      textarea.current?.focus();
    }
  }, [reply, room.id, onReplyUsed]);
  useEffect(() => {
    if (!textarea.current) return;
    textarea.current.style.height = "26px";
    textarea.current.style.height = `${Math.min(textarea.current.scrollHeight, 150)}px`;
  }, [draft]);
  async function send() {
    if (!draft.trim() || busy) return;
    const content = draft;
    try {
      await onSend(content);
      setDraft("");
      textarea.current?.focus();
    } catch {
      /* Parent displays actionable errors; retain the draft. */
    }
  }
  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  }
  return (
    <div className="composer-area">
      <div className="composer-box">
        <textarea
          ref={textarea}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={keyDown}
          placeholder={`Message ${room.kind === "dm" ? room.name : `#${room.name}`}`}
          aria-label="Message"
          rows={1}
          maxLength={4000}
        />
        <div className="composer-tools">
          <button
            className={`icon-button ${emojiOpen ? "active" : ""}`}
            onClick={() => setEmojiOpen(!emojiOpen)}
            aria-label="Choose emoji"
            aria-expanded={emojiOpen}
          >
            {emojiOpen ? <X size={21} /> : <Smile size={21} />}
          </button>
          <span className="composer-divider" />
          <button
            className="send-button"
            onClick={() => void send()}
            disabled={!draft.trim() || busy}
            aria-label="Send message"
          >
            <Send size={18} />
          </button>
        </div>
        {emojiOpen && (
          <div className="composer-emojis">
            {["✨", "👋", "❤️", "🔥", "😊", "🎉", "☀️", "🌿", "🚀", "👍", "👀", "💡"].map(
              (emoji) => (
                <button
                  key={emoji}
                  aria-label={`Insert ${emoji}`}
                  onClick={() => {
                    setDraft(draft + emoji);
                    setEmojiOpen(false);
                    textarea.current?.focus();
                  }}
                >
                  {emoji}
                </button>
              ),
            )}
          </div>
        )}
      </div>
      <div className="composer-hint">
        <span>
          <strong>Enter</strong> to send · <strong>Shift + Enter</strong> for a new line
        </span>
        <span>
          {draft.length > 3500 ? `${draft.length}/4000` : "A little kindness goes a long way ✦"}
        </span>
      </div>
    </div>
  );
}
