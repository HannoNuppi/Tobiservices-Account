# TobiServices Account Center

Zentrales, E-Mail-freies Account-System für TobiServices-Websites.

## Anmeldung

TobiServices verwendet **Firebase Anonymous Authentication**. Es wird beim Start eines Accounts kein E-Mail-Konto benötigt.

Der Account besteht aus einer Firebase-UID plus einem Anzeigenamen und optionalen Tags.

Wichtig: Ein anonymes Firebase-Konto ist an die lokale Firebase-Sitzung des Browsers gebunden. Ohne eine später verknüpfte Anmeldemethode gibt es keine sichere Wiederherstellung desselben Accounts auf einem anderen Gerät.

## Einmalige Firebase-Einrichtung

In Firebase Console:

1. **Authentication** → **Sign-in method**
2. Den Anbieter **Anonymous / Anonym** aktivieren.
3. Firestore Database anlegen.
4. `firestore.rules` veröffentlichen.
5. Einen Account über `login.html` starten.
6. Das dadurch erzeugte `users/<UID>`-Dokument einmalig manuell mit `tags: ["admin"]` versehen.

Die offizielle Firebase-Dokumentation beschreibt die anonyme Anmeldung unter „Sicherheit → Authentifizierung → Anmeldemethode → Anonym“. 

## Seiten

- `login.html` – Account starten
- `account.html` – eigener Account und Tags
- `admin.html` – Admin Center
- `auth-core.js` – gemeinsames Auth-Modul
- `firestore.rules` – Sicherheitsregeln

## Admin Center

Das Admin Center unterstützt:

- Accountsuche nach Anzeigename oder UID
- Tag-Filter
- Tags hinzufügen/entfernen
- Bulk-Änderungen für mehrere Accounts
- UID kopieren
- CSV-Export
- Account-Statistiken
- JDNEXT-Hausaufgaben-Monitor für `next-untis-plus`

## Verbindung mit Websites

Eine Website kann das Auth-Modul direkt verwenden:

```html
<script type="module">
import {
  onUser,
  requireLogin,
  hasTag
} from "https://hannonuppi.github.io/Tobiservices-Account/auth-core.js";

onUser((user, profile) => {
  if (!user) return requireLogin();

  console.log(profile?.displayName, profile?.tags);

  if (hasTag(profile, "admin")) {
    // Admin-Bereich
  }
});
</script>
```

TobiServices und JDNEXT verwenden bewusst **getrennte Firebase-Projekte**. JDNEXT benutzt weiterhin `next-untis-plus`; der TobiServices-Account ist dort optional und wird nicht zur Anzeige öffentlicher Hausaufgaben benötigt.

## Sicherheit

Die Firestore-Regeln erlauben Benutzern nur den Zugriff auf das eigene Profil. Rollen und Tags können nicht vom Benutzer selbst gesetzt werden; Admin-Änderungen werden serverseitig durch Firestore Rules geschützt.
