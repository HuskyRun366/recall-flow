import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full'
  },
  {
    path: 'login',
    data: { animationIndex: 0 },
    loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'privacy',
    data: { animationIndex: 90 },
    loadComponent: () => import('./features/legal/privacy.component').then(m => m.PrivacyComponent)
  },
  {
    path: 'terms',
    data: { animationIndex: 91 },
    loadComponent: () => import('./features/legal/terms.component').then(m => m.TermsComponent)
  },
  {
    path: 'home',
    canActivate: [authGuard],
    data: { animationIndex: 10 },
    loadComponent: () => import('./features/home/home.component').then(m => m.HomeComponent)
  },
  // Lernen Mode Routes
  {
    path: 'lernen',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        redirectTo: 'home',
        pathMatch: 'full'
      },
      {
        path: 'home',
        data: { animationIndex: 60 },
        loadComponent: () => import('./features/lernen/lernen-home/lernen-home.component').then(m => m.LernenHomeComponent)
      },
      {
        path: 'decks',
        data: { animationIndex: 61 },
        loadComponent: () => import('./features/lernen/lernen-list/lernen-list.component').then(m => m.LernenListComponent)
      },
      {
        path: 'deck/:id',
        data: { animationIndex: 62 },
        loadComponent: () => import('./features/lernen/deck-detail/deck-detail.component').then(m => m.DeckDetailComponent)
      },
      {
        path: 'deck-editor/:id',
        data: { animationIndex: 63 },
        loadComponent: () => import('./features/lernen/flashcard-editor/flashcard-editor.component').then(m => m.FlashcardEditorComponent)
      },
      {
        path: 'deck/:id/study',
        data: { animationIndex: 64 },
        loadComponent: () => import('./features/lernen/flashcard-session/flashcard-session.component').then(m => m.FlashcardSessionComponent)
      },
      // Learning Materials Routes
      {
        path: 'materials',
        data: { animationIndex: 65 },
        loadComponent: () => import('./features/lernen/material-list/material-list.component').then(m => m.MaterialListComponent)
      },
      {
        path: 'material/:id',
        data: { animationIndex: 66 },
        loadComponent: () => import('./features/lernen/material-viewer/material-viewer.component').then(m => m.MaterialViewerComponent)
      },
      {
        path: 'material-editor/new',
        data: { animationIndex: 67 },
        loadComponent: () => import('./features/lernen/material-editor/material-editor.component').then(m => m.MaterialEditorComponent)
      },
      {
        path: 'material-editor/:id',
        data: { animationIndex: 67 },
        loadComponent: () => import('./features/lernen/material-editor/material-editor.component').then(m => m.MaterialEditorComponent)
      }
    ]
  },
  {
    path: 'settings',
    canActivate: [authGuard],
    data: { animationIndex: 30 },
    loadComponent: () => import('./features/settings/settings.component').then(m => m.SettingsComponent)
  },
  {
    path: 'updates',
    canActivate: [authGuard],
    data: { animationIndex: 20 },
    loadComponent: () => import('./features/updates/updates.component').then(m => m.UpdatesComponent)
  },
  {
    path: 'quizzes',
    canActivate: [authGuard],
    data: { animationIndex: 40 },
    loadComponent: () => import('./features/quiz-management/quiz-list/quiz-list.component').then(m => m.QuizListComponent)
  },
  {
    path: 'quizzes/:id',
    canActivate: [authGuard],
    data: { animationIndex: 41 },
    loadComponent: () => import('./features/quiz-management/quiz-detail/quiz-detail.component').then(m => m.QuizDetailComponent)
  },
  {
    path: 'quiz-editor/:id',
    canActivate: [authGuard],
    data: { animationIndex: 42 },
    loadComponent: () => import('./features/quiz-editor/quiz-editor.component').then(m => m.QuizEditorComponent)
  },
  {
    path: 'ai-quiz-generator',
    canActivate: [authGuard],
    data: { animationIndex: 44 },
    loadComponent: () => import('./features/ai-quiz-generator/ai-quiz-generator.component').then(m => m.AiQuizGeneratorComponent)
  },
  {
    path: 'quiz/:id/take',
    canActivate: [authGuard],
    data: { animationIndex: 43 },
    loadComponent: () => import('./features/quiz-taking/quiz-session/quiz-session.component').then(m => m.QuizSessionComponent)
  },
  {
  path: 'quiz-detail/:id',
  canActivate: [authGuard],
  data: { animationIndex: 41 },
  loadComponent: () => import('./features/quiz-management/quiz-detail/quiz-detail.component')
    .then(m => m.QuizDetailComponent)
 },
  {
    path: '**',
    redirectTo: 'home'
  }
];
