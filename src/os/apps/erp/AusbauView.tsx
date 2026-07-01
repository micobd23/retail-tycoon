import { useState } from "react";
import {
  useEconomy, capacityOf, kundenstrom, dailyWage, upgradeCost, UPGRADE_META,
  type UpgradeTrack,
} from "../../../economy/economyStore";
import { SUPPLIERS, euro } from "../../../economy/catalog";
import { BankSection } from "./BankSection";

// --- Ausbau-Ansicht -------------------------------------------------------
const TRACKS_CLASSIC: UpgradeTrack[] = ["lager", "flaeche", "kassen", "kuehltheke", "marketing", "personal"];
const TRACKS_EINMALIG: UpgradeTrack[] = ["lieferwagen", "eigenmarke"];

export function AusbauView() {
  const cash = useEconomy((s) => s.cash);
  const upgrades = useEconomy((s) => s.upgrades);
  const contracts = useEconomy((s) => s.contracts);
  const doUpgrade = useEconomy((s) => s.upgrade);
  const doSign = useEconomy((s) => s.signContract);
  const doCancel = useEconomy((s) => s.cancelContract);
  const specialization = useEconomy((s) => s.specialization);
  const [msg, setMsg] = useState<string | null>(null);

  const cap = capacityOf(upgrades, specialization);
  const strom = kundenstrom(upgrades);
  const wage = dailyWage(upgrades);

  const effektJetzt = (track: UpgradeTrack): string => {
    if (track === "lager") return `${cap.trocken.toLocaleString("de-DE")} Plätze trocken`;
    if (track === "flaeche") return `${cap.frisch.toLocaleString("de-DE")} Plätze frisch`;
    if (track === "kassen") return `Kundenstrom ×${strom.toFixed(2)}`;
    if (track === "kuehltheke") return upgrades.kuehltheke > 0 ? `+${upgrades.kuehltheke} T Haltbarkeit` : "kein Bonus";
    if (track === "marketing") return upgrades.marketing > 0 ? `+${upgrades.marketing * 8}% Kundenstrom` : "kein Bonus";
    if (track === "personal") return upgrades.personal > 0 ? `${upgrades.personal} Mitarbeiter · −${upgrades.personal * 10}% Verderb · ${euro(wage)}/Tag` : "kein Personal";
    if (track === "lieferwagen") return upgrades.lieferwagen >= 1 ? "Aktiv ✓" : "Nicht freigeschaltet";
    if (track === "eigenmarke") return upgrades.eigenmarke >= 1 ? "Aktiv ✓" : "Nicht freigeschaltet";
    return "";
  };

  const handle = (track: UpgradeTrack) => {
    const res = doUpgrade(track);
    setMsg(res.ok
      ? `✅ ${UPGRADE_META[track].name} — Stufe ${upgrades[track] + 1} erreicht.`
      : `⚠️ ${res.msg}`
    );
  };

  const handleSign = (supplierId: string) => {
    const res = doSign(supplierId);
    const name = SUPPLIERS.find((s) => s.id === supplierId)?.name ?? supplierId;
    setMsg(res.ok ? `✅ Vertrag mit ${name} abgeschlossen (−10% dauerhaft).` : `⚠️ ${res.msg}`);
  };

  return (
    <div className="erp-table-wrap" style={{ padding: "12px 16px" }}>
      <div className="erp-ausbau-intro">
        Investiere deinen Gewinn in den Betrieb. Jede Stufe kostet mehr als die vorige.
      </div>
      {msg && <div className="erp-msg">{msg}</div>}

      <div className="ausbau-section-title">📦 Kapazität & Betrieb</div>
      <div className="erp-ausbau-grid">
        {TRACKS_CLASSIC.map((track) => {
          const meta = UPGRADE_META[track];
          const level = upgrades[track];
          const maxed = meta.maxLevel !== undefined && level >= meta.maxLevel;
          const cost = upgradeCost(track, level);
          const tooExpensive = cost > cash;
          return (
            <div key={track} className={"erp-ausbau-card" + (maxed ? " maxed" : "")}>
              <div className="erp-ausbau-head">
                <span className="erp-ausbau-icon">{meta.icon}</span>
                <div>
                  <div className="erp-ausbau-name">{meta.name}</div>
                  <div className="erp-ausbau-level">
                    Stufe {level}{meta.maxLevel ? ` / ${meta.maxLevel}` : ""}
                  </div>
                </div>
              </div>
              <div className="erp-ausbau-desc">{meta.desc}</div>
              <div className="erp-ausbau-effect">
                Aktuell: <strong>{effektJetzt(track)}</strong>
              </div>
              {maxed ? (
                <div className="ausbau-maxed">Maximalstufe erreicht ✓</div>
              ) : (
                <button
                  className="erp-buy erp-ausbau-buy"
                  disabled={tooExpensive}
                  title={tooExpensive ? "Nicht genug Geld" : `Kosten ${euro(cost)}`}
                  onClick={() => handle(track)}
                >
                  Ausbauen · {euro(cost)}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="ausbau-section-title" style={{ marginTop: 20 }}>🔓 Einmalige Freischaltungen</div>
      <div className="erp-ausbau-grid">
        {TRACKS_EINMALIG.map((track) => {
          const meta = UPGRADE_META[track];
          const level = upgrades[track];
          const unlocked = level >= 1;
          const cost = upgradeCost(track, 0);
          const tooExpensive = cost > cash;
          return (
            <div key={track} className={"erp-ausbau-card" + (unlocked ? " maxed" : "")}>
              <div className="erp-ausbau-head">
                <span className="erp-ausbau-icon">{meta.icon}</span>
                <div>
                  <div className="erp-ausbau-name">{meta.name}</div>
                  <div className="erp-ausbau-level">{unlocked ? "Freigeschaltet" : "Gesperrt"}</div>
                </div>
              </div>
              <div className="erp-ausbau-desc">{meta.desc}</div>
              {unlocked ? (
                <div className="ausbau-maxed">Aktiv ✓</div>
              ) : (
                <button
                  className="erp-buy erp-ausbau-buy"
                  disabled={tooExpensive}
                  title={tooExpensive ? "Nicht genug Geld" : `Einmalig ${euro(cost)}`}
                  onClick={() => handle(track)}
                >
                  Freischalten · {euro(cost)}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="ausbau-section-title" style={{ marginTop: 20 }}>🤝 Stammkunden-Verträge</div>
      <div className="erp-ausbau-intro" style={{ marginBottom: 10 }}>
        Einmalig 1.000 € pro Vertrag → dauerhaft −10% bei diesem Lieferanten. Maximal 2 gleichzeitig.
        Verträge können jederzeit gekündigt werden (kein Rückerstattung).
      </div>
      <div className="erp-ausbau-grid">
        {SUPPLIERS.filter((s) => !s.requiresUpgrade || (upgrades as unknown as Record<string,number>)[s.requiresUpgrade] >= 1).map((s) => {
          const active = contracts.includes(s.id);
          const canSign = !active && contracts.length < 2 && cash >= 1000;
          return (
            <div key={s.id} className={"erp-ausbau-card" + (active ? " maxed" : "")}>
              <div className="erp-ausbau-head">
                <span className="erp-ausbau-icon">🏪</span>
                <div>
                  <div className="erp-ausbau-name">{s.name}</div>
                  <div className="erp-ausbau-level">{active ? "Vertrag aktiv 🤝" : "Kein Vertrag"}</div>
                </div>
              </div>
              <div className="erp-ausbau-desc">
                {active ? "−10 % auf alle Bestellungen bei diesem Lieferanten." : "Für 1.000 € Stammkunden-Rabatt sichern."}
              </div>
              {active ? (
                <button
                  className="erp-buy erp-ausbau-buy"
                  style={{ background: "#b71c1c" }}
                  onClick={() => { doCancel(s.id); setMsg(`Vertrag mit ${s.name} gekündigt.`); }}
                >
                  Vertrag kündigen
                </button>
              ) : (
                <button
                  className="erp-buy erp-ausbau-buy"
                  disabled={!canSign}
                  title={!canSign ? (contracts.length >= 2 ? "Maximal 2 Verträge" : "Nicht genug Geld") : ""}
                  onClick={() => handleSign(s.id)}
                >
                  Vertrag abschließen · {euro(1000)}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="ausbau-section-title" style={{ marginTop: 20 }}>🏦 Bank & Kredit</div>
      <BankSection />
    </div>
  );
}
