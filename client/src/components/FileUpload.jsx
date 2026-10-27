import { useRef, useState } from 'react';
import { FiUploadCloud, FiImage, FiFilm, FiMusic, FiFileText, FiCheckCircle, FiX, FiRefreshCw, FiAlertCircle } from 'react-icons/fi';
import ImageCropper from './ImageCropper.jsx';

// One icon that actually matches what's being asked for, derived from the
// `accept` string the caller already passes, a cover image shows a
// picture icon, a course video shows a film icon, an ebook PDF shows a
// document icon, instead of every field showing the same generic cloud.
function kindFromAccept(accept = '') {
  const a = accept.toLowerCase();
  if (a.includes('image')) return 'image';
  if (a.includes('video')) return 'video';
  if (a.includes('audio')) return 'audio';
  if (a.includes('pdf')) return 'pdf';
  return 'any';
}

const ICONS = {
  image: FiImage,
  video: FiFilm,
  audio: FiMusic,
  pdf: FiFileText,
  any: FiUploadCloud,
};

const WRONG_TYPE = {
  image: 'That file is not an image. Choose a JPEG, PNG or WebP photo.',
  video: 'That file is not a supported video. Choose an MP4, WebM or MOV file.',
  audio: 'That file is not a supported audio file.',
  pdf: 'That file is not a PDF. Choose a .pdf file.',
  any: 'That file type is not supported here.',
};

// Phones sometimes hand over a file with an empty MIME type, so the
// extension is the fallback signal. Used only to decide whether to let the
// person continue; the server still checks the real bytes.
const EXTENSION_KINDS = {
  image: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'avif', 'bmp'],
  video: ['mp4', 'webm', 'mov', 'm4v'],
  audio: ['mp3', 'wav', 'm4a', 'aac', 'flac'],
  pdf: ['pdf'],
};

function extensionOf(name = '') {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i + 1).toLowerCase();
}

function matchesAccept(file, accept) {
  if (!accept) return true;
  const tokens = accept.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
  const type = (file.type || '').toLowerCase();
  const ext = extensionOf(file.name);
  return tokens.some(token => {
    if (token.startsWith('.')) return ext === token.slice(1);
    if (token.endsWith('/*')) {
      const family = token.slice(0, -2);
      return type ? type.startsWith(`${family}/`) : (EXTENSION_KINDS[family] || []).includes(ext);
    }
    if (type) return type === token;
    return (EXTENSION_KINDS[token.split('/')[1]] || [token.split('/')[1]]).includes(ext)
      || (EXTENSION_KINDS[token.split('/')[0]] || []).includes(ext);
  });
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// `crop` (optional): { aspect, round }, when set, an image the person
// picks opens a crop step first and `onChange` only fires with the cropped
// result, so a phone photo lands in the shape it's displayed in.
//
// `maxBytes` (optional): the largest file the server will accept. Checked
// here so a too-big file is refused immediately with a clear message instead
// of after minutes of uploading.
//
// `onChange` always receives `{ target: { files: [File] } }`; clearing the
// selection calls it with an empty `files` array.
export default function FileUpload({ id, label, accept, onChange, hint, preview, previewKind, crop, maxBytes }) {
  const inputRef = useRef(null);
  const [picked, setPicked] = useState(null); // { name, size }
  const [cropping, setCropping] = useState(null); // the File awaiting crop
  const [croppedPreview, setCroppedPreview] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState(null);
  const kind = kindFromAccept(accept);
  const Icon = ICONS[kind];

  function emit(files) {
    onChange({ target: { files } });
  }

  function acceptFile(file) {
    setError(null);
    if (!file) return;
    if (file.size === 0) {
      setError('That file is empty. Choose a different one.');
      return;
    }
    if (!matchesAccept(file, accept)) {
      setError(WRONG_TYPE[kind]);
      return;
    }
    if (maxBytes && file.size > maxBytes) {
      setError(`That file is ${formatBytes(file.size)}. The limit here is ${formatBytes(maxBytes)}.`);
      return;
    }
    if (crop && (file.type.startsWith('image/') || (!file.type && EXTENSION_KINDS.image.includes(extensionOf(file.name))))) {
      setCropping(file);
      return;
    }
    setPicked({ name: file.name, size: file.size });
    emit([file]);
  }

  function handleChange(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // let them re-pick the same file later
    acceptFile(file);
  }

  function applyCrop(croppedFile, previewUrl) {
    setCropping(null);
    setPicked({ name: croppedFile.name, size: croppedFile.size });
    setCroppedPreview(previewUrl);
    emit([croppedFile]);
  }

  function clear() {
    setPicked(null);
    setCroppedPreview(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
    emit([]);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    acceptFile(e.dataTransfer?.files?.[0]);
  }

  const shownPreview = croppedPreview || preview;
  const showImage = shownPreview && (previewKind === 'image' || crop);
  const showVideo = shownPreview && previewKind === 'video' && !crop;

  return (
    <div className="file-upload">
      <input ref={inputRef} id={id} type="file" accept={accept} onChange={handleChange} className="file-upload__input" />

      {picked && !cropping ? (
        <div className="file-upload__card">
          {showImage
            ? <img src={shownPreview} alt="" className="file-upload__thumb" />
            : <span className="file-upload__badge"><FiCheckCircle size={20} /></span>}
          <div className="file-upload__meta">
            <span className="file-upload__name" title={picked.name}>{picked.name}</span>
            <span className="file-upload__size">{formatBytes(picked.size)} · ready to upload</span>
          </div>
          <label htmlFor={id} className="file-upload__action" title="Choose a different file">
            <FiRefreshCw size={14} /> <span>Replace</span>
          </label>
          {!crop && (
            <button type="button" className="file-upload__action file-upload__action--remove" onClick={clear} aria-label="Remove file">
              <FiX size={15} />
            </button>
          )}
        </div>
      ) : (
        <label
          htmlFor={id}
          className={`file-upload__dropzone${dragging ? ' file-upload__dropzone--drag' : ''}${error ? ' file-upload__dropzone--error' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <Icon size={22} />
          <span>{label}</span>
          <small className="file-upload__sub">
            {dragging ? 'Drop it here' : `Tap to browse or drag a file here${maxBytes ? ` · up to ${formatBytes(maxBytes)}` : ''}`}
          </small>
        </label>
      )}

      {error && (
        <p className="file-upload__error" role="alert"><FiAlertCircle size={14} /> {error}</p>
      )}
      {hint && !error && <small>{hint}</small>}

      {cropping && (
        <ImageCropper
          file={cropping}
          aspect={crop.aspect || 1}
          round={!!crop.round}
          onCancel={() => setCropping(null)}
          onApply={applyCrop}
        />
      )}

      {!cropping && !picked && showImage && (
        <img src={shownPreview} alt="" className="file-upload__preview" />
      )}
      {!cropping && showVideo && (
        <video src={shownPreview} controls className="file-upload__preview" />
      )}
    </div>
  );
}
