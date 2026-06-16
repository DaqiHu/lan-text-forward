import { useRef, useEffect, useCallback } from 'react';

interface TextInputProps {
  value: string;
  onChange: (val: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
}

/**
 * Textarea that sends on Enter (Ctrl+Enter / Shift+Enter for newline).
 * Adapts to mobile keyboard via VisualViewport API.
 */
export function TextInput({
  value,
  onChange,
  onSend,
  disabled = false,
  placeholder = '在此输入文字...',
  maxLength = 10 * 1024,
}: TextInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
        e.preventDefault();
        if (value.trim()) {
          onSend();
        }
      }
    },
    [onSend, value],
  );

  // Mobile keyboard: adapt container to VisualViewport
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const handleFocus = () => {
      setTimeout(() => {
        const vv = window.visualViewport;
        if (vv && vv.height < window.innerHeight - 80) {
          textarea.style.height = `${vv.height - 200}px`;
        }
      }, 400);
    };

    const handleBlur = () => {
      textarea.style.height = '';
    };

    textarea.addEventListener('focus', handleFocus);
    textarea.addEventListener('blur', handleBlur);

    return () => {
      textarea.removeEventListener('focus', handleFocus);
      textarea.removeEventListener('blur', handleBlur);
    };
  }, []);

  // Auto-focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="relative flex-1 flex flex-col min-h-0">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          className="flex-1 w-full resize-none rounded-2xl border border-gray-200 dark:border-gray-700
                     bg-white/90 dark:bg-apple-gray-dark/90 backdrop-blur-sm
                     px-4 py-4 text-base leading-relaxed
                     text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500
                     shadow-sm transition-all duration-200
                     focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/20 focus:outline-none
                     disabled:opacity-50
                     scrollbar-thin"
          style={{ minHeight: '100px' }}
        />
      </div>
      {/* Character count */}
      <div className="flex justify-end mt-1.5">
        <span className={`text-xs tabular-nums ${
          value.length > maxLength * 0.9
            ? 'text-apple-orange'
            : 'text-apple-gray dark:text-apple-gray-light'
        }`}>
          {value.length.toLocaleString()} / {maxLength.toLocaleString()}
        </span>
      </div>
    </div>
  );
}
