# RecallFlow Notification Server

Kostenloser Push-Notification Server für die RecallFlow Quiz-App.

## Features

- 🔔 Automatische Push-Benachrichtigungen bei Quiz-Änderungen
- 👥 Benachrichtigt nur Owner und Co-Autoren
- 📬 Follow-Notifications: Benachrichtigt Follower bei neuen Quizzen
- 🔄 Real-time Firestore Listeners
- 🔒 Rate Limiting & Input Validation
- 🆓 100% kostenlos auf Render.com
- ⚡ Keine Wartung nötig

## Notification Types

| Type | Beschreibung | Empfänger |
|------|--------------|-----------|
| Quiz Update | Quiz-Titel oder Beschreibung geändert | Owner & Co-Autoren |
| Question Added | Neue Frage hinzugefügt | Owner & Co-Autoren |
| Question Deleted | Frage gelöscht | Owner & Co-Autoren |
| **New Quiz (Follow)** | Gefolgter Autor hat neues Quiz veröffentlicht | Follower |

## Security

- **Rate Limiting**: Max 10 Notifications pro User pro Minute
- **Input Validation**: Alle IDs und Strings werden validiert/sanitized
- **Deduplication**: Verhindert doppelte Notifications
- **Security Headers**: X-Content-Type-Options, X-Frame-Options
- **Environment Variables**: Keine Secrets im Code

## Deployment auf Render.com

### 1. Service Account Key erstellen

1. Gehe zur [Firebase Console](https://console.firebase.google.com/)
2. Wähle dein Projekt "recall-flow-app"
3. Gehe zu **Project Settings** (Zahnrad) → **Service accounts**
4. Klicke auf **Generate new private key**
5. Speichere die Datei (z.B. als `service-account.json`)

### 2. Repository vorbereiten

```bash
# Im notification-server Ordner
git init
git add .
git commit -m "Initial notification server"

# Neues GitHub Repo erstellen und pushen
git remote add origin https://github.com/DEIN_USERNAME/recallflow-notifications.git
git push -u origin main
```

### 3. Auf Render.com deployen

1. Gehe zu [https://render.com](https://render.com)
2. Klicke **Sign Up** (kostenlos mit GitHub Account)
3. Klicke **New** → **Web Service**
4. Verbinde dein GitHub Repository
5. Wähle das `recallflow-notifications` Repository
6. **Root Directory**: `notification-server`
7. **Build Command**: `npm install`
8. **Start Command**: `npm start`
9. Klicke **Advanced** → **Add Environment Variable**:
   - **Key**: `FIREBASE_SERVICE_ACCOUNT`
   - **Value**: Kompletter Inhalt deiner `service-account.json` Datei

10. Klicke **Create Web Service**

### 4. Fertig! 🎉

Der Server deployed automatisch und läuft 24/7 kostenlos.

## Monitoring

- Health Check: `https://deine-app.onrender.com/health`
- Render Dashboard zeigt Logs und Status
- Server wacht automatisch aus Schlaf-Modus auf

## Logs ansehen

Im Render Dashboard:
- Klicke auf deinen Service
- Tab **Logs** zeigt alle Aktivitäten:
  ```
  📝 Quiz updated: "Angular Basics" - Titel wurde geändert
  👥 Notifying 2 users...
  ✅ Sent 2/2 notifications

  📬 Follow notification: "Max Mustermann" published "React Grundlagen"
     Target user: abc12345...
  ✅ Sent 1/1 notifications
  ```

## Troubleshooting

**Server schläft?**
- Render.com Free Tier schläft nach 15min Inaktivität
- Wacht automatisch bei Quiz-Änderung auf
- Erste Benachrichtigung dauert ~30 Sekunden

**Keine Benachrichtigungen?**
- Prüfe Logs im Render Dashboard
- Stelle sicher FIREBASE_SERVICE_ACCOUNT korrekt gesetzt ist
- Prüfe ob Nutzer FCM Tokens haben (in Firebase Console → Firestore)

## Kosten

**$0.00** - Komplett kostenlos!

Render.com Free Tier:
- 750 Stunden/Monat (mehr als genug)
- Automatischer Schlafmodus
- Keine Kreditkarte nötig
