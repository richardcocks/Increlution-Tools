import { useState } from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';
import type { LinkContext } from './MarkdownRenderer';
import './ReadmeEditor.css';

interface Props {
  initialValue: string | null;
  maxLength: number;
  linkContext: LinkContext;
  onSave: (value: string | null) => Promise<void>;
  onCancel: () => void;
}

export function ReadmeEditor({ initialValue, maxLength, linkContext, onSave, onCancel }: Props) {
  const [value, setValue] = useState<string>(initialValue ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const len = value.length;
  const overLimit = len > maxLength;
  const nearLimit = !overLimit && len > maxLength * 0.85;

  const handleSave = async () => {
    if (overLimit) return;
    setSaving(true);
    setError(null);
    try {
      const trimmed = value.trim();
      await onSave(trimmed === '' ? null : value);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save readme');
      setSaving(false);
    }
  };

  return (
    <div className="readme-editor">
      <div className="readme-editor-panes">
        <div className="readme-editor-pane">
          <div className="readme-editor-pane-label">
            <i className="fas fa-pen-to-square" /> Markdown
          </div>
          <textarea
            className="readme-editor-textarea"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Write a description of this folder. Markdown (GFM) supported. Use a 'Copy markdown link' button on a loadout to insert a link to it."
            spellCheck
          />
        </div>
        <div className="readme-editor-pane">
          <div className="readme-editor-pane-label">
            <i className="fas fa-eye" /> Preview
          </div>
          <div className="readme-editor-preview">
            {value.trim() ? (
              <MarkdownRenderer source={value} linkContext={linkContext} />
            ) : (
              <p className="readme-editor-preview-empty">Preview will appear here.</p>
            )}
          </div>
        </div>
      </div>
      <div className="readme-editor-footer">
        <span className={`readme-editor-count ${overLimit ? 'over' : nearLimit ? 'near' : ''}`}>
          {len.toLocaleString()} / {maxLength.toLocaleString()}
        </span>
        {error && <span className="readme-editor-error">{error}</span>}
        <div className="readme-editor-buttons">
          <button className="folder-view-action-btn secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button
            className="folder-view-action-btn"
            onClick={handleSave}
            disabled={saving || overLimit}
          >
            {saving ? <><i className="fas fa-spinner fa-spin" /> Saving</> : 'Save Readme'}
          </button>
        </div>
      </div>
    </div>
  );
}
