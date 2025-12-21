<div align="center">
  <h1>
    <img src="public/logo.svg" alt="RecallFlow" width="36" height="36" style="vertical-align: middle; margin-right: 8px;">
    RecallFlow
  </h1>
  <p>Intelligent quiz and flashcard platform with spaced repetition, collaborative authoring, and offline-first learning.</p>
  <p>
    <img src="https://img.shields.io/badge/Angular-19-DD0031?style=for-the-badge&logo=angular&logoColor=white" alt="Angular">
    <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
    <img src="https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black" alt="Firebase">
    <img src="https://img.shields.io/badge/PWA-Ready-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white" alt="PWA Ready">
  </p>
</div>

## Overview

RecallFlow is a modern learning app built for structured knowledge retention. It combines quizzes, flashcards, and spaced repetition into a unified experience, with collaborative editing, offline support, and a clean, responsive UI.

## Key Features

- Quiz management with multiple question types (multiple-choice, ordering, matching)
- Collaborative quiz authoring with roles (owner / co-author / participant)
- Flashcard decks with spaced repetition progress tracking
- Adaptive learning signals (difficulty, due dates, review scheduling)
- Learning materials (HTML-based study content) with viewer and editor
- AI-powered quiz generation (PDF + image inputs)
- PWA support with offline caching and background sync
- Localization support (EN/DE/FR/ES)
- TOON text format editor for bulk quiz editing

## Tech Stack

- Frontend: Angular 19, TypeScript 5.7, SCSS
- State: Angular Signals
- Backend: Firebase (Auth, Firestore, Storage, Hosting)
- PWA: Service Worker (ngsw), Background Sync, Offline Cache
- Editor: CodeMirror 6 (TOON format)

## Quick Start

### Prerequisites

- Node.js 18+
- npm 9+
- Firebase account
- Gemini API key (optional, for AI quiz generation)

### Install

```bash
npm install
```

### Configure Environment

Create local environment files:

```bash
cp src/environments/environment.example.ts src/environments/environment.ts
cp src/environments/environment.example.ts src/environments/environment.prod.ts
```

Fill in your Firebase and Gemini configuration:

```typescript
export const environment = {
  production: false,
  firebase: {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
  },
  gemini: {
    apiKey: "YOUR_GEMINI_API_KEY",
    model: "gemini-2.5-flash",
    maxOutputTokens: 8000,
    maxFiles: 5,
    maxFileSizeMB: 20
  }
};
```

### Run Development Server

```bash
npm start
```

Open http://localhost:4200

## Scripts

```bash
npm start       # Development server
npm run build   # Production build
npm run watch   # Build in watch mode
npm test        # Run tests
```

## Firebase Setup

Enable the following in Firebase Console:

- Authentication (Email/Password, Google)
- Firestore Database
- Hosting
- Storage (if using assets)

Deploy Firestore rules and indexes:

```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

## Project Structure

```
src/
  app/
    core/           # Singleton services (auth, firestore, progress)
    features/       # Feature views (auth, home, quiz, learning)
    shared/         # Reusable components, utils, data
    models/         # TypeScript interfaces
  assets/           # Icons and i18n
  environments/     # Environment configs
```

## Firestore Data Model (high level)

```
quizzes/{quizId}
questions/{questionId}
quizParticipants/{quizId}/participants/{userId}
quizProgress/{quizId}/userProgress/{userId}/questionProgress/{questionId}

flashcardDecks/{deckId}
flashcards/{cardId}
deckParticipants/{deckId}/participants/{userId}
flashcardProgress/{deckId}/userProgress/{userId}/cardProgress/{cardId}

learningMaterials/{materialId}
materialParticipants/{materialId}/participants/{userId}
users/{userId}/userMaterials/{materialId}
```

## PWA & Offline

RecallFlow uses a service worker for offline availability and background sync. Cached content is automatically refreshed, and users can preload quizzes/decks for offline usage.

## Contributing

Contributions are welcome. If you plan larger changes, open an issue or discussion first.

1. Fork the repo
2. Create a feature branch
3. Commit using conventional commits
4. Open a pull request

## License

MIT License — see [LICENSE.md](LICENSE.md).

## Contact

Questions or feedback? Open an issue in your repository.
