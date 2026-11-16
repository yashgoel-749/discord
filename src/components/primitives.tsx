"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import type { User } from "@/lib/model";

export function Avatar({
  user,
  size = "normal",
  showStatus = true,
}: {
  user: User;
  size?: "small" | "normal" | "large";
  showStatus?: boolean;
}) {
  return (
    <span
      className={`avatar avatar-${size}`}
      style={{ backgroundColor: user.color }}
      aria-label={`${user.name}, ${user.status}`}
    >
      {user.name
        .split(" ")
        .map((part) => part[0])
        .slice(0, 2)
        .join("")}
      {showStatus && <span className={`status-dot status-${user.status}`} />}
    </span>
  );
}

export function Dialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`dialog ${wide ? "dialog-wide" : ""}`}
      aria-labelledby="dialog-title"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
    >
      <header className="dialog-heading">
        <h2 id="dialog-title">{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Close dialog">
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand ${compact ? "brand-compact" : ""}`}>
      <span className="brand-mark">
        <i />
        <i />
        <i />
      </span>
      {!compact && (
        <span>
          relay<span className="brand-period">.</span>
        </span>
      )}
    </span>
  );
}
