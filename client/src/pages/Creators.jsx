import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiUsers, FiPackage } from 'react-icons/fi';
import Seal from '../components/Seal.jsx';

function CreatorCard({ creator }) {
  return (
    <Link to={`/@${creator.handle}`} className="creator-card">
      <div
        className="creator-card__avatar"
        style={{ background: creator.avatar_path ? `url(${creator.avatar_path}) center/cover` : 'linear-gradient(135deg, var(--gold) 0%, var(--green-glow) 100%)' }}
      >
        {!creator.avatar_path && creator.name.charAt(0).toUpperCase()}
      </div>
      <div className="creator-card__name">
        <span>{creator.name}</span>
        {!!creator.verified && <Seal />}
      </div>
      <p className="muted" style={{ fontSize: '.76rem', marginTop: 2 }}>@{creator.handle}</p>
      {creator.bio && <p className="creator-card__bio">{creator.bio}</p>}
      <p className="creator-card__count">
        <FiPackage size={12} /> {creator.product_count} product{creator.product_count === 1 ? '' : 's'}
      </p>
    </Link>
  );
}

export default function Creators() {
  const [creators, setCreators] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/creators')
      .then(r => r.json())
      .then(setCreators)
      .catch(() => setError('Could not load creators. Check your connection and try again.'));
  }, []);

  return (
    <main className="wrap" style={{ padding: '40px 20px 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <FiUsers size={22} color="var(--green)" />
        <h1 style={{ fontSize: '1.8rem' }}>Meet the creators</h1>
      </div>
      <p className="muted" style={{ marginBottom: 28 }}>
        Every guide, template, and ebook on SCORPIO comes from a real person behind it. Browse by who's selling, not just what's for sale.
      </p>

      {error && <p className="error-text">{error}</p>}

      {!creators && !error && (
        <div className="creators-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton-card" style={{ padding: 20 }}>
              <div className="skeleton" style={{ width: 64, height: 64, borderRadius: '50%', marginBottom: 14 }} />
              <div className="skeleton" style={{ height: 14, width: '70%', marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 12, width: '45%' }} />
            </div>
          ))}
        </div>
      )}

      {creators && creators.length === 0 && (
        <div className="empty-state">
          <strong>No creators with published listings yet.</strong>
        </div>
      )}

      {creators && creators.length > 0 && (
        <div className="creators-grid">
          {creators.map(c => <CreatorCard key={c.id} creator={c} />)}
        </div>
      )}
    </main>
  );
}
