'use client';

/**
 * RichEditor — Tiptap-based rich text editor for compose.
 *
 * Toolbar: Bold, Italic, Underline, Strikethrough | Bullet list, Ordered list |
 *          Link | Text color | Font size | Emoji picker | Undo/Redo
 */

import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Color from '@tiptap/extension-color';
import TextStyle from '@tiptap/extension-text-style';
import Placeholder from '@tiptap/extension-placeholder';
import { useState, useCallback } from 'react';

// ─── Toolbar button ───────────────────────────────────────────────────────────

function TBtn({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      disabled={disabled}
      title={title}
      className={`
        w-7 h-7 flex items-center justify-center rounded text-sm transition-colors
        disabled:opacity-30 disabled:cursor-not-allowed
        ${active
          ? 'bg-gray-200 text-gray-900'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }
      `}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-gray-200 mx-0.5 flex-shrink-0" />;
}

// ─── Font size extension (simple via textStyle marks) ────────────────────────

const FONT_SIZES = ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '36px'];

// ─── Emoji picker (simple inline grid) ───────────────────────────────────────

const COMMON_EMOJIS = [
  '😀','😂','😊','😍','🤔','😢','😡','👍','👎','❤️',
  '🎉','🔥','✅','❌','⚠️','📧','📎','🔗','📅','💡',
  '🚀','💼','🏠','📞','💰','📊','🎯','⭐','🌟','👋',
];

function EmojiPicker({ onSelect, onClose }: { onSelect: (e: string) => void; onClose: () => void }) {
  return (
    <div className="absolute bottom-full right-0 mb-1 bg-white border rounded-lg shadow-lg p-2 z-50 w-48">
      <div className="grid grid-cols-10 gap-0.5">
        {COMMON_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => { onSelect(emoji); onClose(); }}
            className="w-6 h-6 flex items-center justify-center text-base hover:bg-gray-100 rounded text-center leading-none"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Toolbar ─────────────────────────────────────────────────────────────────

function Toolbar({ editor }: { editor: Editor | null }) {
  const [showEmoji, setShowEmoji] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  const setLink = useCallback(() => {
    if (!editor) return;
    if (!linkUrl) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange('link')
        .setLink({ href: linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}` })
        .run();
    }
    setLinkUrl('');
    setShowLinkInput(false);
  }, [editor, linkUrl]);

  if (!editor) return null;

  const COLORS = ['#000000','#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899','#6b7280'];

  return (
    <div className="flex items-center gap-0.5 px-2 py-1.5 border-t bg-gray-50 flex-wrap relative">
      {/* Text formatting */}
      <TBtn onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive('bold')} title="Bold (Ctrl+B)">
        <strong>B</strong>
      </TBtn>
      <TBtn onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive('italic')} title="Italic (Ctrl+I)">
        <em>I</em>
      </TBtn>
      <TBtn onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive('underline')} title="Underline (Ctrl+U)">
        <span className="underline">U</span>
      </TBtn>
      <TBtn onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive('strike')} title="Strikethrough">
        <span className="line-through">S</span>
      </TBtn>

      <Divider />

      {/* Lists */}
      <TBtn onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive('bulletList')} title="Bullet list">
        ≡
      </TBtn>
      <TBtn onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive('orderedList')} title="Numbered list">
        ≔
      </TBtn>

      <Divider />

      {/* Link */}
      <div className="relative">
        <TBtn onClick={() => setShowLinkInput(!showLinkInput)}
          active={editor.isActive('link')} title="Insert link">
          🔗
        </TBtn>
        {showLinkInput && (
          <div className="absolute bottom-full left-0 mb-1 bg-white border rounded-lg shadow-lg p-2 z-50 flex gap-1 w-56">
            <input
              autoFocus
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') setLink(); if (e.key === 'Escape') setShowLinkInput(false); }}
              placeholder="https://..."
              className="flex-1 text-xs border rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button type="button" onClick={setLink}
              className="text-xs bg-blue-600 text-white px-2 rounded hover:bg-blue-700">
              OK
            </button>
          </div>
        )}
      </div>

      <Divider />

      {/* Text color */}
      <div className="relative">
        <TBtn onClick={() => setShowColorPicker(!showColorPicker)} title="Text color">
          <span style={{ borderBottom: '3px solid ' + (editor.getAttributes('textStyle').color || '#000') }}>A</span>
        </TBtn>
        {showColorPicker && (
          <div className="absolute bottom-full left-0 mb-1 bg-white border rounded-lg shadow-lg p-2 z-50">
            <div className="flex gap-1 flex-wrap w-28">
              {COLORS.map((c) => (
                <button key={c} type="button"
                  onClick={() => { editor.chain().focus().setColor(c).run(); setShowColorPicker(false); }}
                  className="w-5 h-5 rounded-full border border-gray-200 hover:scale-110 transition-transform"
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
              <button type="button"
                onClick={() => { editor.chain().focus().unsetColor().run(); setShowColorPicker(false); }}
                className="text-xs text-gray-500 hover:text-gray-700 mt-1">
                Reset
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Font size */}
      <select
        onChange={(e) => {
          if (e.target.value) {
            editor.chain().focus().setMark('textStyle', { fontSize: e.target.value }).run();
          }
        }}
        className="text-xs border rounded px-1 py-0.5 bg-white text-gray-600 h-7"
        defaultValue=""
        title="Font size"
      >
        <option value="" disabled>Size</option>
        {FONT_SIZES.map((s) => <option key={s} value={s}>{s.replace('px', '')}</option>)}
      </select>

      <Divider />

      {/* Emoji */}
      <div className="relative">
        <TBtn onClick={() => setShowEmoji(!showEmoji)} title="Emoji">
          😊
        </TBtn>
        {showEmoji && (
          <EmojiPicker
            onSelect={(e) => editor.chain().focus().insertContent(e).run()}
            onClose={() => setShowEmoji(false)}
          />
        )}
      </div>

      <Divider />

      {/* Undo / Redo */}
      <TBtn onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()} title="Undo (Ctrl+Z)">
        ↩
      </TBtn>
      <TBtn onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()} title="Redo (Ctrl+Y)">
        ↪
      </TBtn>
    </div>
  );
}

// ─── RichEditor ───────────────────────────────────────────────────────────────

interface RichEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}

export function RichEditor({ value, onChange, placeholder, autoFocus, className }: RichEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'text-blue-600 underline' } }),
      Color,
      TextStyle,
      Placeholder.configure({ placeholder: placeholder ?? 'Write your message…' }),
    ],
    content: value || '',
    autofocus: autoFocus,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none outline-none min-h-[160px] px-3 py-2 text-sm text-gray-800',
      },
    },
  });

  return (
    <div className={`flex flex-col ${className ?? ''}`}>
      <div className="flex-1 overflow-y-auto">
        <EditorContent editor={editor} />
      </div>
      <Toolbar editor={editor} />
    </div>
  );
}

/**
 * Get plain text from HTML for SMTP text/plain fallback.
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}
