import { useState } from 'react';
import { FiUploadCloud, FiImage, FiFilm, FiMusic, FiFileText, FiCheckCircle } from 'react-icons/fi';
import ImageCropper from './ImageCropper.jsx';

// One icon that actually matches what's being asked for, derived from the
// `accept` string the caller already passes — a cover image shows a
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

// `crop` (optional): { aspect, round } — when set, an image the person
// picks opens a crop step first and `onChange` only fires with the cropped
// result, so a phone photo lands in the shape it's displayed in.
export default function FileUpload({ id, label, accept, onChange, hint, preview, previewKind, crop }) {
  const [picked, setPicked] = useState(false);
  const [cropping, setCropping] = useState(null); // the File awaiting crop
  const [croppedPreview, setCroppedPreview] = useState(null);
  const Icon = picked ? FiCheckCircle : ICONS[kindFromAccept(accept)];

  function handleChange(e) {
    const file = e.target.files && e.target.files[0];
    if (crop && file && file.type.startsWith('image/')) {
      setCropping(file);
      e.target.value = ''; // let them re-pick the same file later
      return;
    }
    setPicked(!!file);
    onChange(e);
  }

  function applyCrop(croppedFile, previewUrl) {
    setCropping(null);
    setPicked(true);
    setCroppedPreview(previewUrl);
    onChange({ target: { files: [croppedFile] } });
  }

  const shownPreview = croppedPreview || preview;

  return (
    <div>
      <input id={id} type="file" accept={accept} onChange={handleChange} className="file-upload__input" />
      <label htmlFor={id} className={`file-upload__dropzone${picked ? ' file-upload__dropzone--done' : ''}`}>
        <Icon size={22} />
        <span>{label}</span>
      </label>
      {hint && <small>{hint}</small>}

      {cropping && (
        <ImageCropper
          file={cropping}
          aspect={crop.aspect || 1}
          round={!!crop.round}
          onCancel={() => setCropping(null)}
          onApply={applyCrop}
        />
      )}

      {!cropping && shownPreview && (previewKind === 'image' || crop) && (
        <img src={shownPreview} alt="" className="file-upload__preview" />
      )}
      {!cropping && shownPreview && previewKind === 'video' && !crop && (
        <video src={shownPreview} controls className="file-upload__preview" />
      )}
    </div>
  );
}
