import { Injectable } from '@angular/core';
import { Extension } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { bracketMatching, foldGutter, foldKeymap, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { autocompletion, acceptCompletion } from '@codemirror/autocomplete';
import { html, htmlLanguage } from '@codemirror/lang-html';

/**
 * CodeMirror configuration service for HTML editor
 * Provides editor extensions and configuration for editing HTML content
 */
@Injectable({
  providedIn: 'root'
})
export class CodeMirrorHtmlConfigService {

  /**
   * Get all editor extensions for the HTML editor
   * @param isDark - Whether to use dark theme
   * @param onChange - Callback for content changes
   * @returns Array of CodeMirror extensions
   */
  getEditorExtensions(isDark: boolean, onChange: (content: string) => void): Extension[] {
    return [
      // Basic editing features
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      history(),
      foldGutter(),
      bracketMatching(),

      // Search functionality
      highlightSelectionMatches(),

      // Keymaps
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...searchKeymap,
        { key: 'Tab', run: acceptCompletion, preventDefault: true }
      ]),

      // HTML language support with syntax highlighting
      html({ matchClosingTags: true, autoCloseTags: true }),

      // Default syntax highlighting
      syntaxHighlighting(defaultHighlightStyle),

      // Autocomplete
      autocompletion(),

      // Theme (light or dark)
      this.getTheme(isDark),

      // Change listener
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChange(update.state.doc.toString());
        }
      }),

      // Editor appearance options
      EditorView.lineWrapping,

      // Editor styles
      EditorView.theme({
        '&': {
          fontSize: '14px',
          height: '100%'
        },
        '.cm-scroller': {
          overflow: 'auto',
          fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'source-code-pro', monospace"
        },
        '&.cm-focused': {
          outline: 'none'
        }
      })
    ];
  }

  /**
   * Get theme extension based on dark mode setting
   */
  private getTheme(isDark: boolean): Extension {
    if (isDark) {
      return EditorView.theme({
        '&': {
          backgroundColor: '#1a1a1a',
          color: '#e0e0e0'
        },
        '.cm-content': {
          caretColor: '#fff'
        },
        '.cm-cursor': {
          borderLeftColor: '#fff'
        },
        '.cm-activeLine': {
          backgroundColor: 'rgba(255,255,255,0.05)'
        },
        '.cm-activeLineGutter': {
          backgroundColor: 'rgba(255,255,255,0.05)'
        },
        '.cm-selectionBackground, ::selection': {
          backgroundColor: 'rgba(99, 102, 241, 0.3) !important'
        },
        '.cm-gutters': {
          backgroundColor: '#1a1a1a',
          color: '#666',
          border: 'none'
        },
        '.cm-lineNumbers .cm-gutterElement': {
          color: '#666'
        },
        '.cm-foldGutter .cm-gutterElement': {
          color: '#666'
        }
      }, { dark: true });
    } else {
      return EditorView.theme({
        '&': {
          backgroundColor: '#ffffff',
          color: '#1a1a1a'
        },
        '.cm-content': {
          caretColor: '#000'
        },
        '.cm-cursor': {
          borderLeftColor: '#000'
        },
        '.cm-activeLine': {
          backgroundColor: 'rgba(0,0,0,0.03)'
        },
        '.cm-activeLineGutter': {
          backgroundColor: 'rgba(0,0,0,0.03)'
        },
        '.cm-selectionBackground, ::selection': {
          backgroundColor: 'rgba(99, 102, 241, 0.2) !important'
        },
        '.cm-gutters': {
          backgroundColor: '#f8f8f8',
          color: '#999',
          border: 'none'
        },
        '.cm-lineNumbers .cm-gutterElement': {
          color: '#999'
        },
        '.cm-foldGutter .cm-gutterElement': {
          color: '#999'
        }
      }, { dark: false });
    }
  }
}
