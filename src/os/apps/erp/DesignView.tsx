import { useState } from "react";
import {
  useEconomy, STORE_THEMES, THEME_SWITCH_COST, type StoreTheme,
} from "../../../economy/economyStore";
import { euro } from "../../../economy/catalog";

// --- Design / Ladengestaltung ---------------------------------------------

export function DesignView() {
  const storeTheme  = useEconomy((s) => s.storeTheme);
  const cash        = useEconomy((s) => s.cash);
  const setTheme    = useEconomy((s) => s.setStoreTheme);
  const [msg, setMsg] = useState<string | null>(null);

  const handle = (id: StoreTheme) => {
    const r = setTheme(id);
    setMsg(r.ok ? null : r.msg ?? null);
  };

  return (
    <div className="erp-table-wrap" style={{ padding: "16px 20px" }}>
      <h3 style={{ margin: "0 0 4px", color: "#263238" }}>Ladengestaltung</h3>
      <p style={{ color: "#607d8b", fontSize: 13, margin: "0 0 16px", lineHeight: 1.5 }}>
        Wähle eine Einrichtung für deinen Laden — beeinflusst Kundenstrom und Zufriedenheit.
        Umbau auf ein neues Design kostet {euro(THEME_SWITCH_COST)}; Rückwechsel auf Standard ist kostenlos.
      </p>

      {msg && (
        <div style={{ background: "#fff3e0", border: "1px solid #ffcc80", borderRadius: 8, padding: "9px 13px", fontSize: 13, marginBottom: 14 }}>
          ⚠️ {msg}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
        {STORE_THEMES.map((t) => {
          const active   = storeTheme === t.id;
          const cost     = t.id === "standard" ? 0 : THEME_SWITCH_COST;
          const canAfford = active || cost === 0 || cash >= cost;
          return (
            <div key={t.id} style={{
              background: active ? "#e8f5e9" : "#fff",
              border: `2px solid ${active ? "#43a047" : "#cfd8dc"}`,
              borderRadius: 12, padding: 16,
              display: "flex", flexDirection: "column", gap: 8,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 30 }}>{t.emoji}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: "#263238" }}>{t.name}</div>
                  {active && <div style={{ fontSize: 11, color: "#2e7d32", fontWeight: 700 }}>✓ AKTIV</div>}
                </div>
              </div>
              <div style={{ fontSize: 12, fontStyle: "italic", color: "#78909c", lineHeight: 1.4 }}>{t.tagline}</div>
              <ul style={{ margin: "2px 0 0", paddingLeft: 18, fontSize: 13, color: "#388e3c", lineHeight: 1.5 }}>
                {t.perks.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
              <div style={{ fontSize: 12, color: "#c62828", lineHeight: 1.4, marginTop: 2 }}>⚠️ {t.tradeoff}</div>
              <button
                disabled={active || !canAfford}
                onClick={() => handle(t.id)}
                style={{
                  marginTop: "auto", padding: "9px 0", borderRadius: 8, border: "none",
                  background: active ? "#a5d6a7" : canAfford ? "#2e7d32" : "#cfd8dc",
                  color: active ? "#1b5e20" : "#fff",
                  fontWeight: 700, fontSize: 14,
                  cursor: active || !canAfford ? "default" : "pointer",
                }}
              >
                {active ? "Aktiv" : cost === 0 ? "Standard wählen" : canAfford ? `Umbau (${euro(cost)})` : `${euro(cost)} nötig`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
