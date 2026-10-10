# TobiServices Account Center (Firebase Spark)

Gemeinsamer Account- und Rollenservice für TobiServices-Websites. Account Center und Admin-Oberfläche nutzen Firebase Authentication und Firestore. Die JDNEXT-Münzautomatik benötigt zusätzlich die bereitgestellten Cloud Functions und einen Firebase-Blaze-Tarif.

## Einmalige Einrichtung ohne Terminal

1. Öffne die [Firebase Console](https://console.firebase.google.com/) und wähle das Projekt `tobiservices`.
2. Unter **Authentication → Sign-in method** muss **E-Mail/Passwort** aktiviert sein. Neue Nutzer legst du unter **Authentication → Users** an.
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

`users/{uid}.goldCoins` ist das gemeinsame Guthaben über alle TobiServices-Dienste. Es ist eine sichere ganze Zahl und darf bei Moderationsstrafen negativ werden. Normale Kontoinhaber dürfen ein fehlendes Guthabenfeld nur einmalig auf `0` initialisieren; bestehende Guthaben dürfen nicht clientseitig verändert werden. Nur Admins können den Saldo im Admin Center ändern. JDNEXT vergibt serverseitig `+10` pro veröffentlichtem Hausaufgabeneintrag und zieht bei Entfernung nach zwei verschiedenen Meldungen `20` Münzen ab.

### `siteSettings/jdnext`

Wartungsstatus für JDNEXT. Lesen ist öffentlich erlaubt, Änderungen dürfen nur von Admins erfolgen. Der optionale persönliche Bypass steht im Profilfeld `users/{uid}.maintenanceBypass`; nur der jeweilige Admin darf ihn für sich selbst umschalten.

### `tobiAccounts/{usernameKey}` (Legacy)

Die alte Username/Passwort-Collection bleibt für Browser vollständig gesperrt.

## JDNEXT-Münzen und automatische Kontosperre

Für die automatische Vergabe und den Abzug wird ein serverseitiger Aufruf zwischen den Cloud Functions beider Firebase-Projekte verwendet. Der gemeinsame Schlüssel darf **nicht** im HTML, in GitHub oder in Firestore stehen. Lege einen langen zufälligen Wert fest und trage exakt denselben Wert in beiden Projekten ein:

```bash
# Projekt tobiservices
firebase use tobiservices
firebase functions:secrets:set JDNEXT_REWARD_SECRET
firebase deploy --only functions,firestore:rules

# Projekt next-untis-plus
firebase use next-untis-plus
firebase functions:secrets:set TOBI_REWARD_SECRET
firebase deploy --only functions,firestore:rules
```

Die CLI fragt den Secret-Wert interaktiv ab. Verwende bei beiden Secret-Namen denselben zufälligen Wert. Cloud Functions und Secret Manager benötigen einen Firebase-Blaze-Tarif. Die bestehende Website bleibt statisch erreichbar; ohne veröffentlichte Functions sind die serverseitigen Münzfunktionen aber nicht aktiv.

- Hausaufgaben posten und melden benötigt weiterhin **kein TobiServices-Konto**.
- Ein verifiziert angemeldeter TobiServices-Account erhält `+10` beim Posten.
- Zwei Meldungen von unterschiedlichen anonymen JDNEXT-Identitäten entfernen den Eintrag; wenn sein Autor ein TobiServices-Konto hatte, werden `20` Münzen abgezogen.
- Bei einem Guthaben von `-50` oder weniger wird der Firebase-Authentication-Account gesperrt und das Profil bleibt zur Wiederherstellung erhalten. Es wird nichts gelöscht.

## Einschränkungen ohne Blaze

Der Spark-Betrieb kann keine Cloud Functions verwenden. Daher kann die Webseite die Firebase-Auth-User-Verwaltung nicht wie die Admin SDK-Funktionen bedienen: Das Admin Center zeigt initialisierte TobiServices-Profile statt einer vollständigen Liste jedes Auth-Kontos. Die Sperrfunktion sperrt den Zugriff auf unterstützende TobiServices-Websites, nicht die Anmeldung bei Firebase Authentication selbst.

GitHub Pages liefert statische Dateien aus. Ein clientseitiger Beta-Bildschirm ist deshalb keine Geheimhaltung für HTML-/JavaScript-Dateien; wirklich private Daten müssen in Firestore oder einem anderen Serverdienst durch Regeln/Zugriffskontrollen geschützt werden.

## GitHub Pages

Die Website-Dateien werden bei aktivierter GitHub-Pages-Konfiguration von `main` veröffentlicht. Für die Spark-kompatible Version ist kein `firebase deploy --only functions` erforderlich. Die Firestore-Regeln müssen einmalig in der Firebase Console veröffentlicht werden.
