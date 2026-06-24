import { create } from "zustand";
import { persist } from "zustand/middleware";

// ---------------------------------------------------------------------------
// Postfach — Lieferanten schicken Angebote, Bestellbestätigungen (Rechnungen)
// und Info-Nachrichten. Bewusst getrennt vom Economy-Store: der Economy-Store
// ruft hier `receive()` auf, dieser Store kennt die Wirtschaft nicht
// (keine zirkulären Importe).
// ---------------------------------------------------------------------------

export type MailKind = "angebot" | "rechnung" | "info";

export interface Mail {
  id: string;
  from: string; // Absender (Lieferant o.ä.)
  subject: string;
  body: string;
  day: number; // Spieltag, an dem die Mail kam
  kind: MailKind;
  read: boolean;
}

let mailSeq = 0;
const newId = () => `m${Date.now().toString(36)}_${mailSeq++}`;

interface MailState {
  mails: Mail[]; // neueste zuerst

  receive: (m: Omit<Mail, "id" | "read">) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  remove: (id: string) => void;
  clearAll: () => void;
}

export const useMail = create<MailState>()(
  persist(
    (set) => ({
      mails: [],

      receive: (m) =>
        set((s) => ({
          mails: [{ ...m, id: newId(), read: false }, ...s.mails].slice(0, 100),
        })),

      markRead: (id) =>
        set((s) => ({
          mails: s.mails.map((m) => (m.id === id ? { ...m, read: true } : m)),
        })),

      markAllRead: () =>
        set((s) => ({ mails: s.mails.map((m) => ({ ...m, read: true })) })),

      remove: (id) =>
        set((s) => ({ mails: s.mails.filter((m) => m.id !== id) })),

      clearAll: () => set({ mails: [] }),
    }),
    { name: "retail-tycoon-mail", version: 1 },
  ),
);

// Anzahl ungelesener Mails (für das Badge im RetailOS).
export function unreadCount(mails: Mail[]): number {
  return mails.reduce((n, m) => n + (m.read ? 0 : 1), 0);
}
