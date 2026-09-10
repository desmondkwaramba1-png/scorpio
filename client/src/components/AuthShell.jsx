// The shared frame for every auth-flow screen — login, signup, onboarding,
// the post-OAuth role question, password reset, email verification. Just a
// bordered card on a soft background; no logo up top (the nav already
// carries the wordmark, and anything more read as shouting).
export default function AuthShell({ children, wide = false, cardStyle }) {
  return (
    <div className="auth-page">
      <div className={`auth-shell${wide ? ' auth-shell--wide' : ''}`}>
        <div className="auth-card" style={cardStyle}>{children}</div>
      </div>
    </div>
  );
}
