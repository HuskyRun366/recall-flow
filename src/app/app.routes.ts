import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'quiz/home',
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
  // Legacy Quiz URLs (redirect to the new /quiz/* structure)
  { path: 'home', redirectTo: 'quiz/home', pathMatch: 'full' },
  { path: 'quizzes', redirectTo: 'quiz/quizzes', pathMatch: 'full' },
  { path: 'quizzes/:id', redirectTo: 'quiz/:id', pathMatch: 'full' },
  { path: 'quiz-detail/:id', redirectTo: 'quiz/:id', pathMatch: 'full' },
  { path: 'quiz-editor/:id', redirectTo: 'quiz/editor/:id', pathMatch: 'full' },
  { path: 'ai-quiz-generator', redirectTo: 'quiz/ai-quiz-generator', pathMatch: 'full' },

  // Quiz Mode Routes (mirrors the nested structure of /lernen/*)
  {
    path: 'quiz',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        redirectTo: 'home',
        pathMatch: 'full'
      },
      {
        path: 'home',
        data: { animationIndex: 10 },
        loadComponent: () => import('./features/home/home.component').then(m => m.HomeComponent)
      },
      {
        path: 'quizzes',
        data: { animationIndex: 40 },
        loadComponent: () => import('./features/quiz-management/quiz-list/quiz-list.component').then(m => m.QuizListComponent)
      },
      {
        path: 'editor/:id',
        data: { animationIndex: 42 },
        loadComponent: () => import('./features/quiz-editor/quiz-editor.component').then(m => m.QuizEditorComponent)
      },
      {
        path: 'ai-quiz-generator',
        data: { animationIndex: 44 },
        loadComponent: () => import('./features/ai-quiz-generator/ai-quiz-generator.component').then(m => m.AiQuizGeneratorComponent)
      },
      {
        path: 'analytics',
        data: { animationIndex: 45 },
        loadComponent: () => import('./features/quiz-management/creator-analytics/creator-analytics.component').then(m => m.CreatorAnalyticsComponent)
      },
      {
        path: ':id/take',
        data: { animationIndex: 43 },
        loadComponent: () => import('./features/quiz-taking/quiz-session/quiz-session.component').then(m => m.QuizSessionComponent)
      },
      {
        path: ':id/analytics',
        data: { animationIndex: 45 },
        loadComponent: () => import('./features/quiz-management/quiz-analytics/quiz-analytics.component').then(m => m.QuizAnalyticsComponent)
      },
      {
        path: ':id',
        data: { animationIndex: 41 },
        loadComponent: () => import('./features/quiz-management/quiz-detail/quiz-detail.component').then(m => m.QuizDetailComponent)
      }
    ]
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
    path: 'discover',
    canActivate: [authGuard],
    data: { animationIndex: 50 },
    loadComponent: () => import('./features/discover/discover.component').then(m => m.DiscoverComponent)
  },
  {
    path: 'settings/theme-editor/new',
    canActivate: [authGuard],
    data: { animationIndex: 31 },
    loadComponent: () => import('./features/theme-editor/theme-editor.component').then(m => m.ThemeEditorComponent)
  },
  {
    path: 'settings/theme-editor/:id',
    canActivate: [authGuard],
    data: { animationIndex: 31 },
    loadComponent: () => import('./features/theme-editor/theme-editor.component').then(m => m.ThemeEditorComponent)
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
    path: '**',
    redirectTo: 'quiz/home'
  }
];
