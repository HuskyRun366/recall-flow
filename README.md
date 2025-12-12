<div align="center">

# <img src="public/logo.svg" alt="RecallFlow" width=36 height=36> RecallFlow

### Intelligent Quiz-App mit Spaced Repetition System

*Lerne smarter, nicht härter – mit wissenschaftlich fundiertem Spaced Repetition Learning*

[![Angular](https://img.shields.io/badge/Angular-19-DD0031?style=for-the-badge&logo=angular&logoColor=white)](https://angular.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com/)
[![PWA](https://img.shields.io/badge/PWA-Ready-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)

[Features](#-features) · [Setup](#-quick-start) · [Docs](#-documentation)

---

</div>

## ✨ Features

### 🎯 **Quiz-Management**
- **Multiple Question Types**: Multiple-Choice, Ordering, Matching-Fragen
- **Kollaboratives Erstellen**: Invite Co-Authors per Email
- **Flexible Visibility**: Public, Unlisted oder Private Quizzes
- **Join Codes**: Teile Quizzes einfach mit einem 6-stelligen Code
- **Export**: Exportiere Quizzes als lesbare Textdatei

### 🤖 **AI Quiz Generator**
- **PDF & Image Upload**: Erstelle Quizzes aus Dokumenten oder Screenshots
- **Gemini 2.5 Flash**: Powered by Google's neuester AI
- **Flexible Konfiguration**: Wähle Question-Mix und Schwierigkeitsgrad
- **25k Token Limit**: Verarbeite große Dokumente

### 📊 **Spaced Repetition Learning**
- **4 Progress Levels**: Von Untrained (🔴) bis Perfectly Trained (🟢)
- **Smart Reset**: Level sinkt bei falschen Antworten
- **Visual Progress**: Fortschrittsbalken und Farb-Coding
- **Personalisiert**: Jeder User hat eigenen Fortschritt

### 📱 **Progressive Web App**
- **Installierbar**: Wie eine native App auf allen Geräten
- **Offline Support**: Funktioniert auch ohne Internet
- **Auto-Updates**: Service Worker lädt Updates automatisch
- **Push Notifications**: Bleib auf dem Laufenden
- **Badge Support**: Ungelesene Benachrichtigungen im App-Icon

### 🎨 **Modern UI/UX**
- **Dark & Light Mode**: Automatisch oder manuell umschaltbar
- **Responsive Design**: Optimiert für Desktop, Tablet & Mobile
- **Smooth Animations**: Polierte User Experience
- **Accessibility**: WCAG-konform mit Keyboard-Navigation

### 📝 **TOON-Format Editor**
- **CodeMirror Integration**: Syntax-Highlighting für TOON
- **CSV-basiert**: Menschenlesbar und Git-freundlich
- **Bulk-Editing**: Erstelle Quizzes im Text-Editor
- **Validation**: Live-Fehlerprüfung mit Zeilennummern

### 📣 **Update Channel**
- **Changelog**: Timeline aller Updates und Features
- **Badge Notifications**: Werde über neue Updates informiert
- **Versioning**: Klares Versioning-System
- **Change Types**: Feature, Bugfix, Improvement, Breaking Changes

---

## 🚀 Quick Start

### Voraussetzungen

- **Node.js** 18+ ([Download](https://nodejs.org/))
- **npm** 9+ (kommt mit Node.js)
- **Firebase Account** ([Kostenlos erstellen](https://firebase.google.com/))
- **Gemini API Key** ([Google AI Studio](https://makersuite.google.com/app/apikey))

### Installation

1. **Repository klonen**
   ```bash
   git clone https://github.com/HuskyRun366/recall-flow.git
   cd recall-flow
   ```

2. **Dependencies installieren**
   ```bash
   npm install
   ```

3. **Firebase Projekt erstellen**
   - Gehe zu [Firebase Console](https://console.firebase.google.com/)
   - Erstelle ein neues Projekt
   - Aktiviere **Authentication** (Email/Password & Google)
   - Aktiviere **Firestore Database** (Start in Test Mode)
   - Aktiviere **Hosting**

4. **Environment Files einrichten**
   ```bash
   # Kopiere die Beispiel-Datei
   cp src/environments/environment.example.ts src/environments/environment.ts
   cp src/environments/environment.example.ts src/environments/environment.prod.ts
   ```

   **Füge deine Firebase Config ein:**
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

5. **Firestore Security Rules & Indicies deployen**
   ```bash
   firebase deploy --only firestore:rules
   firebase deploy --only firestore:indexes
   ```

6. **Development Server starten**
   ```bash
   npm start
   ```

   App läuft auf: **http://localhost:4200** 🎉

---

## 🏗️ Build & Deploy

### Production Build
```bash
npm run build
```
Output: `dist/quiz-app/browser/`

### Firebase Deployment
```bash
# Alles deployen (Hosting + Firestore Rules)
firebase deploy

# Nur Hosting
firebase deploy --only hosting

# Nur Firestore Rules
firebase deploy --only firestore:rules
```

### Service Worker
Der Service Worker cached die App automatisch für Offline-Nutzung:
- **Strategie**: Network First mit Cache Fallback
- **Auto-Update**: Prüft bei jedem Neustart auf Updates
- **Update-Prompt**: User werden über neue Versionen informiert

---

## 🛠️ Tech Stack

### Frontend
- **Angular 19** - Modern Frontend Framework
- **TypeScript 5.7** - Type-safe Development
- **Angular Signals** - Reactive State Management
- **Standalone Components** - Modern Angular Architecture
- **Angular Material 19** - UI Components
- **SCSS** - Styling mit CSS Variables

### Backend & Services
- **Firebase Authentication** - User Management
- **Firestore** - NoSQL Database
- **Firebase Hosting** - Web Hosting
- **Firebase Storage** - File Uploads
- **Google Gemini AI** - Quiz Generation

### PWA & Performance
- **Service Worker** (ngsw) - Offline Support & Caching
- **Web App Manifest** - Installierbarkeit
- **Push Notifications** - User Engagement
- **Badging API** - App Icon Badges

### Development Tools
- **CodeMirror 6** - Code Editor
- **Angular CDK** - Drag & Drop
- **RxJS** - Reactive Programming
---

## 📁 Projektstruktur

```
quiz-app/
├── src/
│   ├── app/
│   │   ├── core/                    # Singleton Services
│   │   │   ├── guards/             # Route Guards (auth.guard.ts)
│   │   │   └── services/           # Core Services
│   │   │       ├── auth.service.ts
│   │   │       ├── quiz.service.ts
│   │   │       ├── question.service.ts
│   │   │       ├── progress.service.ts
│   │   │       └── updates.service.ts
│   │   │
│   │   ├── features/                # Feature Modules (Lazy Loaded)
│   │   │   ├── auth/               # Login & Authentication
│   │   │   ├── home/               # Dashboard
│   │   │   ├── quiz-editor/        # TOON Editor & Visual Editor
│   │   │   ├── quiz-management/    # Quiz List & Detail
│   │   │   ├── quiz-taking/        # Quiz Session & Questions
│   │   │   ├── ai-quiz-generator/  # AI-powered Quiz Creation
│   │   │   ├── settings/           # User Settings
│   │   │   ├── updates/            # Changelog & Updates
│   │   │   └── legal/              # Privacy & Terms
│   │   │
│   │   ├── shared/                  # Shared Code
│   │   │   ├── components/         # Reusable Components
│   │   │   │   ├── header/
│   │   │   │   ├── network-status/
│   │   │   │   └── toon-editor/
│   │   │   ├── data/               # Static Data
│   │   │   │   └── changelog.ts
│   │   │   └── utils/              # Helper Functions
│   │   │       ├── toon-parser.ts
│   │   │       └── toon-stringifier.ts
│   │   │
│   │   ├── models/                  # TypeScript Interfaces
│   │   │   ├── quiz.model.ts
│   │   │   ├── question.model.ts
│   │   │   ├── user.model.ts
│   │   │   └── progress.model.ts
│   │   │
│   │   └── app.routes.ts           # Route Configuration
│   │
│   ├── environments/                # Environment Configs
│   │   ├── environment.ts          # Development
│   │   ├── environment.prod.ts     # Production
│   │   └── environment.example.ts  # Template
│   │
│   ├── styles/                      # Global Styles
│   │   ├── _variables.scss         # SCSS Variables
│   │   └── styles.scss             # Main Stylesheet
│   │
│   └── assets/                      # Static Assets
│       └── icons/                  # PWA Icons
│
├── firestore.rules                  # Firestore Security Rules
├── firebase.json                    # Firebase Configuration
├── ngsw-config.json                # Service Worker Config
└── angular.json                    # Angular Configuration
```

---

## 📖 Documentation

### TOON Format

TOON ist unser custom text-based Format für Quiz-Erstellung. Es ist CSV-basiert und menschenlesbar:

```
quiz:
  title: Angular Basics
  description: Test your Angular knowledge
  visibility: public

questions[2]{orderIndex,type,questionText}:
  0,multiple-choice,What is a component?
  1,ordering,Sort these by importance

options[3]{questionIndex,text,isCorrect}:
  0,Building block,true
  0,A service,false
  0,A pipe,false

orderItems[3]{questionIndex,text,correctOrder}:
  1,Components,0
  1,Services,1
  1,Directives,2
```

### Firestore Schema

```
ROOT COLLECTIONS:
├── users/{userId}
│   └── userQuizzes/{quizId}        # Denormalized quiz references
│
├── quizzes/{quizId}                # Quiz documents
│
├── questions/{questionId}          # Question documents (reference quizId)
│
├── quizParticipants/{quizId}
│   └── participants/{userId}       # User roles
│
└── quizProgress/{quizId}
    └── userProgress/{userId}
        └── questionProgress/{questionId}  # Learning progress
```

### Spaced Repetition Logic

**4 Progress Levels:**
- **Level 0** (🔴): Not trained
- **Level 1** (🟡): Once trained
- **Level 2** (🟢): Twice trained
- **Level 3** (🟢): Perfectly trained

**Logic:**
- ✅ Correct answer → `level += 1` (max 3)
- ❌ Wrong answer → `level = 0` (reset)

---

## 🎨 Customization

### Theme Anpassen

Colors sind in [src/styles/styles.scss](src/styles/styles.scss) als CSS Variables definiert:

```scss
:root {
  --color-primary: #2196F3;
  --color-accent: #FF4081;
  --color-background: #FAFAFA;
  --color-surface: #FFFFFF;
  // ...
}

[data-theme="dark"] {
  --color-background: #121212;
  --color-surface: #1E1E1E;
  // ...
}
```

### Changelog Updates hinzufügen

Neue Updates in [src/app/shared/data/changelog.ts](src/app/shared/data/changelog.ts):

```typescript
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.21',
    date: new Date('2025-12-11'),
    title: 'Mein neues Feature',
    changes: [
      { type: 'feature', text: 'Neue coole Funktion' },
      { type: 'bugfix', text: 'Bug XY behoben' }
    ]
  },
  // ... existing entries
];
```

---

## 🤝 Contributing

Contributions sind willkommen!

1. **Fork** das Repository
2. **Branch** erstellen (`git checkout -b feature/AmazingFeature`)
3. **Commit** deine Changes (`git commit -m 'feat: Add AmazingFeature'`)
4. **Push** zum Branch (`git push origin feature/AmazingFeature`)
5. **Pull Request** öffnen

### Commit Convention

Wir verwenden [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - Neue Features
- `fix:` - Bug Fixes
- `docs:` - Documentation
- `style:` - Code Style (formatting, etc.)
- `refactor:` - Code Refactoring
- `test:` - Tests
- `chore:` - Maintenance

---

## 📄 Lizenz

Dieses Projekt ist lizenziert unter der **MIT License** - siehe [LICENSE](LICENSE) für Details.

---

## 🙏 Acknowledgments

- **Angular Team** - Für das großartige Framework
- **Firebase Team** - Für die Backend-as-a-Service Platform
- **Google AI** - Für die Gemini API
- **CodeMirror** - Für den fantastischen Code Editor
- **Material Design** - Für das Design System

---

## 📬 Kontakt

**Fragen oder Feedback?**

- 🐛 [Issues](https://github.com/yourusername/quiz-app/issues)
- 💬 [Discussions](https://github.com/yourusername/quiz-app/discussions)

---

<div align="center">

**Made with ❤️ and Angular**

⭐ Star us on GitHub — it helps!

[⬆ Back to Top](#-recallflow)

</div>
