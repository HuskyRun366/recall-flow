// Copy this file to environment.ts and environment.prod.ts
// and replace the placeholder values with your actual configuration

export const environment = {
  production: false, // Set to true for environment.prod.ts
  firebase: {
    apiKey: "YOUR_FIREBASE_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID",
    measurementId: "YOUR_MEASUREMENT_ID",
    vapidKey: "YOUR_VAPID_KEY" // Get from Firebase Console: Project Settings > Cloud Messaging > Web Push certificates
  },
  gemini: {
    apiKey: 'YOUR_GEMINI_API_KEY', // Get from Google AI Studio
    model: 'gemini-2.5-flash', // Model with multimodal support
    maxFiles: 3, // Maximum files per generation
    maxFileSizeMB: 10, // Maximum file size in MB
    maxOutputTokens: 25000, // Cap the AI response
    enabled: true // Set to false to disable AI generation
  },
  dataProtection: {
    contactEmail: 'example@email.com',
    contactName: 'Max Mustermann',
    zipCode: '0000',
    country: '',
    streetAndHouseNumber: '',
    city: ''
  }
};
