"use client";

import { useEffect, useRef } from "react";
import {
  Bookmark,
  Check,
  CornerUpLeft,
  Pencil,
  SmilePlus,
  Trash2,
  Hash,
  ArrowDown,
} from "lucide-react";
import type { Message, Room, User } from "@/lib/model";
import { Avatar } from "./primitives";

type Props = {
  messages: Message[];
  users: User[];
  me: User;
  room: Room;
  search: string;
  saved: string[];
  savedOnly: boolean;
  onReact: (message: Message) => void;
  onEdit: (message: Message) => void;
  onDelete: (message: Message) => void;
  onReply: (user: User) => void;
  onSave: (message: Message) => void;
  onUser: (user: User) => void;
  onToggleReaction: (message: Message, emoji: Message["reactions"][number]["emoji"]) => void;
};

export function MessageList({
  messages,
  users,
  me,
  room,
  search,
  saved,
  savedOnly,
  onReact,
  onEdit,
  onDelete,
  onReply,
  onSave,
  onUser,
  onToggleReaction,
}: Props) {
  const list = useRef<HTMLDivElement>(null);
  const previousLength = useRef(0);
  const visible = messages.filter(
    (m) =>
      (!savedOnly || saved.includes(m.id)) &&
      (!search ||
        m.content.toLowerCase().includes(search.toLowerCase()) ||
        users
          .find((u) => u.id === m.authorId)
          ?.name.toLowerCase()
          .includes(search.toLowerCase())),
  );
  useEffect(() => {
    const element = list.current;
    if (element && (previousLength.current === 0 || messages.length > previousLength.current))
      element.scrollTop = element.scrollHeight;
    previousLength.current = messages.length;
  }, [messages.length, room.id]);
  useEffect(() => {
    const element = list.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [room.id]);
  return (
    <div className="message-scroll" ref={list}>
      {!search && !savedOnly && (
        <section className="channel-intro">
          <div className="intro-hash">
            <Hash size={30} strokeWidth={1.6} />
          </div>
          <span className="eyebrow">A LITTLE SPACE FOR BIG IDEAS</span>
          <h1>
            {room.kind === "dm" ? `Hey, ${room.name.split(" ")[0]}.` : `Welcome to #${room.name}`}
          </h1>
          <p>
            {room.kind === "dm"
              ? "This is the beginning of your conversation. Make it a good one."
              : room.topic + ". Make yourself at home."}
          </p>
        </section>
      )}
      {(search || savedOnly) && (
        <div className="results-heading">
          {visible.length} {savedOnly ? "saved messages" : "results"}
          {search && <> for “{search}”</>}
          {savedOnly && <small>Saved in this browser session</small>}
        </div>
      )}
      {!visible.length && (
        <div className="empty-chat">
          <span>✦</span>
          <h3>
            {search
              ? "Nothing here just yet."
              : savedOnly
                ? "Keep the good stuff close."
                : "Every conversation starts somewhere."}
          </h3>
          <p>
            {search
              ? "Try a different word or phrase."
              : savedOnly
                ? "Use the bookmark on any message to save it for later."
                : "Be the first to say hello."}
          </p>
        </div>
      )}
      {visible.map((message, index) => {
        const author = users.find((u) => u.id === message.authorId);
        if (!author) return null;
        const previous = visible[index - 1];
        const date = new Date(message.createdAt);
        const showDate =
          !previous || new Date(previous.createdAt).toDateString() !== date.toDateString();
        const grouped =
          previous?.authorId === message.authorId &&
          !showDate &&
          date.getTime() - new Date(previous.createdAt).getTime() < 300000;
        return (
          <div key={message.id}>
            {showDate && (
              <div className="date-divider">
                <span>
                  {date.toDateString() === new Date().toDateString()
                    ? "Today"
                    : date.toLocaleDateString(undefined, {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                </span>
              </div>
            )}
            <article
              className={`message ${grouped ? "message-grouped" : ""}`}
              data-testid="message"
            >
              <div className="message-avatar">
                {!grouped && (
                  <button
                    className="avatar-button"
                    onClick={() => onUser(author)}
                    aria-label={`View ${author.name}'s profile`}
                  >
                    <Avatar user={author} showStatus={false} />
                  </button>
                )}
              </div>
              <div className="message-body">
                {!grouped && (
                  <header>
                    <button className="author-name" onClick={() => onUser(author)}>
                      {author.name}
                    </button>
                    {author.id === me.id && <span className="you-label">YOU</span>}
                    <time dateTime={message.createdAt}>
                      {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </time>
                  </header>
                )}
                <p>
                  {message.content}
                  {message.edited && <small className="edited-label"> (edited)</small>}
                </p>
                {message.id === "m4" && (
                  <div className="moodboard">
                    <div className="moodboard-content">
                      <span>THE QUIET COLLECTION</span>
                      <strong>
                        A softer
                        <br />
                        kind of bold<span>.</span>
                      </strong>
                      <small>STUDIO PALETTE / 001</small>
                    </div>
                    <div className="moodboard-art">
                      <div className="arch arch-back" />
                      <div className="arch arch-front" />
                      <div className="moodboard-flower">✳</div>
                      <div className="palette-dots">
                        <i />
                        <i />
                        <i />
                        <i />
                      </div>
                    </div>
                  </div>
                )}
                {message.reactions.length > 0 && (
                  <div className="reactions">
                    {message.reactions.map((reaction) => (
                      <button
                        key={reaction.emoji}
                        onClick={() => onToggleReaction(message, reaction.emoji)}
                        className={
                          reaction.userIds.includes(me.id) ? "reaction active" : "reaction"
                        }
                        aria-label={`${reaction.emoji} reaction, ${reaction.userIds.length}, ${reaction.userIds.includes(me.id) ? "remove" : "add"}`}
                        aria-pressed={reaction.userIds.includes(me.id)}
                      >
                        <span>{reaction.emoji}</span>
                        {reaction.userIds.length}
                      </button>
                    ))}
                    <button
                      className="reaction-add"
                      aria-label="Add reaction"
                      onClick={() => onReact(message)}
                    >
                      <SmilePlus size={15} />
                    </button>
                  </div>
                )}
              </div>
              <div className="message-actions">
                <button
                  className="icon-button"
                  aria-label="Add reaction"
                  onClick={() => onReact(message)}
                >
                  <SmilePlus size={17} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Reply to message"
                  onClick={() => onReply(author)}
                >
                  <CornerUpLeft size={17} />
                </button>
                <button
                  className={`icon-button ${saved.includes(message.id) ? "active" : ""}`}
                  aria-label={saved.includes(message.id) ? "Unsave message" : "Save message"}
                  onClick={() => onSave(message)}
                >
                  {saved.includes(message.id) ? <Check size={17} /> : <Bookmark size={17} />}
                </button>
                {author.id === me.id && (
                  <>
                    <button
                      className="icon-button"
                      aria-label="Edit message"
                      onClick={() => onEdit(message)}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="icon-button danger"
                      aria-label="Delete message"
                      onClick={() => onDelete(message)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
              </div>
            </article>
          </div>
        );
      })}
      <button
        className="jump-bottom"
        onClick={() =>
          list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" })
        }
      >
        <ArrowDown size={14} /> Latest messages
      </button>
    </div>
  );
}
