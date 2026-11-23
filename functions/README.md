# ebookwala — 3-Din Free Trial / ₹49-month subscription setup

Yeh folder Firebase Cloud Functions hai jo Razorpay Subscriptions ko
ebookwala.github.io se jodta hai: **3-din free trial (₹2 authorization)**,
uske baad **₹49/month autodebit**.

Code already likh diya gaya hai. Neeche diye steps **sirf aapko** (Vishnu ko)
apne Razorpay aur Firebase dashboard mein karne hain — yeh main nahi kar
sakta kyunki yeh aapke payment account ki settings hain.

## 1. Razorpay dashboard mein Subscriptions activate karna

1. https://dashboard.razorpay.com par login karein.
2. **Subscriptions** feature activate hai ya nahi check karein — left menu
   mein "Subscriptions" dikhna chahiye. Agar nahi dikhta, to Razorpay support
   se activate karwana padega (Individual account par kabhi extra KYC maang
   sakte hain).
3. **Settings → Subscriptions → Authentication transaction amount** mein
   jaakar amount **₹2** set karein — yahi woh rakam hai jo trial start karte
   waqt deduct hogi (mandate verify karne ke liye).
4. **UPI Autopay** aur **Card recurring** dono enable rakhein, taaki customer
   dono tarah se pay kar sake.

## 2. Plan banana (₹49/month)

1. Subscriptions → **Plans → + Create Plan**
2. Billing frequency: **Monthly**, Amount: **₹49**, Currency: INR
3. Plan ka naam: "ebookwala All-Access Monthly"
4. Save karne ke baad jo **Plan ID** milega (jaise `plan_XXXXXXXXXXXX`), use
   copy kar lein — step 5 mein chahiye hoga.

## 3. Webhook banana

1. Settings → **Webhooks → + Add New Webhook**
2. Webhook URL: `firebase deploy` karne ke baad terminal mein jo URL print
   hoga use yahan daalein — kuch is tarah dikhega:
   `https://asia-south1-ebookwala-90c89.cloudfunctions.net/razorpayWebhook`
3. Active events mein select karein: `subscription.authenticated`,
   `subscription.activated`, `subscription.charged`,
   `subscription.completed`, `subscription.cancelled`,
   `subscription.halted`, `subscription.pending`
4. Ek **Secret** set karein (koi bhi random strong string) — isi secret ko
   step 5 mein `RAZORPAY_WEBHOOK_SECRET` ke roop mein use karna hai.

## 4. API Keys

Settings → **API Keys** se apni **Key Id** aur **Key Secret** le lein (Live
mode wali, Test mode nahi — jab tak aap pehle test na karna chahein).

## 5. Firebase mein secrets set karna

Terminal mein (is `functions/` folder ke parent, ya kahin bhi) Firebase CLI
install + login karein agar pehle se nahi hai:

```bash
npm install -g firebase-tools
firebase login
```

Phir yeh 4 secrets set karein (har command ke baad value paste karke Enter
dabayein):

```bash
firebase functions:secrets:set RAZORPAY_KEY_ID
firebase functions:secrets:set RAZORPAY_KEY_SECRET
firebase functions:secrets:set RAZORPAY_WEBHOOK_SECRET
firebase functions:secrets:set RAZORPAY_PLAN_ID
```

## 6. Deploy karna

Repo ke root folder (jahan `firebase.json` hai) se:

```bash
cd functions && npm install && cd ..
firebase deploy --only functions,firestore:rules
```

Deploy hone ke baad jo URL print hoga wahi webhook URL hai (step 3 mein wapas
jaakar daal dein agar pehle placeholder diya tha).

## 7. Test karna

- Site par login karke "3-Din Free Trial" button dabayein.
- Razorpay Checkout khulega, ₹2 ka mandate authorize karna hoga (apna hi
  card/UPI use karke test kar sakte hain).
- Success ke turant baad subscription status Firestore mein `authenticated`
  ho jaana chahiye (check Firebase Console → Firestore → `users/<uid>`), aur
  site par sabhi paid ebooks "Padhein" se khulni chahiye.
- 3 din baad Razorpay khud ₹49 charge karega aur status `active` ho jayega.
- Har mahine automatically ₹49 katega jab tak user khud cancel na kare
  (site par "Subscription Cancel Karein" button se) ya payment fail na ho
  (status `halted` ho jata hai aur access turant lock ho jata hai).

## Kaise kaam karta hai (summary)

- `createTrialSubscription` — user login karke trial button dabata hai, yeh
  function Razorpay customer + subscription banata hai (billing start = 3
  din baad), aur Checkout ke liye subscription id return karta hai.
- `razorpayWebhook` — Razorpay har event (mandate success, charge success,
  cancel, fail) is par bhejta hai; yeh Firestore mein `users/{uid}`
  ka `subscription.status` update karta hai.
- Site ka frontend (`subscription.js`) Firestore ke `users/{uid}` document
  ko real-time sunta hai — jab bhi status `authenticated` ya `active` ho,
  sabhi paid ebooks turant unlock ho jaate hain, kisi reload ki zaroorat
  nahi.
- Ek account sirf **ek hi baar** trial le sakta hai (`trialUsed` flag
  Firestore mein save hota hai jab ₹2 ka mandate pehli baar succeed hota
  hai).
