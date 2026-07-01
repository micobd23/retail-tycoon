import { useState } from "react";
import { useEconomy, effectiveSales } from "../../../economy/economyStore";
import { CATALOG, euro, dayToCalendar } from "../../../economy/catalog";
import { CATEGORIES } from "./shared";

// --- Preise-Ansicht -------------------------------------------------------
export function PreiseView() {
  const prices    = useEconomy((s) => s.prices);
  const setPrice  = useEconomy((s) => s.setPrice);
  const upgrades  = useEconomy((s) => s.upgrades);
  const day       = useEconomy((s) => s.day);
  const { season, seasonDay } = dayToCalendar(day);

  // Lokaler Input-State (String, damit man ungestört tippen kann)
  const [inputs, setInputs] = useState<Record<string, string>>({});

  const getInput = (id: string, baseVK: number): string => {
    if (inputs[id] !== undefined) return inputs[id];
    return (prices[id] ?? baseVK).toFixed(2);
  };

  const commit = (id: string, _baseVK: number, raw: string) => {
    const val = parseFloat(raw.replace(",", "."));
    if (!isNaN(val) && val > 0) setPrice(id, +val.toFixed(2));
    setInputs((prev) => { const n = { ...prev }; delete n[id]; return n; });
  };

  const reset = (id: string, baseVK: number) => {
    setPrice(id, baseVK);
    setInputs((prev) => { const n = { ...prev }; delete n[id]; return n; });
  };

  return (
    <div className="erp-table-wrap">
      <p style={{ padding: "8px 4px 4px", margin: 0, fontSize: 12, color: "#546e7a" }}>
        Passe deine Verkaufspreise an. Höhere Preise = mehr Marge, aber weniger Kunden (Elastizität ×1,5).
        Änderungen wirken ab dem nächsten Tag.
      </p>
      <table className="erp-grid">
        <thead>
          <tr>
            <th className="l">Produkt</th>
            <th>Ø EK</th>
            <th>Basis-VK</th>
            <th>Dein Preis</th>
            <th>Marge %</th>
            <th>Nachfrage-Effekt</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {CATEGORIES.map((cat) => {
            const items = CATALOG.filter((p) => {
              if (p.category !== cat) return true; // alle Kategorien zeigen
              return true;
            }).filter((p) => p.category === cat);
            if (items.length === 0) return null;
            return [
              <tr key={"cat-" + cat} className="erp-cat-row">
                <td className="l" colSpan={7}>{cat}</td>
              </tr>,
              ...items.map((p) => {
                const myVK     = parseFloat(getInput(p.id, p.vk));
                const isCustom = prices[p.id] !== undefined && prices[p.id] !== p.vk;
                const marge    = p.ek > 0 ? Math.round(((myVK - p.ek) / p.ek) * 100) : 0;
                void upgrades; // via effectiveSales
                const baseDemand = effectiveSales(p, upgrades, undefined, season, seasonDay);
                // Effekt bei hypothetischem Preis: Elastizität manuell berechnen
                const factor = myVK > 0 ? Math.pow(p.vk / myVK, 1.5) : 1;
                const demandPct = Math.round((factor - 1) * 100);
                const belowEK  = myVK < p.ek;
                return (
                  <tr key={p.id}>
                    <td className="l">
                      <span className="erp-name">{p.name}</span>
                      {isCustom && <span style={{ fontSize: 10, color: "#1565c0", marginLeft: 4 }}>✎ angepasst</span>}
                      {belowEK && <span style={{ fontSize: 10, color: "#c62828", marginLeft: 4 }}>⚠ unter EK</span>}
                    </td>
                    <td style={{ color: "#546e7a" }}>{euro(p.ek)}</td>
                    <td style={{ color: "#78909c" }}>{euro(p.vk)}</td>
                    <td>
                      <input
                        className="erp-qty"
                        type="number"
                        min={0.01}
                        step={0.05}
                        style={{ width: 72 }}
                        value={getInput(p.id, p.vk)}
                        onChange={(e) => setInputs((prev) => ({ ...prev, [p.id]: e.target.value }))}
                        onBlur={(e) => commit(p.id, p.vk, e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") commit(p.id, p.vk, (e.target as HTMLInputElement).value); }}
                      />
                    </td>
                    <td className={marge >= 20 ? "erp-marge" : marge >= 0 ? "" : "erp-loss"}>
                      {marge}%
                    </td>
                    <td style={{ color: demandPct > 0 ? "#2e7d32" : demandPct < 0 ? "#c62828" : "#546e7a", fontWeight: 600 }}>
                      {demandPct === 0 ? "—" : demandPct > 0 ? `▲${demandPct}%` : `▼${Math.abs(demandPct)}%`}
                      {baseDemand > 0 && (
                        <span style={{ fontWeight: 400, color: "#90a4ae", fontSize: 11, marginLeft: 4 }}>
                          (~{Math.round(baseDemand * factor)}/T)
                        </span>
                      )}
                    </td>
                    <td>
                      {isCustom && (
                        <button
                          className="erp-chip"
                          style={{ padding: "2px 8px", fontSize: 11 }}
                          onClick={() => reset(p.id, p.vk)}
                          title="Auf Katalogpreis zurücksetzen"
                        >
                          ↺
                        </button>
                      )}
                    </td>
                  </tr>
                );
              }),
            ];
          })}
        </tbody>
      </table>
      <p className="erp-foot">
        Nachfrage-Effekt = Änderung gegenüber dem Katalogpreis. ▲ = mehr Kunden, ▼ = weniger.
        Alle Preise in €, Änderung mit Enter oder Klick außerhalb bestätigen.
      </p>
    </div>
  );
}
