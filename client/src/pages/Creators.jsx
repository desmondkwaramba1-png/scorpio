import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiUsers, FiPackage, FiArrowUpRight, FiCheck, FiStar, FiRefreshCw, FiAlertCircle } from 'react-icons/fi';

// No text Seal badge here on purpose, at this card's width there's no
// room for "Verified" without shoving the name itself into truncation
// (a real problem the first version of this card had). The gold avatar
// ring (see .creator-card--verified in index.css) already carries that
// signal; the full Seal with its label still shows on the creator's own
// profile page, where there's room for it.
function CreatorCard({ creator }) {
  return (
    <Link to={`/@${creator.handle}`} className={`creator-card${creator.verified ? ' creator-card--verified' : ''}`}>
      <div
        className="creator-card__avatar"
        style={creator.avatar_path ? { backgroundImage: `url(${creator.avatar_path})` } : undefined}
      >
        {!creator.avatar_path && creator.name.charAt(0).toUpperCase()}
      </div>
      <div className="creator-card__info">
        <div className="creator-card__name">
          <span>{creator.name}</span>
          {creator.verified && <FiCheck className="creator-card__verified-icon" size={13} aria-label="Verified creator" />}
        </div>
        <p className="creator-card__handle">@{creator.handle}</p>
        <div className="creator-card__stats">
          <span><FiPackage size={12} /> {creator.product_count} product{creator.product_count === 1 ? '' : 's'}</span>
          {creator.avg_rating && <span><FiStar size={12} /> {creator.avg_rating} <small>({creator.review_count})</small></span>}
        </div>
      </div>
      <span className="creator-card__visit">
        <span>View <FiArrowUpRight size={14} /></span>
      </span>
    </Link>
  );
}

export default function Creators() {
  const [creators, setCreators] = useState(null);
  const [error, setError] = useState(null);

  function loadCreators() {
    setError(null);
    fetch('/api/creators')
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        list.sort((a, b) => {
          if (Number(b.verified) !== Number(a.verified)) return Number(b.verified) - Number(a.verified);
          return (b.product_count || 0) - (a.product_count || 0);
        });
        setCreators(list);
      })
      .catch(() => {
        setCreators([]);
        setError(null);
      });
  }

  useEffect(() => {
    loadCreators();
  }, []);

  return (
    <div className="creators-page wrap">
      <header className="creators-heading">
        <p className="section__eyebrow mono"><FiUsers size={13} /> THE PEOPLE BEHIND THE WORK</p>
        <div className="creators-heading__row">
          <div>
            <h1>Meet the creators.</h1>
            <p>Find the people behind the ideas, guides, and tools you use.</p>
          </div>
          {creators && creators.length > 0 && (
            <span className="creators-heading__count">{creators.length} creators</span>
          )}
        </div>
      </header>

      {error && creators === null && (
        <div className="page-state page-state--error">
          <div className="page-state__icon"><FiAlertCircle size={28} /></div>
          <h2>We couldn’t load the creators.</h2>
          <p>{error}</p>
          <button className="btn btn--primary" onClick={loadCreators}>
            <FiRefreshCw size={15} /> Retry
          </button>
        </div>
      )}

      {!creators && !error && (
        <div className="creators-grid">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="skeleton-card creator-skeleton">
              <div className="skeleton" style={{ width: 52, height: 52, borderRadius: '50%', margin: '0 auto 10px' }} />
              <div className="skeleton" style={{ height: 12, width: '70%', margin: '0 auto 8px' }} />
              <div className="skeleton" style={{ height: 10, width: '45%', margin: '0 auto' }} />
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
    </div>
  );
}
