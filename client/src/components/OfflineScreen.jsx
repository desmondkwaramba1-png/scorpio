import { FiRefreshCw, FiWifiOff } from 'react-icons/fi';

export default function OfflineScreen({ status, onContinue, onRetry, checking }) {
  const isOffline = status === 'offline';

  return (
    <div className="offline-screen" role="alertdialog" aria-modal="true" aria-labelledby="offline-title">
      <div className="offline-screen__content">
        <div className="offline-screen__signal" aria-hidden="true">
          <span className="offline-screen__signal-ring offline-screen__signal-ring--outer" />
          <span className="offline-screen__signal-ring offline-screen__signal-ring--inner" />
          <span className="offline-screen__signal-core"><FiWifiOff size={24} /></span>
        </div>
        <p className="offline-screen__eyebrow mono">SCORPIO CONNECTION CHECK</p>
        <h1 id="offline-title">{isOffline ? "You're offline for a moment." : "We can't reach SCORPIO right now."}</h1>
        <p className="offline-screen__body">
          {isOffline
            ? 'Your work is still here. Reconnect to continue where you left off.'
            : 'Your internet may still be working. The service didn’t respond, so give it a moment and try again.'}
        </p>
        <div className="offline-screen__status" aria-live="polite">
          <span className="offline-screen__status-dot" />
          {isOffline ? 'Waiting for your connection' : 'Waiting for the service'}
        </div>
        <div className="offline-screen__actions">
          <button type="button" className="btn btn--primary" onClick={onRetry} disabled={checking}>
            <FiRefreshCw className={checking ? 'offline-screen__refresh--spinning' : ''} size={15} />
            {checking ? 'Checking...' : 'Try again'}
          </button>
          <button type="button" className="offline-screen__continue" onClick={onContinue}>
            Keep this page open
          </button>
        </div>
        <p className="offline-screen__footnote">No need to start over. The page underneath stays right where you left it.</p>
      </div>
    </div>
  );
}