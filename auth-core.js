/* Gemeinsames Accountsystem. Diese Datei einmal hosten (z. B. Repo "accounts")
   und von allen Websites per <script type="module"> importieren. */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  updateProfile, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, getDocs, collection, query, limit,
  writeBatch, serverTimestamp, increment } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const CONFIG = {
  // Aus der Firebase-Konsole: Projekteinstellungen > Deine Apps > Web-App
  firebase: { apiKey: "AIzaSyCwVh8-JIm-pj8N8bOWgwz8-G_cLQ6AVuQ", authDomain: "tobiservices.firebaseapp.com", projectId: "tobiservices", appId: "1:552906640909:web:99f583a0f4145e96ee8f44" },
  loginUrl: "https://hannonuppi.github.io/Tobiservices-Account/login.html",
  allowedReturnHosts: ["hannonuppi.github.io"],   // Seiten, zu denen login.html zurückleiten darf
};

const app = initializeApp(CONFIG.firebase);
export const auth = getAuth(app);
export const db = getFirestore(app);
export { signOut };

export const signIn = (email, pw) => signInWithEmailAndPassword(auth, email, pw);
export const resetPassword = (email) => sendPasswordResetEmail(auth, email);

export async function signUp(name, email, pw) {
  const { user } = await createUserWithEmailAndPassword(auth, email, pw);
  await updateProfile(user, { displayName: name });
  await setDoc(doc(db, "users", user.uid), {
    displayName: name, email, tags: [], mojo: 0,
    createdAt: serverTimestamp(), mojoUpdatedAt: serverTimestamp(),
  });
  return user;
}

export async function getProfile(uid = auth.currentUser?.uid) {
  if (!uid) return null;
  const s = await getDoc(doc(db, "users", uid));
  return s.exists() ? { uid, ...s.data() } : null;
}

/** cb(user, profile) bei jedem Login/Logout. Profil enthält tags und mojo. */
export function onUser(cb) {
  return onAuthStateChanged(auth, async (u) => cb(u, u ? await getProfile(u.uid) : null));
}

export const hasTag = (profile, tag) => !!profile?.tags?.includes(tag);

export const isAdmin = async () => hasTag(await getProfile(), "admin");

export function requireLogin() {
  location.href = CONFIG.loginUrl + "?return=" + encodeURIComponent(location.href);
}

const defaultSite = () => location.host + "/" + (location.pathname.split("/")[1] || "");

/** Mojo gutschreiben (positiv) oder ausgeben (negativ). Gibt true/false zurück.
    Die Firestore-Regeln begrenzen Betrag und Tempo (siehe firestore.rules). */
export async function changeMojo(delta, reason = "", site = defaultSite()) {
  const u = auth.currentUser;
  if (!u || !Number.isInteger(delta)) return false;
  const b = writeBatch(db);
  b.update(doc(db, "users", u.uid), { mojo: increment(delta), mojoUpdatedAt: serverTimestamp() });
  b.set(doc(collection(db, "mojoLog")), {
    uid: u.uid, site, delta, reason: String(reason).slice(0, 100), createdAt: serverTimestamp(),
  });
  try { await b.commit(); return true; } catch (e) { console.warn("Mojo abgelehnt:", e.code); return false; }
}

/* Nur für das Admin-Panel */
export const cleanTag = (t) => t.toLowerCase().trim().replace(/[^a-z0-9äöüß_-]+/g, "-").slice(0, 24);
export async function listUsers() {
  const s = await getDocs(query(collection(db, "users"), limit(500)));
  return s.docs.map((d) => ({ uid: d.id, ...d.data() }));
}
export const setTags = (uid, tags) => updateDoc(doc(db, "users", uid), { tags });
export const setMojo = (uid, mojo) => updateDoc(doc(db, "users", uid), { mojo });
