import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { decodeSave, buildBadgeModel, IncrelutionSaveError } from '../utils/increlutionSave';
import type { BadgeModel } from '../utils/increlutionSave';
import { BadgeSvg } from '../components/BadgeSvg';
import './BadgePage.css';

const EXPORT_SCALE = 2;

/** Rasterise a rendered badge SVG element to a PNG blob. */
function rasterize(svg: SVGSVGElement, scale: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xml = new XMLSerializer().serializeToString(svg);
    const svgDataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(xml)))}`;
    const width = svg.viewBox.baseVal.width || svg.clientWidth;
    const height = svg.viewBox.baseVal.height || svg.clientHeight;
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas is not supported in this browser.'));
        return;
      }
      ctx.scale(scale, scale);
      ctx.drawImage(image, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Could not render the badge image.'));
      }, 'image/png');
    };
    image.onerror = () => reject(new Error('Could not render the badge image.'));
    image.src = svgDataUrl;
  });
}

export default function BadgePage() {
  const navigate = useNavigate();
  const [rawInput, setRawInput] = useState('');
  const [model, setModel] = useState<BadgeModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pngUrl, setPngUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const pngBlobRef = useRef<Blob | null>(null);
  const pngUrlRef = useRef<string | null>(null);

  const setPng = useCallback((blob: Blob | null) => {
    if (pngUrlRef.current) {
      URL.revokeObjectURL(pngUrlRef.current);
      pngUrlRef.current = null;
    }
    pngBlobRef.current = blob;
    if (blob) {
      const url = URL.createObjectURL(blob);
      pngUrlRef.current = url;
      setPngUrl(url);
    } else {
      setPngUrl(null);
    }
  }, []);

  // Revoke the last object URL when the page unmounts.
  useEffect(() => () => setPng(null), [setPng]);

  const generate = useCallback((raw: string) => {
    try {
      setModel(buildBadgeModel(decodeSave(raw)));
      setError(null);
    } catch (err) {
      setModel(null);
      setPng(null);
      setError(err instanceof IncrelutionSaveError ? err.message : 'Something went wrong reading that save.');
    }
  }, [setPng]);

  // Rasterise the badge whenever the model changes.
  useEffect(() => {
    if (!model || !svgRef.current) return;
    let cancelled = false;
    rasterize(svgRef.current, EXPORT_SCALE)
      .then((blob) => {
        if (!cancelled) setPng(blob);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not render the badge image.');
      });
    return () => {
      cancelled = true;
    };
  }, [model, setPng]);

  const downloadPng = useCallback(() => {
    if (!pngUrlRef.current) return;
    const link = document.createElement('a');
    link.href = pngUrlRef.current;
    link.download = 'increlution-badge.png';
    link.click();
  }, []);

  const copyPng = useCallback(async () => {
    const blob = pngBlobRef.current;
    if (!blob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy the image — your browser may not allow clipboard image access. Use Download instead.');
    }
  }, []);

  return (
    <div className="badge-page">
      <div className="badge-page-content">
        <h1>Increlution Stats Badge</h1>
        <p className="badge-intro">
          Paste an Increlution save below to generate a shareable stats badge.
          Your save is decoded entirely in your browser — it never leaves your device or touches a server.
        </p>

        <textarea
          className="badge-input"
          placeholder="Paste your Increlution save here…"
          value={rawInput}
          onChange={(e) => setRawInput(e.target.value)}
          spellCheck={false}
        />

        <div className="badge-actions">
          <button className="badge-btn primary" onClick={() => generate(rawInput)} disabled={!rawInput.trim()}>
            Generate badge
          </button>
          {pngUrl && (
            <>
              <button className="badge-btn" onClick={copyPng}>
                {copied ? 'Copied!' : 'Copy image'}
              </button>
              <button className="badge-btn" onClick={downloadPng}>
                Download PNG
              </button>
            </>
          )}
        </div>

        {error && <p className="badge-error">{error}</p>}

        {pngUrl && (
          <div className="badge-preview">
            <img className="badge-image" src={pngUrl} alt="Increlution stats badge" />
          </div>
        )}

        {/* Off-screen live SVG, used only as the source for rasterisation. */}
        {model && (
          <div className="badge-offscreen" aria-hidden="true">
            <BadgeSvg ref={svgRef} model={model} />
          </div>
        )}

        <button onClick={() => navigate(-1)} className="badge-back">Back</button>
      </div>
    </div>
  );
}
