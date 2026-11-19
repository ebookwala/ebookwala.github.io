// Shared logic for ebookwala.github.io
// Loads books.json and renders the catalog grid, search, and category filters.

let ALL_BOOKS = [];
let activeCategory = "All";

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
    loadBooks();
    const search = document.getElementById("searchInput");
    if (search) search.addEventListener("input", applyFilters);
}

// ---- Book detail page ----
async function initBookPage() {
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
    container.innerHTML = `
        <img src="${book.cover}" alt="${book.title}">
            <div class="meta">
                  <span class="category-pill">${book.category}</span>
                        <h2>${book.title}</h2>
                              <p>${book.description}</p>
                                    <div class="price-tag ${isFree ? 'free' : ''}">${isFree ? 'Free' : '₹' + book.price}</div>
                                          ${isFree
                                                    ? `<a class="buy-btn" href="#" onclick="alert('Yahan free ebook ki download/reading link lagayein'); return false;">Padhna Shuru Karein</a>`
                                                    : `<a class="buy-btn" href="${book.razorpayLink || '#'}" target="_blank" rel="noopener">Khareedein — ₹${book.price}</a>`
                                          }
                                                <div class="preview-box">${book.preview}</div>
                                                    </div>
                                                      `;
}
