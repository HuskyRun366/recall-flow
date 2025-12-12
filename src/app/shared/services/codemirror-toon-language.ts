import { StreamLanguage } from '@codemirror/language';
import { LanguageSupport } from '@codemirror/language';

/**
 * TOON (Token Oriented Object Notation) language support for CodeMirror
 * Provides syntax highlighting for the custom TOON format used in quiz editing
 */

interface ToonState {
  inString: boolean;
  stringDelimiter?: string;
}

const toonLanguage = StreamLanguage.define<ToonState>({
  startState: () => ({
    inString: false
  }),

  token(stream, state) {
    // Handle strings
    if (state.inString) {
      while (!stream.eol()) {
        if (stream.next() === state.stringDelimiter && stream.peek() !== '\\') {
          state.inString = false;
          state.stringDelimiter = undefined;
          return 'string';
        }
      }
      return 'string';
    }

    // Comments (# to end of line)
    if (stream.match(/#.*$/)) {
      return 'comment';
    }

    // Section headers at start of line
    if (stream.sol()) {
      if (stream.match(/^quiz:/)) {
        return 'keyword';
      }
      if (stream.match(/^questions\[/)) {
        return 'keyword';
      }
      if (stream.match(/^options\[/)) {
        return 'keyword';
      }
      if (stream.match(/^orderItems\[/)) {
        return 'keyword';
      }
      if (stream.match(/^matchingChoices\[/)) {
        return 'keyword';
      }
      if (stream.match(/^matchingPairs\[/)) {
        return 'keyword';
      }
    }

    // Array indices [123]
    if (stream.match(/\[\d+\]/)) {
      return 'number';
    }

    // Field schemas {orderIndex,type,questionText}
    if (stream.match(/\{[^}]+\}/)) {
      return 'type';
    }

    // Property keys (indented word followed by colon)
    if (stream.match(/^\s+\w+:/)) {
      return 'propertyName';
    }

    // Strings in quotes
    if (stream.match(/^"/)) {
      state.inString = true;
      state.stringDelimiter = '"';
      return 'string';
    }

    // Booleans
    if (stream.match(/\b(true|false)\b/)) {
      return 'bool';
    }

    // Commas
    if (stream.match(/,/)) {
      return 'punctuation';
    }

    // Colons (not after property keys)
    if (stream.match(/:/)) {
      return 'punctuation';
    }

    // Numbers (standalone)
    if (stream.match(/\b\d+\b/)) {
      return 'number';
    }

    // Move forward if no match
    stream.next();
    return null;
  }
});

/**
 * Returns a LanguageSupport instance for TOON language
 */
export function toonLanguageSupport(): LanguageSupport {
  return new LanguageSupport(toonLanguage);
}
