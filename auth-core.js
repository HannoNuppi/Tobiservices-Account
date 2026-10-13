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
  getDocFromServer,
  setDoc,
  updateDoc,
  runTransaction,
  serverTimestamp,
  collection,
  getDocs,
  query,
  orderBy,
  limit,
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

await setPersistence(auth, browserLocalPersistence).catch(error => {
  // Do not abort the whole Account Core if a browser temporarily refuses a
  // persistence change; auth state and profile reads should still initialize.
  console.warn("Account-Persistenz konnte nicht aktualisiert werden:", error);
});

export const signOut = () => firebaseSignOut(auth);

export const PROFILE_TITLES = Object.freeze([
  { value: "", label: "Kein Titel" },
  { value: "Newcomer", label: "Newcomer" },
  { value: "Dance Fan", label: "Dance Fan" },
  { value: "Gold Collector", label: "Gold Collector" },
  { value: "Theme Hunter", label: "Theme Hunter" },
  { value: "Night Owl", label: "Night Owl" },
  { value: "Legend", label: "Legend" }
]);
export const PROFILE_ICONS = Object.freeze(["🌟", "🎮", "🦊", "🐱", "🐸", "🐼", "🐉", "🦄", "👾", "🎃", "⭐", "💎", "🌈", "🪩"]);
const VALID_PROFILE_TITLES = new Set(PROFILE_TITLES.map(item => item.value));
const VALID_PROFILE_ICONS = new Set(PROFILE_ICONS);
const DEFAULT_PROFILE_ICON = "🌟";

function asProfile(uid, data) {
  const profile = { uid, ...data };
  if (!Number.isSafeInteger(profile.goldCoins)) profile.goldCoins = 0;
  profile.tags = Array.isArray(profile.tags) ? profile.tags : [];
  if (!VALID_PROFILE_TITLES.has(profile.profileTitle)) profile.profileTitle = "";
  if (!VALID_PROFILE_ICONS.has(profile.profileIcon)) profile.profileIcon = DEFAULT_PROFILE_ICON;
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

// Read the latest profile directly from the server. Untis Next uses this to
// refresh granted themes before rendering the theme picker, bypassing stale
// Firestore cache snapshots from the legacy Compat listener.
export async function refreshProfileFromServer(uid = auth.currentUser?.uid) {
  const currentUser = auth.currentUser;
  if (!uid || !currentUser || currentUser.isAnonymous || currentUser.uid !== uid) {
    return null;
  }
  const snap = await getDocFromServer(doc(db, "users", uid));
  if (!snap.exists()) return null;
  return asProfile(uid, snap.data() || {});
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

  let data = snap.data() || {};
  // Migrate older profiles one cosmetic field at a time. These are display-only
  // metadata; they never grant tags, permissions or admin access.
  const cosmeticDefaults = {};
  if (!Object.prototype.hasOwnProperty.call(data, "profileTitle")) cosmeticDefaults.profileTitle = "";
  if (!Object.prototype.hasOwnProperty.call(data, "profileIcon")) cosmeticDefaults.profileIcon = DEFAULT_PROFILE_ICON;
  if (Object.keys(cosmeticDefaults).length) {
    try {
      await updateDoc(profileRef, {
        ...cosmeticDefaults,
        lastProfileChangeAt: serverTimestamp()
      });
      snap = await getDoc(profileRef);
      data = snap.exists() ? snap.data() || {} : data;
    } catch (error) {
      console.warn("Profil-Design konnte noch nicht initialisiert werden:", error);
    }
  }
  if (!Object.prototype.hasOwnProperty.call(data, "goldCoins")) {
    // Existing profiles from before the currency field may initialize it to
    // zero once. Keep this as a separate write because the Rules treat it separately.
    try {
      await updateDoc(profileRef, { goldCoins: 0 });
      snap = await getDoc(profileRef);
      data = snap.exists() ? snap.data() || data : data;
    } catch (error) {
      console.warn("Goldmünzen-Feld konnte noch nicht initialisiert werden:", error);
      data.goldCoins = 0;
    }
  }

  return asProfile(uid, data);
}

function isLocalHalloweenDate() {
  // Event eligibility must use the same calendar date on every device.
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    month: "numeric",
    day: "numeric"
  }).formatToParts(new Date());
  const month = Number(parts.find(part => part.type === "month")?.value);
  const day = Number(parts.find(part => part.type === "day")?.value);
  return month === 10 && day === 31;
}

async function maybeGrantHalloweenThemeOnLogin(user, profile) {
  if (!user || user.isAnonymous || !profile || profile.disabled === true || !isLocalHalloweenDate()) {
    return profile;
  }
  const profileOwned = Array.isArray(profile.ownedThemes) ? profile.ownedThemes : [];
  if (profileOwned.includes("HalloweenEvent") || profile.halloweenUnlockedAt) return profile;

  try {
    const profileRef = doc(db, "users", user.uid);
    const granted = await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(profileRef);
      if (!snapshot.exists()) return false;
      const latest = snapshot.data() || {};
      const owned = Array.isArray(latest.ownedThemes) ? latest.ownedThemes : [];
      if (latest.disabled === true || latest.halloweenUnlockedAt || owned.includes("HalloweenEvent")) return false;
      if (owned.length >= 30) return false;

      transaction.update(profileRef, {
        ownedThemes: [...owned, "HalloweenEvent"],
        halloweenUnlockedAt: serverTimestamp(),
        lastProfileChangeAt: serverTimestamp()
      });
      return true;
    });
    // Re-read even when another concurrent grant won the transaction race.
    return await getProfile(user.uid);
  } catch (error) {
    // The matching Firestore rule validates the server-side date and the one-time grant.
    console.warn("Halloween-Theme konnte nicht automatisch freigeschaltet werden:", error);
    return profile;
  }
}

export function onUser(callback) {
  let authEvent = 0;
  return onAuthStateChanged(auth, async user => {
    const eventId = ++authEvent;
    // Anonymous JDNEXT identities are not TobiServices accounts.
    if (!user || user.isAnonymous) {
      callback(null, null);
      return;
    }

    const stillCurrent = () =>
      eventId === authEvent &&
      auth.currentUser?.uid === user.uid &&
      auth.currentUser.isAnonymous !== true;

    try {
      let profile = await getProfile(user.uid);
      if (!stillCurrent()) return;

      // Prefer a server-fresh profile but retain a usable cached profile if a
      // transient network error occurs. This avoids "half logged-in" states.
      try {
        const serverProfile = await refreshProfileFromServer(user.uid);
        if (serverProfile) profile = serverProfile;
      } catch (error) {
        console.warn("Server-Profil vorübergehend nicht erreichbar; Cache wird weiterverwendet.", error);
      }
      if (!stillCurrent()) return;

      profile = await maybeGrantHalloweenThemeOnLogin(user, profile);
      if (!stillCurrent()) return;

      callback(user, profile);
      if (profile && profile.disabled !== true) {
        void syncPublicProfile(profile).catch(error =>
          console.warn("Öffentlicher Profilabgleich konnte nicht abgeschlossen werden:", error)
        );
      }
    } catch (error) {
      if (!stillCurrent()) return;
      console.error("Accountprofil konnte nicht geladen werden:", error);
      // Keep the authenticated identity visible; consumers can retry the profile read.
      callback(user, null);
    }
  });
}

export const hasTag = (profile, tag) =>
  Array.isArray(profile?.tags) &&
  profile.tags.includes(String(tag).toLowerCase());

export const isAdmin = profile => profile?.disabled !== true && hasTag(profile, "admin");

const USER_SELECTABLE_THEMES = new Set([
  "Next", "Ocean", "Sunset", "Forest", "Candy", "Midnight", "Aurora", "Retro",
  "RoyalRebels", "Bronze", "Silver", "Gold", "WinterEvent", "BirthdayEvent", "HalloweenEvent"
]);

// Change the equipped theme using the same authenticated Firebase session as the Account Center.
// Admin Matrix is intentionally local-only and is guarded by the current admin tag in Untis Next.
// Update only cosmetic fields. Neither field is consulted by isAdmin() or hasAccess().
export async function updateCosmeticProfile({ profileTitle = "", profileIcon = DEFAULT_PROFILE_ICON } = {}) {
  const title = String(profileTitle ?? "");
  const icon = String(profileIcon ?? DEFAULT_PROFILE_ICON);
  if (!VALID_PROFILE_TITLES.has(title)) throw new Error("Ungültiger Profil-Titel.");
  if (!VALID_PROFILE_ICONS.has(icon)) throw new Error("Ungültiges Profil-Icon.");
  const user = auth.currentUser;
  if (!user || user.isAnonymous) throw new Error("Bitte melde dich zuerst an.");
  const profile = await getProfile(user.uid);
  if (!profile || profile.disabled === true) throw new Error("Dein Konto ist nicht verfügbar oder gesperrt.");
  await updateDoc(doc(db, "users", user.uid), {
    profileTitle: title,
    profileIcon: icon,
    lastProfileChangeAt: serverTimestamp()
  });
  const updated = await refreshProfileFromServer(user.uid);
  if (updated) void syncPublicProfile(updated).catch(error =>
    console.warn("Ranglisten-Profil konnte nicht aktualisiert werden:", error)
  );
  return updated || { ...profile, profileTitle: title, profileIcon: icon };
}

// Public mirror contains no email or tags. Rules require every mirrored score
// and cosmetic value to match the private user's own profile, preventing fake coin totals.
export async function syncPublicProfile(profileHint = null) {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return null;
  let profile = null;
  try {
    profile = await refreshProfileFromServer(user.uid);
  } catch (error) {
    if (profileHint?.uid === user.uid) profile = profileHint;
    else throw error;
  }
  if (!profile || profile.uid !== user.uid || profile.disabled === true) return null;
  const title = VALID_PROFILE_TITLES.has(profile.profileTitle) ? profile.profileTitle : "";
  const icon = VALID_PROFILE_ICONS.has(profile.profileIcon) ? profile.profileIcon : DEFAULT_PROFILE_ICON;
  const displayName = String(profile.displayName || user.displayName || user.email?.split("@")[0] || "Spieler").trim().slice(0, 32) || "Spieler";
  const goldCoins = Number.isSafeInteger(profile.goldCoins) ? profile.goldCoins : 0;
  await setDoc(doc(db, "publicProfiles", user.uid), {
    displayName,
    profileTitle: title,
    profileIcon: icon,
    goldCoins,
    updatedAt: serverTimestamp()
  });
  return { uid: user.uid, displayName, profileTitle: title, profileIcon: icon, goldCoins };
}

export async function getLeaderboard(maxEntries = 50) {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(Number(maxEntries) || 50)));
  const result = await getDocs(query(
    collection(db, "publicProfiles"),
    orderBy("goldCoins", "desc"),
    limit(safeLimit)
  ));
  return result.docs.map(snap => ({ uid: snap.id, ...(snap.data() || {}) }));
}

export async function setEquippedTheme(themeId) {
  const id = String(themeId ?? "");
  if (!USER_SELECTABLE_THEMES.has(id)) throw new Error("Dieses Theme kann nicht ausgewählt werden.");
  if (id === "AdminMatrix") throw new Error("Admin Matrix wird lokal mit dem aktiven admin-Tag aktiviert.");

  const currentUser = auth.currentUser;
  if (!currentUser || currentUser.isAnonymous) throw new Error("Bitte melde dich erneut im TobiServices Account an.");

  const profile = await getProfile(currentUser.uid);
  if (!profile || profile.disabled === true) throw new Error("Dein TobiServices-Konto ist nicht verfügbar oder gesperrt.");

  const owned = Array.isArray(profile.ownedThemes) ? profile.ownedThemes : [];
  if (id !== "Next" && !owned.includes(id)) {
    throw new Error("Dieses Theme ist für dein Konto nicht freigeschaltet.");
  }

  await updateDoc(doc(db, "users", currentUser.uid), { equippedTheme: id });
  return { ...profile, equippedTheme: id };
}


export const ACCESS_RESOURCES = Object.freeze({
  "test-mode": "Untis Next Test Mode",
  "jdnext": "JDNEXT",
  "untis-next": "Untis Next",
  "account-apk": "APK-Download"
});

const DEFAULT_ACCESS_CONTROL = Object.freeze({
  tags: ["admin", "dance-beta"],
  permissions: {
    "test-mode": ["admin"],
    "jdnext": ["admin", "dance-beta"],
    "untis-next": [],
    "account-apk": []
  }
});

function cleanAccessTags(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map(tag => String(tag ?? "").toLowerCase().trim())
    .filter(tag => /^[a-z0-9äöüß_-]{1,24}$/.test(tag)))]
    .slice(0, 100);
}

function normalizeAccessControl(data = {}, exists = true) {
  const tags = cleanAccessTags(data.tags);
  if (!exists) {
    for (const tag of DEFAULT_ACCESS_CONTROL.tags) if (!tags.includes(tag)) tags.push(tag);
  } else if (!tags.includes("admin")) {
    tags.unshift("admin");
  }
  const permissions = {};
  for (const key of Object.keys(ACCESS_RESOURCES)) {
    const source = data.permissions?.[key];
    permissions[key] = [...new Set((Array.isArray(source) ? source : DEFAULT_ACCESS_CONTROL.permissions[key])
      .map(tag => String(tag ?? "").toLowerCase().trim())
      .filter(tag => tags.includes(tag)))];
  }
  return { tags, permissions, exists };
}

export async function getAccessControl() {
  const snap = await getDoc(doc(db, "siteSettings", "accessControl"));
  return normalizeAccessControl(snap.exists() ? snap.data() || {} : DEFAULT_ACCESS_CONTROL, snap.exists());
}

export function hasAccess(profile, resource, accessControl = null) {
  if (!profile || profile.disabled === true) return false;
  if (isAdmin(profile)) return true;
  if (!Object.prototype.hasOwnProperty.call(ACCESS_RESOURCES, resource)) return false;
  const config = normalizeAccessControl(accessControl || DEFAULT_ACCESS_CONTROL);
  const allowedTags = config.permissions[resource] || [];
  // Blank lists keep ordinary public app/download resources ungated.
  if (allowedTags.length === 0 && resource !== "test-mode" && resource !== "jdnext") return true;
  const userTags = Array.isArray(profile.tags) ? profile.tags : [];
  return allowedTags.some(tag => userTags.includes(tag));
}

export async function saveAccessControl(accessControl) {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Bitte melde dich erneut an.");
  const adminSnap = await getDoc(doc(db, "users", currentUser.uid));
  const adminProfile = adminSnap.exists() ? adminSnap.data() || {} : {};
  if (adminProfile.disabled === true || !Array.isArray(adminProfile.tags) || !adminProfile.tags.includes("admin")) {
    throw new Error("Nur aktive Admins dürfen Tag- und Zugriffsregeln ändern.");
  }

  const tags = cleanAccessTags(accessControl?.tags);
  if (!tags.includes("admin")) tags.unshift("admin");
  if (tags.length > 100) throw new Error("Maximal 100 Tags.");
  const permissions = {};
  for (const key of Object.keys(ACCESS_RESOURCES)) {
    const requested = Array.isArray(accessControl?.permissions?.[key]) ? accessControl.permissions[key] : [];
    permissions[key] = [...new Set(requested.map(tag => String(tag).toLowerCase().trim()))];
    if (permissions[key].some(tag => !tags.includes(tag))) {
      throw new Error("Jede Berechtigung muss auf einen Tag aus der Tag-Liste verweisen.");
    }
  }

  const ref = doc(db, "siteSettings", "accessControl");
  const snap = await getDoc(ref);
  const payload = {
    tags,
    permissions,
    updatedBy: currentUser.uid,
    updatedAt: serverTimestamp()
  };
  if (snap.exists()) await updateDoc(ref, payload);
  else await setDoc(ref, payload);
  return normalizeAccessControl(payload, true);
}



export async function requestLivePublish(note = "") {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Bitte melde dich erneut an.");
  const adminSnap = await getDoc(doc(db, "users", currentUser.uid));
  const adminProfile = adminSnap.exists() ? adminSnap.data() || {} : {};
  if (adminProfile.disabled === true || !Array.isArray(adminProfile.tags) || !adminProfile.tags.includes("admin")) {
    throw new Error("Nur aktive Admins dürfen eine Live-Veröffentlichung freigeben.");
  }
  const requestId = Date.now().toString(36) + "-" + currentUser.uid.slice(0, 10) + "-" + Math.random().toString(36).slice(2, 8);
  const ref = doc(db, "siteSettings", "deployment");
  const payload = {
    requestId,
    target: "untis-next",
    requestedBy: currentUser.uid,
    requestedAt: serverTimestamp(),
    note: String(note ?? "").trim().slice(0, 300)
  };
  const snap = await getDoc(ref);
  if (snap.exists()) await updateDoc(ref, payload);
  else await setDoc(ref, payload);
  return { ok: true, requestId };
}

export async function getLivePublishRequest() {
  const snap = await getDoc(doc(db, "siteSettings", "deployment"));
  if (!snap.exists()) return null;
  const data = snap.data() || {};
  return {
    requestId: typeof data.requestId === "string" ? data.requestId : "",
    target: typeof data.target === "string" ? data.target : "",
    requestedBy: typeof data.requestedBy === "string" ? data.requestedBy : "",
    requestedAt: data.requestedAt || null,
    note: typeof data.note === "string" ? data.note : ""
  };
}

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
      ownedThemes: Array.isArray(data.ownedThemes) ? data.ownedThemes : [],
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
  const accessRef = doc(db, "siteSettings", "accessControl");
  const accessSnap = await getDoc(accessRef);
  const allowedTags = accessSnap.exists()
    ? cleanAccessTags((accessSnap.data() || {}).tags)
    : [...DEFAULT_ACCESS_CONTROL.tags];
  if (cleanTags.some(tag => !allowedTags.includes(tag))) {
    throw new Error("Du kannst nur Tags aus der zentralen Tag-Liste zuweisen.");
  }
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

const ADMIN_GRANTABLE_EVENT_THEMES = new Set(["WinterEvent", "BirthdayEvent", "HalloweenEvent"]);

export async function setOwnedEventTheme(uid, themeId, grant = true) {
  const targetUid = String(uid ?? "");
  const id = String(themeId ?? "");
  if (!targetUid) throw new Error("uid-required");
  if (!ADMIN_GRANTABLE_EVENT_THEMES.has(id)) throw new Error("Dieses Event-Theme kann nicht vergeben werden.");

  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Bitte melde dich erneut an.");
  const adminSnap = await getDoc(doc(db, "users", currentUser.uid));
  const adminProfile = adminSnap.exists() ? adminSnap.data() || {} : {};
  if (adminProfile.disabled === true || !Array.isArray(adminProfile.tags) || !adminProfile.tags.includes("admin")) {
    throw new Error("Nur aktive Admins dürfen Event-Themes vergeben.");
  }

  const targetRef = doc(db, "users", targetUid);
  const targetSnap = await getDoc(targetRef);
  if (!targetSnap.exists()) throw new Error("Für diesen Account existiert noch kein TobiServices-Profil.");
  const target = targetSnap.data() || {};
  const currentOwned = Array.isArray(target.ownedThemes) ? target.ownedThemes : [];
  const nextOwned = [...new Set(grant ? [...currentOwned, id] : currentOwned.filter(value => value !== id))];
  if (nextOwned.length > 30) throw new Error("Für dieses Konto sind bereits zu viele Themes gespeichert.");

  const update = {
    ownedThemes: nextOwned,
    lastProfileChangeAt: serverTimestamp()
  };
  if (!grant && target.equippedTheme === id) update.equippedTheme = "Next";
  await updateDoc(targetRef, update);
  return { ok: true, uid: targetUid, ownedThemes: nextOwned, granted: Boolean(grant), themeId: id };
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
