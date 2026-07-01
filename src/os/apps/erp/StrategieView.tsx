import { useState } from "react";
import {
  useEconomy, SPECIALIZATIONS, SPEC_SWITCH_COST, type Specialization,
} from "../../../economy/economyStore";
import { euro } from "../../../economy/catalog";

export function StrategieView() {
  const branches       = useEconomy((s) => s.branches);
  const specialization = useEconomy((s) => s.specialization);
  const cash           = useEconomy((s) => s.cash);
  const setSpec        = useEconomy((s) => s.setSpecialization);
  const [msg, setMsg]  = useState<string | null>(null);

  if (branches < 1) {
    return (
      <div className="erp-table-wrap" style={{ padding: "32px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 44, marginBottom: 10 }}>🔒</div>
        <h3 style={{ margin: "0 0 8px", color: "#37474f" }}>Strategie noch gesperrt</h3>
        <p style={{ color: "#607d8b", fontSize: 14, maxWidth: 460, margin: "0 auto", lineHeight: 1.5 }}>
          Deine Spezialisierung schaltest du frei, sobald du deine <strong>erste Filiale</strong> eröffnet hast.
          Bis dahin: Konzentriere dich auf einen profitablen Hauptladen!
        </p>
      </div>
    );
  }

  const handlePick = (spec: Specialization) => {
    const res = setSpec(spec);
    if (!res.ok) setMsg(res.msg ?? "Aktion nicht möglich.");
    else setMsg(null);
  };

  return (
    <div className="erp-table-wrap" style={{ padding: "16px 20px" }}>
      <h3 style={{ margin: "0 0 4px", color: "#263238" }}>Deine Ausrichtung</h3>
      <p style={{ color: "#607d8b", fontSize: 13, margin: "0 0 16px", lineHeight: 1.5 }}>
        Wähle eine strategische Identität für deinen Markt. Jeder Pfad hat klare Vor- und Nachteile.
        {specialization === null
          ? " Die erste Wahl ist gratis."
          : ` Ein Wechsel kostet ${euro(SPEC_SWITCH_COST)}.`}
      </p>

      {msg && (
        <div style={{ background: "#fff3e0", border: "1px solid #ffcc80", borderRadius: 8, padding: "9px 13px", fontSize: 13, marginBottom: 14 }}>
          ⚠️ {msg}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
        {SPECIALIZATIONS.map((s) => {
          const active = specialization === s.id;
          const cost = specialization === null ? 0 : SPEC_SWITCH_COST;
          const canAfford = active || cost <= cash;
          return (
            <div
              key={s.id}
              style={{
                background: active ? "#e8f5e9" : "#fff",
                border: `2px solid ${active ? "#43a047" : "#cfd8dc"}`,
                borderRadius: 12,
                padding: 16,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 30 }}>{s.emoji}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: "#263238" }}>{s.name}</div>
                  {active && <div style={{ fontSize: 11, color: "#2e7d32", fontWeight: 700 }}>✓ AKTIV</div>}
                </div>
              </div>
              <div style={{ fontSize: 12, fontStyle: "italic", color: "#78909c", lineHeight: 1.4 }}>
                {s.tagline}
              </div>
              <ul style={{ margin: "2px 0 0", paddingLeft: 18, fontSize: 13, color: "#388e3c", lineHeight: 1.5 }}>
                {s.perks.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
              <div style={{ fontSize: 12, color: "#c62828", lineHeight: 1.4, marginTop: 2 }}>
                ⚠️ {s.tradeoff}
              </div>
              <button
                disabled={active || !canAfford}
                onClick={() => handlePick(s.id)}
                style={{
                  marginTop: "auto",
                  padding: "9px 0",
                  borderRadius: 8,
                  border: "none",
                  background: active ? "#a5d6a7" : canAfford ? "#2e7d32" : "#cfd8dc",
                  color: active ? "#1b5e20" : "#fff",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: active || !canAfford ? "default" : "pointer",
                }}
              >
                {active
                  ? "Aktiv"
                  : specialization === null
                    ? "Diese Ausrichtung wählen"
                    : canAfford
                      ? `Wechseln (${euro(SPEC_SWITCH_COST)})`
                      : `${euro(SPEC_SWITCH_COST)} nötig`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
