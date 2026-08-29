import { useEffect, useRef, useState } from 'react';
import { FiHeart, FiMessageCircle, FiShare2, FiCheck } from 'react-icons/fi';
import { FaWhatsapp, FaFacebook } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api';
import { canNativeShare, shareOrCopy } from '../lib/share';

// Only WhatsApp and Facebook have a real "share this URL" web intent, so
// those get their own direct link in the fallback menu. Everywhere else
// (Instagram, TikTok, anything else installed) is handled for real by the
// native OS share sheet on devices that support it — that's the only
// mechanism that can actually hand a link to those apps.
const DIRECT_LINKS = [
  { id: 'whatsapp', label: 'WhatsApp', icon: FaWhatsapp, color: '#25D366',
    open: (url, text) => `https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}` },
  { id: 'facebook', label: 'Facebook', icon: FaFacebook, color: '#1877F2',
    open: (url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` }
];

export default function EngagementBar({ product, onCommentClick }) {
  const { user } = useAuth();
  const [liked, setLiked] = useState(product.liked_by_me);
  const [likeCount, setLikeCount] = useState(product.like_count);
  const [shareCount, setShareCount] = useState(product.share_count);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onOutside(e) { if (!menuRef.current?.contains(e.target)) setMenuOpen(false); }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [menuOpen]);

  async function toggleLike() {
    if (!user) { window.location.href = '/login?role=buyer'; return; }
    const data = await api.post(`/api/products/${product.id}/like`);
    setLiked(data.liked);
    setLikeCount(data.like_count);
  }

  async function recordShare(channel) {
    try {
      const data = await api.post(`/api/products/${product.id}/share`, { channel });
      setShareCount(data.share_count);
    } catch {
      // the share itself already happened; the counter is best-effort
    }
  }

  async function handleShareClick() {
    if (!canNativeShare()) { setMenuOpen(o => !o); return; }
    const url = window.location.href;
    const method = await shareOrCopy({ title: product.title, text: `Check out ${product.title} on SCORPIO`, url });
    if (method === 'native') recordShare('native');
    else if (method === 'copy_link') {
      recordShare('copy_link');
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }

  function openDirect(channel) {
    const url = window.location.href;
    const text = `Check out ${product.title} on SCORPIO`;
    window.open(channel.open(url, text), '_blank', 'noopener,noreferrer');
    recordShare(channel.id);
    setMenuOpen(false);
  }

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    recordShare('copy_link');
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
    setMenuOpen(false);
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', margin: '18px 0' }}>
      <button onClick={toggleLike} style={{
        display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer',
        color: liked ? 'var(--red)' : 'var(--muted)', fontSize: '.9rem', fontWeight: 600, padding: 0
      }}>
        <FiHeart fill={liked ? 'var(--red)' : 'none'} /> {likeCount > 0 && likeCount}
      </button>

      <button onClick={onCommentClick} style={{
        display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--muted)', fontSize: '.9rem', fontWeight: 600, padding: 0
      }}>
        <FiMessageCircle /> {product.comment_count > 0 && product.comment_count}
      </button>

      <div ref={menuRef} style={{ position: 'relative' }}>
        <button onClick={handleShareClick} style={{
          display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer',
          color: copied ? 'var(--green-glow)' : 'var(--muted)', fontSize: '.9rem', fontWeight: 600, padding: 0
        }}>
          {copied ? <FiCheck /> : <FiShare2 />} {copied ? 'Copied' : (shareCount > 0 && shareCount)}
        </button>

        {menuOpen && (
          <div className="card" style={{
            position: 'absolute', top: '130%', left: 0, zIndex: 10, minWidth: 180,
            padding: 8, display: 'flex', flexDirection: 'column', gap: 2
          }}>
            {DIRECT_LINKS.map(ch => (
              <button key={ch.id} onClick={() => openDirect(ch)} style={{
                display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none',
                cursor: 'pointer', padding: '8px 10px', borderRadius: 'var(--radius-sm)', color: 'var(--ink)',
                fontSize: '.88rem', fontWeight: 600, width: '100%', textAlign: 'left'
              }}>
                <ch.icon size={16} color={ch.color} /> {ch.label}
              </button>
            ))}
            <button onClick={copyLink} style={{
              display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none',
              cursor: 'pointer', padding: '8px 10px', borderRadius: 'var(--radius-sm)', color: 'var(--ink)',
              fontSize: '.88rem', fontWeight: 600, width: '100%', textAlign: 'left'
            }}>
              <FiCheck size={16} /> Copy link
              <span className="muted" style={{ fontSize: '.72rem', fontWeight: 400, marginLeft: 'auto' }}>for Instagram/TikTok</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
