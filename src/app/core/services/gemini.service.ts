import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class GeminiService {
  private genAI: GoogleGenerativeAI;

  constructor() {
    this.genAI = new GoogleGenerativeAI(environment.gemini.apiKey);
  }

  generateQuizFromFiles(
    files: Array<{ data: string; mimeType: string }>,
    questionCount: number = 7,
    multipleChoicePercent: number = 70,
    orderingPercent: number = 30,
    matchingPercent: number = 0,
    teacherStyle: 'relaxed' | 'balanced' | 'demanding' | 'strict' = 'balanced'
  ): Observable<string> {
    return from(this.generateQuizInternal(files, questionCount, multipleChoicePercent, orderingPercent, matchingPercent, teacherStyle)).pipe(
      map(response => {
        const toon = this.extractToonFromResponse(response);
        return toon;
      }),
      catchError(error => {
        console.error('Gemini API Error:', error);
        throw new Error(this.formatErrorMessage(error));
      })
    );
  }

  generateLearningMaterialFromFiles(
    files: Array<{ data: string; mimeType: string }>,
    sectionCount: number | null = null,
    interactivityLevel: 'low' | 'medium' | 'high' = 'medium',
    style: 'concise' | 'balanced' | 'detailed' = 'balanced'
  ): Observable<{ title: string; description: string; html: string }> {
    return from(this.generateLearningMaterialInternal(files, sectionCount, interactivityLevel, style)).pipe(
      map(response => {
        return this.parseMaterialResponse(response);
      }),
      catchError(error => {
        console.error('Gemini API Error:', error);
        throw new Error(this.formatErrorMessage(error));
      })
    );
  }

  getQuizPrompt(
    questionCount: number = 7,
    multipleChoicePercent: number = 70,
    orderingPercent: number = 30,
    matchingPercent: number = 0,
    teacherStyle: 'relaxed' | 'balanced' | 'demanding' | 'strict' = 'balanced'
  ): string {
    return this.buildQuizPrompt(questionCount, multipleChoicePercent, orderingPercent, matchingPercent, teacherStyle);
  }

  getMaterialPrompt(
    sectionCount: number | null = null,
    interactivityLevel: 'low' | 'medium' | 'high' = 'medium',
    style: 'concise' | 'balanced' | 'detailed' = 'balanced'
  ): string {
    return this.buildMaterialPrompt(sectionCount, interactivityLevel, style);
  }

  private async generateQuizInternal(
    files: Array<{ data: string; mimeType: string }>,
    questionCount: number,
    multipleChoicePercent: number,
    orderingPercent: number,
    matchingPercent: number,
    teacherStyle: 'relaxed' | 'balanced' | 'demanding' | 'strict'
  ): Promise<string> {
    const prompt = this.buildQuizPrompt(questionCount, multipleChoicePercent, orderingPercent, matchingPercent, teacherStyle);

    // Build parts array with prompt and files
    const parts: Array<any> = [{ text: prompt }];

    for (const file of files) {
      parts.push({
        inlineData: {
          mimeType: file.mimeType,
          data: file.data
        }
      });
    }

    // Single-model call (flash)
    return await this.generateWithModel(environment.gemini.model || 'gemini-2.5-flash', parts);
  }

  private async generateLearningMaterialInternal(
    files: Array<{ data: string; mimeType: string }>,
    sectionCount: number | null,
    interactivityLevel: 'low' | 'medium' | 'high',
    style: 'concise' | 'balanced' | 'detailed'
  ): Promise<string> {
    const prompt = this.buildMaterialPrompt(sectionCount, interactivityLevel, style);

    const parts: Array<any> = [{ text: prompt }];

    for (const file of files) {
      parts.push({
        inlineData: {
          mimeType: file.mimeType,
          data: file.data
        }
      });
    }

    return await this.generateWithModel(environment.gemini.model || 'gemini-2.5-flash', parts);
  }

  private async generateWithModel(modelName: string, parts: Array<any>): Promise<string> {
    const model = this.genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: environment.gemini.maxOutputTokens ?? 25000,
      }
    });

    const result = await model.generateContent(parts);
    const response = await result.response;
    return response.text();
  }

  private isQuotaError(error: any): boolean {
    const errorMessage = error?.message?.toLowerCase() || '';
    const errorString = JSON.stringify(error).toLowerCase();

    // Check for various quota/rate limit error indicators
    return errorMessage.includes('quota') ||
           errorMessage.includes('rate limit') ||
           errorMessage.includes('resource exhausted') ||
           errorMessage.includes('429') ||
           errorString.includes('quota') ||
           errorString.includes('rate_limit') ||
           error?.status === 429;
  }

  private getTeacherStyleInstruction(style: 'relaxed' | 'balanced' | 'demanding' | 'strict'): string {
    const styles = {
      relaxed: `TEACHING STYLE: Relaxed/Easy
- Ask simple, straightforward questions that test basic understanding
- Use clear, simple language without technical jargon
- Focus on main concepts and key takeaways
- Provide obvious wrong answers that are clearly incorrect
- Questions should be answerable with surface-level knowledge of the material`,

      balanced: `TEACHING STYLE: Balanced/Moderate
- Ask questions that test solid understanding of the material
- Mix easy and moderate difficulty questions
- Use appropriate terminology from the material
- Include some questions that require connecting concepts
- Wrong answers should be plausible but distinguishable`,

      demanding: `TEACHING STYLE: Demanding/Challenging
- Ask detailed questions that test thorough understanding
- Include questions about specific details and nuances
- Use precise terminology and expect accurate knowledge
- Some questions should require deeper analysis
- Wrong answers should be plausible and require careful consideration`,

      strict: `TEACHING STYLE: Strict/Expert-Level
- Ask precise, detail-oriented questions that test mastery
- Include questions about subtle distinctions and edge cases
- Require exact knowledge of definitions, processes, and relationships
- Wrong answers should be very close to correct (common misconceptions)
- Questions should challenge even well-prepared students`
    };
    return styles[style];
  }

  private buildQuizPrompt(
    questionCount: number,
    multipleChoicePercent: number,
    orderingPercent: number,
    matchingPercent: number,
    teacherStyle: 'relaxed' | 'balanced' | 'demanding' | 'strict'
  ): string {
    const styleInstruction = this.getTeacherStyleInstruction(teacherStyle);

    return `You are a quiz generation expert. Analyze the provided images/PDFs and create a comprehensive quiz in TOON format.

${styleInstruction}

CRITICAL RULE - READ THIS FIRST:
EVERY multiple-choice question MUST have AT LEAST ONE correct option (isCorrect=true) and the rest false.
If you forget to mark any option as true, the quiz will be INVALID and REJECTED.

TOON FORMAT SPECIFICATION:
The quiz must be in this EXACT format with proper array headers:

quiz:
  title: [Descriptive title based on content]
  description: [Brief description of what the quiz covers]
  visibility: private

questions[N]{orderIndex,type,questionText}:
  0,multiple-choice,What is X?
  1,ordering,Order the following steps
  2,matching,Match each term to the correct definition

options[M]{questionIndex,text,isCorrect}:
  0,Option 1,true
  0,Option 2,false
  0,Option 3,false
  0,Option 4,false

matchingChoices[L]{questionIndex,text}:
  2,Definition A
  2,Definition B

matchingPairs[P]{questionIndex,leftText,correctChoiceIndex}:
  2,Term 1,0
  2,Term 2,1

orderItems[K]{questionIndex,text,correctOrder}:
  1,First step,0
  1,Second step,1

CRITICAL ARRAY HEADER FORMAT:
- questions[N]{orderIndex,type,questionText}: where N is the total count of questions
- options[M]{questionIndex,text,isCorrect}: where M is the total count of options
- orderItems[K]{questionIndex,text,correctOrder}: where K is the total count of order items
- matchingChoices[L]{questionIndex,text}: where L is the total count of dropdown options for matching questions
- matchingPairs[P]{questionIndex,leftText,correctChoiceIndex}: where P is the total count of matching pairs
- You MUST include the count [N], [M], [K] and field names {field1,field2,field3}
- Example: If you have 5 questions, write "questions[5]{orderIndex,type,questionText}:"
- Example: If you have 12 options, write "options[12]{questionIndex,text,isCorrect}:"

REQUIREMENTS:
1. Generate EXACTLY ${questionCount} questions (not more, not less)
2. Question type distribution: ${multipleChoicePercent}% multiple-choice, ${orderingPercent}% ordering, ${matchingPercent}% matching
3. CRITICAL: Each multiple-choice question MUST have 3-4 options where:
   - AT LEAST ONE option has isCorrect=true (mark the correct answers)
   - NEVER have zero options with isCorrect=true
4. Each ordering question must have 3-5 items to order with correctOrder values 0,1,2,3,4
5. Each matching question must have:
   - A shared dropdown list (matchingChoices) with 3-5 entries
   - 2-5 pairs (leftText + correctChoiceIndex)
   - correctChoiceIndex references the zero-based index in matchingChoices for that question
6. Questions should cover key concepts from the material
7. Use clear, concise language
8. For images: analyze text, diagrams, charts, and visual information
9. For PDFs: extract and understand all textual and visual content
10. Title should be descriptive (e.g., "Biology Chapter 3 Quiz" not "Quiz")
11. Description should summarize the topic (1-2 sentences)
12. Set visibility to "private" by default
13. IMPORTANT: Detect the language of the provided documents and generate ALL quiz content (title, description, questions, options) in that SAME language. If the document is in German, write everything in German. If in Hungarian, write in Hungarian, etc.

CRITICAL FORMAT RULES FOR OPTIONS:
- For EVERY multiple-choice question (questionIndex=0,1,2, etc.):
  - You MUST provide 3-4 options
  - AT LEAST ONE option MUST have isCorrect=true 
  - ALL others MUST have isCorrect=false
- Example for question 0 (single correct):
  0,First option,false
  0,Second option,true
  0,Third option,false
  0,Fourth option,false
- Example for question 1 (two correct allowed):
  1,First option,true
  1,Second option,false
  1,Third option,true
  1,Fourth option,false

CRITICAL FORMAT RULES FOR ARRAYS:
- ALWAYS include array headers with counts and field names
- Array header format: arrayName[count]{field1,field2,field3}:
- Questions array header: questions[N]{orderIndex,type,questionText}:
- Options array header: options[M]{questionIndex,text,isCorrect}:
- OrderItems array header: orderItems[K]{questionIndex,text,correctOrder}:
- MatchingChoices header: matchingChoices[L]{questionIndex,text}:
- MatchingPairs header: matchingPairs[P]{questionIndex,leftText,correctChoiceIndex}:
- Questions data: orderIndex,type,questionText (comma-separated)
- Options data: questionIndex,text,isCorrect (comma-separated, use "true"/"false")
- OrderItems data: questionIndex,text,correctOrder (comma-separated)
- MatchingChoices data: questionIndex,text (comma-separated)
- MatchingPairs data: questionIndex,leftText,correctChoiceIndex (comma-separated, correctChoiceIndex is 0-based)
- STRING SAFETY (ALWAYS): Wrap EVERY free-text field except the title and description in double quotes, even if it has no punctuation. This applies to questionText, option text, orderItems text, matchingChoices text, and matchingPairs leftText. Escape internal quotes by doubling them, e.g., "She said ""Hi""." 
- No extra whitespace in data rows
- 2-space indentation for metadata (title, description, visibility)
- NEVER omit the [count] or {fieldNames} from array headers
- Title and description never need quotes

COMPLETE EXAMPLE (Copy this structure exactly):
quiz:
  title: Math Basics Quiz
  description: Test your basic math knowledge
  visibility: private

questions[3]{orderIndex,type,questionText}:
  0,multiple-choice,What is 2 + 2?
  1,multiple-choice,What is 5 - 3?
  2,ordering,Order these numbers from smallest to largest

options[8]{questionIndex,text,isCorrect}:
  0,3,false
  0,4,true
  0,5,false
  0,6,false
  1,1,false
  1,2,true
  1,3,true
  1,4,false

orderItems[3]{questionIndex,text,correctOrder}:
  2,1,0
  2,5,1
  2,10,2

WRONG EXAMPLE (DO NOT DO THIS):
options[4]{questionIndex,text,isCorrect}:
  0,3,false
  0,4,false    <- WRONG: No option is marked as true!
  0,5,false
  0,6,false

Generate ONLY the TOON format output following this exact structure. Do not include explanations, markdown code blocks, or any other text.`;
  }

  private buildMaterialPrompt(
    sectionCount: number | null,
    interactivityLevel: 'low' | 'medium' | 'high',
    style: 'concise' | 'balanced' | 'detailed'
  ): string {
    const sectionRule = typeof sectionCount === 'number'
      ? `Generate exactly ${sectionCount} main sections with clear headings.`
      : 'Decide an appropriate number of main sections (between 3 and 12) based on the material.';
    const layoutRule = typeof sectionCount === 'number'
      ? `Layout: add a hero header, an overview/summary block, then the ${sectionCount} sections. Use consistent spacing and section anchors.`
      : 'Layout: add a hero header, an overview/summary block, then the main sections you decided on. Use consistent spacing and section anchors.';

    return `You are an instructional designer. Analyze the provided images/PDFs and create an interactive learning material.

OUTPUT FORMAT (strict, no markdown/code fences):
---TITLE---
<title text>
---DESCRIPTION---
<short description>
---HTML---
<!DOCTYPE html>...full HTML document...

CONTENT RULES:
1. ${sectionRule}
2. Match the language of the source documents (German input -> German output).
3. Include a short summary and a \"Key takeaways\" section.
4. Interactivity level: ${interactivityLevel}.
   - low: collapsible sections + glossary tooltips.
   - medium: add flashcards + quick check questions.
   - high: add flashcards + quick quiz + progress tracker.
5. Style mode: ${style}.
   - concise: short explanations, bullet points.
   - balanced: mix of explanations and bullets.
   - detailed: richer explanations and examples.
6. Visual direction: data-centric learning sheet (clean grid, clear typographic hierarchy, compact summary cards, styled tables, callouts, and visual separators). Prefer structured tables/diagrams if the source contains systematic lists or comparisons.
7. ${layoutRule}
8. HTML must be self-contained with inline CSS/JS. You may include ONE optional JS library via CDN only if it clearly improves understanding (e.g., Chart.js for charts). No external fonts, no iframes, no tracking scripts.
9. If you use a library, provide a text fallback and keep datasets small.
10. Use CSS variables for theming: --bg, --text, --surface, --border. Use them in your styles (gradients allowed).
11. Ensure the HTML stays under ~200KB and avoids heavy inline data.
12. The HTML must be safe for sandboxed iframes (no top-level navigation, no window.open).
13. Accessibility: semantic headings, buttons with aria-labels, high contrast for text, and keyboard-friendly interactions.

Return ONLY the specified format.`;
  }

  private extractToonFromResponse(text: string): string {
    // Remove markdown code blocks if present
    let toon = text.trim();
    toon = toon.replace(/^```(?:toon)?\n?/gm, '');
    toon = toon.replace(/\n?```$/gm, '');
    return toon.trim();
  }

  private parseMaterialResponse(text: string): { title: string; description: string; html: string } {
    const cleaned = this.stripCodeFences(text);
    const titleMarker = '---TITLE---';
    const descMarker = '---DESCRIPTION---';
    const htmlMarker = '---HTML---';

    const titleIndex = cleaned.indexOf(titleMarker);
    const descIndex = cleaned.indexOf(descMarker);
    const htmlIndex = cleaned.indexOf(htmlMarker);

    if (titleIndex !== -1 && descIndex !== -1 && htmlIndex !== -1) {
      const title = cleaned.slice(titleIndex + titleMarker.length, descIndex).trim();
      const description = cleaned.slice(descIndex + descMarker.length, htmlIndex).trim();
      const html = cleaned.slice(htmlIndex + htmlMarker.length).trim();

      if (!title || !html) {
        throw new Error('Invalid material response');
      }

      return { title, description, html };
    }

    const jsonText = this.extractJsonFromResponse(cleaned);
    const data = JSON.parse(jsonText) as { title?: string; description?: string; html?: string };

    if (!data?.title || !data?.html) {
      throw new Error('Invalid material response');
    }

    return {
      title: data.title,
      description: data.description ?? '',
      html: data.html
    };
  }

  private extractJsonFromResponse(text: string): string {
    const cleaned = this.stripCodeFences(text).trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('No JSON object found in response');
    }
    return cleaned.slice(start, end + 1);
  }

  private stripCodeFences(text: string): string {
    let cleaned = text.trim();
    cleaned = cleaned.replace(/^```(?:json|html|text)?\n?/gm, '');
    cleaned = cleaned.replace(/\n?```$/gm, '');
    return cleaned.trim();
  }

  private formatErrorMessage(error: any): string {
    if (error.message?.includes('API_KEY_INVALID')) {
      return 'API-Schlüssel ungültig. Bitte Konfiguration prüfen.';
    }
    if (this.isQuotaError(error)) {
      return 'Quota-Limit erreicht. Das System hat automatisch versucht, auf Gemini 2.5 Flash zu wechseln, aber beide Modelle sind derzeit nicht verfügbar. Bitte versuchen Sie es später erneut.';
    }
    if (error.message) {
      return `Gemini API Fehler: ${error.message}`;
    }
    return 'Fehler bei der Quiz-Generierung. Bitte versuchen Sie es erneut.';
  }
}
