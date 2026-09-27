import React, { useState, useEffect, useRef } from 'react';
import { FiPaperclip, FiSend, FiFile, FiLock } from 'react-icons/fi';
import { api } from '../lib/api';

export default function DisputeThread({ purchaseId, currentUserId, disputeStatus, disputeReason }) {
  const [timeline, setTimeline] = useState([]);
  const [caseReason, setCaseReason] = useState(disputeReason || '');
  const [message, setMessage] = useState('');
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  
  const bottomRef = useRef(null);

  const fetchTimeline = async () => {
    try {
      const data = await api.get(`/api/disputes/purchases/${purchaseId}`);
      setTimeline(data.timeline);
      setCaseReason(data.reason || disputeReason || '');
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchTimeline();
    const interval = setInterval(fetchTimeline, 5000);
    return () => clearInterval(interval);
  }, [purchaseId]);

  useEffect(() => {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [timeline]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message && !file) return;
    setSubmitting(true);
    setError('');

    try {
      if (file) {
        const body = new FormData();
        body.append('file', file);
        await api.uploadWithProgress('/api/disputes/purchases/' + purchaseId + '/evidence', 'POST', body, setUploadProgress);
        setFile(null);
      }
      if (message) {
        await api.post('/api/disputes/purchases/' + purchaseId + '/messages', { body: message });
        setMessage('');
      }
      await fetchTimeline();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
      setUploadProgress(0);
    }
  };

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', height: 400 }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface-raised)' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <FiLock size={16} /> Case Chat
          <span className={"badge " + (disputeStatus === 'open' ? 'badge--red' : 'badge--neutral')} style={{ marginLeft: 'auto' }}>
            {disputeStatus}
          </span>
        </h3>
        <p className="muted" style={{ fontSize: '.85rem', marginTop: 4, marginBottom: 0 }}>Reason: {caseReason}</p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {timeline.map((item, idx) => {
          const isMine = item.user_id === currentUserId;
          return (
            <div key={idx} style={{ alignSelf: isMine ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
              <div style={{ fontSize: '.75rem', marginBottom: 2, color: 'var(--text-muted)', textAlign: isMine ? 'right' : 'left' }}>
                {item.author_role.charAt(0).toUpperCase() + item.author_role.slice(1)}
              </div>
              <div style={{
                background: isMine ? 'var(--green)' : 'var(--surface-raised)',
                color: isMine ? '#fff' : 'var(--text)',
                padding: '8px 12px',
                borderRadius: 8,
                borderBottomRightRadius: isMine ? 2 : 8,
                borderBottomLeftRadius: isMine ? 8 : 2
              }}>
                {item.type === 'message' ? (
                  <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '.9rem' }}>{item.body}</div>
                ) : (
                  <a href={item.storage_path} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
                    <FiFile /> {item.original_filename}
                  </a>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {disputeStatus === 'open' && (
        <form onSubmit={handleSubmit} style={{ padding: 12, borderTop: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', gap: 8, alignItems: 'center' }}>
          {error && <div className="error-text" style={{ position: 'absolute', top: -30 }}>{error}</div>}
          <label style={{ cursor: 'pointer', padding: 8, color: file ? 'var(--green)' : 'var(--text-muted)' }}>
            <FiPaperclip size={20} />
            <input type="file" style={{ display: 'none' }} onChange={e => setFile(e.target.files[0])} />
          </label>
          <input 
            type="text" 
            placeholder={file ? file.name : "Type a message..."} 
            value={message} 
            onChange={e => setMessage(e.target.value)}
            style={{ flex: 1, border: 'none', background: 'var(--surface-raised)', borderRadius: 20, padding: '8px 16px' }}
          />
          <button type="submit" disabled={submitting || (!message && !file)} className="btn btn--primary" style={{ padding: '8px 16px', borderRadius: 20 }}>
            {submitting ? (uploadProgress > 0 ? `${uploadProgress}%` : '...') : <FiSend />}
          </button>
        </form>
      )}
    </div>
  );
}
