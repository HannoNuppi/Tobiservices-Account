# TobiServices Account Center

Zentrales Konto-System für TobiServices-Websites.

## Enthalten

- E-Mail/Passwort-Login über Firebase Authentication
- E-Mail-Verifizierung vor dem Zugriff
- sichere Account-Seite
- Tag-System, z. B. `admin`
- Admin-Panel
- strikte Firestore Security Rules
- sichere Rücksprünge zu TobiServices-Websites
- gemeinsamer Firebase-Standort für zukünftige TobiServices-Apps

## Firebase

Das Projekt verwendet Firebase `tobiservices`.

Die Firebase-Web-Konfiguration im Frontend ist kein geheimes Passwort. Die eigentliche Zugriffskontrolle erfolgt über Firebase Authentication und Firestore Security Rules.

### Einmalige Einrichtung in Firebase

1. Authentication → Sign-in method → **E-Mail/Passwort** aktivieren.
2. Firestore Database anlegen.
3. Den Inhalt von `firestore.rules` im Firebase-Console-Tab **Rules** veröffentlichen.
4. Unter Authentication → Settings → Authorized domains die GitHub-Pages-Domain eintragen:
   `hannonuppi.github.io`
5. Einen ersten Account über `login.html` registrieren.
6. Nach bestätigter E-Mail das Firestore-Dokument `users/<UID>` öffnen und einmalig den Tag `admin` hinzufügen. Danach kann der Admin weitere Tags vergeben.

## Verbindung mit anderen TobiServices-Seiten

Websites auf `hannonuppi.github.io` können `auth-core.js` direkt als gemeinsames Auth-Modul importieren:

```html
<script type="module">
import {
  onUser,
  requireLogin,
  hasTag,
  CONFIG
} from "https://hannonuppi.github.io/Tobiservices-Account/auth-core.js";

onUser((user, profile) => {
  if (!user || !user.emailVerified) return requireLogin();
  console.log(profile.displayName, profile.tags);
  if (hasTag(profile, "admin")) {
    console.log("Admin-Zugriff");
  }
});
</script>
```

Wichtig: Die verbundene Anwendung muss für ihre eigenen Firestore-Daten dieselbe Firebase-Projektbasis verwenden, wenn die Firestore Security Rules die Account-UID direkt als `request.auth.uid` auswerten sollen. Genau so wird die Stundenplan-App angebunden.

## Sicherheitsmodell

- Nicht angemeldete Nutzer kommen nicht an geschützte Firestore-Daten.
- Nutzer können sich nicht selbst den Admin-Tag geben.
- Nutzer können ihren Anzeigenamen ändern, aber keine Rollen oder Sicherheitsfelder.
- Admins können Tags anderer Nutzer verwalten.
- Admins können ihren eigenen Admin-Tag nicht versehentlich entfernen.
- Hausaufgaben werden als einzelne Dokumente statt als frei überschreibbares Array gespeichert.
- Ein Report ist an die UID des meldenden Kontos gebunden und kann nicht verändert oder gelöscht werden.
- Audit-/Mojo-Log-Einträge sind für den Browser nicht beschreibbar.

Für echte serverseitige Aktionen, die z. B. automatisch Mojo vergeben, Admin-Rollen per Policy ändern oder Rate-Limits erzwingen sollen, sollte später eine vertrauenswürdige Backend-Komponente (z. B. Cloud Functions) verwendet werden.
