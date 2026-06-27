import { useState } from "react";
import { useCompetitor } from "../../economy/competitorStore";
import { useEconomy, AD_CAMPAIGN, PRICE_OFFENSIVE } from "../../economy/economyStore";
import { euro } from "../../economy/catalog";
import "./browser.css";

const TYPE_LABEL: Record<string, string> = {
  discounter: "🏷️ Discounter",
  bio: "🌿 Bio-Markt",
};

const STRATEGY_LABEL: Record<string, string> = {
  expansion: "Expansions-Strategie",
  volume: "Volumen-Strategie",
  quality: "Qualitäts-Fokus",
};

const STRATEGY_DESC: Record<string, string> = {
  expansion: "Wächst aggressiv — früh viel Marktanteil sichern.",
  volume: "Stetiges Wachstum — hört nie auf, aber nie ein Sprint.",
  quality: "Langsamer Start, starkes Fundament — langfristig gefährlich.",
};

function ShareBar({ value, color, label }: { value: number; color: string; label: string }) {
  const pct = Math.round(value);
  return (
    <div className="comp-strength-row">
      <span className="comp-strength-label">{label}</span>
      <div className="comp-bar-wrap">
        <div className="comp-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="comp-bar-label">{pct} %</span>
    </div>
  );
}

export function BrowserApp() {
  const competitors = useCompetitor((s) => s.competitors);
  const visibleNews = useCompetitor((s) => s.visibleNews);
  const getPlayerStrength = useCompetitor((s) => s.playerStrength);
  const firmName = useEconomy((s) => s.firmName);
  const lastRevenue = useEconomy((s) => s.lastRevenue);
  const started = useEconomy((s) => s.started);
  const day = useEconomy((s) => s.day);
  const cash = useEconomy((s) => s.cash);
  const adUntilDay = useEconomy((s) => s.adUntilDay);
  const offensiveUntilDay = useEconomy((s) => s.offensiveUntilDay);
  const launchAd = useEconomy((s) => s.launchAdCampaign);
  const launchOffensive = useEconomy((s) => s.launchPriceOffensive);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const adActive = adUntilDay >= day;
  const offensiveActive = offensiveUntilDay >= day;

  // Marktanteile berechnen
  const playerStr = getPlayerStrength(lastRevenue);
  const totalStr = playerStr + competitors.reduce((s, c) => s + c.strength, 0);
  const playerShare = totalStr > 0 ? Math.round((playerStr / totalStr) * 100) : 0;

  return (
    <div className="app-pad browser-app">
      <div className="browser-bar">
        <span className="browser-dot" />
        <span className="browser-dot" />
        <span className="browser-dot" />
        <div className="browser-url">retailnet://markt/wettbewerb</div>
      </div>

      {!started ? (
        <div className="app-placeholder">
          <div className="app-placeholder-icon">🌐</div>
          <h3>RetailNet Explorer</h3>
          <p>Starte ein Spiel, um den Marktbericht zu sehen.</p>
        </div>
      ) : (
        <div className="browser-content">
          <h2 className="browser-title">
            Marktbericht
            {firmName && <span className="browser-firm"> — {firmName}</span>}
          </h2>

          {/* Marktanteile (Spieler + alle Konkurrenten) */}
          <section className="browser-section">
            <h3 className="browser-section-title">Marktanteile</h3>
            <div className="market-share-list">
              {/* Spieler */}
              <div className="market-share-row player-row">
                <span className="market-share-name">
                  🏪 {firmName || "Dein Markt"}
                  <span className="market-share-tag you-tag">Du</span>
                </span>
                <div className="comp-bar-wrap">
                  <div
                    className="comp-bar-fill"
                    style={{ width: `${playerShare}%`, background: "#4fc3f7" }}
                  />
                </div>
                <span className="comp-bar-label">{playerShare} %</span>
              </div>
              {/* Konkurrenten */}
              {competitors.map((c) => {
                const share = totalStr > 0 ? Math.round((c.strength / totalStr) * 100) : 0;
                const color =
                  c.strength < 30 ? "#66bb6a" : c.strength < 60 ? "#ffa726" : "#ef5350";
                return (
                  <div key={c.id} className="market-share-row">
                    <span className="market-share-name">
                      {TYPE_LABEL[c.type].split(" ")[0]} {c.name}
                    </span>
                    <div className="comp-bar-wrap">
                      <div
                        className="comp-bar-fill"
                        style={{ width: `${share}%`, background: color }}
                      />
                    </div>
                    <span className="comp-bar-label">{share} %</span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Aktionen gegen die Konkurrenz */}
          <section className="browser-section">
            <h3 className="browser-section-title">⚔️ Deine Gegenmaßnahmen</h3>
            {actionMsg && (
              <div style={{ background: "#fff3e0", border: "1px solid #ffcc80", borderRadius: 8, padding: "8px 12px", fontSize: 13, marginBottom: 10 }}>
                ⚠️ {actionMsg}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
              {/* Werbekampagne */}
              <div style={{ background: "#fff", border: `2px solid ${adActive ? "#42a5f5" : "#cfd8dc"}`, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 24 }}>📢</span>
                  <span style={{ fontWeight: 700, color: "#263238" }}>Werbekampagne</span>
                </div>
                <div style={{ fontSize: 12, color: "#607d8b", lineHeight: 1.45 }}>
                  +30 % Laufkundschaft & weniger Konkurrenzdruck für {AD_CAMPAIGN.days} Tage.
                </div>
                {adActive ? (
                  <div style={{ marginTop: "auto", padding: "8px 0", textAlign: "center", color: "#1565c0", fontWeight: 700, fontSize: 13 }}>
                    🔵 Läuft noch {adUntilDay - day + 1} {adUntilDay - day + 1 === 1 ? "Tag" : "Tage"}
                  </div>
                ) : (
                  <button
                    onClick={() => { const r = launchAd(); setActionMsg(r.ok ? null : r.msg ?? null); }}
                    disabled={cash < AD_CAMPAIGN.cost}
                    style={{ marginTop: "auto", padding: "9px 0", borderRadius: 8, border: "none", background: cash >= AD_CAMPAIGN.cost ? "#1565c0" : "#cfd8dc", color: "#fff", fontWeight: 700, fontSize: 14, cursor: cash >= AD_CAMPAIGN.cost ? "pointer" : "default" }}
                  >
                    Starten ({euro(AD_CAMPAIGN.cost)})
                  </button>
                )}
              </div>

              {/* Preisoffensive */}
              <div style={{ background: "#fff", border: `2px solid ${offensiveActive ? "#ef5350" : "#cfd8dc"}`, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 24 }}>💥</span>
                  <span style={{ fontWeight: 700, color: "#263238" }}>Preisoffensive</span>
                </div>
                <div style={{ fontSize: 12, color: "#607d8b", lineHeight: 1.45 }}>
                  −15 % Preise, +25 % Nachfrage & Marktanteil-Klau für {PRICE_OFFENSIVE.days} Tage. Kostet Marge!
                </div>
                {offensiveActive ? (
                  <div style={{ marginTop: "auto", padding: "8px 0", textAlign: "center", color: "#c62828", fontWeight: 700, fontSize: 13 }}>
                    🔴 Läuft noch {offensiveUntilDay - day + 1} {offensiveUntilDay - day + 1 === 1 ? "Tag" : "Tage"}
                  </div>
                ) : (
                  <button
                    onClick={() => { const r = launchOffensive(); setActionMsg(r.ok ? null : r.msg ?? null); }}
                    style={{ marginTop: "auto", padding: "9px 0", borderRadius: 8, border: "none", background: "#c62828", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
                  >
                    Starten (gratis, kostet Marge)
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Konkurrenten-Detail */}
          <section className="browser-section">
            <h3 className="browser-section-title">Konkurrenten</h3>
            <div className="comp-list">
              {competitors.map((c) => (
                <div key={c.id} className="comp-card">
                  <div className="comp-header">
                    <span className="comp-name">{c.name}</span>
                    <span className="comp-type">{TYPE_LABEL[c.type]}</span>
                  </div>
                  <div className="comp-strategy">{STRATEGY_LABEL[c.strategy]}</div>
                  <div className="comp-desc">{STRATEGY_DESC[c.strategy]}</div>
                  <ShareBar
                    value={c.strength}
                    label="Marktstärke"
                    color={c.strength < 30 ? "#66bb6a" : c.strength < 60 ? "#ffa726" : "#ef5350"}
                  />
                </div>
              ))}
            </div>
          </section>

          {/* News-Feed */}
          <section className="browser-section">
            <h3 className="browser-section-title">📰 Markt-Nachrichten</h3>
            {visibleNews.length === 0 ? (
              <p className="browser-empty">Noch keine Meldungen — Markt beobachten…</p>
            ) : (
              <div className="news-list">
                {visibleNews.map((n, i) => {
                  const comp = competitors.find((c) => c.id === n.competitorId);
                  return (
                    <div key={i} className="news-item">
                      <div className="news-meta">
                        <span className="news-day">Tag {n.day}</span>
                        <span className="news-who">{comp?.name ?? n.competitorId}</span>
                      </div>
                      <p className="news-text">{n.text}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
