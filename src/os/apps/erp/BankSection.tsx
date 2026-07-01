import { useState } from "react";
import { useEconomy, creditLimit, CREDIT_INTEREST_RATE } from "../../../economy/economyStore";
import { euro } from "../../../economy/catalog";

export function BankSection() {
  const branches    = useEconomy((s) => s.branches);
  const creditUsed  = useEconomy((s) => s.creditUsed);
  const cash        = useEconomy((s) => s.cash);
  const takeCredit  = useEconomy((s) => s.takeCredit);
  const repayCredit = useEconomy((s) => s.repayCredit);
  const [msg, setMsg] = useState<string | null>(null);

  const limit     = creditLimit(branches);
  const available = Math.max(0, limit - creditUsed);
  const interest  = +(creditUsed * CREDIT_INTEREST_RATE).toFixed(2);

  const doTake = (amount: number) => {
    const r = takeCredit(amount);
    setMsg(r.ok ? `+${euro(amount)} geliehen.` : r.msg ?? null);
  };
  const doRepay = (amount: number) => {
    const r = repayCredit(amount);
    setMsg(r.ok ? `${euro(amount)} zurückgezahlt.` : r.msg ?? null);
  };

  return (
    <div style={{ background: "#f5f5f5", borderRadius: 10, padding: "14px 16px", marginTop: 8 }}>
      {msg && (
        <div style={{ background: "#fff3e0", border: "1px solid #ffcc80", borderRadius: 8, padding: "7px 11px", fontSize: 13, marginBottom: 10 }}>
          {msg}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 12 }}>
        {[
          { label: "Kreditlimit", value: euro(limit), sub: `+${euro(3000)}/Filiale` },
          { label: "Genutzt", value: euro(creditUsed), sub: creditUsed > 0 ? `${euro(interest)}/Tag Zinsen` : "kein Kredit" },
          { label: "Verfügbar", value: euro(available), sub: `${CREDIT_INTEREST_RATE * 100} %/Tag Zins` },
        ].map((c) => (
          <div key={c.label} style={{ background: "#fff", borderRadius: 8, padding: "10px 12px", textAlign: "center", border: "1px solid #e0e0e0" }}>
            <div style={{ fontSize: 12, color: "#78909c", marginBottom: 2 }}>{c.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#263238" }}>{c.value}</div>
            <div style={{ fontSize: 11, color: "#90a4ae", marginTop: 2 }}>{c.sub}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[1000, 3000, available].filter((v, i, a) => v > 0 && a.indexOf(v) === i).map((amt) => (
          <button key={`take-${amt}`}
            onClick={() => doTake(amt)}
            disabled={amt > available || cash + amt > limit * 3}
            style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: amt > available ? "#cfd8dc" : "#1565c0", color: "#fff", fontWeight: 700, fontSize: 13, cursor: amt > available ? "default" : "pointer" }}
          >
            Leihen +{euro(amt)}
          </button>
        ))}
        <div style={{ width: "100%", height: 0 }} />
        {[1000, 3000, creditUsed].filter((v, i, a) => v > 0 && v <= creditUsed && a.indexOf(v) === i).map((amt) => (
          <button key={`repay-${amt}`}
            onClick={() => doRepay(amt)}
            disabled={amt > cash}
            style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #b71c1c", background: "#fff", color: amt > cash ? "#cfd8dc" : "#b71c1c", fontWeight: 700, fontSize: 13, cursor: amt > cash ? "default" : "pointer" }}
          >
            Zurückzahlen −{euro(amt)}
          </button>
        ))}
        {creditUsed === 0 && (
          <span style={{ fontSize: 13, color: "#90a4ae", alignSelf: "center" }}>Kein offener Kredit.</span>
        )}
      </div>
    </div>
  );
}
