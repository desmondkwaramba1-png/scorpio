import { FiSun, FiMoon } from 'react-icons/fi';
import { useTheme } from '../context/ThemeContext.jsx';

// Lives in Account.jsx (buyers) and dashboard/Settings.jsx (creators) —
// pulled out of the top nav bar to free up that space, which meant it
// needed a home reachable by both roles rather than just one settings page.
export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <div className="card card--pad" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{
          width: 34, height: 34, borderRadius: 10, background: 'var(--green-tint)', color: 'var(--green-glow)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
        }}>
          {isDark ? <FiMoon size={16} /> : <FiSun size={16} />}
        </span>
        <div>
          <p style={{ fontWeight: 700 }}>Appearance</p>
          <p className="muted" style={{ fontSize: '.85rem' }}>{isDark ? 'Dark mode' : 'Light mode'}</p>
        </div>
      </div>
      <button type="button" onClick={toggleTheme} className="btn btn--ghost btn--sm">
        Switch to {isDark ? 'light' : 'dark'}
      </button>
    </div>
  );
}
