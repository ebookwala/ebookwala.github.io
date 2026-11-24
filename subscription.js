// 3-Din Free Trial (₹2) + ₹49/month subscription logic for ebookwala.github.io
// Talks to the Cloud Functions in functions/index.js and watches the user's
// Firestore doc so every page on the site knows whether reading is unlocked.
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-functions.js";

const firebaseConfig = {
  apiKey: "AIzaSyB89cJH-Unpkg8t4Ujw4n8L6e6w-_nNtQM",
  authDomain: "ebookwala-90c89.firebaseapp.com",
  projectId: "ebookwala-90c89",
  storageBucket: "ebookwala-90c89.firebasestorage.app",
  messagingSenderId: "340324580449",
  appId: "1:340324580449:web:922f4f16aab24c98a13e20",
  measurementId: "G-SGTXL3YKXD"
};

// auth.js may already have called initializeApp() — reuse that instance
// instead of throwing a "duplicate app" error.
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
const functions = getFunctions(app, "asia-south1"); // must match the deployed function region

window.ebookSub = { active: false, status: null, ready: false, purchasedBooks: [] };

let unsubscribeDoc = null;

function setState(patch) {
  window.ebookSub = Object.assign({}, window.ebookSub, patch, { ready: true });
  window.dispatchEvent(new CustomEvent("ebook-sub", { detail: window.ebookSub }));
}

function watchUser(uid) {
  if (unsubscribeDoc) { unsubscribeDoc(); unsubscribeDoc = null; }
  if (!uid) { setState({ active: false, status: null }); return; }
  unsubscribeDoc = onSnapshot(
    doc(db, "users", uid),
    snap => {
      const sub = snap.exists() ? snap.data().subscription : null;
      const status = sub ? sub.status : null;
      // "authenticated" = ₹2 mandate done, 3-day trial running.
      // "active"        = trial over, ₹49/month cycle running.
      const active = status === "authenticated" || status === "active";
      const purchasedBooks = (snap.exists() && snap.data().purchasedBooks) || [];
      setState({ active, status, currentEnd: sub && sub.currentEnd, purchasedBooks });
    },
    () => setState({ active: false, status: null })
  );
}

// auth.js dispatches "ebook-auth" with the Firebase user (or null) on every change.
window.addEventListener("ebook-auth", e => watchUser(e.detail && e.detail.uid));

function loadCheckoutScript() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) { resolve(); return; }
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Razorpay checkout load nahi hua, internet check karein."));
    document.head.appendChild(s);
  });
}

window.startTrial = async function startTrial() {
  const authApi = window.ebookAuth;
  if (!authApi) { alert("Login system abhi load ho raha hai, thodi der baad try karein."); return; }
  let user = authApi.user;
  if (!user) {
    user = await authApi.login();
    if (!user) return;
  }
  try {
    await loadCheckoutScript();
    const createFn = httpsCallable(functions, "createTrialSubscription");
    const { data } = await createFn();
    const rzp = new window.Razorpay({
      key: data.keyId,
      subscription_id: data.subscriptionId,
      name: "ebookwala",
      description: "3-Din Free Trial — sabhi ebooks padhein. Trial ke baad ₹49/month.",
      theme: { color: "#39ff14" },
      handler: function () {
        alert("✅ Trial shuru ho gaya! Ab aap sabhi ebooks padh sakte hain.");
        window.location.reload();
      },
      modal: { ondismiss: function () {} },
    });
    rzp.on("payment.failed", function (resp) {
      alert("Payment fail ho gaya: " + ((resp.error && resp.error.description) || "dobara try karein."));
    });
    rzp.open();
  } catch (e) {
    alert("Trial start nahi ho paaya: " + ((e && e.message) || e));
  }
};

window.buyBook = async function buyBook(bookId, title, amount) {
  const authApi = window.ebookAuth;
  if (!authApi) { alert("Login system abhi load ho raha hai, thodi der baad try karein."); return; }
  let user = authApi.user;
  if (!user) {
    user = await authApi.login();
    if (!user) return;
  }
  try {
    await loadCheckoutScript();
    const createFn = httpsCallable(functions, "createBookOrder");
    const { data } = await createFn({ bookId });
    const rzp = new window.Razorpay({
      key: data.keyId,
      order_id: data.orderId,
      amount: data.amount,
      currency: "INR",
      name: "ebookwala",
      description: data.title || title,
      theme: { color: "#39ff14" },
      prefill: { email: (user.email || ""), name: (user.displayName || "") },
      handler: function () {
        alert("✅ Payment ho gaya! Ye ebook ab unlock ho gayi hai — page refresh ho raha hai.");
        window.location.reload();
      },
      modal: { ondismiss: function () {} },
    });
    rzp.on("payment.failed", function (resp) {
      alert("Payment fail ho gaya: " + ((resp.error && resp.error.description) || "dobara try karein."));
    });
    rzp.open();
  } catch (e) {
    alert("Purchase shuru nahi ho paaya: " + ((e && e.message) || e));
  }
};

window.cancelSubscription = async function cancelSubscription() {
  if (!confirm("Kya aap apna ebookwala subscription cancel karna chahte hain? Agle mahine se ₹49 nahi katega.")) return;
  try {
    const fn = httpsCallable(functions, "cancelSubscription");
    await fn();
    alert("✅ Subscription cancel ho gaya.");
  } catch (e) {
    alert("Cancel nahi ho paaya: " + ((e && e.message) || e));
  }
};
