// Firebase Google login + Analytics for ebookwala.github.io
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyB89cJH-Unpkg8t4Ujw4n8L6e6w-_nNtQM",
  authDomain: "ebookwala-90c89.firebaseapp.com",
  projectId: "ebookwala-90c89",
  storageBucket: "ebookwala-90c89.firebasestorage.app",
  messagingSenderId: "340324580449",
  appId: "1:340324580449:web:922f4f16aab24c98a13e20",
  measurementId: "G-SGTXL3YKXD"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// Analytics is loaded separately so a blocked tracker never breaks login.
let track = () => {};
import("https://www.gstatic.com/firebasejs/11.0.2/firebase-analytics.js").then(m => {
  const an = m.getAnalytics(app);
  track = (name, params) => { try { m.logEvent(an, name, params); } catch (e) {} };
  document.addEventListener("click", ev => {
    const a = ev.target.closest && ev.target.closest("a.buy-btn");
    if (a && /rzp\.io/.test(a.href)) track("begin_checkout", { item_name: document.title });
  });
}).catch(() => {});

window.ebookAuth = {
  ready: false,
  user: null,
  // Call this directly from a click handler so the popup is not blocked.
  login() {
    return signInWithPopup(auth, provider).then(r => { track("login", { method: "google" }); return r.user; }).catch(e => {
      if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") {
        alert("Login nahi ho paaya (" + (e.code || e.message) + "). Dobara koshish karein.");
      }
      return null;
    });
  },
  logout() { return signOut(auth); }
};

onAuthStateChanged(auth, user => {
  window.ebookAuth.user = user;
  window.ebookAuth.ready = true;
  window.dispatchEvent(new CustomEvent("ebook-auth", { detail: user }));
});
