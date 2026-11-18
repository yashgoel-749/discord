import type { Friendship, Command } from "./model";

export type FriendshipAction =
  | Extract<Command, { username: string }>["type"]
  | "friendAccept"
  | "friendDecline"
  | "friendCancel"
  | "friendRemove"
  | "block"
  | "unblock";
export class FriendshipError extends Error {}

export function transitionFriendship({
  actorId,
  peerId,
  current,
  action,
}: {
  actorId: string;
  peerId: string;
  current: Friendship | null;
  action: FriendshipAction;
}): Friendship | null {
  if (actorId === peerId) throw new FriendshipError("You cannot add or block yourself");
  if (
    current &&
    !(
      [current.requesterId, current.addresseeId].includes(actorId) &&
      [current.requesterId, current.addresseeId].includes(peerId)
    )
  )
    throw new FriendshipError("This relationship is not yours");
  if (action === "block")
    return {
      requesterId: current?.requesterId ?? actorId,
      addresseeId: current?.addresseeId ?? peerId,
      status: "blocked",
      blockedBy: [...new Set([...(current?.blockedBy ?? []), actorId])],
    };
  if (action === "unblock") {
    if (current?.status !== "blocked" || !current.blockedBy.includes(actorId))
      throw new FriendshipError("You have not blocked this person");
    const blockedBy = current.blockedBy.filter((id) => id !== actorId);
    return blockedBy.length ? { ...current, blockedBy } : null;
  }
  if (current?.status === "blocked") throw new FriendshipError("You cannot contact this person");
  switch (action) {
    case "friendRequest":
      if (current?.status === "accepted") throw new FriendshipError("Already friends");
      if (current?.requesterId === actorId) throw new FriendshipError("Request already sent");
      return current
        ? { ...current, status: "accepted" }
        : { requesterId: actorId, addresseeId: peerId, status: "pending", blockedBy: [] };
    case "friendAccept":
    case "friendDecline":
      if (current?.status !== "pending" || current.addresseeId !== actorId)
        throw new FriendshipError("No incoming request from this person");
      return action === "friendAccept" ? { ...current, status: "accepted" } : null;
    case "friendCancel":
      if (current?.status !== "pending" || current.requesterId !== actorId)
        throw new FriendshipError("No outgoing request to this person");
      return null;
    case "friendRemove":
      if (current?.status !== "accepted") throw new FriendshipError("You are not friends");
      return null;
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
