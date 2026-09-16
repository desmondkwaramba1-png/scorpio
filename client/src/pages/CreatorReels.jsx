import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReelViewer from '../components/ReelViewer.jsx';
import { useSEO } from '../lib/seo';
import { SITE_ORIGIN } from '../lib/site.js';
import { api } from '../lib/api';

// Used to be a horizontal strip stacked right above the product grid on
// CreatorProfile itself, a visitor scrolled straight from one into the
// other with nothing but a plain heading between them, reels and
// products reading as one blended feed instead of two different things.
// This is that content's real home now: its own URL, so "this creator's
// reels" is a link you can actually share, not just a section you scroll
// past. CreatorProfile links here instead of embedding the strip.
export default function CreatorReels() {
  const { handle: rawHandle } = useParams();
  // Same "/:handle" route quirk as CreatorProfile, the captured param
  // still has the leading "@" from the URL.
  const handle = rawHandle.replace(/^@/, '');
  const navigate = useNavigate();
  const [reels, setReels] = useState(null);

  useEffect(() => {
    setReels(null);
    api.get(`/api/reels?creator=${handle}`).then(setReels).catch(() => setReels([]));
  }, [handle]);

  useSEO({
    title: reels?.[0] ? `${reels[0].creator_name}'s reels | SCORPIO` : undefined,
    description: reels?.[0] ? `Watch ${reels[0].creator_name}'s reels on SCORPIO.` : undefined,
    url: `${SITE_ORIGIN}/@${handle}/reels`
  });

  // Matches .reel-viewer's own background, no white flash before the
  // real viewer takes over once data arrives.
  if (reels === null) {
    return <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.92)', zIndex: 2000 }} />;
  }

  if (reels.length === 0) {
    return (
      <div className="wrap center-page" style={{ padding: 20 }}>
        <p className="muted">This creator hasn't posted any reels yet.</p>
      </div>
    );
  }

  return <ReelViewer reels={reels} startIndex={0} onClose={() => navigate(`/@${handle}`)} />;
}
