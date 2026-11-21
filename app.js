// Shared logic for ebookwala.github.io
// Loads books.json and renders the catalog grid, search, category filters, login bar and book page.

let ALL_BOOKS = [];
let activeCategory = "All";

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
async function loadBooks() {
    const res = await fetch("books.json?v=" + Date.now(), { cache: "no-store" });
    ALL_BOOKS = await res.json();
    renderCategories();
    renderGrid(ALL_BOOKS);
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

function renderGrid(books) {
    const grid = document.getElementById("bookGrid");
    if (!grid) return;
    if (books.length === 0) {
        grid.innerHTML = `<div class="empty-state">Koi ebook nahi mili. Dusra search try karein.</div>`;
        return;
    }
    grid.innerHTML = books.map(b => `
        <a class="card" href="book.html?id=${encodeURIComponent(b.id)}">
            <img src="${b.cover}" alt="${b.title}" loading="lazy">
            <div class="info">
                <p class="title">${b.title}</p>
                <p class="price ${b.free || b.price === 0 ? 'free' : ''}">${b.free || b.price === 0 ? 'Free' : '₹' + b.price}</p>
            </div>
        </a>
    `).join("");
}

function applyFilters() {
    const query = (document.getElementById("searchInput")?.value || "").trim().toLowerCase();
    let filtered = ALL_BOOKS;
    if (activeCategory !== "All") {
        filtered = filtered.filter(b => b.category === activeCategory);
    }
    if (query) {
        filtered = filtered.filter(b =>
            b.title.toLowerCase().includes(query) ||
            b.description.toLowerCase().includes(query)
        );
    }
    renderGrid(filtered);
}

function initHome() {
    initAuthBar();
    loadBooks();
    const search = document.getElementById("searchInput");
    if (search) search.addEventListener("input", applyFilters);
}

// ---------- Book detail page ----------
async function initBookPage() {
    initAuthBar();
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    const res = await fetch("books.json?v=" + Date.now(), { cache: "no-store" });
    const books = await res.json();
    const book = books.find(b => b.id === id);
    const container = document.getElementById("bookDetail");
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
            <div class="preview-box">${book.preview}</div>
        </div>`;

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
    }
}

// ---------- Online reader ----------
async function initReader() {
    initAuthBar();
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    const msg = document.getElementById("readerMsg");
    const wrap = document.getElementById("readerWrap");
    const bar = document.getElementById("readerBar");

    const res = await fetch("books.json?v=" + Date.now(), { cache: "no-store" });
    const books = await res.json();
    const book = books.find(b => b.id === id);
    if (!book || !book.file) {
        msg.innerHTML = "Ebook nahi mili. <a class='back-link' href='index.html'>← Wapas jaayein</a>";
        return;
    }
    document.title = book.title + " — ebookwala reader";
    document.getElementById("readerTitle").textContent = book.title;

    let started = false;
    onAuth(user => {
        if (!user) {
            if (started) { window.location.reload(); return; }
            msg.innerHTML = `<p>🔒 Is ebook ko padhne ke liye login zaroori hai.</p>
                <button class="buy-btn" id="readerLogin">🔐 Google se Login</button>`;
            document.getElementById("readerLogin").addEventListener("click", () => requireLogin());
            return;
        }
        if (started) return;
        started = true;
        loadReader(book, user, msg, wrap, bar);
    });
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
