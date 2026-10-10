# TobiServices Account Center

Gemeinsamer Account- und Rollenservice für TobiServices-Websites. Neue Konten werden direkt über **Firebase Authentication (E-Mail + Passwort)** verwaltet. Rollen wie `admin` werden ausschließlich über das serverseitig geprüfte Tag-Profil gesteuert.

## Konten und Anmeldung

- Neue Accounts werden im Firebase-Projekt `tobiservices` unter **Authentication → Users** angelegt.
- Websites verwenden Firebase Authentication für E-Mail-/Passwort-Anmeldung.
- Beim ersten Login wird über die geschützte Cloud Function `ensureUserProfile` das Profil `users/{uid}` erzeugt, falls es noch nicht existiert. Neue Profile beginnen immer ohne Tags.
- Berechtigungen werden über `users/{uid}.tags` entschieden. Nur ein Profil mit dem Tag `admin` erhält Admin-Rechte.
- Das Admin Center listet die Firebase-Authentication-Konten und verwaltet deren Tags. Es muss kein zweites Passwort-System in `tobiAccounts` gepflegt werden.
- Legacy-Accounts mit TobiServices-Benutzername können vorerst über `loginLegacy()` weiter unterstützt werden. Neue Seiten sollen `login(email, password)` verwenden.

## Firebase-Einrichtung

Im lokalen Projektordner:

1. Firebase CLI installieren und mit deinem Firebase-Konto anmelden.
2. Projekt `tobiservices` auswählen.
3. Prüfen, dass E-Mail/Passwort unter Firebase Authentication → Sign-in method aktiviert ist.
4. Backend und Firestore-Regeln deployen:

   `firebase deploy --only functions,firestore`

Beim Deploy kann Firebase fragen, ob die alte Function `bootstrapTobiAdmin` entfernt werden soll. Bestätige die Entfernung, damit der nicht mehr verwendete Bootstrap-Key-Endpunkt nicht als alte deployed Function weiterbesteht.

Cloud Functions benötigen laut der Projektkonfiguration den Firebase-Blaze-Tarif.

## Ersten Admin sicher einrichten

Der alte Bootstrap-Key ist nicht mehr erforderlich und wird nicht mehr durch den aktuellen Backend-Code verwendet. Für das erste Admin-Konto wird die Rolle einmalig direkt über die vertrauenswürdige **Firebase Console** vergeben:

1. Firebase Console → Authentication → Users öffnen.
2. Das eigene Konto auswählen und dessen vollständige UID kopieren.
3. Firestore Database → Collection `users` öffnen.
4. Falls noch kein Dokument existiert, ein Dokument mit genau dieser UID als Dokument-ID anlegen. Existiert es schon, nur die Felder ergänzen/aktualisieren.
5. Die Felder setzen:
   - `email` — String mit der E-Mail-Adresse
   - `displayName` — String mit dem Anzeigenamen
   - `tags` — Array mit einem String-Element: `admin`
   - `createdAt` — Timestamp (beim neuen Dokument)
   - `lastProfileChangeAt` — Timestamp

Die Firestore Console benutzt ein vertrauenswürdiges Projekt-Owner/Admin-Konto und umgeht die Client-Regeln für diese manuelle Erstinitialisierung. **Nie** Client-Schreibrechte auf Rollen oder Tags öffnen. Danach können Admins die Tags über die geschützten Cloud Functions verwalten.

Es gibt absichtlich keinen öffentlichen Endpunkt, über den unangemeldete Besucher sich selbst oder andere Accounts zu Admins machen könnten.

## Firestore-Datenstruktur

### `users/{uid}`

Profil für ein Firebase-Authentication-Konto. Die ID muss exakt der Firebase-Auth-UID entsprechen.

```json
{
  "email": "person@example.com",
  "displayName": "Beispiel",
  "tags": [],
  "goldCoins": 0,
  "authProvider": "firebase-auth",
  "createdAt": "<Firestore Timestamp>",
  "lastProfileChangeAt": "<Firestore Timestamp>"
}
```

Das Profil wird von `ensureUserProfile` mit leeren Tags angelegt. Admin-Funktionen werden nicht über vom Client übermittelte Tags freigeschaltet, sondern lesen die gespeicherten Tags serverseitig.

### Gemeinsame Goldmünzen

`users/{uid}.goldCoins` ist das gemeinsame Goldmünzen-Guthaben des Kontos für alle TobiServices-Dienste. Es wird als nicht-negative Ganzzahl gespeichert und beginnt bei `0`. Bestehende Profile ohne dieses Feld werden beim Profil-Ladevorgang über `ensureUserProfile` ergänzt. Dienste sollen dieses zentrale Feld verwenden und keinen eigenen Münzestand in lokalen Speicher oder service-spezifische Dokumente legen.

Es ist absichtlich noch keine Funktion zum Verdienen, Gutschreiben oder Ausgeben von Goldmünzen implementiert. Die Clients können `users` nicht beschreiben; spätere Änderungen müssen über vertrauenswürdige, serverseitig autorisierte Funktionen erfolgen.

### `tobiAccounts/{usernameKey}` (Legacy)

Diese Collection hält eventuell noch alte Username/Passwort-Konten. Passwort-Hashes und Salts sind geschützt und dürfen nicht an Browser ausgeliefert werden. Neue E-Mail-Konten benötigen keinen Eintrag in dieser Collection. Wenn ein Legacy-Account existiert, synchronisiert `setTobiTags` dessen Tags weiterhin.

### `siteSettings/jdnext`

Der Wartungsstatus für JDNEXT. Lesen ist öffentlich erlaubt; Änderungen erfolgen ausschließlich über eine geschützte Admin-Cloud-Function.

## Admin Center

Das Admin Center unterstützt:
- alle Firebase-Auth-Konten suchen und anzeigen
- Tags einzeln oder in Bulk hinzufügen/entfernen
- Admin-Tags nach Serverprüfung vergeben
- Konten aktivieren/deaktivieren
- CSV-Export und den JDNEXT-Wartungsmodus

Die nicht verlinkte Seite `account-setup-7f3c.html` in JDNEXT-UI verwendet ebenfalls E-Mail-/Passwort-Login und erlaubt Tag-Änderungen nur, wenn der angemeldete Benutzer den `admin`-Tag besitzt. `noindex` und der versteckte Pfad sind keine Sicherheitsgrenze; entscheidend sind die serverseitigen Prüfungen.

## Sicherheit

- E-Mail-/Passwort-Anmeldung über Firebase Authentication.
- Passwörter werden nicht in Firestore-Tags, Profilen oder JDNEXT UI gespeichert.
- `users` darf nicht vom Browser beschrieben werden; Profile werden durch geschützte Cloud Functions verwaltet.
- `tobiAccounts` bleibt komplett durch Firestore Rules gesperrt.
- Admin-Cloud-Functions verlangen eine gültige Firebase-Auth-Sitzung und lesen den `admin`-Tag aus `users/{uid}`.
- Tags können nicht durch `ensureUserProfile` selbst vergeben werden; neue Profile erhalten `tags: []`.
- Deaktivieren und Tag-Änderungen laufen über das Backend.
