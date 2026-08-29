import { useCallback, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { decodeSave, buildBadgeModel, IncrelutionSaveError } from '../utils/increlutionSave';
import type { BadgeModel } from '../utils/increlutionSave';
import { BadgeSvg } from '../components/BadgeSvg';
import './BadgePage.css';

export default function BadgePage() {
  const navigate = useNavigate();
  const [rawInput, setRawInput] = useState('');
  const [model, setModel] = useState<BadgeModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const generate = useCallback((raw: string) => {
    try {
      const badge = buildBadgeModel(decodeSave(raw));
      setModel(badge);
      setError(null);
    } catch (err) {
      setModel(null);
      setError(err instanceof IncrelutionSaveError ? err.message : 'Something went wrong reading that save.');
    }
  }, []);

  const onFile = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = typeof reader.result === 'string' ? reader.result : '';
        setRawInput(text);
        generate(text);
      };
      reader.onerror = () => setError('Could not read that file.');
      reader.readAsText(file);
      // Allow re-selecting the same file later.
      event.target.value = '';
    },
    [generate],
  );

  const downloadPng = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const svgDataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(xml)))}`;
    const scale = 2;
    const width = svg.viewBox.baseVal.width || svg.clientWidth;
    const height = svg.viewBox.baseVal.height || svg.clientHeight;
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(scale, scale);
      ctx.drawImage(image, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'increlution-badge.png';
        link.click();
        URL.revokeObjectURL(url);
      }, 'image/png');
    };
    image.src = svgDataUrl;
  }, []);

  return (
    <div className="badge-page">
      <div className="badge-page-content">
        <h1>Increlution Stats Badge</h1>
        <p className="badge-intro">
          Paste an Increlution save (or load a backup file) to generate a shareable stats badge.
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
          <label className="badge-btn">
            Load save file
            <input type="file" accept=".txt,text/plain" onChange={onFile} hidden />
          </label>
          {model && (
            <button className="badge-btn" onClick={downloadPng}>
              Download PNG
            </button>
          )}
        </div>

        {error && <p className="badge-error">{error}</p>}

        {model && (
          <div className="badge-preview">
            <BadgeSvg ref={svgRef} model={model} />
          </div>
        )}

        <button onClick={() => navigate(-1)} className="badge-back">Back</button>
      </div>
    </div>
  );
}
