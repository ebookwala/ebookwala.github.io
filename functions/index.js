/**
 * ebookwala — subscription Cloud Functions
 * --------------------------------------------------------
 * Implements: "3-Din Free Trial" (₹2 authorization) then
 * ₹49/month autodebit via Razorpay Subscriptions, plus a mandatory
 * profile (mobile/WhatsApp/age/profession) collected after login, an
 * owner-only admin listing of that data, and an email notification sent
 * to every logged-in user whenever a new ebook is added to books.json.
 *
 * Functions:
 *  - createTrialSubscription  (callable)  → starts a Razorpay subscription
 *                                            for the logged-in user
 *  - createBookOrder          (callable)  → creates a Razorpay Order to buy
 *                                            one paid ebook
 *  - razorpayWebhook          (HTTP)      → Razorpay calls this on every
 *                                            subscription/payment/order event
 *  - cancelSubscription       (callable)  → lets a user cancel their own
 *                                            subscription
 *  - saveProfile              (callable)  → saves/updates the logged-in
 *                                            user's mobile/WhatsApp/age/
 *                                            profession (mandatory gate +
 *                                            the account page's edit form)
 *  - adminListUsers           (callable)  → returns every user's profile +
 *                                            subscription summary; only
 *                                            the ADMIN_EMAIL account may
 *                                            call this
 *  - notifyNewBooks           (HTTP)      → emails every logged-in user
 *                                            about newly added ebooks;
 *                                            called by the GitHub Action
 *                                            that diffs books.json on push
 *
 * Required secrets (set once via `firebase functions:secrets:set NAME`):
 *   RAZORPAY_KEY_ID
 *   RAZORPAY_KEY_SECRET
 *   RAZORPAY_WEBHOOK_SECRET
 *   RAZORPAY_PLAN_ID
 *   GMAIL_USER             — the Gmail address notification emails are sent from
 *   GMAIL_APP_PASSWORD     — a 16-char Gmail "App Password" (not the normal password)
 *   NOTIFY_SECRET          — a random string shared with the GitHub Action
 *   ADMIN_EMAIL            — the Google account allowed to open admin.html
 *
 * See functions/README.md for the one-time setup steps.
 */

const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

admin.initializeApp();
const db = admin.firestore();

const REGION = "asia-south1"; // Mumbai — lowest latency for Indian users/Razorpay

const RAZORPAY_KEY_ID = defineSecret("RAZORPAY_KEY_ID");
const RAZORPAY_KEY_SECRET = defineSecret("RAZORPAY_KEY_SECRET");
const RAZORPAY_WEBHOOK_SECRET = defineSecret("RAZORPAY_WEBHOOK_SECRET");
const RAZORPAY_PLAN_ID = defineSecret("RAZORPAY_PLAN_ID");
const GMAIL_USER = defineSecret("GMAIL_USER");
const GMAIL_APP_PASSWORD = defineSecret("GMAIL_APP_PASSWORD");
const NOTIFY_SECRET = defineSecret("NOTIFY_SECRET");
const ADMIN_EMAIL = defineSecret("ADMIN_EMAIL");

// Subscription statuses that should unlock reading access on the site.
// "authenticated" = the ₹2 mandate/authorization succeeded and the 3-day
//                   trial clock has started (full billing hasn't begun yet).
// "active"        = trial is over and the ₹49/month cycle is running.
const ACCESS_STATUSES = new Set(["authenticated", "active"]);

function razorpayClient() {
  return new Razorpay({
    key_id: RAZORPAY_KEY_ID.value(),
    key_secret: RAZORPAY_KEY_SECRET.value(),
  });
}

/**
 * Called from the site (Firebase callable) once the user is logged in and
 * clicks "3-Din Free Trial". Creates (or reuses) a Razorpay customer, then
 * creates a Subscription whose billing start is delayed by 3 days. Returns
 * the subscription id for Razorpay Checkout to collect the ₹2 authorization
 * + recurring mandate.
 */
exports.createTrialSubscription = onCall(
  { region: REGION, secrets: [RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_PLAN_ID] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Login zaroori hai.");
    }
    const uid = request.auth.uid;
    const email = request.auth.token.email || undefined;
    const name = request.auth.token.name || email || uid;

    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() : {};

    if (userData.trialUsed) {
      throw new HttpsError(
        "failed-precondition",
        "Aap pehle hi ek baar free trial le chuke hain. Ek account sirf ek baar trial le sakta hai."
      );
    }
    const existingStatus = userData.subscription && userData.subscription.status;
    if (existingStatus && ACCESS_STATUSES.has(existingStatus)) {
      throw new HttpsError("failed-precondition", "Aapka subscription pehle se active hai.");
    }

    const rp = razorpayClient();

    let customerId = userData.razorpayCustomerId;
    if (!customerId) {
      try {
        const customer = await rp.customers.create({
          name,
          email,
          notes: { firebaseUid: uid },
        });
        customerId = customer.id;
      } catch (err) {
        // Razorpay returns BAD_REQUEST_ERROR both for "customer already exists"
        // AND for bad API credentials — only try the fallback lookup for the
        // former, and never let the fallback's own failure go unhandled.
        const description = (err && err.error && err.error.description) || "";
        const looksLikeDuplicate = /already exists/i.test(description);
        if (err && err.error && err.error.code === "BAD_REQUEST_ERROR" && email && looksLikeDuplicate) {
          try {
            const list = await rp.customers.all({ count: 100 });
            const found = (list.items || []).find((c) => c.email === email);
            if (found) customerId = found.id;
          } catch (lookupErr) {
            logger.error("Razorpay customer lookup (duplicate fallback) failed", lookupErr);
          }
        }
        if (!customerId) {
          logger.error("Razorpay customer creation failed", err);
          const authFailed = err && err.error && /authentication failed/i.test(err.error.description || "");
          throw new HttpsError(
            "internal",
            authFailed
              ? "Razorpay API keys galat hain ya match nahi kar rahi (Authentication failed)."
              : "Razorpay customer nahi ban paaya."
          );
        }
      }
    }

    const startAt = Math.floor(Date.now() / 1000) + 3 * 24 * 60 * 60; // +3 days

    let subscription;
    try {
      subscription = await rp.subscriptions.create({
        plan_id: RAZORPAY_PLAN_ID.value(),
        customer_notify: 1,
        total_count: 120, // up to 10 years of monthly cycles; cancellable anytime
        start_at: startAt,
        // Future start_at + an addon (upfront) amount makes the authentication
        // charge equal to the addon amount itself (not an auto-refunded ₹5
        // token charge). This is the real, non-refunded ₹2 trial fee.
        addons: [
          {
            item: {
              name: "3-Din Free Trial",
              amount: 200, // ₹2 in paise
              currency: "INR",
            },
          },
        ],
        notes: { firebaseUid: uid },
      });
    } catch (err) {
      logger.error("Razorpay subscription creation failed", err);
      throw new HttpsError("internal", "Subscription create nahi ho paayi.");
    }

    await userRef.set(
      {
        razorpayCustomerId: customerId,
        subscription: {
          id: subscription.id,
          status: subscription.status,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
      { merge: true }
    );

    await db.collection("subscriptions").doc(subscription.id).set(
      {
        uid,
        status: subscription.status,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { subscriptionId: subscription.id, keyId: RAZORPAY_KEY_ID.value() };
  }
);

/**
 * Razorpay webhook. Configure this URL (printed after `firebase deploy`) in
 * Razorpay Dashboard → Settings → Webhooks, subscribed to the
 * subscription.* events AND order.paid, with the same secret as
 * RAZORPAY_WEBHOOK_SECRET.
 */
exports.razorpayWebhook = onRequest(
  { region: REGION, secrets: [RAZORPAY_WEBHOOK_SECRET] },
  async (req, res) => {
    const signature = req.headers["x-razorpay-signature"];
    const rawBody = req.rawBody;

    if (!signature || !rawBody) {
      res.status(400).send("Missing signature/body");
      return;
    }

    const expected = crypto
      .createHmac("sha256", RAZORPAY_WEBHOOK_SECRET.value())
      .update(rawBody)
      .digest("hex");

    if (expected !== signature) {
      logger.warn("Razorpay webhook signature mismatch");
      res.status(400).send("Invalid signature");
      return;
    }

    const event = req.body && req.body.event;
    const payload = (req.body && req.body.payload) || {};

    // One-time book purchase: a book's Razorpay Order, paid in full via
    // Razorpay Checkout, tagged with notes.firebaseUid + notes.bookId at
    // creation time (see createBookOrder below). Unlocks just that one book.
    const orderEntity = payload.order && payload.order.entity;
    if (event === "order.paid" && orderEntity) {
      const buyerUid = orderEntity.notes && orderEntity.notes.firebaseUid;
      const bookId = orderEntity.notes && orderEntity.notes.bookId;
      if (buyerUid && bookId) {
        // A combo (e.g. "chatgpt-mastering-combo") has no readable file of its
        // own — its books.json entry instead lists comboItems: the real book
        // ids bundled inside it. Unlock every one of those too, so the buyer
        // can read each volume on its own page right after paying, not just
        // the combo id itself.
        let idsToUnlock = [bookId];
        try {
          const booksRes = await fetch("https://ebookwala.github.io/books.json");
          const books = await booksRes.json();
          const book = books.find((b) => b.id === bookId);
          if (book && Array.isArray(book.comboItems) && book.comboItems.length) {
            idsToUnlock = idsToUnlock.concat(book.comboItems);
          }
        } catch (err) {
          logger.error("Fetching books.json for combo lookup failed", err);
        }
        await db.collection("users").doc(buyerUid).set(
          { purchasedBooks: admin.firestore.FieldValue.arrayUnion(...idsToUnlock) },
          { merge: true }
        );
        logger.info("Book purchase unlocked", { uid: buyerUid, bookId, idsToUnlock, orderId: orderEntity.id });
      } else {
        logger.warn("order.paid webhook missing notes", { orderId: orderEntity.id });
      }
      res.status(200).send("ok");
      return;
    }

    const subEntity = payload.subscription && payload.subscription.entity;

    if (!subEntity) {
      // Not a subscription event (e.g. a plain payment event) — nothing to do.
      res.status(200).send("ignored");
      return;
    }

    const subRef = db.collection("subscriptions").doc(subEntity.id);
    const subSnap = await subRef.get();
    const uid =
      (subSnap.exists && subSnap.data().uid) ||
      (subEntity.notes && subEntity.notes.firebaseUid);

    if (!uid) {
      logger.warn("Webhook for unknown subscription, no uid mapping", subEntity.id);
      res.status(200).send("no uid mapping");
      return;
    }

    const status = subEntity.status; // created|authenticated|active|pending|halted|cancelled|completed|expired

    await subRef.set(
      {
        uid,
        status,
        currentStart: subEntity.current_start || null,
        currentEnd: subEntity.current_end || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastEvent: event,
      },
      { merge: true }
    );

    await db.collection("users").doc(uid).set(
      {
        subscription: {
          id: subEntity.id,
          status,
          currentEnd: subEntity.current_end || null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        // Mark the one-trial-per-account flag the moment the ₹2 mandate succeeds,
        // so it can never be re-used even if this subscription is later cancelled.
        ...(event === "subscription.authenticated" ? { trialUsed: true } : {}),
      },
      { merge: true }
    );

    logger.info("Processed webhook", { event, subscriptionId: subEntity.id, uid, status });
    res.status(200).send("ok");
  }
);

/**
 * Lets a logged-in user cancel their own subscription from the site.
 */
exports.cancelSubscription = onCall(
  { region: REGION, secrets: [RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Login zaroori hai.");
    }
    const uid = request.auth.uid;
    const userRef = db.collection("users").doc(uid);
    const snap = await userRef.get();
    const subId = snap.exists && snap.data().subscription && snap.data().subscription.id;
    if (!subId) {
      throw new HttpsError("not-found", "Koi subscription nahi mila.");
    }
    const rp = razorpayClient();
    try {
      await rp.subscriptions.cancel(subId, false); // false = cancel immediately
    } catch (err) {
      logger.error("Razorpay cancel failed", err);
      throw new HttpsError("internal", "Cancel nahi ho paaya.");
    }
    return { ok: true };
  }
);

/**
 * Called from the site once a logged-in user clicks "Khareedein" on a paid
 * ebook that has a readable file. Creates a Razorpay Order for that one
 * book, with the price looked up server-side from books.json (never
 * trusted from the client), tagged with notes so razorpayWebhook can
 * unlock just that book once the order.paid event arrives.
 */
exports.createBookOrder = onCall(
  { region: REGION, secrets: [RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Login zaroori hai.");
    }
    const uid = request.auth.uid;
    const bookId = request.data && request.data.bookId;
    if (!bookId) {
      throw new HttpsError("invalid-argument", "bookId zaroori hai.");
    }

    let books;
    try {
      const booksRes = await fetch("https://ebookwala.github.io/books.json");
      books = await booksRes.json();
    } catch (err) {
      logger.error("Fetching books.json failed", err);
      throw new HttpsError("internal", "Ebook list load nahi ho paayi.");
    }
    const book = books.find((b) => b.id === bookId);
    if (!book || book.free || !book.price) {
      throw new HttpsError("not-found", "Ye ebook khareedne ke liye available nahi hai.");
    }

    const rp = razorpayClient();
    let order;
    try {
      order = await rp.orders.create({
        amount: Math.round(book.price * 100),
        currency: "INR",
        notes: { firebaseUid: uid, bookId },
      });
    } catch (err) {
      logger.error("Razorpay order creation failed", err);
      throw new HttpsError("internal", "Order nahi ban paaya.");
    }

    return {
      orderId: order.id,
      amount: order.amount,
      keyId: RAZORPAY_KEY_ID.value(),
      title: book.title,
    };
  }
);

// ---------------------------------------------------------------------
// Profile (mandatory mobile/WhatsApp/age/profession) + admin listing +
// new-book email notifications.
// ---------------------------------------------------------------------

const MOBILE_RE = /^(\+91[\-\s]?)?[6-9]\d{9}$/; // Indian mobile, optional +91

/**
 * Called from the mandatory profile gate (right after first login) and
 * from the "Mera Account" page's edit form. Validates and saves the four
 * fields server-side — these show up in adminListUsers, so they're kept
 * real rather than trusting whatever the client already displayed.
 */
exports.saveProfile = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Login zaroori hai.");
  }
  const uid = request.auth.uid;
  const data = request.data || {};
  const mobile = String(data.mobile || "").trim().replace(/[\s-]/g, "");
  const whatsappRaw = String(data.whatsapp || "").trim().replace(/[\s-]/g, "");
  const whatsapp = whatsappRaw || mobile; // "same as mobile" when left blank
  const age = Number(data.age);
  const profession = String(data.profession || "").trim().slice(0, 80);

  if (!MOBILE_RE.test(mobile)) {
    throw new HttpsError("invalid-argument", "Sahi 10-digit mobile number dalein.");
  }
  if (!MOBILE_RE.test(whatsapp)) {
    throw new HttpsError("invalid-argument", "Sahi 10-digit WhatsApp number dalein.");
  }
  if (!Number.isFinite(age) || age < 10 || age > 100) {
    throw new HttpsError("invalid-argument", "Sahi age (10-100) dalein.");
  }
  if (!profession) {
    throw new HttpsError("invalid-argument", "Profession zaroori hai.");
  }

  await db.collection("users").doc(uid).set(
    {
      email: request.auth.token.email || null,
      displayName: request.auth.token.name || null,
      mobile,
      whatsapp,
      age,
      profession,
      profileCompleted: true,
      profileUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { ok: true };
});

/**
 * Owner-only: lists every user's profile + subscription summary for the
 * admin.html page. Gated purely by request.auth.token.email matching the
 * ADMIN_EMAIL secret — the admin signs in with their own Google account,
 * no separate password to manage.
 */
exports.adminListUsers = onCall({ region: REGION, secrets: [ADMIN_EMAIL] }, async (request) => {
  const callerEmail = (request.auth && request.auth.token.email || "").toLowerCase();
  const adminEmail = (ADMIN_EMAIL.value() || "").toLowerCase();
  if (!callerEmail || !adminEmail || callerEmail !== adminEmail) {
    throw new HttpsError("permission-denied", "Aap is page ko kholne ke liye authorized nahi hain.");
  }

  const snap = await db.collection("users").get();
  const users = snap.docs.map((doc) => {
    const d = doc.data() || {};
    return {
      uid: doc.id,
      email: d.email || null,
      displayName: d.displayName || null,
      mobile: d.mobile || null,
      whatsapp: d.whatsapp || null,
      age: d.age || null,
      profession: d.profession || null,
      profileCompleted: !!d.profileCompleted,
      subscriptionStatus: (d.subscription && d.subscription.status) || null,
      purchasedBooksCount: (d.purchasedBooks || []).length,
      trialUsed: !!d.trialUsed,
    };
  });
  return { users };
});

/**
 * Called by the GitHub Action (.github/workflows/notify-new-books.yml)
 * whenever a push to main adds a new book to books.json. Emails every
 * logged-in user (anyone with an `email` field in their users/{uid} doc,
 * profile-completed or not) in BCC batches via Gmail SMTP.
 */
exports.notifyNewBooks = onRequest(
  { region: REGION, secrets: [GMAIL_USER, GMAIL_APP_PASSWORD, NOTIFY_SECRET] },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("POST only");
      return;
    }
    const providedSecret = req.headers["x-notify-secret"];
    if (!providedSecret || providedSecret !== NOTIFY_SECRET.value()) {
      res.status(403).send("Invalid secret");
      return;
    }
    const books = Array.isArray(req.body && req.body.books) ? req.body.books : [];
    if (!books.length) {
      res.status(200).send("No books to notify about");
      return;
    }

    const snap = await db.collection("users").select("email").get();
    const emails = [...new Set(snap.docs.map((d) => d.data().email).filter(Boolean))];
    if (!emails.length) {
      res.status(200).send("No subscribers to email");
      return;
    }

    const siteUrl = "https://ebookwala.github.io/";
    const listHtml = books
      .map((b) => `<li><a href="${siteUrl}${encodeURIComponent(b.id)}.html">${b.title}</a></li>`)
      .join("");
    const listText = books.map((b) => `- ${b.title}: ${siteUrl}${encodeURIComponent(b.id)}.html`).join("\n");
    const subject = books.length === 1
      ? `📚 Nayi ebook aayi hai: ${books[0].title} — ebookwala`
      : `📚 ${books.length} nayi ebooks aayi hain — ebookwala`;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: GMAIL_USER.value(), pass: GMAIL_APP_PASSWORD.value() },
    });

    // BCC in small batches — gentler on Gmail's sending limits/spam
    // filters than one email with hundreds of recipients.
    const BATCH_SIZE = 40;
    let sent = 0;
    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
      const batch = emails.slice(i, i + BATCH_SIZE);
      try {
        await transporter.sendMail({
          from: `"ebookwala" <${GMAIL_USER.value()}>`,
          to: GMAIL_USER.value(),
          bcc: batch,
          subject,
          text: `ebookwala par nayi ebooks aayi hain:\n\n${listText}\n\nDekhein: ${siteUrl}`,
          html: `<p>ebookwala par nayi ebooks aayi hain:</p><ul>${listHtml}</ul><p><a href="${siteUrl}">Sabhi ebooks dekhein →</a></p>`,
        });
        sent += batch.length;
      } catch (err) {
        logger.error("notifyNewBooks: batch send failed", err);
      }
    }

    logger.info("notifyNewBooks sent", { books: books.map((b) => b.id), recipients: sent });
    res.status(200).send(`Notified ${sent} of ${emails.length} users`);
  }
);
