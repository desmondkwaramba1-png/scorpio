import { Link } from 'react-router-dom';

// The shared frame for every auth-flow screen — login, signup, onboarding,
// the post-OAuth role question, password reset, email verification. Puts
// the Scorpio wordmark above a bordered card so each of these reads as a
// deliberate, focused moment rather than a bare form on the page.
export default function AuthShell({ children, wide = false, cardStyle }) {
  return (
    <div className="auth-page">
      <div className={`auth-shell${wide ? ' auth-shell--wide' : ''}`}>
        <Link to="/" className="auth-shell__brand" aria-label="Scorpio home">Scorpio</Link>
        <div className="auth-card" style={cardStyle}>{children}</div>
      </div>
    </div>
  );
}
