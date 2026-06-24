// Platzhalter für den "Browser" (Marktrecherche, kommt später).
export function BrowserApp() {
  return (
    <div className="app-pad">
      <div className="browser-bar">
        <span className="browser-dot" />
        <span className="browser-dot" />
        <span className="browser-dot" />
        <div className="browser-url">retailnet://markt/preise</div>
      </div>
      <div className="app-placeholder">
        <div className="app-placeholder-icon">🌐</div>
        <h3>RetailNet Explorer</h3>
        <p>
          Hier recherchierst du später Marktpreise, findest neue Lieferanten und
          liest Branchen-News, die die Nachfrage beeinflussen.
        </p>
        <p className="app-soon">Kommt nach dem Einkaufs-Programm.</p>
      </div>
    </div>
  );
}
