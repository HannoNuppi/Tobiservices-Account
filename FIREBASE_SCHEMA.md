# Firebase-Datenstruktur – TobiServices

Diese Struktur wird vom Backend verwaltet. Firestore ist schemafrei: Eine Collection wird sichtbar, sobald ein echtes Dokument darin angelegt wird. Das Backend legt die Schema-Referenz bei der ersten Admin-Einrichtung unter `system/schema` an.

## 1. `tobiAccounts/{usernameKey}`

Wird vom Backend bei der Erstellung eines Accounts erzeugt. Der Admin ist ein normaler TobiServices-Account mit dem Tag `admin`.

Beispielstruktur (nur zur Ansicht; nicht manuell anlegen):

```json
{
  "username": "beispieladmin",
  "usernameKey": "beispieladmin",
  "displayName": "Beispiel Admin",
  "uid": "tobi_<vom Backend erzeugte UID>",
  "tags": ["admin"],
  "disabled": false,
  "salt": "<vom Backend zufällig erzeugter Base64-Wert>",
  "passwordHash": "<vom Backend berechneter scrypt-Hash>",
  "passwordVersion": 1,
  "kdf": "scrypt-N32768-r8-p1",
  "createdAt": "<Firestore Timestamp>",
  "updatedAt": "<Firestore Timestamp>"
}
```

**Nicht manuell einfügen:** `uid`, `salt` und `passwordHash` müssen zum Firebase-Authentication-Konto bzw. zum eingegebenen Passwort passen. Sie werden gemeinsam durch `bootstrapTobiAdmin` erzeugt. Der sichere Weg ist, den Bootstrap-Vorgang zu benutzen.

## 2. `users/{uid}`

Öffentliches/sicher begrenztes Profil für die angemeldete Person:

```json
{
  "username": "beispieladmin",
  "displayName": "Beispiel Admin",
  "tags": ["admin"],
  "createdAt": "<Firestore Timestamp>",
  "lastProfileChangeAt": "<Firestore Timestamp>"
}
```

Auch dieses Dokument erstellt das Backend automatisch. `{uid}` muss exakt der vom Backend erzeugten Firebase-Authentication-UID entsprechen.

## 3. `siteSettings/jdnext`

Wird bei der ersten Admin-Einrichtung mit Standardwerten angelegt. Der Admin-Bereich aktualisiert danach diesen Datensatz:

```json
{
  "enabled": false,
  "message": "",
  "updatedAt": "<Firestore Timestamp>"
}
```

## 4. `system/schema`

Wird vom Backend als Schema-Hinweis angelegt. Er beschreibt Feldnamen und Typen; er ist kein Account und sollte nicht manuell bearbeitet werden.

## 5. Bootstrap-Schlüssel

Der geheime Wert wird **nicht** in einer Firestore-Collection gespeichert.

- Firebase-Projekt: `tobiservices`
- Secret-Name: `TOBI_BOOTSTRAP_KEY`
- Speicherort: Firebase/Google Cloud Secret Manager
- Wert: selbst gewählter, zufälliger geheimer Text

Der Secret-Name ist nicht der geheime Wert. Den echten Wert gibst du beim ersten Admin-Bootstrap ein. Nach Erstellung des ersten Admins wird dieser Bootstrap-Endpunkt gesperrt.
