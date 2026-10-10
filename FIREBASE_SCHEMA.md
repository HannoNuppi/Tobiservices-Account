# Firebase-Datenstruktur – TobiServices

Neue Nutzer werden direkt in **Firebase Authentication** mit E-Mail und Passwort angelegt. Beim ersten authentifizierten Login legt die Cloud Function `ensureUserProfile` ein Profil in Firestore an, sofern es noch keines gibt. Neue Profile erhalten keine Rollen.

## 1. Firebase Authentication

Lege Nutzer im Firebase Console-Bereich **Authentication → Users** an. Firebase verwaltet ihre UID, E-Mail-Adresse, Passwortanmeldung und den Kontostatus. Die UID ist der Schlüssel zu ihrem Rollenprofil in Firestore.

## 2. `users/{uid}`

Profil- und Tag-Dokument. Die Dokument-ID muss exakt mit der Firebase-Authentication-UID übereinstimmen.

```json
{
  "email": "person@example.com",
  "displayName": "Beispiel",
  "tags": [],
  "authProvider": "firebase-auth",
  "createdAt": "<Firestore Timestamp>",
  "lastProfileChangeAt": "<Firestore Timestamp>"
}
```

Feldbedeutung:

- `email`: Firebase-Auth-E-Mail-Adresse
- `displayName`: Anzeigename
- `tags`: Array aus Strings, zum Beispiel `["admin"]`
- `authProvider`: Kennzeichnung des neuen Auth-Weges
- `createdAt`, `lastProfileChangeAt`: Firestore-Timestamps

**Nicht vom Browser beschreiben lassen.** Die Firestore-Regeln verweigern Client-Schreibzugriffe auf `users`. Die vertrauenswürdigen Cloud Functions erstellen Profile und ändern Tags.

## 3. Ersten Admin einmalig einrichten

Kein Bootstrap-Key wird gebraucht. Nutze die Firebase Console mit deinem vertrauenswürdigen Projekt-Owner-Konto:

1. Unter Authentication → Users das eigene Konto auswählen und die vollständige UID kopieren.
2. Unter Firestore Database die Collection `users` und das Dokument mit der ID dieser UID öffnen. Wenn es noch nicht existiert, ein Dokument mit genau dieser UID anlegen.
3. `email` als String, `displayName` als String und `tags` als Array mit dem einzigen String `admin` setzen. Beim neuen Dokument zusätzlich `createdAt` und `lastProfileChangeAt` als Timestamps eintragen.

Wenn das Profil bereits besteht, ändere nur das `tags`-Feld und bewahre andere Felder auf. Danach kannst du Admin-Tags im Admin Center verwalten.

Eine öffentliche, unangemeldete Funktion zum Vergeben von Admin-Rechten ist absichtlich nicht vorgesehen. Jede weitere Rollenänderung wird durch eine Cloud Function geprüft, die die angemeldete UID und deren bereits vorhandenen `admin`-Tag überprüft.

## 4. `siteSettings/jdnext`

Wartungsstatus für die JDNEXT-Website:

```json
{
  "enabled": false,
  "message": "",
  "updatedAt": "<Firestore Timestamp>"
}
```

Lesen darf öffentlich möglich sein; Schreiben erfolgt nur über die geschützte Admin-Cloud-Function.

## 5. `tobiAccounts/{usernameKey}` (Legacy)

Diese Collection kann ältere Username/Passwort-Konten enthalten. Passwort-Hash und Salt werden serverseitig gehalten und sind durch Firestore-Regeln gesperrt. Neue Firebase-E-Mail-Konten benötigen keinen Eintrag in dieser Collection. Bei noch bestehenden Legacy-Konten synchronisiert die Tag-Funktion die Tags soweit ein entsprechender Legacy-Eintrag vorhanden ist.

## 6. Deployment-Hinweis

Nach Code-Änderungen:

`firebase deploy --only functions,firestore`

Firebase kann dabei nachfragen, ob die nicht mehr verwendete Function `bootstrapTobiAdmin` gelöscht werden soll. Bestätige diese Entfernung, damit der alte Bootstrap-Key-Endpunkt nicht als bereits deployte Function weiterläuft.
