# ebookwala.github.io — Hindi Ebook Store (static site)

Pratilipi-jaisi ek Hindi ebook website jo GitHub Pages par free host hoti hai.

## Files
- `index.html` — Home page: search + category filter + book grid
- `book.html` — Ek ebook ka detail page (preview + buy button), `books.json` se data load karta hai
- `books.json` — Saari ebooks ki list (title, price, cover, description, preview, Razorpay link). **Yahi file edit karke naye books add karein.**
- `style.css`, `app.js` — Design aur logic

## GitHub Pages par deploy kaise karein
1. GitHub par naya repository banayein, exact naam: `ebookwala.github.io` (aapke GitHub username ka repo hona chahiye `<username>.github.io` — agar aapka username "ebookwala" nahi hai, to ye repo "project site" banega, aur URL `https://<username>.github.io/ebookwala.github.io/` jaisa hoga. Agar aap chahte hain ki URL seedha `https://ebookwala.github.io` ho, to aapka GitHub **username** bhi "ebookwala" hona chahiye).
2. Ye saari files (`index.html`, `book.html`, `books.json`, `style.css`, `app.js`) us repository mein upload/push karein.
3. Repo ke Settings → Pages mein jaakar "Deploy from branch" select karein, branch `main` aur folder `/ (root)` rakhein.
4. 1-2 minute mein site live ho jaayegi.

## Har naya ebook add karne ke liye
`books.json` mein ek naya object add karein:
```json
{
  "id": "unique-id-no-space",
  "title": "Kitab Ka Naam",
  "author": "MyeKitab",
  "category": "Romance",
  "price": 49,
  "cover": "cover-image-ka-URL",
  "description": "Chhoti si jankari ebook ke baare mein",
  "preview": "Pehle paragraph ka free preview text",
  "razorpayLink": "https://rzp.io/l/aapka-razorpay-payment-link",
  "free": false
}
```
Free ebook ke liye `"price": 0, "free": true` rakhein.

## Payment (Razorpay) kaise set karein
1. https://razorpay.com/ par free account banayein aur KYC complete karein (payment receive karne ke liye zaroori hai).
2. Dashboard → **Payment Links** → "Create Payment Link" se har ebook ke liye ek alag link banayein (amount wahi dalein jo book ki price hai).
3. Wo link `books.json` mein us book ke `razorpayLink` field mein daal dein.
4. Payment hone ke baad Razorpay email/SMS se confirm karega; aapko ebook file manually ya auto-email se bhejni hogi (abhi auto-delivery is static site mein nahi hai — isके liye aage backend chahiye hoga, jaise Google Form + Google Sheet + Apps Script se auto-email bhi set ho sakta hai, agar chahiye to bata dena).

## Abhi kya missing hai (aapko dena hoga)
- Asli ebook covers (image files ya URLs)
- Asli book descriptions aur preview text
- Razorpay payment links (har paid book ke liye)
- Jo ebooks free rakhni hain unki actual reading/download link

## Future upgrade (jab chahen)
- Ratings/reviews jo sab visitors ko dikhen (abhi ye static hai) — iske liye Firebase jaisa free backend chahiye hoga.
- Automatic ebook delivery after payment.
