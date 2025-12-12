import { EditorView } from '@codemirror/view';
import { Extension } from '@codemirror/state';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

/**
 * TOON Light Theme - matches Monaco 'vs' base theme
 */
export const toonLightTheme = EditorView.theme({
  '&': {
    color: '#000000',
    backgroundColor: '#ffffff'
  },
  '.cm-content': {
    caretColor: '#000000',
    fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'source-code-pro', monospace"
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: '#000000'
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: '#add6ff'
  },
  '.cm-activeLine': {
    backgroundColor: '#f3f3f3'
  },
  '.cm-gutters': {
    backgroundColor: '#f5f5f5',
    color: '#237893',
    border: 'none'
  },
  '.cm-activeLineGutter': {
    backgroundColor: '#e8e8e8'
  },
  '.cm-lineNumbers .cm-gutterElement': {
    minWidth: '40px',
    paddingRight: '8px'
  }
}, { dark: false });

/**
 * TOON Light Syntax Highlighting
 * Colors match Monaco toon-light theme exactly
 */
export const toonLightHighlight = syntaxHighlighting(HighlightStyle.define([
  { tag: tags.keyword, color: '#0000FF', fontWeight: 'bold' }, // quiz:, questions[
  { tag: tags.number, color: '#098658' }, // [0], [123]
  { tag: tags.typeName, color: '#267f99' }, // {orderIndex,type}
  { tag: tags.propertyName, color: '#001080' }, // title:, description:
  { tag: tags.string, color: '#A31515' }, // "My Quiz"
  { tag: tags.bool, color: '#0000FF' }, // true, false
  { tag: tags.comment, color: '#008000', fontStyle: 'italic' }, // # comments
  { tag: tags.separator, color: '#000000' } // , :
]));

/**
 * TOON Dark Theme - matches Monaco 'vs-dark' base theme
 */
export const toonDarkTheme = EditorView.theme({
  '&': {
    color: '#d4d4d4',
    backgroundColor: '#1e1e1e'
  },
  '.cm-content': {
    caretColor: '#ffffff',
    fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'source-code-pro', monospace"
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: '#ffffff'
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: '#264f78'
  },
  '.cm-activeLine': {
    backgroundColor: '#2a2a2a'
  },
  '.cm-gutters': {
    backgroundColor: '#252526',
    color: '#858585',
    border: 'none'
  },
  '.cm-activeLineGutter': {
    backgroundColor: '#2a2a2a'
  },
  '.cm-lineNumbers .cm-gutterElement': {
    minWidth: '40px',
    paddingRight: '8px'
  }
}, { dark: true });

/**
 * TOON Dark Syntax Highlighting
 * Colors match Monaco toon-dark theme exactly
 */
export const toonDarkHighlight = syntaxHighlighting(HighlightStyle.define([
  { tag: tags.keyword, color: '#569CD6', fontWeight: 'bold' }, // quiz:, questions[
  { tag: tags.number, color: '#B5CEA8' }, // [0], [123]
  { tag: tags.typeName, color: '#4EC9B0' }, // {orderIndex,type}
  { tag: tags.propertyName, color: '#9CDCFE' }, // title:, description:
  { tag: tags.string, color: '#CE9178' }, // "My Quiz"
  { tag: tags.bool, color: '#569CD6' }, // true, false
  { tag: tags.comment, color: '#6A9955', fontStyle: 'italic' }, // # comments
  { tag: tags.separator, color: '#d4d4d4' } // , :
]));

/**
 * Returns the appropriate theme extensions based on dark mode
 * @param isDark - Whether to use dark theme
 * @returns Array of theme extensions
 */
export function getToonTheme(isDark: boolean): Extension[] {
  return isDark
    ? [toonDarkTheme, toonDarkHighlight]
    : [toonLightTheme, toonLightHighlight];
}
