export default function WelcomeBranding({ onRegister, onLogin }) {
  return (
    <>
      <header className="welcome-brand">
        <span className="welcome-logo" aria-hidden="true">SS</span>
        <span>SLICE STORM</span>
      </header>
      <section className="welcome-content">
        <p className="welcome-kicker">PRECISION ARCADE</p>
        <div className="welcome-title-wrap">
          <h1 className="welcome-title"><span>SLICE</span><span>STORM</span></h1>
        </div>
        <p className="welcome-copy">Master the Blade. Chase the Perfect Combo.</p>
        <p className="welcome-description">A fast, focused fruit-slicing challenge. Read the arc, time your cut, and build your streak.</p>
        <div className="welcome-actions">
          <button type="button" className="welcome-register" onClick={onRegister}>Create account</button>
          <button type="button" className="welcome-login" onClick={onLogin}>Sign in</button>
        </div>
      </section>
    </>
  );
}
