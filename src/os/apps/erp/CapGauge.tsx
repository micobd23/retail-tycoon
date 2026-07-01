// --- Lagerplatz-Anzeige (kleiner Balken) ---------------------------------
export function CapGauge({
  label,
  used,
  cap,
  pending = 0,
}: {
  label: string;
  used: number;
  cap: number;
  pending?: number;
}) {
  const total = used + pending;
  const pct = Math.min(100, Math.round((total / cap) * 100));
  const voll = pct >= 90;
  return (
    <div className="erp-cap">
      <span className="erp-stat-label">{label}</span>
      <div className="erp-cap-bar">
        <div
          className={"erp-cap-fill" + (voll ? " full" : "")}
          style={{ width: pct + "%" }}
        />
      </div>
      <span className="erp-cap-text">
        {used.toLocaleString("de-DE")}
        {pending > 0 && <span className="erp-cap-pending">+{pending.toLocaleString("de-DE")}▶</span>}
        {" / "}{cap.toLocaleString("de-DE")}
      </span>
    </div>
  );
}
