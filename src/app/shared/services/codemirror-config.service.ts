import { Injectable } from '@angular/core';
import { Extension } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightActiveLine, hoverTooltip } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { bracketMatching, foldGutter, foldKeymap, syntaxHighlighting, HighlightStyle, foldService } from '@codemirror/language';
import { linter } from '@codemirror/lint';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { autocompletion, Completion, CompletionContext, acceptCompletion } from '@codemirror/autocomplete';
import { tags as t } from '@lezer/highlight';
import { toonLanguageSupport } from './codemirror-toon-language';
import { getToonTheme } from './codemirror-toon-themes';
import { toonLinter } from './codemirror-toon-linter';

/**
 * CodeMirror configuration service for TOON editor
 * Provides editor extensions and configuration
 */
@Injectable({
  providedIn: 'root'
})
export class CodeMirrorConfigService {

  /**
   * Get all editor extensions for the TOON editor
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
      foldService.of(toonFoldRange),
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

      // TOON language support with syntax highlighting
      toonLanguageSupport(),

      // Syntax highlighting overrides for TOON tokens
      syntaxHighlighting(toonHighlightStyle),

      // Autocomplete with TOON keywords/fields
      autocompletion({ override: [toonCompletionSource] }),

      // Hover tooltips for field hints
      hoverTooltip(toonHoverTooltip, { hideOnChange: true }),

      // Linting with 500ms debounce (matches Monaco behavior)
      linter(toonLinter, { delay: 500 }),

      // Theme (light or dark)
      ...getToonTheme(isDark),

      // Change listener for parsing
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChange(update.state.doc.toString());
        }
      }),

      // Editor appearance options
      EditorView.lineWrapping, // Word wrap

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
}

// --- Autocomplete ---
const baseCompletions: Completion[] = [
  { label: 'title', type: 'property', apply: 'title: Demo' },
  { label: 'description', type: 'property', apply: 'description: ' },
  { label: 'visibility', type: 'property', apply: 'visibility: public' },
  { label: 'tags', type: 'property', apply: 'tags: []' },
  { label: 'questions[0]', type: 'property', apply: 'questions[0]{orderIndex,type,questionText}:' },
  { label: 'options[0]', type: 'property', apply: 'options[0]{questionIndex,text,isCorrect}:' },
  { label: 'orderItems[0]', type: 'property', apply: 'orderItems[0]{questionIndex,text,correctOrder}:' },
  { label: 'matchingChoices[0]', type: 'property', apply: 'matchingChoices[0]{questionIndex,text}:' },
  { label: 'matchingPairs[0]', type: 'property', apply: 'matchingPairs[0]{questionIndex,leftText,correctChoiceIndex}:' },
  { label: 'isCorrect', type: 'property', apply: 'isCorrect: false' },
  { label: 'correctOrder', type: 'property', apply: 'correctOrder: 0' },
  { label: 'correctChoiceIndex', type: 'property', apply: 'correctChoiceIndex: 0' },
  { label: 'questionText', type: 'property', apply: 'questionText: text' },
  { label: 'type', type: 'property', apply: 'type: multiple-choice' },
  { label: 'multiple-choice', type: 'keyword' },
  { label: 'ordering', type: 'keyword' },
  { label: 'matching', type: 'keyword' },
  { label: 'true', type: 'keyword' },
  { label: 'false', type: 'keyword' },
  { label: 'public', type: 'keyword' },
  { label: 'private', type: 'keyword' },
  { label: 'unlisted', type: 'keyword' },
];

function toonCompletionSource(context: CompletionContext) {
  const word = context.matchBefore(/[\w\[\]-]+/);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  return {
    from: word.from,
    options: baseCompletions,
    validFor: /[\w\[\]-]*/
  };
}

// --- Hover tooltips ---
const hoverHints: Record<string, string> = {
  visibility: 'public | private | unlisted',
  title: 'Titel des Quizzes',
  description: 'Kurzbeschreibung, optional',
  tags: 'Liste von Schlagwörtern',
  type: 'multiple-choice | ordering | matching',
  questionText: 'Fragetext',
  options: 'Antwortoptionen für Multiple-Choice',
  orderItems: 'Zu sortierende Elemente',
  correctOrder: 'Index der korrekten Position (0-basiert)',
  isCorrect: 'true, wenn diese Option richtig ist',
  questions: 'Liste der Fragen im Quiz',
  orderIndex: 'Position der Frage im Quiz (0-basiert)',
  questionIndex: 'Index der Frage, zu welchem Quiz diese Option/Item gehört',
  matchingChoices: 'Dropdown-Auswahlmöglichkeiten für Matching-Fragen',
  matchingPairs: 'Links stehende Texte mit erwarteter Auswahl',
  leftText: 'Text, der einer Auswahl zugeordnet werden soll',
  correctChoiceIndex: 'Index der korrekten Auswahl innerhalb matchingChoices (0-basiert)',
};

function toonHoverTooltip(view: EditorView, pos: number) {
  const line = view.state.doc.lineAt(pos);
  const text = line.text;
  const rel = pos - line.from;

  // Find the word under the cursor
  let key: string | null = null;
  const wordRegex = /[A-Za-z][A-Za-z0-9_-]*/g;
  let match: RegExpExecArray | null;
  while ((match = wordRegex.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (rel >= start && rel <= end) {
      // Only show tooltip if this word is a property key followed by ':'
      const rest = text.slice(end).trimStart();
      if (rest.startsWith(':') || rest.startsWith('[') || rest.startsWith('}') || rest.startsWith(',')) {
        key = match[0];
      }
      break;
    }
  }

  if (!key) return null;
  const hint = hoverHints[key];
  if (!hint) return null;
  const from = line.from + (match ? match.index : rel);
  const to = from + key.length;
  return {
    pos: from,
    end: to,
    above: true,
    create() {
      const dom = document.createElement('div');
      dom.className = 'cm-toon-tooltip';
      dom.textContent = hint;
      return { dom };
    }
  };
}

// --- Highlighting ---
// Atom One Dark inspired palette
const toonHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: '#c678dd', fontWeight: '700' }, // purple
  { tag: t.propertyName, color: '#56b6c2' },               // cyan
  { tag: t.variableName, color: '#e06c75' },               // red-ish
  { tag: t.string, color: '#98c379' },                     // green
  { tag: t.number, color: '#d19a66' },                     // orange
  { tag: t.bool, color: '#e5c07b', fontWeight: '700' },    // yellow-gold
  { tag: t.comment, color: '#5c6370', fontStyle: 'italic' },
  { tag: t.punctuation, color: '#abb2bf' },                // default fg
  { tag: t.operator, color: '#61afef' },                   // blue
  { tag: t.bracket, color: '#abb2bf' }
]);

// --- Folding helper (indent-based) ---
function toonFoldRange(state: any, pos: number) {
  const line = state.doc.lineAt(pos);
  const indent = leadingSpaces(line.text);
  if (line.text.trim() === '') return null;

  let end = line.to;
  for (let ln = line.number + 1; ln <= state.doc.lines; ln++) {
    const next = state.doc.line(ln);
    const nextIndent = leadingSpaces(next.text);
    if (next.text.trim() === '') continue;
    if (nextIndent <= indent) break;
    end = next.to;
  }

  if (end > line.to) {
    return { from: line.to, to: end };
  }
  return null;
}

function leadingSpaces(text: string): number {
  let i = 0;
  while (i < text.length && text[i] === ' ') i++;
  return i;
}
