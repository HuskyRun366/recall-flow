import { Diagnostic } from '@codemirror/lint';
import { EditorView } from '@codemirror/view';
import { ToonParser } from '../utils/toon-parser';

/**
 * TOON linter for CodeMirror
 * Parses TOON content and provides inline error diagnostics
 */

/**
 * Linter function that validates TOON content and returns diagnostics
 * @param view - The CodeMirror editor view
 * @returns Array of diagnostics (errors)
 */
export function toonLinter(view: EditorView): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const doc = view.state.doc;
  const content = doc.toString();

  // Don't lint empty content
  if (!content.trim()) {
    return diagnostics;
  }

  try {
    // Attempt to parse the TOON content
    ToonParser.parse(content);
  } catch (error: any) {
    // Parse error - convert to diagnostic
    const diagnostic = parseErrorToDiagnostic(error.message, doc);
    if (diagnostic) {
      diagnostics.push(diagnostic);
    }
  }

  return diagnostics;
}

/**
 * Convert a ToonParser error message to a CodeMirror Diagnostic
 * @param errorMsg - Error message from ToonParser
 * @param doc - The CodeMirror document
 * @returns Diagnostic object or null
 */
function parseErrorToDiagnostic(errorMsg: string, doc: any): Diagnostic | null {
  // Extract line number from error message (format: "Line X: Error message")
  const lineMatch = errorMsg.match(/^Line (\d+):/);

  if (lineMatch) {
    const lineNum = parseInt(lineMatch[1], 10);

    // Validate line number is within document bounds
    if (lineNum > 0 && lineNum <= doc.lines) {
      const line = doc.line(lineNum);

      return {
        from: line.from,
        to: line.to,
        severity: 'error',
        message: errorMsg.replace(/^Line \d+:\s*/, '') // Remove "Line X:" prefix from message
      };
    }
  }

  // Fallback: If no line number or invalid line number, highlight the first line
  if (doc.lines > 0) {
    const firstLine = doc.line(1);
    return {
      from: firstLine.from,
      to: firstLine.to,
      severity: 'error',
      message: errorMsg
    };
  }

  return null;
}
