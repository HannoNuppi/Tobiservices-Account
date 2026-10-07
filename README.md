# TobiServices Account Center

Zentrales, E-Mail-freies Account-System für TobiServices-Websites.

## Account-Modell

TobiServices verwendet eigene Accounts mit **Username + Passwort**.

Es gibt keine E-Mail-Adresse und keine Firebase-E-Mail/Passwort-Anmeldung. Die Passwortprüfung passiert serverseitig in Firebase Cloud Functions mit scrypt. Die Passwortdaten liegen in der geschützten Firestore-Sammlung `tobiAccounts` und werden niemals an Browser-Clients ausgeliefert.

Für die Sitzung wird intern ein Firebase Custom Token verwendet. Dadurch können Firestore Rules weiterhin sicher mit `request.auth.uid` arbeiten. Benutzer sehen davon nur die normale TobiServices-Anmeldung.

## Einmalige Firebase-Einrichtung

Im lokalen Projektordner:

1. Firebase CLI installieren und mit deinem Google/Firebase-Konto anmelden.
2. Projekt `tobiservices` auswählen.
3. Einen geheimen Bootstrap-Schlüssel setzen:
   `firebase functions:secrets:set TOBI_BOOTSTRAP_KEY`
4. Backend und Firestore Rules deployen:
   `firebase deploy --only functions,firestore`
5. Den lokalen TobiServices Account Client starten.
6. Unter „Ersten Admin anlegen“ denselben Bootstrap-Schlüssel verwenden.

Der Bootstrap-Endpunkt lässt sich nach dem Erstellen des ersten Admins nicht mehr zur Erstellung eines weiteren Admins verwenden.

Cloud Functions für Firebase benötigen aktuell den Blaze-Tarif. citeturn610044search2

## Seiten

- `login.html` – Username/Passwort-Login
- `account.html` – eigener Account und Tags
- `admin.html` – Admin Center
- `auth-core.js` – gemeinsames Client-Modul
- `functions/index.js` – serverseitige Account-Logik
- `functions/package.json` – Backend-Abhängigkeiten
- `firestore.rules` – geschützte Regeln

## Admin Center

Das Admin Center unterstützt:

- Accounts manuell erstellen
- Accounts suchen
- Tags hinzufügen und entfernen
- Tags als Bulk-Aktion ändern
- Accounts deaktivieren und aktivieren
- UID anzeigen und kopieren
- CSV-Export
- JDNEXT-Hausaufgaben-Monitor für `next-untis-plus`

## JDNEXT

JDNEXT verwendet weiterhin das alte Firebase-Projekt `next-untis-plus`.

- Stundenplan und Hausaufgaben lesen: ohne TobiServices-Account
- Hausaufgaben posten: ohne TobiServices-Account
- Meldungen: anonyme Firebase-Identität im Hintergrund
- TobiServices wird nur für eigene accountbezogene Funktionen benötigt

Die JDNEXT-API-Konfiguration ist unabhängig vom TobiServices-Projekt.

## Sicherheit

- Passwortprüfung nur serverseitig
- scrypt mit zufälligem Salt
- Passwort-Hash und Salt sind für normale Clients nicht lesbar
- `tobiAccounts` ist komplett durch Firestore Rules gesperrt
- Admin-Aktionen laufen über geschützte Callable Functions
- eigene Admin-Rolle kann nicht versehentlich vom letzten Admin entfernt werden
- deaktivierte Accounts werden bei der Anmeldung abgewiesen

Firebase beschreibt Custom Tokens ausdrücklich als serverseitig erzeugte Tokens, die anschließend mit `signInWithCustomToken()` am Client verwendet werden können. citeturn610044search0turn610044search3
