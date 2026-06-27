import { useEconomy, MISSIONS } from "../economy/economyStore";
import { euro } from "../economy/catalog";
import "./winscreen.css";

export function WinScreen() {
  const wonMission = useEconomy((s) => s.wonMission);
  const missionId  = useEconomy((s) => s.missionId);
  const closeWin   = useEconomy((s) => s.closeWin);
  const cash       = useEconomy((s) => s.cash);
  const branches   = useEconomy((s) => s.branches);
  const day        = useEconomy((s) => s.day);

  if (!wonMission) return null;

  const mission = missionId ? MISSIONS.find((m) => m.id === missionId) : null;

  return (
    <div className="win-overlay">
      <div className="win-card">
        <div className="win-fireworks">🎉🏆🎊</div>
        <h1 className="win-title">Mission erfüllt!</h1>

        {mission && (
          <div className="win-mission">
            <span className="win-mission-emoji">{mission.emoji}</span>
            <div>
              <div className="win-mission-name">{mission.title}</div>
              <div className="win-mission-desc">{mission.desc}</div>
            </div>
          </div>
        )}

        <div className="win-stats">
          <StatTile label="Kontostand" value={euro(cash)} color="#66bb6a" />
          <StatTile label="Filialen" value={`${branches}`} color="#4fc3f7" />
          <StatTile label="Tage gespielt" value={`${day}`} color="#ffb74d" />
        </div>

        <p className="win-sub">
          Das Spiel läuft jetzt im Endlos-Modus weiter — baue dein Imperium aus!
        </p>

        <button className="win-btn" onClick={closeWin}>
          ♾️ Endlos weiterspielen
        </button>
      </div>
    </div>
  );
}

function StatTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="win-stat">
      <div className="win-stat-value" style={{ color }}>{value}</div>
      <div className="win-stat-label">{label}</div>
    </div>
  );
}
