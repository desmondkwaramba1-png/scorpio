import { useCallback, useEffect, useRef, useState } from 'react';
import { FiZoomIn } from 'react-icons/fi';

// A dependency-free crop step: the picked image fills a fixed frame, the
// person drags to reposition and uses the slider to zoom, then Apply draws
// the visible region to a canvas and hands back a JPEG blob. Used for
// avatars (square) and product covers (wide) so what a seller uploads off
// their phone actually fits the shape it's shown in, instead of being
// centre-cropped blind by CSS.
export default function ImageCropper({ file, aspect = 1, round = false, onCancel, onApply }) {
  const [src, setSrc] = useState(null);
  const [natural, setNatural] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const drag = useRef(null);

  // Frame the crop happens in. Width is fixed; height follows the aspect.
  const FRAME_W = 340;
  const vw = FRAME_W;
  const vh = Math.round(FRAME_W / aspect);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const baseScale = natural ? Math.max(vw / natural.w, vh / natural.h) : 1;
  const scale = baseScale * zoom;
  const dispW = natural ? natural.w * scale : 0;
  const dispH = natural ? natural.h * scale : 0;

  const clamp = useCallback((o) => {
    const maxX = Math.max(0, (dispW - vw) / 2);
    const maxY = Math.max(0, (dispH - vh) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, o.x)),
      y: Math.min(maxY, Math.max(-maxY, o.y)),
    };
  }, [dispW, dispH, vw, vh]);

  useEffect(() => { setOffset((o) => clamp(o)); }, [zoom, clamp]);

  function onImgLoad(e) {
    setNatural({ w: e.target.naturalWidth, h: e.target.naturalHeight });
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }

  function pointerDown(e) {
    e.preventDefault();
    const p = 'touches' in e ? e.touches[0] : e;
    drag.current = { x: p.clientX, y: p.clientY, ox: offset.x, oy: offset.y };
  }
  function pointerMove(e) {
    if (!drag.current) return;
    const p = 'touches' in e ? e.touches[0] : e;
    setOffset(clamp({
      x: drag.current.ox + (p.clientX - drag.current.x),
      y: drag.current.oy + (p.clientY - drag.current.y),
    }));
  }
  function pointerUp() { drag.current = null; }

  async function apply() {
    if (!natural) return;
    setBusy(true);
    try {
      // Point in image-space that sits under the frame centre, then the
      // source rectangle around it that the frame is showing.
      const cx = natural.w / 2 - offset.x / scale;
      const cy = natural.h / 2 - offset.y / scale;
      const sw = vw / scale;
      const sh = vh / scale;
      const sx = cx - sw / 2;
      const sy = cy - sh / 2;

      const outW = Math.min(1600, Math.round(sw));
      const outH = Math.round(outW * (vh / vw));
      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.src = src;
      await img.decode();
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.92));
      const cropped = new File([blob], (file.name || 'image').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
      onApply(cropped, URL.createObjectURL(blob));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cropper">
      <div
        className="cropper__frame"
        style={{ width: vw, height: vh, borderRadius: round ? '50%' : 'var(--radius-sm)' }}
        onMouseDown={pointerDown}
        onMouseMove={pointerMove}
        onMouseUp={pointerUp}
        onMouseLeave={pointerUp}
        onTouchStart={pointerDown}
        onTouchMove={pointerMove}
        onTouchEnd={pointerUp}
      >
        {src && (
          <img
            src={src}
            alt=""
            onLoad={onImgLoad}
            draggable={false}
            className="cropper__img"
            style={{
              width: dispW || 'auto',
              height: dispH || 'auto',
              transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
            }}
          />
        )}
      </div>

      <label className="cropper__zoom">
        <FiZoomIn size={15} />
        <input
          type="range" min="1" max="3" step="0.01"
          value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))}
          aria-label="Zoom"
        />
      </label>

      <div className="cropper__actions">
        <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className="btn btn--primary btn--sm" onClick={apply} disabled={busy || !natural}>
          {busy ? 'Cropping…' : 'Apply crop'}
        </button>
      </div>
    </div>
  );
}
