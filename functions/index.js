const crypto = require("crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { setGlobalOptions } = require("firebase-functions/v2/options");
const { logger } = require("firebase-functions");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();
setGlobalOptions({
  region: "europe-west1",
  maxInstances: 10
});

const db = getFirestore();
const adminAuth = getAuth();
const BOOTSTRAP_KEY = defineSecret("TOBI_BOOTSTRAP_KEY");

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;
const PASSWORD_MIN = 8;
const MAX_TAGS = 20;

function cleanUsername(value) {
  return String(value ?? "").trim();
}

function usernameKey(value) {
  return cleanUsername(value).toLowerCase();
}

function cleanDisplayName(value) {
  return String(value ?? "").trim().slice(0, 40);
}

function normalizeTags(tags) {
  return [...new Set(
    (Array.isArray(tags) ? tags : [])
      .map(tag => String(tag).toLowerCase().trim())
      .filter(Boolean)
      .map(tag => tag.replace(/[^a-z0-9äöüß_-]+/g, "-").slice(0, 24))
      .filter(Boolean)
  )].slice(0, MAX_TAGS);
}

function assertValidCredentials(username, password) {
  if (!USERNAME_RE.test(username)) {
    throw new HttpsError(
      "invalid-argument",
      "Der Username muss 3–32 Zeichen lang sein und darf nur Buchstaben, Zahlen, Punkt, Unterstrich und Bindestrich enthalten."
    );
  }

  if (typeof password !== "string" || password.length < PASSWORD_MIN || password.length > 128) {
    throw new HttpsError(
      "invalid-argument",
      "Das Passwort muss 8–128 Zeichen lang sein."
    );
  }
}

function makeUid(key) {
  return "tobi_" + crypto
    .createHash("sha256")
    .update("tobiservices:" + key)
    .digest("hex")
    .slice(0, 40);
}

function createPasswordRecord(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024
  });

  return {
    salt: salt.toString("base64"),
    passwordHash: hash.toString("base64"),
    passwordVersion: 1,
    kdf: "scrypt-N32768-r8-p1"
  };
}

function verifyPassword(password, record) {
  try {
    if (!record?.salt || !record?.passwordHash) return false;

    const salt = Buffer.from(record.salt, "base64");
    const expected = Buffer.from(record.passwordHash, "base64");
    const actual = crypto.scryptSync(password, salt, expected.length, {
      N: 32768,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024
    });

    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

async function isAdminUid(uid) {
  const snap = await db.doc("users/" + uid).get();
  if (!snap.exists) return false;
  const tags = Array.isArray(snap.data().tags) ? snap.data().tags : [];
  return tags.includes("admin");
}

async function requireAdmin(request) {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Anmeldung erforderlich.");
  }

  if (!(await isAdminUid(request.auth.uid))) {
    throw new HttpsError("permission-denied", "Admin-Rechte erforderlich.");
  }

  return request.auth.uid;
}

async function buildProfile(uid) {
  const snap = await db.doc("users/" + uid).get();
  if (!snap.exists) return null;
  return { uid, ...snap.data() };
}

async function mintToken(account, uid) {
  const tags = normalizeTags(account.tags);
  return adminAuth.createCustomToken(uid, {
    tobi: true,
    admin: tags.includes("admin"),
    tags
  });
}

exports.loginTobiAccount = onCall(async (request) => {
  const username = cleanUsername(request.data?.username);
  const password = request.data?.password;

  if (!USERNAME_RE.test(username) || typeof password !== "string") {
    throw new HttpsError("unauthenticated", "Username oder Passwort ist falsch.");
  }

  const key = usernameKey(username);
  const ref = db.doc("tobiAccounts/" + key);
  const snap = await ref.get();

  if (!snap.exists) {
    throw new HttpsError("unauthenticated", "Username oder Passwort ist falsch.");
  }

  const account = snap.data();

  if (account.disabled === true || !verifyPassword(password, account)) {
    throw new HttpsError("unauthenticated", "Username oder Passwort ist falsch.");
  }

  const token = await mintToken(account, account.uid);
  const profile = await buildProfile(account.uid);

  return {
    token,
    profile: profile || {
      uid: account.uid,
      username: account.username,
      displayName: account.displayName || account.username,
      tags: normalizeTags(account.tags)
    }
  };
});

exports.bootstrapTobiAdmin = onCall({ secrets: [BOOTSTRAP_KEY] }, async (request) => {
  const suppliedKey = String(request.data?.bootstrapKey ?? "");
  const expectedKey = String(BOOTSTRAP_KEY.value());

  if (!expectedKey || suppliedKey !== expectedKey) {
    throw new HttpsError("permission-denied", "Bootstrap-Schlüssel ist falsch.");
  }

  const username = cleanUsername(request.data?.username);
  const password = request.data?.password;
  const displayName = cleanDisplayName(request.data?.displayName) || username;

  assertValidCredentials(username, password);

  const existingAdmins = await db
    .collection("tobiAccounts")
    .where("tags", "array-contains", "admin")
    .limit(1)
    .get();

  if (!existingAdmins.empty) {
    throw new HttpsError("already-exists", "Es existiert bereits ein Admin-Account.");
  }

  const key = usernameKey(username);
  const ref = db.doc("tobiAccounts/" + key);
  const existing = await ref.get();

  if (existing.exists) {
    throw new HttpsError("already-exists", "Dieser Username ist bereits vergeben.");
  }

  const uid = makeUid(key);
  const passwordRecord = createPasswordRecord(password);

  await adminAuth.createUser({
    uid,
    displayName
  });

  await ref.set({
    username,
    usernameKey: key,
    displayName,
    uid,
    tags: ["admin"],
    disabled: false,
    ...passwordRecord,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });

  await db.doc("users/" + uid).set({
    username,
    displayName,
    tags: ["admin"],
    createdAt: FieldValue.serverTimestamp(),
    lastProfileChangeAt: FieldValue.serverTimestamp()
  });

  const token = await mintToken({ tags: ["admin"] }, uid);

  logger.info("TobiServices bootstrap admin created", {
    username: key,
    uid
  });

  return {
    token,
    profile: await buildProfile(uid)
  };
});

exports.createTobiAccount = onCall(async (request) => {
  const adminUid = await requireAdmin(request);

  const username = cleanUsername(request.data?.username);
  const password = request.data?.password;
  const displayName = cleanDisplayName(request.data?.displayName) || username;

  assertValidCredentials(username, password);

  const key = usernameKey(username);
  const ref = db.doc("tobiAccounts/" + key);

  if ((await ref.get()).exists) {
    throw new HttpsError("already-exists", "Dieser Username ist bereits vergeben.");
  }

  const uid = makeUid(key);
  const passwordRecord = createPasswordRecord(password);

  await adminAuth.createUser({
    uid,
    displayName
  });

  await ref.set({
    username,
    usernameKey: key,
    displayName,
    uid,
    tags: [],
    disabled: false,
    ...passwordRecord,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdBy: adminUid
  });

  await db.doc("users/" + uid).set({
    username,
    displayName,
    tags: [],
    createdAt: FieldValue.serverTimestamp(),
    lastProfileChangeAt: FieldValue.serverTimestamp()
  });

  return {
    ok: true,
    uid,
    username,
    displayName
  };
});

exports.listTobiUsers = onCall(async (request) => {
  await requireAdmin(request);

  const snap = await db.collection("users").limit(500).get();

  return {
    users: snap.docs.map(doc => ({
      uid: doc.id,
      ...doc.data()
    }))
  };
});

exports.setTobiTags = onCall(async (request) => {
  const adminUid = await requireAdmin(request);

  const uid = String(request.data?.uid ?? "");
  const tags = normalizeTags(request.data?.tags);

  if (!uid) {
    throw new HttpsError("invalid-argument", "UID fehlt.");
  }

  if (uid === adminUid && !tags.includes("admin")) {
    throw new HttpsError("failed-precondition", "Du kannst deinen eigenen letzten Admin-Tag nicht entfernen.");
  }

  const accountSnap = await db.collection("tobiAccounts").where("uid", "==", uid).limit(1).get();
  if (accountSnap.empty) {
    throw new HttpsError("not-found", "TobiServices-Account nicht gefunden.");
  }

  const accountRef = accountSnap.docs[0].ref;
  await accountRef.update({
    tags,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: adminUid
  });

  await db.doc("users/" + uid).update({
    tags,
    lastProfileChangeAt: FieldValue.serverTimestamp()
  });

  return { ok: true, uid, tags };
});

exports.setMaintenanceMode = onCall(async (request) => {
  const adminUid = await requireAdmin(request);

  const enabled = request.data?.enabled === true;
  const message = String(request.data?.message ?? "").trim().slice(0, 500);

  await db.doc("siteSettings/jdnext").set({
    enabled,
    message,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: adminUid
  }, { merge: true });

  logger.info("JDNEXT maintenance mode changed", {
    enabled,
    updatedBy: adminUid
  });

  return { ok: true, enabled, message };
});

exports.setTobiDisabled = onCall(async (request) => {
  const adminUid = await requireAdmin(request);
  const uid = String(request.data?.uid ?? "");
  const disabled = Boolean(request.data?.disabled);

  if (!uid) {
    throw new HttpsError("invalid-argument", "UID fehlt.");
  }

  if (uid === adminUid && disabled) {
    throw new HttpsError("failed-precondition", "Du kannst deinen eigenen Account hier nicht deaktivieren.");
  }

  const accountSnap = await db.collection("tobiAccounts").where("uid", "==", uid).limit(1).get();
  if (accountSnap.empty) {
    throw new HttpsError("not-found", "TobiServices-Account nicht gefunden.");
  }

  const accountRef = accountSnap.docs[0].ref;
  const account = accountSnap.docs[0].data();

  await accountRef.update({
    disabled,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: adminUid
  });

  try {
    await adminAuth.updateUser(uid, { disabled });
  } catch (error) {
    logger.warn("Firebase Auth user status could not be synchronized", {
      uid,
      error: String(error)
    });
  }

  return { ok: true, uid, disabled, username: account.username };
});
