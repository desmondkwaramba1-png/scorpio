import { FiUploadCloud, FiImage, FiVideo, FiFile } from 'react-icons/fi';

const ICONS = { image: FiImage, video: FiVideo, file: FiFile };

export default function FileUpload({ id, label, accept, onChange, hint, preview, previewKind }) {
  const Icon = preview ? (ICONS[previewKind] || FiFile) : FiUploadCloud;

  return (
    <div>
      <input id={id} type="file" accept={accept} onChange={onChange} className="file-upload__input" />
      <label htmlFor={id} className="file-upload__dropzone">
        <Icon size={22} />
        <span>{label}</span>
      </label>
      {hint && <small>{hint}</small>}
      {preview && previewKind === 'image' && <img src={preview} alt="" className="file-upload__preview" />}
      {preview && previewKind === 'video' && <video src={preview} controls className="file-upload__preview" />}
    </div>
  );
}
