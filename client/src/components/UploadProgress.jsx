import { FiLock } from 'react-icons/fi';

// Shown while a publish/edit/issue upload is in flight. Two honest phases:
// bytes leaving the device (percentage), then the server finishing up
// (indeterminate, because the percentage has nothing more to say by then).
export default function UploadProgress({ progress = 0, label = 'Uploading' }) {
  const finishing = progress >= 100;
  return (
    <div className="upload-panel" role="status" aria-live="polite">
      <div className="upload-panel__row">
        <span className="upload-panel__title">{finishing ? 'Finishing up…' : `${label} · ${progress}%`}</span>
        <span className="upload-panel__lock"><FiLock size={12} /> Keep this page open</span>
      </div>
      <div className={`upload-progress${finishing ? ' upload-progress--busy' : ''}`}>
        <div className="upload-progress__bar" style={{ width: `${finishing ? 100 : Math.max(progress, 3)}%` }} />
      </div>
      <p className="upload-panel__note">
        {finishing
          ? 'Your files are uploaded. We are processing them now.'
          : progress < 20
            ? 'Larger files can take a few minutes on mobile data. Your details are safe if the connection drops.'
            : 'Uploading securely.'}
      </p>
    </div>
  );
}
