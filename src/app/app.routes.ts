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
    loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'privacy',
    loadComponent: () => import('./features/legal/privacy.component').then(m => m.PrivacyComponent)
  },
  {
    path: 'terms',
    loadComponent: () => import('./features/legal/terms.component').then(m => m.TermsComponent)
  },
  {
    path: 'home',
    canActivate: [authGuard],
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
        loadComponent: () => import('./features/lernen/lernen.component').then(m => m.LernenComponent) // Temporary, will be replaced with LernenHomeComponent in Phase 2
      },
      {
        path: 'decks',
        loadComponent: () => import('./features/lernen/lernen.component').then(m => m.LernenComponent) // Temporary, will be replaced with LernenListComponent in Phase 3
      },
      {
        path: 'deck-editor/:id',
        loadComponent: () => import('./features/lernen/flashcard-editor/flashcard-editor.component').then(m => m.FlashcardEditorComponent)
      },
      {
        path: 'deck/:id/study',
        loadComponent: () => import('./features/lernen/flashcard-session/flashcard-session.component').then(m => m.FlashcardSessionComponent)
      }
    ]
  },
  {
    path: 'settings',
    canActivate: [authGuard],
    loadComponent: () => import('./features/settings/settings.component').then(m => m.SettingsComponent)
  },
  {
    path: 'updates',
    canActivate: [authGuard],
    loadComponent: () => import('./features/updates/updates.component').then(m => m.UpdatesComponent)
  },
  {
    path: 'quizzes',
    canActivate: [authGuard],
    loadComponent: () => import('./features/quiz-management/quiz-list/quiz-list.component').then(m => m.QuizListComponent)
  },
  {
    path: 'quizzes/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./features/quiz-management/quiz-detail/quiz-detail.component').then(m => m.QuizDetailComponent)
  },
  {
    path: 'quiz-editor/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./features/quiz-editor/quiz-editor.component').then(m => m.QuizEditorComponent)
  },
  {
    path: 'ai-quiz-generator',
    canActivate: [authGuard],
    loadComponent: () => import('./features/ai-quiz-generator/ai-quiz-generator.component').then(m => m.AiQuizGeneratorComponent)
  },
  {
    path: 'quiz/:id/take',
    canActivate: [authGuard],
    loadComponent: () => import('./features/quiz-taking/quiz-session/quiz-session.component').then(m => m.QuizSessionComponent)
  },
  {
  path: 'quiz-detail/:id',
  canActivate: [authGuard],
  loadComponent: () => import('./features/quiz-management/quiz-detail/quiz-detail.component')
    .then(m => m.QuizDetailComponent)
 },
  {
    path: '**',
    redirectTo: 'home'
  }
];
