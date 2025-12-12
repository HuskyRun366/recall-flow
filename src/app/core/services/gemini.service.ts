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

  private extractToonFromResponse(text: string): string {
    // Remove markdown code blocks if present
    let toon = text.trim();
    toon = toon.replace(/^```(?:toon)?\n?/gm, '');
    toon = toon.replace(/\n?```$/gm, '');
    return toon.trim();
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
