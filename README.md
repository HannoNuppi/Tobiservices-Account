# TobiServices Account Center (Firebase Spark)

Gemeinsamer Account- und Rollenservice für TobiServices-Websites. Account Center, Admin-Oberfläche und die JDNEXT-Münzlogik verwenden Firebase Authentication, Firestore und streng geprüfte Firestore-Regeln. Die Münzlogik für textbasierte Hausaufgaben benötigt keine Cloud Functions und keinen Blaze-Tarif.

## Einmalige Einrichtung ohne Terminal

1. Öffne die [Firebase Console](https://console.firebase.google.com/) und wähle das Projekt `tobiservices`.
2. Unter **Authentication → Sign-in method** müssen **E-Mail/Passwort** und **Anonym** aktiviert sein. Anonyme Sitzungen ermöglichen Hausaufgaben posten und melden ohne TobiServices-Account. Neue Nutzer legst du unter **Authentication → Users** an.
3. Öffne **Firestore Database → Rules**.
4. Ersetze dort die Regeln durch den Inhalt von [`firestore.rules`](https://github.com/HannoNuppi/Tobiservices-Account/blob/main/firestore.rules) und klicke auf **Publish**. Diese Schritte benötigen kein lokales Projektverzeichnis und keinen Cloud-Functions-Deploy.
5. Öffne das Admin Center neu und melde dich mit dem Konto an, dessen Dokument `users/{UID}` bereits `tags: ["admin"]` hat.

**Achtung:** Die Regeln sind die Sicherheitsgrenze für Tag-Verwaltung und Guthaben. Veröffentliche nicht versehentlich permissive Regeln wie `allow read, write: if true`.

## So funktioniert das Spark-kompatible Modell

- Neue Firebase-Auth-Nutzer erhalten beim ersten erfolgreichen Profil-Lesevorgang ein Firestore-Profil `users/{UID}`, falls es noch fehlt. Die Regeln erlauben dabei nur `tags: []` und `goldCoins: 0`.
- Das Admin Center listet nur Profile aus `users`. Ein Konto, das nur in Firebase Authentication angelegt und noch nie bei einem TobiServices-Dienst angemeldet wurde, erscheint erst nach dem ersten Login.
- Bestehende Admins dürfen Tags und Dienstzugriff verwalten, JDNEXT-Wartung aktivieren und den Coinstand von Profilen ändern. Das eigene Admin-Tag ist beim eigenen Profil geschützt.
- Admins können ihren persönlichen Wartungsbypass in JDNEXT aktivieren; der Schalter wird im eigenen Profil gespeichert und wirkt nur auf die JDNEXT-Wartungsseite.
- Der Schalter **Dienste sperren** setzt `users/{UID}.disabled = true`. Das deaktiviert nicht das Firebase-Authentication-Konto an sich; jede angebundene Website muss das Feld beachten.
- Ältere Username/Passwort-Konten und die in `functions/index.js` verbliebenen Callable Functions werden im Spark-Client nicht verwendet.

## Ersten Admin einrichten

Die erste Admin-Rolle muss einmalig über die vertrauenswürdige Firebase Console eingerichtet werden:

1. Unter Authentication → Users die eigene UID kopieren.
2. Unter Firestore Database → Data die Collection `users` öffnen.
3. Ein Dokument mit genau dieser UID als Dokument-ID anlegen bzw. öffnen.
4. `tags` als Array mit einem String-Element `admin` setzen. Ergänze `email`, `displayName`, `authProvider = "firebase-auth"` und für neue Profile `goldCoins = 0`, `createdAt`, `lastProfileChangeAt`.

Die Firebase Console ist eine vertrauenswürdige Verwaltungsschnittstelle. **Nie** clientseitige Schreibrechte auf die Tags oder Rollen öffnen. Nach Einrichtung der ersten Admin-Rolle können weitere Tag-Änderungen im Admin Center stattfinden.

## Firestore-Profil und gemeinsame Goldmünzen

### `users/{uid}`

Die UID des Dokuments muss exakt zur Firebase-Authentication-UID gehören. Beispiel:

```json
{
  "email": "person@example.com",
  "displayName": "Beispiel",
  "tags": [],
  "goldCoins": 0,
  "authProvider": "firebase-auth"
}
```

`users/{uid}.goldCoins` ist das gemeinsame Guthaben über alle TobiServices-Dienste. Es ist eine sichere ganze Zahl und darf bei Moderationsstrafen negativ werden. Normale Kontoinhaber dürfen ein fehlendes Guthabenfeld nur einmalig auf `0` initialisieren; bestehende Guthaben dürfen nicht frei verändert werden. Nur Admins können den Saldo im Admin Center beliebig ändern. Bei JDNEXT wird `+10` in derselben atomaren Firestore-Transaktion wie ein neuer Homework-Eintrag gutgeschrieben; eine Löschung nach zwei eindeutigen Meldungen wird regelbasiert mit `−20` verknüpft.

### `siteSettings/jdnext`

Wartungsstatus für JDNEXT. Lesen ist öffentlich erlaubt, Änderungen dürfen nur von Admins erfolgen. Der optionale persönliche Bypass steht im Profilfeld `users/{uid}.maintenanceBypass`; nur der jeweilige Admin darf ihn für sich selbst umschalten.

### `tobiAccounts/{usernameKey}` (Legacy)

Die alte Username/Passwort-Collection bleibt für Browser vollständig gesperrt.

## JDNEXT-Münzen und Moderation ohne Blaze

Neue JDNEXT-Hausaufgaben liegen im TobiServices-Firestore-Projekt unter `jdnextHomework/{hwKey}/entries/{entryId}`. Die private Zuordnung zum Autor liegt unter `jdnextHomeworkPrivate/{hwKey}/entries/{entryId}` und ist regulär nicht lesbar. Ein Münzereignis wird unter `jdnextCoinEvents/{eventId}` gespeichert; diese Ereignisse sind nicht clientseitig lesbar, änderbar oder löschbar.

- Posten und melden funktioniert ohne TobiServices-Konto. Solche Einträge bekommen keinen Kontobonus.
- Ein angemeldeter, nicht gesperrter TobiServices-Account erhält `+10` zusammen mit dem neuen Eintrag in einem Firestore-Commit.
- Pro Firebase-Identität gibt es höchstens eine Meldung je Eintrag. Zwei verschiedene Identitäten erhöhen den Meldungszähler auf zwei; danach können Eintrag, private Zuordnung und die `−20`-Buchung nur als zusammengehöriger, von Rules geprüfter Commit entfernt werden.
- Bei `goldCoins <= -50` wird `users/{uid}.disabled = true` gesetzt. Das Konto und sein Guthaben werden nicht gelöscht.

**Wichtige Grenze des Spark-Tarifs:** Ohne vertrauenswürdige Serverfunktion kann Firebase Authentication nicht serverseitig auf `disabled=true` gesetzt werden. Diese Lösung sperrt deshalb den TobiServices-Dienstzugriff über das Profilfeld `disabled`; alle angeschlossenen Dienste müssen dieses Feld respektieren. Die Anmeldung selbst kann weiterhin bestehen. Die Regeln verhindern, dass ein Browser den Saldo frei ändert.

### Aktivieren

1. Öffne Firebase Console → Projekt `tobiservices` → Authentication → Sign-in method und aktiviere **Anonym** zusätzlich zu E-Mail/Passwort.
2. Öffne Firestore Database → Rules, übernimm `firestore.rules` aus diesem Repository und klicke auf **Publish**.
3. Für den reinen Text-Hausaufgaben-, Meldungs- und Münzablauf ist kein Cloud-Functions-Deploy und kein Secret nötig.

Die bestehende Discord-Bild-Upload-Funktion von JDNEXT ist davon getrennt und verwendet weiterhin eine Cloud Function; sie braucht weiterhin die dafür beschriebene Functions-Einrichtung.

## Einschränkungen ohne Blaze

Das Spark-Modell kann die Konten in Firebase Authentication nicht mit dem Admin SDK deaktivieren. Die JDNEXT-Straflogik setzt deshalb `users/{uid}.disabled = true`; das ist eine Dienstsperre, keine Abschaltung des Authentication-Logins. Alle angebundenen TobiServices-Dienste müssen dieses Feld beachten. Die Hausaufgaben-, Report- und Münzlogik wird durch Firestore Rules geprüft und benötigt keine Cloud Functions.

GitHub Pages liefert statische Dateien aus. Ein clientseitiger Beta-Bildschirm ist deshalb keine Geheimhaltung für HTML-/JavaScript-Dateien; private Daten müssen durch Firestore-Regeln geschützt werden.

## GitHub Pages

Die Website-Dateien werden bei aktivierter GitHub-Pages-Konfiguration von `main` veröffentlicht. Die textbasierte Hausaufgaben-, Report- und Münzlogik benötigt nur die veröffentlichte `firestore.rules` dieses Repositorys und aktiviert Anonym-Auth. Nur die getrennte Discord-Bildfunktion braucht weiterhin Cloud Functions.
