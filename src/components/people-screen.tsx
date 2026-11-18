"use client";

import { useState, type FormEvent } from "react";
import { MoreHorizontal } from "lucide-react";
import { commandSchema, type AppState, type Command, type User } from "@/lib/model";
import { Avatar } from "./primitives";

type Tab = "All" | "Online" | "Pending" | "Blocked" | "Add Friend";
const tabs: Tab[] = ["All", "Online", "Pending", "Blocked", "Add Friend"];
export function PeopleScreen({
  state,
  busy,
  dispatch,
  onProfile,
  onMessage,
  notify,
}: {
  state: AppState;
  busy: boolean;
  dispatch: (command: Command) => Promise<AppState>;
  onProfile: (user: User) => void;
  onMessage: (user: User) => void;
  notify: (message: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("All");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  async function perform(command: Command) {
    setError("");
    try {
      const next = await dispatch(command);
      if (command.type === "friendRequest") {
        notify(
          next.friends.length > state.friends.length
            ? "You're now friends!"
            : "Friend request sent",
        );
        setUsername("");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update friendship");
    }
  }
  async function addFriend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = commandSchema.safeParse({ type: "friendRequest", username });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    await perform(parsed.data);
  }
  function rows(
    relationships: AppState["friends"],
    kind: "friend" | "incoming" | "outgoing" | "blocked",
  ) {
    return relationships.map((relationship) => {
      const user = state.users.find((person) => person.id === relationship.userId);
      if (!user) return null;
      return (
        <li className="friend-row" key={relationship.id}>
          <button className="friend-person" onClick={() => onProfile(user)}>
            <Avatar user={user} />
            <span>
              <strong>{user.name}</strong>
              <small className="public-username">@{user.username}</small>
              <small>{user.status === "dnd" ? "Do not disturb" : user.status}</small>
            </span>
          </button>
          <div className="friend-actions">
            {kind === "incoming" && (
              <>
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => void perform({ type: "friendAccept", userId: user.id })}
                >
                  Accept
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => void perform({ type: "friendDecline", userId: user.id })}
                >
                  Decline
                </button>
              </>
            )}
            {kind === "outgoing" && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() => void perform({ type: "friendCancel", userId: user.id })}
              >
                Cancel
              </button>
            )}
            {kind === "blocked" && (
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => void perform({ type: "unblock", userId: user.id })}
              >
                Unblock
              </button>
            )}
            {kind === "friend" && (
              <>
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => onMessage(user)}
                >
                  Message
                </button>
                <details className="friend-menu">
                  <summary aria-label={`More actions for ${user.username}`}>
                    <MoreHorizontal size={20} />
                  </summary>
                  <div>
                    <button
                      disabled={busy}
                      onClick={() => void perform({ type: "friendRemove", userId: user.id })}
                    >
                      Remove Friend
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => void perform({ type: "block", userId: user.id })}
                    >
                      Block
                    </button>
                    <button
                      onClick={() =>
                        void navigator.clipboard
                          .writeText(`@${user.username}`)
                          .then(() => notify("Username copied"))
                          .catch(() => setError("Could not copy username"))
                      }
                    >
                      Copy username
                    </button>
                  </div>
                </details>
              </>
            )}
          </div>
        </li>
      );
    });
  }
  const friends =
    tab === "Online"
      ? state.friends.filter(
          (friend) => state.users.find((user) => user.id === friend.userId)?.status !== "offline",
        )
      : state.friends;
  return (
    <section className="people-screen" aria-label="Your people">
      <div className="people-tabs" role="tablist" aria-label="Friend lists">
        {tabs.map((item) => (
          <button
            key={item}
            id={`people-tab-${item.replaceAll(" ", "-")}`}
            role="tab"
            aria-selected={tab === item}
            aria-controls="people-panel"
            onClick={() => {
              setTab(item);
              setError("");
            }}
          >
            {item}
            {item === "Pending" && ` (${state.incoming.length + state.outgoing.length})`}
          </button>
        ))}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div
        id="people-panel"
        role="tabpanel"
        aria-labelledby={`people-tab-${tab.replaceAll(" ", "-")}`}
      >
        {tab === "Add Friend" ? (
          <form onSubmit={addFriend} className="add-friend-form">
            <h2>Add a friend</h2>
            <p>Enter their exact public username.</p>
            <label>
              Username
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="@username"
                maxLength={21}
                required
              />
            </label>
            <button className="primary-button" disabled={busy}>
              Send friend request
            </button>
          </form>
        ) : tab === "Pending" ? (
          <>
            <h3>Incoming · {state.incoming.length}</h3>
            <ul>{rows(state.incoming, "incoming")}</ul>
            {!state.incoming.length && <p>No incoming requests.</p>}
            <h3>Outgoing · {state.outgoing.length}</h3>
            <ul>{rows(state.outgoing, "outgoing")}</ul>
            {!state.outgoing.length && <p>No outgoing requests.</p>}
          </>
        ) : tab === "Blocked" ? (
          <>
            <h3>Blocked · {state.blocked.length}</h3>
            <ul>{rows(state.blocked, "blocked")}</ul>
            {!state.blocked.length && <p>No blocked people.</p>}
          </>
        ) : (
          <>
            <h3>
              {tab} friends · {friends.length}
            </h3>
            {tab === "Online" && (
              <p className="sidebar-small">
                Availability is selected by each person, not live connection tracking.
              </p>
            )}
            <ul>{rows(friends, "friend")}</ul>
            {!friends.length && (
              <p>
                {tab === "Online" ? "No friends marked online." : "Add a friend to get started."}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
