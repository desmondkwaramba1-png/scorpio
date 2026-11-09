import { useState, useEffect, useRef } from 'react';
import { FiPaperclip, FiSend, FiFile, FiLock, FiAlertTriangle } from 'react-icons/fi';
import { api } from '../lib/api';

export default function DisputeThread({ purchaseId, currentUserId, disputeStatus, disputeReason }) {
  const [timeline, setTimeline] = useState([]);
  const [caseReason, setCaseReason] = useState(disputeReason || '');
  const [message, setMessage] = useState('');
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [seriousClaim, setSeriousClaim] = useState(false);

  const fetchTimeline = async () => {
    try {
      const data = await api.get(`/api/disputes/purchases/${purchaseId}`);
      setTimeline(data.timeline);
      setCaseReason(data.reason || disputeReason || '');
      setSeriousClaim(!!data.serious_claim);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchTimeline();
    const interval = setInterval(fetchTimeline, 5000);
    return () => clearInterval(interval);
  }, [purchaseId]);

  // Keep the newest message in view by scrolling the chat box itself, and only
  // when a message arrives. scrollIntoView would drag the whole page here on
  // every 5-second refresh.
  const timelineRef = useRef(null);
  useEffect(() => {
    const box = timelineRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [timeline.length]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message && !file) return;
    if (seriousClaim && !message.trim()) {
      setError('Explain why you believe the product is stolen, illegal, counterfeit, or fundamentally misleading.');
      return;
    }
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
        await api.post('/api/disputes/purchases/' + purchaseId + (seriousClaim ? '/serious-claim' : '/messages'), { body: message });
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
    <div className="card dispute-thread">
      <div className="dispute-thread__header">
        <h2 className="dispute-thread__title">
          <FiLock size={16} /> Case Chat
          <span className={`badge ${disputeStatus === 'open' ? 'badge--red' : 'badge--neutral'}`}>
            {disputeStatus}
          </span>
        </h2>
        <p className="dispute-thread__reason">Reason: {caseReason}</p>
        <p className="dispute-thread__how"><strong>How this works:</strong> You, the creator, and SCORPIO can read this case. Reply here while it is open; the chat becomes read-only after SCORPIO resolves the dispute.</p>
        <p className="dispute-thread__policy">Keep contact on SCORPIO. Phone numbers, email addresses, and links are blocked. Use attachments only as case evidence.</p>
      </div>

      <div className="dispute-thread__timeline" ref={timelineRef}>
        {timeline.map((item, idx) => {
          const isMine = item.user_id === currentUserId;
          return (
            <div key={idx} className={`dispute-thread__item${isMine ? ' is-mine' : ''}`}>
              <div className="dispute-thread__author">
                {item.author_role.charAt(0).toUpperCase() + item.author_role.slice(1)}
              </div>
              <div className="dispute-thread__bubble">
                {item.type === 'message' ? (
                  <div>{item.body}</div>
                ) : (
                  <a href={item.storage_path} target="_blank" rel="noopener noreferrer" className="dispute-thread__evidence">
                    <FiFile /> {item.original_filename}
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {disputeStatus === 'open' && (
        <form onSubmit={handleSubmit} className="dispute-thread__composer">
          {error && <div className="error-text dispute-thread__error">{error}</div>}
          <label className="dispute-thread__attach" title="Attach case evidence" aria-label="Attach case evidence">
            <FiPaperclip size={20} />
            <input type="file" style={{ display: 'none' }} onChange={e => setFile(e.target.files[0])} />
          </label>
          <input 
            type="text" 
            placeholder={file ? file.name : 'Reply in your case...'}
            value={message} 
            onChange={e => setMessage(e.target.value)}
            maxLength={2000}
            className="dispute-thread__input"
            aria-label={seriousClaim ? 'Explain the serious product claim' : 'Reply in the case chat'}
          />
          <button type="submit" disabled={submitting || (!message && !file)} className="btn btn--primary dispute-thread__send" aria-label="Send case message">
            {submitting ? (uploadProgress > 0 ? `${uploadProgress}%` : '...') : <FiSend />}
          </button>
          {!seriousClaim && (
            <label className="dispute-thread__serious">
              <input type="checkbox" checked={seriousClaim} onChange={e => setSeriousClaim(e.target.checked)} />
              <span><FiAlertTriangle size={13} /> Flag a serious product claim</span>
            </label>
          )}
        </form>
      )}
    </div>
  );
}
