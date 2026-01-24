import { useState, useEffect, useRef } from 'react';
import './TextInputModal.css';

interface TextInputModalProps {
  title: string;
  label: string;
  placeholder?: string;
  initialValue?: string;
  submitText?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export function TextInputModal({
  title,
  label,
  placeholder,
  initialValue = '',
  submitText = 'Submit',
  onSubmit,
  onCancel
}: TextInputModalProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus and select the input on mount
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onSubmit(value.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div className="text-input-modal-overlay" onClick={onCancel}>
      <div className="text-input-modal" onClick={e => e.stopPropagation()}>
        <h3>{title}</h3>
        <form onSubmit={handleSubmit}>
          <label htmlFor="text-input-modal-input">{label}</label>
          <input
            ref={inputRef}
            id="text-input-modal-input"
            type="text"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
          />
          <div className="text-input-modal-actions">
            <button type="button" className="text-input-modal-cancel" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="text-input-modal-submit" disabled={!value.trim()}>
              {submitText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
