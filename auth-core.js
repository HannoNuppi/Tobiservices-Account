/* TobiServices Account Core — Spark-kompatibel.
   Neue Konten verwenden Firebase Authentication (E-Mail/Passwort).
   Profile und Adminverwaltung nutzen Firestore mit restriktiven Security Rules.
   Dieses Modul ruft keine Cloud Functions auf. */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut as firebaseSignOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  collection,
  getDocs,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const CONFIG = Object.freeze({
  firebase: {
    apiKey: "AIzaSyCwVh8-JIm-pj8N8bOWgwz8-G_cLQ6AVuQ",
    authDomain: "tobiservices.firebaseapp.com",
    projectId: "tobiservices",
    storageBucket: "tobiservices.firebasestorage.app",
    messagingSenderId: "552906640909",
    appId: "1:552906640909:web:99f583a0f4145e96ee8f44",
    measurementId: "G-9LKPHE93S1"
  },
  loginUrl: "https://hannonuppi.github.io/Tobiservices-Account/login.html",
  accountUrl: "https://hannonuppi.github.io/Tobiservices-Account/account.html",
  allowedReturnHosts: ["hannonuppi.github.io"]
});

const app = initializeApp(CONFIG.firebase);
export const auth = getAuth(app);
export const db = getFirestore(app);

await setPersistence(auth, browserLocalPersistence);

export const signOut = () => firebaseSignOut(auth);

function asProfile(uid, data) {
  const profile = { uid, ...data };
  if (!Number.isSafeInteger(profile.goldCoins)) {
    profile.goldCoins = 0;
  }
  profile.tags = Array.isArray(profile.tags) ? profile.tags : [];
  return profile;
}

export async function login(email, password) {
  const normalizedEmail = String(email ?? "").trim();
  const secret = String(password ?? "");
  if (!normalizedEmail || !secret) {
    throw new Error("email-and-password-required");
  }

  const result = await signInWithEmailAndPassword(auth, normalizedEmail, secret);
  const profile = await getProfile(result.user.uid);
  if (profile?.disabled === true) {
    await firebaseSignOut(auth);
    const error = new Error("Dieses TobiServices-Konto ist gesperrt. Bitte wende dich an einen Admin.");
    error.code = "account-disabled-by-moderation";
    throw error;
  }
  return { user: result.user, profile };
}

// Old username/password accounts relied on Cloud Functions and are not
// available in the free Spark-only configuration.
export async function loginLegacy() {
  const error = new Error("Legacy-Login benötigt das bisherige Cloud-Functions-Backend.");
  error.code = "legacy-login-requires-cloud-functions";
  throw error;
}

export async function getProfile(uid = auth.currentUser?.uid) {
  if (!uid) return null;
  if (!auth.currentUser || auth.currentUser.uid !== uid) {
    throw new Error("profile-read-current-user-only");
  }

  const profileRef = doc(db, "users", uid);
  let snap = await getDoc(profileRef);

  if (!snap.exists()) {
    const currentUser = auth.currentUser;
    try {
      // Firestore rules permit profile self-creation only with tags=[] and
      // goldCoins=0. A failed concurrent create is handled by re-reading.
      await setDoc(profileRef, {
        email: currentUser.email || "",
        displayName: currentUser.displayName || "",
        tags: [],
        goldCoins: 0,
        authProvider: "firebase-auth",
        createdAt: serverTimestamp(),
        lastProfileChangeAt: serverTimestamp()
      });
    } catch (error) {
      snap = await getDoc(profileRef);
      if (!snap.exists()) throw error;
    }

    snap = await getDoc(profileRef);
    if (!snap.exists()) throw new Error("profile-create-failed");
  }

  const data = snap.data() || {};
  if (!Object.prototype.hasOwnProperty.call(data, "goldCoins")) {
    // Existing profiles from before the currency field may initialize it to
    // zero once. Rules disallow changing a balance once the field exists.
    try {
      await updateDoc(profileRef, { goldCoins: 0 });
    } catch (error) {
      console.warn("Goldmünzen-Feld konnte noch nicht initialisiert werden:", error);
    }
    data.goldCoins = 0;
  }

  return asProfile(uid, data);
}

export function onUser(callback) {
  return onAuthStateChanged(auth, async user => {
    // Anonyme JDNEXT-Sitzungen dürfen posten und melden, sind aber kein
    // angemeldeter TobiServices-Account und sollen den Login nicht blockieren.
    if (!user || user.isAnonymous) {
      callback(null, null);
      return;
    }

    try {
      const profile = await getProfile(user.uid);
      callback(user, profile);
    } catch (error) {
      console.error("Accountprofil konnte nicht geladen werden:", error);
      callback(user, null);
    }
  });
}

export const hasTag = (profile, tag) =>
  Array.isArray(profile?.tags) &&
  profile.tags.includes(String(tag).toLowerCase());

export const isAdmin = profile => profile?.disabled !== true && hasTag(profile, "admin");

export async function createAccount(email, password, displayName) {
  const normalizedEmail = String(email ?? "").trim();
  const secret = String(password ?? "");
  const cleanName = String(displayName ?? "").replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 80);

  if (!normalizedEmail || !secret || !cleanName) {
    throw new Error("Bitte Name, E-Mail-Adresse und Passwort ausfüllen.");
  }
  if (secret.length < 8) {
    const error = new Error("Das Passwort muss mindestens 8 Zeichen lang sein.");
    error.code = "auth/weak-password";
    throw error;
  }
  if (secret.length > 128) {
    throw new Error("Das Passwort darf höchstens 128 Zeichen lang sein.");
  }

  const result = await createUserWithEmailAndPassword(auth, normalizedEmail, secret);
  try {
    await updateProfile(result.user, { displayName: cleanName });
    const profile = await getProfile(result.user.uid);
    if (profile?.disabled === true) {
      await firebaseSignOut(auth);
      const error = new Error("Dieses Konto ist gesperrt.");
      error.code = "account-disabled-by-moderation";
      throw error;
    }
    return { user: result.user, profile };
  } catch (error) {
    // Auth account is already created at this point. A later login retries
    // creation of the profile through getProfile() if Firestore was unavailable.
    console.error("Account ist erstellt, das Profil konnte aber nicht vollständig initialisiert werden:", error);
    throw error;
  }
}

export async function listUsers() {
  const snapshot = await getDocs(collection(db, "users"));
  return snapshot.docs.map(item => {
    const data = item.data() || {};
    return {
      uid: item.id,
      email: data.email || "",
      username: data.username || data.email || "",
      displayName: data.displayName || data.email || "",
      tags: Array.isArray(data.tags) ? data.tags : [],
      goldCoins: Number.isSafeInteger(data.goldCoins) ? data.goldCoins : 0,
      disabled: data.disabled === true,
      maintenanceBypass: data.maintenanceBypass === true,
      createdAt: data.createdAt || null,
      authProvider: data.authProvider || "firebase-auth"
    };
  }).sort((a, b) => String(a.email || a.username).localeCompare(String(b.email || b.username)));
}

function normalizeTags(tags) {
  return [...new Set((Array.isArray(tags) ? tags : [])
    .map(tag => String(tag).toLowerCase().trim())
    .filter(Boolean)
    .map(tag => tag.replace(/[^a-z0-9äöüß_-]+/g, "-").slice(0, 24))
    .filter(Boolean))].slice(0, 20);
}

export async function setTags(uid, tags) {
  const targetUid = String(uid ?? "");
  if (!targetUid) throw new Error("uid-required");
  const cleanTags = normalizeTags(tags);
  if (targetUid === auth.currentUser?.uid && !cleanTags.includes("admin")) {
    throw new Error("Du kannst deinen eigenen Admin-Tag nicht entfernen.");
  }

  const ref = doc(db, "users", targetUid);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Für diesen Account existiert noch kein TobiServices-Profil.");
  await updateDoc(ref, {
    tags: cleanTags,
    lastProfileChangeAt: serverTimestamp()
  });
  return { ok: true, uid: targetUid, tags: cleanTags };
}

export async function setGoldCoins(uid, amount) {
  const targetUid = String(uid ?? "");
  const balance = Number(amount);
  if (!targetUid) throw new Error("uid-required");
  if (!Number.isSafeInteger(balance)) {
    throw new Error("Der Kontostand muss eine ganze Zahl im sicheren Zahlenbereich sein.");
  }
  const current = auth.currentUser;
  if (!current) throw new Error("Bitte melde dich erneut an.");

  const currentSnap = await getDoc(doc(db, "users", current.uid));
  const currentProfile = currentSnap.exists() ? currentSnap.data() || {} : {};
  if (!Array.isArray(currentProfile.tags) || !currentProfile.tags.includes("admin")) {
    throw new Error("Nur Admins dürfen Goldmünzen ändern.");
  }

  if (targetUid === current.uid && balance <= -50) {
    throw new Error("Du kannst deinen eigenen Admin-Account nicht über die Sperrschwelle setzen.");
  }
  const targetRef = doc(db, "users", targetUid);
  const targetSnap = await getDoc(targetRef);
  if (!targetSnap.exists()) throw new Error("Für diesen Account existiert noch kein TobiServices-Profil.");

  const update = {
    goldCoins: balance,
    lastProfileChangeAt: serverTimestamp()
  };
  if (balance <= -50) update.disabled = true;
  await updateDoc(targetRef, update);
  return { ok: true, uid: targetUid, goldCoins: balance };
}

export async function setMaintenanceBypass(enabled) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Bitte melde dich erneut an.");

  const profileRef = doc(db, "users", uid);
  const snap = await getDoc(profileRef);
  const data = snap.exists() ? snap.data() || {} : {};
  if (!Array.isArray(data.tags) || !data.tags.includes("admin")) {
    throw new Error("Der Wartungsbypass ist nur für Admins verfügbar.");
  }

  await updateDoc(profileRef, {
    maintenanceBypass: Boolean(enabled),
    lastProfileChangeAt: serverTimestamp()
  });
  return Boolean(enabled);
}

export async function setDisabled(uid, disabled) {
  const targetUid = String(uid ?? "");
  if (!targetUid) throw new Error("uid-required");
  if (targetUid === auth.currentUser?.uid && disabled) {
    throw new Error("Du kannst deinen eigenen Account nicht sperren.");
  }
  const ref = doc(db, "users", targetUid);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Für diesen Account existiert noch kein TobiServices-Profil.");
  const profile = snap.data() || {};
  if (!disabled && Number.isSafeInteger(profile.goldCoins) && profile.goldCoins <= -50) {
    throw new Error("Das Guthaben muss zuerst über -50 Goldmünzen angehoben werden.");
  }
  await updateDoc(ref, {
    disabled: Boolean(disabled),
    lastProfileChangeAt: serverTimestamp()
  });
  return { ok: true, uid: targetUid, disabled: Boolean(disabled) };
}

export function onMaintenanceMode(callback) {
  if (typeof callback !== "function") throw new Error("callback-required");
  return onSnapshot(
    doc(db, "siteSettings", "jdnext"),
    snapshot => {
      const data = snapshot.exists() ? snapshot.data() || {} : {};
      callback({
        enabled: data.enabled === true,
        message: typeof data.message === "string" ? data.message : ""
      }, null);
    },
    error => {
      console.error("JDNEXT-Wartungsstatus konnte nicht gelesen werden:", error);
      callback(null, error);
    }
  );
}

export async function setMaintenanceMode(enabled, message = "") {
  const ref = doc(db, "siteSettings", "jdnext");
  const data = {
    enabled: Boolean(enabled),
    message: String(message ?? "").trim().slice(0, 500),
    updatedAt: serverTimestamp()
  };
  const snap = await getDoc(ref);
  if (snap.exists()) await updateDoc(ref, data);
  else await setDoc(ref, data);
  return { ok: true, enabled: Boolean(enabled), message: data.message };
}

export function requireLogin(returnUrl = location.href) {
  let target = CONFIG.loginUrl;

  try {
    const url = new URL(returnUrl);
    if (url.protocol === "https:" && CONFIG.allowedReturnHosts.includes(url.hostname)) {
      target += "?return=" + encodeURIComponent(url.href);
    }
  } catch {}

  location.replace(target);
}

export function safeReturnUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && CONFIG.allowedReturnHosts.includes(url.hostname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}
