/* TobiServices Account Core
   Zentrale Firebase-Authentifizierung für alle TobiServices-Websites. */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut as firebaseSignOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp
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

export const signIn = (email, password) =>
  signInWithEmailAndPassword(auth, String(email).trim(), password);

export const resetPassword = (email) =>
  sendPasswordResetEmail(auth, String(email).trim());

function cleanDisplayName(value) {
  return String(value ?? "").trim().slice(0, 40);
}

export async function signUp(displayName, email, password) {
  const name = cleanDisplayName(displayName);
  if (name.length < 1) throw new Error("display-name-required");

  const { user } = await createUserWithEmailAndPassword(
    auth,
    String(email).trim(),
    password
  );

  try {
    await updateProfile(user, { displayName: name });

    await setDoc(doc(db, "users", user.uid), {
      displayName: name,
      email: user.email || String(email).trim(),
      tags: [],
      createdAt: serverTimestamp(),
      lastProfileChangeAt: serverTimestamp()
    });

    await sendEmailVerification(user);
  } catch (error) {
    console.error("Profil konnte nicht vollständig angelegt werden:", error);
    throw error;
  }

  return user;
}

export async function refreshCurrentUser() {
  if (!auth.currentUser) return null;
  await auth.currentUser.reload();
  return auth.currentUser;
}

export async function getProfile(uid = auth.currentUser?.uid) {
  if (!uid) return null;
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

export function onUser(callback) {
  return onAuthStateChanged(auth, async user => {
    if (!user) {
      callback(null, null);
      return;
    }

    const profile = await getProfile(user.uid);
    callback(user, profile);
  });
}

export const hasTag = (profile, tag) =>
  Array.isArray(profile?.tags) && profile.tags.includes(String(tag).toLowerCase());

export const isAdmin = profile => hasTag(profile, "admin");

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

/* Admin-Funktionen: Die tatsächliche Berechtigung kommt ausschließlich
   aus den Firestore Security Rules. */
export async function listUsers() {
  const { getDocs, collection, query, limit } =
    await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");

  const snap = await getDocs(query(collection(db, "users"), limit(500)));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

export const setTags = async (uid, tags) => {
  const normalized = [...new Set(
    (Array.isArray(tags) ? tags : [])
      .map(t => String(t).toLowerCase().trim())
      .filter(Boolean)
      .map(t => t.replace(/[^a-z0-9äöüß_-]+/g, "-").slice(0, 24))
      .filter(Boolean)
  )].slice(0, 20);

  return updateDoc(doc(db, "users", uid), { tags: normalized });
};
