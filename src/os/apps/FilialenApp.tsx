import { useState } from "react";
import { useEconomy, branchCost } from "../../economy/economyStore";
import { euro } from "../../economy/catalog";

const RANKS = [
  { min: 0,  emoji: "👤", name: "Einzelkämpfer" },
  { min: 1,  emoji: "🏬", name: "Händler" },
  { min: 2,  emoji: "🏪", name: "Regionalist" },
  { min: 3,  emoji: "🏆", name: "Marktführer" },
  { min: 5,  emoji: "🌟", name: "Handelskette" },
  { min: 8,  emoji: "👑", name: "Supermarkt-Imperium" },
];

export function FilialenApp() {
  const cash        = useEconomy((s) => s.cash);
  const branches    = useEconomy((s) => s.branches);
  const lastRevenue = useEconomy((s) => s.lastRevenue);
  const openBranch  = useEconomy((s) => s.openBranch);
  const [msg, setMsg] = useState<string | null>(null);

  const nextCost       = branchCost(branches);
  const canAfford      = cash >= nextCost;
  const progress       = Math.min(1, cash / nextCost);
  const rank           = [...RANKS].reverse().find((r) => branches >= r.min) ?? RANKS[0];
  const passivePerBranch = +(lastRevenue * 0.12).toFixed(2);
  const totalPassive   = +(passivePerBranch * branches).toFixed(2);
  const daysLeft       = lastRevenue > 0 ? Math.ceil((nextCost - cash) / lastRevenue) : null;

  const handleOpen = () => {
    const res = openBranch();
    setMsg(res.ok ? `🎉 Filiale ${branches + 1} erfolgreich eröffnet!` : `⚠️ ${res.msg}`);
  };

  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16, height: "100%", boxSizing: "border-box", overflowY: "auto" }}>

      {/* Rang-Banner */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, background: "#eceff1", borderRadius: 10, padding: "12px 16px" }}>
        <span style={{ fontSize: 36 }}>{rank.emoji}</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18, color: "#263238" }}>{rank.name}</div>
          <div style={{ fontSize: 13, color: "#546e7a" }}>
            {branches === 0
              ? "Noch keine Filialen — spare auf die erste hin!"
              : `${branches} ${branches === 1 ? "Filiale" : "Filialen"} · Passiveinkommen: ${euro(totalPassive)}/Tag`}
          </div>
        </div>
      </div>

      {/* Filialen-Liste */}
      <div>
        <div style={{ fontWeight: 600, fontSize: 13, color: "#78909c", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Deine Standorte</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", border: "1px solid #cfd8dc", borderRadius: 8, padding: "10px 14px" }}>
            <span style={{ fontWeight: 600 }}>🏪 Hauptfiliale</span>
            <span style={{ color: "#2e7d32", fontWeight: 600 }}>{euro(lastRevenue)}/Tag (gestern)</span>
          </div>
          {Array.from({ length: branches }).map((_, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f1f8e9", border: "1px solid #c5e1a5", borderRadius: 8, padding: "10px 14px" }}>
              <span style={{ fontWeight: 600 }}>🏬 Filiale {i + 1}</span>
              <span style={{ color: "#388e3c", fontWeight: 600 }}>+{euro(passivePerBranch)}/Tag</span>
            </div>
          ))}
        </div>
      </div>

      {msg && (
        <div style={{ background: msg.startsWith("🎉") ? "#e8f5e9" : "#fff3e0", border: `1px solid ${msg.startsWith("🎉") ? "#a5d6a7" : "#ffcc80"}`, borderRadius: 8, padding: "10px 14px", fontSize: 14 }}>
          {msg}
        </div>
      )}

      {/* Nächste Expansion */}
      <div style={{ background: "#fff", border: "1px solid #b0bec5", borderRadius: 10, padding: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
          Nächste Expansion — Filiale {branches + 1}
        </div>
        <div style={{ fontSize: 13, color: "#546e7a", marginBottom: 12 }}>
          Einmalige Investition: <strong>{euro(nextCost)}</strong>
          {" · "}danach täglich <strong>+{euro(passivePerBranch > 0 ? passivePerBranch : lastRevenue * 0.12)}</strong> Passiveinkommen
        </div>

        {/* Fortschrittsbalken */}
        <div style={{ background: "#eceff1", borderRadius: 99, height: 10, marginBottom: 6 }}>
          <div style={{ background: canAfford ? "#43a047" : "#1565c0", borderRadius: 99, height: 10, width: `${progress * 100}%`, transition: "width 0.4s" }} />
        </div>
        <div style={{ fontSize: 12, color: "#546e7a", marginBottom: 12 }}>
          {euro(Math.min(cash, nextCost))} / {euro(nextCost)} ({Math.round(progress * 100)}%)
          {!canAfford && daysLeft !== null && (
            <span style={{ marginLeft: 8, color: "#78909c" }}>· noch ca. {daysLeft} Tage</span>
          )}
        </div>

        <button
          onClick={handleOpen}
          disabled={!canAfford}
          style={{
            width: "100%", padding: "11px 0", borderRadius: 8, border: "none",
            background: canAfford ? "#2e7d32" : "#b0bec5",
            color: "#fff", fontWeight: 700, fontSize: 15,
            cursor: canAfford ? "pointer" : "not-allowed",
          }}
        >
          {canAfford ? `🏪 Filiale ${branches + 1} eröffnen!` : `Noch ${euro(nextCost - cash)} fehlen`}
        </button>
      </div>

      {/* Rang-Übersicht */}
      <div>
        <div style={{ fontWeight: 600, fontSize: 13, color: "#78909c", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Rang-Leiter</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {RANKS.map((r) => {
            const active = branches >= r.min && (RANKS[RANKS.indexOf(r) + 1]?.min ?? 999) > branches;
            const done   = branches >= (RANKS[RANKS.indexOf(r) + 1]?.min ?? 999);
            return (
              <div key={r.min} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 12px", borderRadius: 8, background: active ? "#e3f2fd" : done ? "#f1f8e9" : "#fafafa", border: `1px solid ${active ? "#90caf9" : done ? "#c5e1a5" : "#e0e0e0"}` }}>
                <span style={{ fontSize: 20 }}>{r.emoji}</span>
                <span style={{ fontWeight: active ? 700 : 400, color: active ? "#1565c0" : done ? "#388e3c" : "#78909c", flex: 1 }}>{r.name}</span>
                <span style={{ fontSize: 12, color: "#90a4ae" }}>{r.min === 0 ? "Start" : `ab ${r.min} Filiale${r.min > 1 ? "n" : ""}`}</span>
                {done && <span style={{ color: "#43a047", fontWeight: 700 }}>✓</span>}
                {active && <span style={{ color: "#1565c0", fontSize: 12, fontWeight: 700 }}>← Du</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
