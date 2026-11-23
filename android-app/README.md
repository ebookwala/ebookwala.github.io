# ebookwala — Android App

Yeh app aapki [ebookwala.github.io](https://ebookwala.github.io/) website ka hi "Android" version hai, isi repository ke `android-app/` folder me rakha gaya hai:

- Website wala **same catalog** — app `https://ebookwala.github.io/books.json` ko seedha fetch karta hai. Jab bhi aap website par koi nayi ebook `books.json` me add karenge, wahi ebook **automatically** app me bhi dikhne lag jaayegi — app ko dobara banane/update karne ki zaroorat nahi.
- **Search + category filter** — website jaisa.
- **Free / Paid badge** har book par, website ki tarah.
- **Paid books** → "Khareedein" button dabane par wahi Razorpay payment link browser me khulta hai jo website par use ho raha hai.
- **Free books ke liye built-in reader** — PDF.js se banaya gaya ek chhota reader jo app ke andar hi PDF page-by-page dikhata hai (zoom/pinch bhi karta hai), bina kisi alag PDF app ke.

## Zaroori baat — "fileUrl" field

Abhi `books.json` me kisi bhi free book ke liye asli PDF file ka link nahi hai (website par bhi "Is ebook ki file abhi upload nahi hui" wala message hi dikhta hai). Jis din aap kisi free book me ek naya field jodenge:

```json
{
  "id": "gaon-ki-kahani",
  "title": "Gaon Ki Kahani",
  ...
  "fileUrl": "https://ebookwala.github.io/gaon-ki-kahani.pdf"
}
```

...us din se woh book app ke built-in reader me turant khulne lag jaayegi — kisi app update ki zaroorat nahi, sirf `books.json` update karna hai (jaise aap dusri details update karte hain). (Paid books jaisi `naukri-ya-business.pdf` already isi style me repo ke root par hosted hain.)

## APK kaise milta hai

Root `.github/workflows/build-apk.yml` workflow is `android-app/` folder me kisi bhi badlaav par (ya `main` branch par koi bhi push par) khud chalta hai aur:

1. GitHub ke apne (free) servers par APK build karta hai — Android SDK yahan install karne ki zaroorat nahi.
2. Us APK ko ek **GitHub Release** ke saath attach kar deta hai, isliye ek **permanent, seedha download link** mil jaata hai (login ki zaroorat nahi, Actions "Artifacts" jaisa expire nahi hota):

   **https://github.com/ebookwala/ebookwala.github.io/releases/latest/download/ebookwala.apk**

   Yeh link website (`index.html`) ke header me "📱 App Download Karein" button me already daal diya gaya hai.
3. Phone par yeh link kholke APK download aur install kar lein ("Unknown sources/Install unknown apps" ek baar allow karna padega).

Jab bhi aap `android-app/` me koi change push karenge, workflow dobara chalega aur upar wala link apne-aap naye build par point karta rahega (link same rehta hai, sirf andar ka APK update hota hai).

### Play Store ke liye

Yeh workflow jo APK deta hai woh "debug-signed" type ka hai — testing aur apne phone me install karne ke liye bilkul theek hai. Play Store par daalne se pehle isko apni khud ki signing key se sign karna padega (keystore banani hogi) — yeh agla step hai, jab aap taiyaar hon to bata dein, main woh bhi set kar dunga.

## Project structure

```
app/src/main/java/com/ebookwala/app/
  MainActivity.kt        — book grid, search, category filter
  BookDetailActivity.kt  — book detail + Padhein/Khareedein button
  ReaderActivity.kt      — built-in PDF reader (WebView + PDF.js)
  Book.kt                — books.json data model
  BooksRepository.kt     — fetch + offline cache of books.json
  BooksAdapter.kt         — grid list adapter

app/src/main/assets/pdfjs/ — bundled PDF.js reader (pdf.min.mjs, reader.html, reader.js)
```
