import { useState } from "react";
import { useMail, type Mail, type MailKind } from "../../economy/mailStore";
import "./mail.css";

const KIND_META: Record<MailKind, { icon: string; label: string }> = {
  angebot: { icon: "★", label: "Angebot" },
  rechnung: { icon: "€", label: "Rechnung" },
  info: { icon: "ℹ", label: "Info" },
};

export function MailApp() {
  const mails = useMail((s) => s.mails);
  const markRead = useMail((s) => s.markRead);
  const markAllRead = useMail((s) => s.markAllRead);
  const remove = useMail((s) => s.remove);

  // Aktuell geöffnete Mail (Standard: die neueste).
  const [selId, setSelId] = useState<string | null>(null);
  const selected: Mail | null =
    mails.find((m) => m.id === selId) ?? mails[0] ?? null;

  const open = (m: Mail) => {
    setSelId(m.id);
    if (!m.read) markRead(m.id);
  };

  return (
    <div className="mail">
      {/* Linke Spalte: Posteingang-Liste */}
      <div className="mail-list">
        <div className="mail-list-head">
          <span>Posteingang ({mails.length})</span>
          <button className="mail-allread" onClick={markAllRead}>
            Alle gelesen
          </button>
        </div>
        {mails.length === 0 && (
          <div className="mail-empty">Keine Nachrichten.</div>
        )}
        {mails.map((m) => (
          <button
            key={m.id}
            className={
              "mail-item" +
              (selected?.id === m.id ? " active" : "") +
              (m.read ? "" : " unread")
            }
            onClick={() => open(m)}
          >
            <span className={"mail-kind k-" + m.kind}>
              {KIND_META[m.kind].icon}
            </span>
            <span className="mail-item-text">
              <span className="mail-item-from">{m.from}</span>
              <span className="mail-item-subj">{m.subject}</span>
            </span>
            <span className="mail-item-day">T{m.day}</span>
          </button>
        ))}
      </div>

      {/* Rechte Spalte: Lesebereich */}
      <div className="mail-read">
        {selected ? (
          <>
            <div className="mail-read-head">
              <span className={"mail-badge k-" + selected.kind}>
                {KIND_META[selected.kind].label}
              </span>
              <h3>{selected.subject}</h3>
              <div className="mail-meta">
                Von <strong>{selected.from}</strong> · Tag {selected.day}
                <button
                  className="mail-del"
                  onClick={() => {
                    remove(selected.id);
                    setSelId(null);
                  }}
                  title="Löschen"
                >
                  🗑
                </button>
              </div>
            </div>
            <pre className="mail-body">{selected.body}</pre>
          </>
        ) : (
          <div className="mail-empty">Wähle links eine Nachricht.</div>
        )}
      </div>
    </div>
  );
}
