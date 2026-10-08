/* TobiServices Account Core
   Benutzerdefinierte Username/Passwort-Accounts.
   Firebase Authentication wird nur als interne, passwortlose Sitzung
   mit Custom Tokens verwendet. Passwortprüfung und Accountverwaltung
   passieren ausschließlich serverseitig über Cloud Functions. */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  signInWithCustomToken,
  signOut as firebaseSignOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getFunctions,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

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
  allowedReturnHosts: ["hannonuppi.github.io"],
  functionsRegion: "europe-west1"
});

const app = initializeApp(CONFIG.firebase);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, CONFIG.functionsRegion);

await setPersistence(auth, browserLocalPersistence);

const loginCall = httpsCallable(functions, "loginTobiAccount");
const createAccountCall = httpsCallable(functions, "createTobiAccount");
const listUsersCall = httpsCallable(functions, "listTobiUsers");
const setTagsCall = httpsCallable(functions, "setTobiTags");
const setDisabledCall = httpsCallable(functions, "setTobiDisabled");
const setMaintenanceModeCall = httpsCallable(functions, "setMaintenanceMode");

export const signOut = () => firebaseSignOut(auth);

export async function login(username, password) {
  const result = await loginCall({
    username: String(username ?? "").trim(),
    password: String(password ?? "")
  });

  const data = result.data || {};
  if (!data.token) throw new Error("custom-token-missing");

  const authResult = await signInWithCustomToken(auth, data.token);
  return {
    user: authResult.user,
    profile: data.profile || null
  };
}

export async function getProfile(uid = auth.currentUser?.uid) {
  if (!uid) return null;

  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists()
    ? { uid, ...snap.data() }
    : null;
}

export function onUser(callback) {
  return onAuthStateChanged(auth, async user => {
    if (!user) {
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

export const isAdmin = profile => hasTag(profile, "admin");

export async function createAccount(username, password, displayName = "") {
  const result = await createAccountCall({
    username: String(username ?? "").trim(),
    password: String(password ?? ""),
    displayName: String(displayName ?? "").trim()
  });
  return result.data;
}

export async function listUsers() {
  const result = await listUsersCall();
  return Array.isArray(result.data?.users) ? result.data.users : [];
}

export async function setTags(uid, tags) {
  const result = await setTagsCall({
    uid: String(uid),
    tags: Array.isArray(tags) ? tags : []
  });
  return result.data;
}

export async function setDisabled(uid, disabled) {
  const result = await setDisabledCall({
    uid: String(uid),
    disabled: Boolean(disabled)
  });
  return result.data;
}

export async function setMaintenanceMode(enabled, message = "") {
  const result = await setMaintenanceModeCall({
    enabled: Boolean(enabled),
    message: String(message ?? "").trim().slice(0, 500)
  });
  return result.data;
}

export function requireLogin(returnUrl = location.href) {
  let target = CONFIG.loginUrl;

  try {
    const url = new URL(returnUrl);
    if (
      url.protocol === "https:" &&
      CONFIG.allowedReturnHosts.includes(url.hostname)
    ) {
      target += "?return=" + encodeURIComponent(url.href);
    }
  } catch {}

  location.replace(target);
}

export function safeReturnUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      CONFIG.allowedReturnHosts.includes(url.hostname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}
