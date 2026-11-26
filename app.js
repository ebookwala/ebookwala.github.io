// Shared logic for ebookwala.github.io
// Loads books.json and renders the catalog grid, search, category filters, login bar and book page.

let ALL_BOOKS = [];
let activeCategory = "All";
let activeType = "all";   // all | free | paid | combo
let activeSort = "default"; // default | price-asc | price-desc

function bookType(b) {
    if (Array.isArray(b.comboItems) && b.comboItems.length) return "combo";
    if (b.free || b.price === 0) return "free";
    return "paid";
}

// A lowercase blob of every field a reader might type, so search works
// whether they type Devanagari ("राहु") or the romanized spelling ("rahu") —
// the book's own id (e.g. "rahu-mahagranth") already is that romanization.
function buildSearchIndex(b) {
    return [b.title, b.description, b.author, b.category, (b.id || "").replace(/[-_]/g, " ")]
        .join(" ")
        .toLowerCase();
}

// ---------- Login helpers (auth.js sets window.ebookAuth) ----------
function onAuth(cb) {
    window.addEventListener("ebook-auth", e => cb(e.detail));
    if (window.ebookAuth && window.ebookAuth.ready) cb(window.ebookAuth.user);
}

// Must be called straight from a click handler (popup blockers).
function requireLogin() {
    const a = window.ebookAuth;
    if (!a) {
        alert("Login system abhi load ho raha hai. Kuch second baad dobara try karein.");
        return Promise.resolve(null);
    }
    return a.user ? Promise.resolve(a.user) : a.login();
}

function renderAuthBar(user) {
    const bar = document.getElementById("authBar");
    if (!bar) return;
    if (user) {
        const first = (user.displayName || user.email || "User").split(" ")[0];
        const photo = user.photoURL ? `<img src="${user.photoURL}" alt="" referrerpolicy="no-referrer">` : "";
        bar.innerHTML = `<span class="user">${photo}<span>${first}</span></span><button id="logoutBtn">Logout</button>`;
        document.getElementById("logoutBtn").addEventListener("click", () => window.ebookAuth.logout());
    } else {
        bar.innerHTML = `<button id="loginBtn">🔐 Google se Login</button>`;
        document.getElementById("loginBtn").addEventListener("click", () => requireLogin());
    }
}

function initAuthBar() { onAuth(renderAuthBar); }

// ---------- Catalog ----------
const CATALOG_CACHE_KEY = "ebookwala:catalog-cache-v1";
const CATALOG_CACHE_TTL = 10 * 60 * 1000; // 10 minutes — fresh enough, avoids refetching on every page

async function fetchCatalog() {
    // Serve a recent copy from this browser's sessionStorage first so moving
    // between the homepage, a book page and the reader doesn't re-download
    // books.json (and every book cover's dimensions) each time. A hard
    // refresh or a new tab still gets a live fetch.
    try {
        const cached = JSON.parse(sessionStorage.getItem(CATALOG_CACHE_KEY) || "null");
        if (cached && Date.now() - cached.t < CATALOG_CACHE_TTL) return cached.books;
    } catch (e) {}
    const res = await fetch("books.json?v=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const books = await res.json();
    try { sessionStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify({ t: Date.now(), books })); } catch (e) {}
    return books;
}

async function loadBooks() {
    const grid = document.getElementById("bookGrid");
    try {
        ALL_BOOKS = await fetchCatalog();
        ALL_BOOKS.forEach(b => { b._search = buildSearchIndex(b); });
        renderCategories();
        renderGrid(ALL_BOOKS);
        buildHeroMosaic();
    } catch (e) {
        if (grid) {
            grid.innerHTML = `<div class="empty-state">Ebooks load nahi ho payin. Internet check karein.<br>
                <button type="button" class="buy-btn secondary" id="retryLoadBtn" style="margin-top:14px">🔄 Dobara Try Karein</button></div>`;
            const btn = document.getElementById("retryLoadBtn");
            if (btn) btn.addEventListener("click", () => { try { sessionStorage.removeItem(CATALOG_CACHE_KEY); } catch (e2) {} loadBooks(); });
        }
    }
}

// Fills the home page's hero background with a tiled mosaic of real book covers.
// Kept small on phones (fewer, smaller tiles) since it's pure decoration behind
// the hero text and shouldn't cost a slow connection dozens of image loads.
function buildHeroMosaic() {
    const mosaic = document.getElementById("heroMosaic");
    if (!mosaic || !ALL_BOOKS.length) return;
    const isSmall = window.matchMedia && window.matchMedia("(max-width:600px)").matches;
    const tileCount = isSmall ? 16 : 48;
    const covers = ALL_BOOKS.map(b => b.cover).filter(Boolean);
    // Repeat/shuffle the cover list so the mosaic fills a wide strip even with few books.
    const tiles = [];
    const shuffled = [...covers].sort(() => Math.random() - 0.5);
    while (tiles.length < tileCount) tiles.push(...shuffled);
    mosaic.innerHTML = tiles.slice(0, tileCount).map((src, i) =>
        `<img src="${src}" alt="" loading="lazy" style="animation-delay:${Math.min(i * 0.02, 0.6)}s">`
    ).join("");
}

function renderCategories() {
    const nav = document.getElementById("categoryNav");
    if (!nav) return;
    const cats = ["All", ...new Set(ALL_BOOKS.map(b => b.category))];
    nav.innerHTML = cats.map(c =>
        `<button data-cat="${c}" class="${c === activeCategory ? 'active' : ''}">${c}</button>`
    ).join("");
    nav.querySelectorAll("button").forEach(btn => {
        btn.addEventListener("click", () => {
            activeCategory = btn.dataset.cat;
            renderCategories();
            applyFilters();
        });
    });
}

function shortDesc(b, len) {
    len = len || 78;
    const d = (b.description || "").trim();
    return d.length > len ? d.slice(0, len).trim() + "…" : d;
}

// The two/three buttons shown on a card, matched to what that book actually
// needs: a free book just opens; a paid book (or combo) gets a no-login
// sample link plus a one-tap buy that skips the detail page entirely.
function cardActionsHtml(b) {
    const type = bookType(b);
    const href = encodeURIComponent(b.id) + ".html";
    if (type === "free") {
        if (!b.file) return `<a class="mini-btn" href="${href}">Vivaran Dekhein</a>`;
        return `<button type="button" class="mini-btn" data-action="free-read" data-id="${b.id}">📖 Free Padhein</button>`;
    }
    const buyLabel = (type === "combo" ? "🎁 " : "") + "₹" + b.price + " Khareedein";
    return `
        <a class="mini-btn ghost" href="${href}#previewBox">Namuna Padhein</a>
        <button type="button" class="mini-btn" data-action="buy" data-id="${b.id}" data-price="${b.price}" data-title="${encodeURIComponent(b.title)}">${buyLabel}</button>`;
}

function renderGrid(books) {
    const grid = document.getElementById("bookGrid");
    if (!grid) return;
    if (books.length === 0) {
        grid.innerHTML = `<div class="empty-state">Koi ebook nahi mili. Dusra search ya filter try karein.</div>`;
        return;
    }
    grid.innerHTML = books.map(b => {
        const href = encodeURIComponent(b.id) + ".html";
        const type = bookType(b);
        const priceText = type === "free" ? "Free" : ("₹" + b.price + (type === "combo" ? " · Combo" : ""));
        return `
        <div class="card${type === "combo" ? " is-combo" : ""}">
            <a class="card-media" href="${href}">
                <img src="${b.cover}" alt="${b.title}" loading="lazy">
                <span class="category-badge">${b.category}</span>
            </a>
            <div class="info">
                <a class="title" href="${href}">${b.title}</a>
                <p class="desc">${shortDesc(b)}</p>
                <p class="price ${type === "free" ? "free" : ""}">${priceText}</p>
                <div class="card-actions">${cardActionsHtml(b)}</div>
            </div>
        </div>`;
    }).join("");
}

// One delegated listener handles every card's buttons, so re-rendering the
// grid (new search, filter, category) never needs to re-bind anything.
function initGridActions() {
    const grid = document.getElementById("bookGrid");
    if (!grid) return;
    grid.addEventListener("click", e => {
        const freeBtn = e.target.closest('[data-action="free-read"]');
        if (freeBtn) {
            e.preventDefault();
            requireLogin().then(u => { if (u) window.location.href = "read.html?id=" + encodeURIComponent(freeBtn.dataset.id); });
            return;
        }
        const buyBtn = e.target.closest('[data-action="buy"]');
        if (buyBtn) {
            e.preventDefault();
            const id = buyBtn.dataset.id, price = Number(buyBtn.dataset.price), title = decodeURIComponent(buyBtn.dataset.title || "");
            requireLogin().then(u => { if (u) window.buyBook && window.buyBook(id, title, price); });
        }
    });
}

function applyFilters() {
    const query = (document.getElementById("searchInput")?.value || "").trim().toLowerCase();
    const tokens = query.split(/\s+/).filter(Boolean);
    let filtered = ALL_BOOKS;
    if (activeCategory !== "All") {
        filtered = filtered.filter(b => b.category === activeCategory);
    }
    if (activeType !== "all") {
        filtered = filtered.filter(b => bookType(b) === activeType);
    }
    if (tokens.length) {
        // Every typed word must appear somewhere in the book's index — lets
        // "rahu mahagranth" or just "mahagranth" both find the same book.
        filtered = filtered.filter(b => tokens.every(t => (b._search || buildSearchIndex(b)).includes(t)));
    }
    if (activeSort === "price-asc") filtered = [...filtered].sort((a, b) => (a.price || 0) - (b.price || 0));
    else if (activeSort === "price-desc") filtered = [...filtered].sort((a, b) => (b.price || 0) - (a.price || 0));
    renderGrid(filtered);
    const countEl = document.getElementById("resultCount");
    if (countEl) countEl.textContent = filtered.length + " parinaam mile";
}

// Used by the hero's "🆓 Free Ebooks" shortcut button.
window.selectTypeAndScroll = function selectTypeAndScroll(type) {
    activeType = type;
    document.querySelectorAll("#typeFilters button").forEach(btn => btn.classList.toggle("active", btn.dataset.type === type));
    applyFilters();
    document.getElementById("bookGrid").scrollIntoView({ behavior: "smooth", block: "start" });
};

function renderSubBanner() {
    const el = document.getElementById("subBanner");
    if (!el) return;
    const sub = window.ebookSub || {};
    if (!sub.ready) { el.style.display = "none"; return; }
    if (sub.active) {
        const endText = sub.currentEnd ? new Date(sub.currentEnd * 1000).toLocaleDateString("hi-IN") : null;
        el.style.display = "flex";
        el.innerHTML = `<p>✅ Aapka trial/subscription active hai — saari ebooks padh sakte hain.${endText ? " Agla ₹49 charge: " + endText + "." : ""}</p>
            <button type="button" class="buy-btn secondary" id="subCancelBtn">Subscription Cancel Karein</button>`;
        const cancelBtn = document.getElementById("subCancelBtn");
        if (cancelBtn) cancelBtn.addEventListener("click", () => window.cancelSubscription && window.cancelSubscription());
        return;
    }
    el.style.display = "flex";
    el.innerHTML = `<p>🎁 3-Din Free Trial — abhi sirf ₹2 lagega (card/UPI verify karne ke liye), 3 din tak <strong>sabhi ebooks</strong> padhein. Chauthe din se ₹49/mahina apne-aap shuru hoga, jise aap yahin se jab chahein cancel kar sakte hain.</p>
        <button type="button" class="buy-btn" id="subTrialBtn">Free Trial Shuru Karein</button>`;
    const trialBtn = document.getElementById("subTrialBtn");
    if (trialBtn) trialBtn.addEventListener("click", () => window.startTrial && window.startTrial());
}

function initHome() {
    initAuthBar();
    initHeaderMenu();
    loadBooks();
    initGridActions();
    const search = document.getElementById("searchInput");
    if (search) search.addEventListener("input", applyFilters);
    const typeFilters = document.getElementById("typeFilters");
    if (typeFilters) {
        typeFilters.addEventListener("click", e => {
            const btn = e.target.closest("button[data-type]");
            if (!btn) return;
            activeType = btn.dataset.type;
            typeFilters.querySelectorAll("button").forEach(b => b.classList.toggle("active", b === btn));
            applyFilters();
        });
    }
    const sortSelect = document.getElementById("sortSelect");
    if (sortSelect) sortSelect.addEventListener("change", () => { activeSort = sortSelect.value; applyFilters(); });
    onAuth(renderSubBanner);
    window.addEventListener("ebook-sub", renderSubBanner);
    renderSubBanner();
}

// Small "☰ More" dropdown used on narrow screens to tuck away the app-download
// link so the header stays short — search and categories stay visible instead
// of being pushed below the fold.
function initHeaderMenu() {
    const btn = document.getElementById("menuToggle");
    const menu = document.getElementById("menuDropdown");
    if (!btn || !menu) return;
    btn.addEventListener("click", () => menu.classList.toggle("open"));
    document.addEventListener("click", e => {
        if (!menu.contains(e.target) && e.target !== btn) menu.classList.remove("open");
    });
}

// ---------- Book detail page ----------
async function initBookPage() {
    initAuthBar();
    const params = new URLSearchParams(window.location.search);
    const id = window.BOOK_ID || params.get("id");
    const container = document.getElementById("bookDetail");
    let books;
    try { books = await fetchCatalog(); }
    catch (e) {
        container.innerHTML = `<div class="empty-state">Ebook load nahi ho payi. Internet check karke <a href="javascript:location.reload()">dobara try karein</a>.</div>`;
        return;
    }
    const book = books.find(b => b.id === id);
    if (!book) {
        container.innerHTML = `<div class="empty-state">Ebook nahi mili.</div>`;
        return;
    }
    document.title = book.title + " — ebookwala";
    const isFree = book.free || book.price === 0;

    let actions;
    if (isFree && book.file) {
        actions = `
            <div class="btn-row">
                <button class="buy-btn" id="readBtn">📖 Online Padhein</button>
                <button class="buy-btn secondary" id="dlBtn">⬇ Download Karein</button>
            </div>
            <p class="login-note" id="loginNote"></p>`;
    } else if (isFree) {
        actions = `<p class="login-note">Is ebook ki file abhi upload nahi hui. Jald hi aayegi.</p>`;
    } else if (Array.isArray(book.comboItems) && book.comboItems.length) {
        // A combo bundle has no reader file of its own — it unlocks the
        // individual volumes listed in comboItems (each already a normal
        // paid book with its own file). Buy it the same in-site way as any
        // other paid book so the purchase webhook can unlock every volume.
        const itemRows = book.comboItems.map(cid => {
            const cb = books.find(x => x.id === cid);
            return `<li data-combo-item="${cid}">${cb ? cb.title : cid}</li>`;
        }).join("");
        actions = `
            <div class="btn-row">
                <button class="buy-btn" id="buyBtn">🎁 Combo Khareedein — ₹${book.price}</button>
            </div>
            <p class="login-note" id="loginNote"></p>
            <div class="combo-items" id="comboItemsBox">
                <p class="combo-items-label">Is combo mein shaamil ${book.comboItems.length} PDF ebooks:</p>
                <ul>${itemRows}</ul>
                <p class="combo-items-note">Format: PDF. Khareedne ke turant baad (payment confirm hote hi) har volume yahin neeche "📖 Padhein" button se khulega — login ke saath, bina dobara payment kiye.</p>
            </div>`;
    } else if (book.file) {
        // Paid book with a readable file: buy it once, OR unlock it (and every
        // other book) with the 3-day trial / ₹49-month subscription.
        actions = `
            <div class="btn-row">
                <button class="buy-btn" id="buyBtn">Khareedein — ₹${book.price}</button>
                <button class="buy-btn secondary" id="readBtn">📖 Padhein</button>
            </div>
            <p class="login-note" id="loginNote"></p>
            <p class="trial-note">🎁 Ya <button type="button" class="link-btn" id="trialBtn">3-Din Free Trial</button> lekar <strong>sabhi ebooks</strong> padhein — abhi sirf ₹2 (verify ke liye), 3 din free, chauthe din se ₹49/mahina (jab chahen upar se cancel karein)</p>`;
    } else {
        actions = `<a class="buy-btn" href="${book.razorpayLink || '#'}" target="_blank" rel="noopener">Khareedein — ₹${book.price}</a>`;
    }

    container.innerHTML = `
        <img src="${book.cover}" alt="${book.title}">
        <div class="meta">
            <span class="category-pill">${book.category}</span>
            <h2>${book.title}</h2>
            <p>${book.description}</p>
            <div class="price-tag ${isFree ? 'free' : ''}">${isFree ? 'Free' : '₹' + book.price}</div>
            ${actions}
            <div class="share-wrap" id="shareWrap"></div>
            <p class="preview-label">📖 Namuna (koi login zaroori nahi):</p>
            <div class="preview-box" id="previewBox">${book.preview}</div>
        </div>`;

    initShare(book);

    if (isFree && book.file) {
        document.getElementById("readBtn").addEventListener("click", () => {
            requireLogin().then(u => { if (u) window.location.href = "read.html?id=" + encodeURIComponent(book.id); });
        });
        document.getElementById("dlBtn").addEventListener("click", () => {
            requireLogin().then(u => {
                if (!u) return;
                const a = document.createElement("a");
                a.href = book.file;
                a.download = book.title.replace(/[^\w\-]+/g, "_") + (/\.pdf$/i.test(book.file) ? ".pdf" : ".docx");
                document.body.appendChild(a);
                a.click();
                a.remove();
            });
        });
        onAuth(u => {
            const note = document.getElementById("loginNote");
            if (!note) return;
            note.textContent = u
                ? "✅ Aap login hain, padh ya download kar sakte hain."
                : "🔒 Padhne ya download karne ke liye Google se login zaroori hai.";
        });
    } else if (!isFree && Array.isArray(book.comboItems) && book.comboItems.length) {
        const owns = () => window.ebookSub && (window.ebookSub.active || (window.ebookSub.purchasedBooks || []).includes(book.id));
        const buyBtn = document.getElementById("buyBtn");
        if (buyBtn) buyBtn.addEventListener("click", () => {
            requireLogin().then(u => { if (u) window.buyBook && window.buyBook(book.id, book.title, book.price); });
        });
        const renderComboState = () => {
            const note = document.getElementById("loginNote");
            const box = document.getElementById("comboItemsBox");
            if (!box) return;
            const u = window.ebookAuth && window.ebookAuth.user;
            if (!u) {
                if (note) note.textContent = "🔒 Khareedne ya padhne ke liye Google se login zaroori hai.";
                return;
            }
            if (owns()) {
                if (note) note.textContent = "✅ Aapne ye combo khareeda hai — neeche se har volume padhein.";
                box.querySelectorAll("li[data-combo-item]").forEach(li => {
                    const cid = li.dataset.comboItem;
                    if (li.querySelector("a")) return;
                    li.innerHTML += ` <a class="mini-btn" href="read.html?id=${encodeURIComponent(cid)}">📖 Padhein</a>`;
                });
            } else if (note) {
                note.textContent = "Khareedne ke baad yahin se sabhi volumes padh sakte hain.";
            }
        };
        onAuth(renderComboState);
        window.addEventListener("ebook-sub", renderComboState);
        renderComboState();
    } else if (!isFree && book.file) {
        const owns = () => window.ebookSub && (window.ebookSub.active || (window.ebookSub.purchasedBooks || []).includes(book.id));
        document.getElementById("readBtn").addEventListener("click", () => {
            requireLogin().then(u => {
                if (!u) return;
                if (owns()) {
                    window.location.href = "read.html?id=" + encodeURIComponent(book.id);
                } else {
                    alert("Is ebook ko padhne ke liye khareedein ya 3-din free trial lein.");
                }
            });
        });
        const buyBtn = document.getElementById("buyBtn");
        if (buyBtn) buyBtn.addEventListener("click", () => {
            requireLogin().then(u => { if (u) window.buyBook && window.buyBook(book.id, book.title, book.price); });
        });
        const trialBtn = document.getElementById("trialBtn");
        if (trialBtn) trialBtn.addEventListener("click", () => window.startTrial && window.startTrial());
        const updateNote = () => {
            const note = document.getElementById("loginNote");
            if (!note) return;
            const u = window.ebookAuth && window.ebookAuth.user;
            note.textContent = !u
                ? "🔒 Padhne ke liye Google se login zaroori hai."
                : owns()
                ? "✅ Aapne ye ebook khareedi hai ya trial/subscription active hai — padh sakte hain."
                : "Is ebook ko padhne ke liye khareedein ya free trial lein.";
        };
        onAuth(updateNote);
        window.addEventListener("ebook-sub", updateNote);
        updateNote();
    }
}

// ---------- Share ----------
function injectShareStyles() {
    if (document.getElementById("shareStyles")) return;
    const st = document.createElement("style");
    st.id = "shareStyles";
    st.textContent = `
    .share-wrap{margin:14px 0 4px;position:relative}
    .share-btn{background:transparent;color:var(--accent-dark,#0fa800);border:2px solid var(--accent,#39ff14);border-radius:10px;padding:8px 16px;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:0 0 10px rgba(57,255,20,.35)}
    .share-btn:hover{box-shadow:0 0 18px rgba(57,255,20,.7)}
    .share-menu{display:none;flex-wrap:wrap;gap:8px;margin-top:10px}
    .share-menu.open{display:flex}
    .share-menu a,.share-menu button{background:#fff;color:#111;border:1px solid #d6e8d6;border-radius:999px;padding:7px 14px;font-size:.9rem;text-decoration:none;cursor:pointer;font-family:inherit}
    .share-menu a:hover,.share-menu button:hover{border-color:var(--accent,#39ff14);box-shadow:0 0 10px rgba(57,255,20,.5)}
    .share-toast{margin-top:8px;font-size:.88rem;color:var(--accent-dark,#0fa800)}`;
    document.head.appendChild(st);
}

function initShare(book) {
    const wrap = document.getElementById("shareWrap");
    if (!wrap) return;
    injectShareStyles();
    const url = location.origin + "/" + encodeURIComponent(book.id) + ".html";
    const text = book.title + " — ebookwala par";
    const eu = encodeURIComponent(url), et = encodeURIComponent(text);
    wrap.innerHTML = `
        <button class="share-btn" id="shareBtn" type="button">🔗 Share Karein</button>
        <div class="share-menu" id="shareMenu">
            <button type="button" id="shCopy">📋 Link copy</button>
            <a target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(text + " " + url)}">WhatsApp</a>
            <a target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${eu}">Facebook</a>
            <button type="button" id="shInsta">Instagram</button>
            <a target="_blank" rel="noopener" href="https://t.me/share/url?url=${eu}&text=${et}">Telegram</a>
        </div>
        <div class="share-toast" id="shareToast"></div>`;
    const toast = m => { const t = document.getElementById("shareToast"); t.textContent = m; setTimeout(() => { t.textContent = ""; }, 3500); };
    const copy = async () => {
        try { await navigator.clipboard.writeText(url); return true; }
        catch (e) {
            const ta = document.createElement("textarea"); ta.value = url; document.body.appendChild(ta); ta.select();
            let ok = false; try { ok = document.execCommand("copy"); } catch (e2) {}
            ta.remove(); return ok;
        }
    };
    document.getElementById("shareBtn").addEventListener("click", async () => {
        if (navigator.share) {
            try { await navigator.share({ title: book.title, text, url }); return; } catch (e) { if (e && e.name === "AbortError") return; }
        }
        document.getElementById("shareMenu").classList.toggle("open");
    });
    document.getElementById("shCopy").addEventListener("click", async () => { toast((await copy()) ? "✅ Link copy ho gaya" : "Link copy nahi hua, manually copy karein: " + url); });
    document.getElementById("shInsta").addEventListener("click", async () => {
        const ok = await copy();
        toast(ok ? "✅ Link copy ho gaya, ab Instagram mein paste karke share karein." : "Instagram par link manually paste karein: " + url);
        window.open("https://www.instagram.com/", "_blank", "noopener");
    });
}

// ---------- Online reader ----------
async function initReader() {
    initAuthBar();
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    const msg = document.getElementById("readerMsg");
    const wrap = document.getElementById("readerWrap");
    const bar = document.getElementById("readerBar");

    let books;
    try { books = await fetchCatalog(); }
    catch (e) {
        msg.innerHTML = "Ebook load nahi ho payi. <a class='back-link' href='javascript:location.reload()'>🔄 Dobara try karein</a>";
        return;
    }
    const book = books.find(b => b.id === id);
    if (!book || !book.file) {
        msg.innerHTML = "Ebook nahi mili. <a class='back-link' href='index.html'>← Wapas jaayein</a>";
        return;
    }
    document.title = book.title + " — ebookwala reader";
    document.getElementById("readerTitle").textContent = book.title;

    const isFree = book.free || book.price === 0;
    let started = false;

    function showLocked() {
        msg.innerHTML = `<p>🔒 Yeh paid ebook hai. Padhne ke liye khareedein ya 3-din free trial lein.</p>
            <div class="btn-row" style="justify-content:center">
                <button type="button" class="buy-btn" id="readerBuy">Khareedein — ₹${book.price}</button>
                <button type="button" class="buy-btn secondary" id="readerTrial">🎁 3-Din Free Trial</button>
            </div>
            <p class="login-note"><a class="back-link" href="${encodeURIComponent(book.id)}.html">← Book page par jaayein</a></p>`;
        const rb = document.getElementById("readerBuy");
        if (rb) rb.addEventListener("click", () => window.buyBook && window.buyBook(book.id, book.title, book.price));
        const tb = document.getElementById("readerTrial");
        if (tb) tb.addEventListener("click", () => window.startTrial && window.startTrial());
    }

    function owns() {
        return window.ebookSub && (window.ebookSub.active || (window.ebookSub.purchasedBooks || []).includes(book.id));
    }

    function evaluate(user) {
        if (!user) {
            if (started) { window.location.reload(); return; }
            msg.innerHTML = `<p>🔒 Is ebook ko padhne ke liye login zaroori hai.</p>
                <button class="buy-btn" id="readerLogin">🔐 Google se Login</button>`;
            document.getElementById("readerLogin").addEventListener("click", () => requireLogin());
            return;
        }
        if (!isFree && !owns()) {
            if (started) { window.location.reload(); return; }
            // Wait for the subscription listener's first result before deciding "locked".
            if (window.ebookSub && window.ebookSub.ready) showLocked();
            return;
        }
        if (started) return;
        started = true;
        loadReader(book, user, msg, wrap, bar);
    }

    onAuth(evaluate);
    window.addEventListener("ebook-sub", () => evaluate(window.ebookAuth && window.ebookAuth.user));
}

async function loadReader(book, user, msg, wrap, bar) {
    try {
        msg.textContent = "📖 Ebook taiyaar ho rahi hai…";
        if (typeof pdfjsLib === "undefined") throw new Error("Reader library load nahi hui");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
        const pdf = await pdfjsLib.getDocument({ url: book.file }).promise;
        const total = pdf.numPages;
        const key = "ebookwala:" + user.uid + ":" + book.id;
        let page = 0;
        try { page = Math.min(total - 1, Math.max(0, parseInt(localStorage.getItem(key) || "0", 10) || 0)); } catch (e) {}

        msg.style.display = "none";
        bar.innerHTML = `
            <button id="rPrev">◀ Pichla</button>
            <span>Page <input id="rNum" type="number" min="1" max="${total}" style="width:64px"> / ${total}</span>
            <button id="rNext">Agla ▶</button>
            <a class="back-link" style="margin:0;color:#39ff14" href="book.html?id=${encodeURIComponent(book.id)}">Book page</a>`;
        bar.style.display = "flex";
        wrap.innerHTML = '<canvas id="rCanvas" style="display:block;margin:0 auto;max-width:100%;background:#fff;border-radius:6px"></canvas>';
        const canvas = document.getElementById("rCanvas");
        let busy = false, pending = null;

        const render = async p => {
            if (busy) { pending = p; return; }
            busy = true;
            try {
                const pg = await pdf.getPage(p + 1);
                const base = pg.getViewport({ scale: 1 });
                const cssW = Math.min(wrap.clientWidth - 36 || 800, 900);
                const dpr = Math.min(window.devicePixelRatio || 1, 2);
                const vp = pg.getViewport({ scale: (cssW / base.width) * dpr });
                canvas.width = vp.width; canvas.height = vp.height;
                canvas.style.width = (vp.width / dpr) + "px";
                await pg.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
            } catch (e) {}
            busy = false;
            if (pending !== null) { const n = pending; pending = null; render(n); }
        };
        const show = p => {
            page = Math.min(total - 1, Math.max(0, p));
            document.getElementById("rNum").value = page + 1;
            document.getElementById("rPrev").disabled = page === 0;
            document.getElementById("rNext").disabled = page === total - 1;
            try { localStorage.setItem(key, String(page)); } catch (e) {}
            render(page);
            window.scrollTo(0, 0);
        };
        document.getElementById("rPrev").addEventListener("click", () => show(page - 1));
        document.getElementById("rNext").addEventListener("click", () => show(page + 1));
        document.getElementById("rNum").addEventListener("change", e => show((parseInt(e.target.value, 10) || 1) - 1));
        document.addEventListener("keydown", e => {
            if (e.target.tagName === "INPUT") return;
            if (e.key === "ArrowRight") show(page + 1);
            if (e.key === "ArrowLeft") show(page - 1);
        });
        wrap.addEventListener("contextmenu", e => e.preventDefault());
        wrap.addEventListener("copy", e => e.preventDefault());
        window.addEventListener("resize", () => render(page));
        show(page);
    } catch (err) {
        msg.textContent = "Ebook khul nahi paayi: " + err.message;
    }
}

// ---------- 3D tilt interaction (cards + book cover) ----------
(function () {
    // Skip on touch devices — mousemove won't fire meaningfully there anyway.
    if (window.matchMedia && !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    function tilt(el, e, strength, extra) {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        const rx = (0.5 - y) * strength;
        const ry = (x - 0.5) * strength;
        el.style.transition = "none";
        el.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) ${extra}`;
    }
    function resetTilt(el) {
        el.style.transition = "transform .45s ease";
        el.style.transform = "";
    }

    document.addEventListener("mousemove", e => {
        const card = e.target.closest && e.target.closest(".card");
        if (card) tilt(card, e, 9, "translateY(-4px) scale(1.03)");
        const cover = e.target.closest && e.target.closest(".book-detail img");
        if (cover) tilt(cover, e, 12, "scale(1.04)");
    });
    document.addEventListener("mouseout", e => {
        const card = e.target.closest && e.target.closest(".card");
        if (card && (!e.relatedTarget || !card.contains(e.relatedTarget))) resetTilt(card);
        const cover = e.target.closest && e.target.closest(".book-detail img");
        if (cover && (!e.relatedTarget || !cover.contains(e.relatedTarget))) resetTilt(cover);
    });
})();
