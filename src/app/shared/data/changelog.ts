export interface ChangelogEntry {
  version: string;         // z.B. "1.2.0"
  date: Date;              // Release-Datum
  title: string;           // Kurzer Titel
  description?: string;    // Optional: Längere Beschreibung
  changes: ChangelogItem[];
}

export interface ChangelogItem {
  type: 'feature' | 'bugfix' | 'improvement' | 'breaking';
  text: string;
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '2.2',
    date: new Date('2025-12-18'),
    title: 'Custom Themes & Settings Verbesserungen',
    changes: [
      { type: 'feature', text: 'Neue Farb-Themes in den Einstellungen: Presets, eigene Themes, Marketplace sowie Import/Export als JSON' },
      { type: 'improvement', text: 'Theme-Farben wirken jetzt app-weit inkl. Gradients und besserer Lesbarkeit auf Buttons & Highlights' },
      { type: 'improvement', text: 'Theme-Bereich in den Einstellungen ist einklappbar (kompakte Vorschau)' },
      { type: 'improvement', text: 'Sprach-Auswahl wurde aus dem Header in die Einstellungen verschoben' },
      { type: 'bugfix', text: 'Fix: verbuggtes Theme-Icon im Settings-Header' }
    ]
  },
  {
    version: '2.1',
    date: new Date('2025-12-17'),
    title: 'Materials Integration & Viewer Fixes',
    changes: [
      { type: 'feature', text: 'Add "Material" as sub-section of Lernen with navigation link and quick access' },
      { type: 'improvement', text: 'Add multi-action FAB in Lernen (create Flashcards/Decks and Materials)' },
      { type: 'bugfix', text: 'Fix Firestore participant writes failing when invitedBy is undefined' },
      { type: 'bugfix', text: 'Fix Material Viewer layout so embedded HTML fills the available height (no more tiny scroll strip)' },
      { type: 'improvement', text: 'Material Viewer now preserves interactive JavaScript and only applies theme sync when supported by the HTML' },
      { type: 'improvement', text: 'Show a one-time safety warning when opening public/unlisted learning materials' },
      { type: 'improvement', text: 'Harden material iframes by removing allow-same-origin (Viewer + Editor preview)' },
      { type: 'bugfix', text: 'Restore scroll position properly on navigation (prevents “black bar” when opening viewer pages)' },
      { type: 'improvement', text: 'Replace flashy mode transitions with subtle slide animations for a more business-like feel' },
      { type: 'improvement', text: 'Restructure Quiz routes under /quiz for consistency with Lernen (legacy URLs redirect)' }
    ]
  },
  {
    version: '2.0',
    date: new Date('2025-12-13'),
    title: 'Lern & Flashcard-System',
    changes: [
      { type: 'feature', text: 'Introduce Lern & Flashcard-System for enhanced learning experience' },
      {type: 'feature', text: 'Add import functionality for external flashcard sets' }
    ]
  },
  {
    version: '1.22',
    date: new Date('2025-12-12'),
    title: 'iOS Dynamic Island Fix',
    changes: [
      { type: 'bugfix', text: 'Fix dynamic island display issue on iOS devices' }
    ]
  },
  {
    version: '1.21',
    date: new Date('2025-12-11'),
    title: 'Skeleton Loaders & Performance Improvements',
    changes: [
      { type: 'improvement', text: 'Add skeleton loaders for quizzes and improve overall app performance' },
      { type: 'improvement', text: 'Optimize data fetching and caching strategies' }
    ]
  },
  {
    version: '1.20',
    date: new Date('2025-12-10'),
    title: 'Update-Channel Feature',
    changes: [
      { type: 'feature', text: 'Update-Channel mit Badge im Header und Timeline-Design' }
    ]
  },
  {
    version: '1.19',
    date: new Date('2025-12-10'),
    title: 'Quiz-Export Feature',
    changes: [
      { type: 'feature', text: 'Quiz-Export als lesbare Textdatei mit allen Antworten' }
    ]
  },
  {
    version: '1.18',
    date: new Date('2025-12-09'),
    title: 'Settings Icon Update',
    changes: [
      { type: 'feature', text: 'Update settings icon and enhance hover styles for improved visibility' }
    ]
  },
  {
    version: '1.17',
    date: new Date('2025-12-08'),
    title: 'PWA Install Screenshots',
    changes: [
      { type: 'feature', text: 'Add install screenshots to PWA prompt for enhanced user guidance' }
    ]
  },
  {
    version: '1.16',
    date: new Date('2025-12-07'),
    title: 'Matching Question Results',
    changes: [
      { type: 'feature', text: 'Enhance matching question result display with improved styling and correctness indication' }
    ]
  },
  {
    version: '1.15',
    date: new Date('2025-12-06'),
    title: 'Matching Question Logic',
    changes: [
      { type: 'feature', text: 'Enhance matching question logic and UI with improved selection handling and styling' }
    ]
  },
  {
    version: '1.14',
    date: new Date('2025-12-05'),
    title: 'Matching Question Slider',
    changes: [
      { type: 'feature', text: 'Add matching question type with slider and logic for distribution' }
    ]
  },
  {
    version: '1.13',
    date: new Date('2025-12-04'),
    title: 'Matching Question UI',
    changes: [
      { type: 'feature', text: 'Add matching question type with UI and logic' }
    ]
  },
  {
    version: '1.12',
    date: new Date('2025-12-03'),
    title: 'Badging Service',
    changes: [
      { type: 'feature', text: 'Add badging service for unread notifications and badge management' }
    ]
  },
  {
    version: '1.11',
    date: new Date('2025-12-02'),
    title: 'User Profile Menu',
    changes: [
      { type: 'feature', text: 'Enhance user profile menu functionality with toggle and close actions' }
    ]
  },
  {
    version: '1.10',
    date: new Date('2025-12-01'),
    title: 'Settings Page',
    changes: [
      { type: 'feature', text: 'Add settings page for managing notifications and offline access, update routing, and enhance pull-to-refresh logic' }
    ]
  },
  {
    version: '1.9',
    date: new Date('2025-11-30'),
    title: 'Firestore Integration',
    changes: [
      { type: 'feature', text: 'Integrate runInInjectionContext for Firestore operations across services' }
    ]
  },
  {
    version: '1.8',
    date: new Date('2025-11-29'),
    title: 'Push Notifications',
    changes: [
      { type: 'feature', text: 'Implement push notifications with Firebase, add PWA detection, and enhance notification settings UI' }
    ]
  },
  {
    version: '1.7',
    date: new Date('2025-11-28'),
    title: 'Mobile Menu Enhancement',
    changes: [
      { type: 'feature', text: 'Enhance mobile menu functionality and styling, improve pull-to-refresh logic, and prevent horizontal overflow' }
    ]
  },
  {
    version: '1.6',
    date: new Date('2025-11-27'),
    title: 'Network Status & PWA Prompts',
    changes: [
      { type: 'feature', text: 'Add network status indicator and iOS/PWA install prompts' }
    ]
  },
  {
    version: '1.5',
    date: new Date('2025-11-26'),
    title: 'Privacy & Terms',
    changes: [
      { type: 'feature', text: 'Add privacy and terms components with routing, update login to link to policies' }
    ]
  },
  {
    version: '1.4',
    date: new Date('2025-11-25'),
    title: 'Icons & Favicon',
    changes: [
      { type: 'feature', text: 'Add new icons and update favicon links in manifest and index.html' }
    ]
  },
  {
    version: '1.3',
    date: new Date('2025-11-24'),
    title: 'Firestore Rules Update',
    changes: [
      { type: 'feature', text: 'Enhance SVG assets' }
    ]
  },
  {
    version: '1.2',
    date: new Date('2025-11-23'),
    title: 'Project Configuration',
    changes: [
      { type: 'feature', text: 'Update project name in .firebaserc and enhance Firestore rules for user access' }
    ]
  },
  {
    version: '1.1',
    date: new Date('2025-11-22'),
    title: 'Quiz Results Display',
    changes: [
      { type: 'feature', text: 'Enhance multiple-choice and ordering questions to display correct answers and results' }
    ]
  },
  {
    version: '1.0',
    date: new Date('2025-11-01'),
    title: 'Initial Release',
    description: 'RecallFlow Quiz-App mit Spaced Repetition System',
    changes: [
      { type: 'feature', text: 'Multiple-Choice, Ordering und Matching Fragetypen' },
      { type: 'feature', text: 'Spaced Repetition Lernsystem mit 4 Levels' },
      { type: 'feature', text: 'Kollaboratives Quiz-Erstellen (Owner, Co-Author, Participant)' },
      { type: 'feature', text: 'TOON-Format Editor mit CodeMirror' },
      { type: 'feature', text: 'Offline-Unterstützung als PWA' },
      { type: 'feature', text: 'Dark/Light Theme-Support' }
    ]
  }
];

// Helper: Neueste Version
export function getLatestVersion(): string {
  return CHANGELOG[0].version;
}

// Helper: Alle Änderungen seit Version
export function getChangesSince(version: string): ChangelogEntry[] {
  const index = CHANGELOG.findIndex(e => e.version === version);
  if (index === -1) return CHANGELOG; // Alle anzeigen wenn Version unbekannt
  return CHANGELOG.slice(0, index);
}
