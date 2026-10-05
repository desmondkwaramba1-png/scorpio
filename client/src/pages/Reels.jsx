import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FiFilm } from 'react-icons/fi';
import ReelViewer from '../components/ReelViewer.jsx';
import { useSEO } from '../lib/seo';
import { SITE_ORIGIN } from '../lib/site.js';
import { api } from '../lib/api';

// Before this page existed, a reel was only ever reachable from inside
// something else, a creator's own storefront, a specific product page, or
// the homepage's "Meet the creators" rail (and only for whichever handful
// of creators happened to have a reel AND land in that limited fetch). A
// buyer with no reason to already be on one of those had no path in at
// all. This is that path: /reels, a nav link, newest-across-everyone,
// reusing the same full-screen ReelViewer every other entry point already
// opens, so there's exactly one reel-watching experience in the app, not
// a second one built just for this page.
export default function Reels() {
  const [reels, setReels] = useState(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    api.get('/api/reels?limit=50').then(setReels).catch(() => setReels([]));
  }, []);

  useSEO({
    title: 'Reels, Watch Zimbabwean creators in action | SCORPIO',
    description: "Short video reels from real creators on SCORPIO, see what they're selling before you buy.",
    url: `${SITE_ORIGIN}/reels`
  });

  // Matches .reel-viewer's own background so there's no white flash
  // between this and the real viewer taking over the instant data arrives.
  if (reels === null) {
    return <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.92)', zIndex: 2000 }} />;
  }

  if (reels.length === 0) {
    return (
      <div className="wrap" style={{ padding: '60px 20px 80px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <FiFilm size={22} color="var(--green)" />
          <h1 style={{ fontSize: '1.8rem' }}>Reels</h1>
        </div>
        <div className="empty-state" style={{ marginTop: 20 }}>
          <strong>No reels yet.</strong>
          Creators are just getting started, check back soon.
        </div>
      </div>
    );
  }

  const requestedIndex = reels.findIndex(item => String(item.id) === searchParams.get('reel'));
  return <ReelViewer reels={reels} startIndex={requestedIndex < 0 ? 0 : requestedIndex} onClose={() => navigate('/discover')} />;
}
