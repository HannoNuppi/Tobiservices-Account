# Firebase-Accountsystem für deine GitHub-Websites

## Einrichtung

1. **Firebase-Projekt** anlegen, eine Web-App registrieren und die Config in `auth-core.js` eintragen (auch `DEINNAME` bei `loginUrl` und `allowedReturnHosts` ersetzen).
2. **Authentication**: Anmeldemethode "E-Mail/Passwort" aktivieren. Unter *Einstellungen > Autorisierte Domains* jede Domain eintragen, auf der das System läuft (z. B. `deinname.github.io`).
3. **Firestore** anlegen und den Inhalt von `firestore.rules` im Tab *Regeln* veröffentlichen.
4. **Ersten Admin festlegen**: Konto über `login.html` registrieren. Dann in Firestore das Dokument `users/<UID>` öffnen und im Feld `tags` (Array) den Eintrag `admin` hinzufügen (UID findest du unter Authentication). Weitere Admins vergibst du danach im Admin-Panel, indem du dem Account den Tag `admin` gibst.
5. Den Ordner samt deinen `theme.css` und `theme.js` in ein Repo (z. B. `accounts`) legen und GitHub Pages aktivieren. Das Admin-Panel liegt dann unter `.../accounts/admin.html`.

## In einer Website nutzen

```html
<script src="theme.js"></script>
<script type="module">
import { onUser, changeMojo, hasTag, requireLogin, signOut }
  from "https://DEINNAME.github.io/accounts/auth-core.js";

onUser(async (user, profile) => {
  if (!user) return;                       // oder requireLogin() für geschützte Seiten
  console.log(profile.displayName, profile.mojo, profile.tags);
  if (hasTag(profile, "vip")) { /* Bereich für Accounts mit dem Tag "vip" */ }
});

// Mojo vergeben (positiv) oder ausgeben (negativ)
const ok = await changeMojo(10, "Level geschafft");
if (!ok) jdToast("Mojo konnte nicht gebucht werden.");
</script>
```

## Gut zu wissen

- **Mojo-Grenzen:** Die Regeln erlauben pro Buchung höchstens +100 und nur alle 5 Sekunden (`maxAward()` und `cooldown()` in `firestore.rules`). Da die Websites selbst vergeben, kann jemand mit Programmierkenntnissen im Rahmen dieser Grenzen trotzdem schummeln. Für wirklich manipulationssichere Belohnungen braucht es Cloud Functions (Blaze-Tarif).
- **Verlauf (`mojoLog`)** wird vom Browser geschrieben und dient nur zur Anzeige.
- **Geteilter Login:** Seiten unter `deinname.github.io/...` teilen sich denselben Browser-Speicher, man bleibt dort überall angemeldet. Eigene Domains fragen einmal separat nach dem Login (gleiches Konto).
- Der API-Key in der Config ist bei Firebase öffentlich gedacht. Geschützt wird über die Regeln und die autorisierten Domains.
