package com.ebookwala.app

import android.content.Intent
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.widget.AdapterView
import android.widget.ArrayAdapter
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.GridLayoutManager
import com.ebookwala.app.databinding.ActivityMainBinding
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var repository: BooksRepository
    private val adapter = BooksAdapter { book -> openBook(book) }
    private val executor = Executors.newSingleThreadExecutor()

    private var allBooks: List<Book> = emptyList()
    private var currentCategory: String = "Sabhi"
    private var currentQuery: String = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        repository = BooksRepository(this)

        binding.recyclerBooks.layoutManager = GridLayoutManager(this, 2)
        binding.recyclerBooks.adapter = adapter

        binding.swipeRefresh.setOnRefreshListener { fetchBooks() }

        binding.editSearch.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                currentQuery = s?.toString()?.trim() ?: ""
                applyFilters()
            }
            override fun afterTextChanged(s: Editable?) {}
        })

        // Show cached catalog instantly, then refresh from network.
        repository.loadCached()?.let {
            allBooks = it
            setupCategorySpinner(it)
            applyFilters()
        }
        fetchBooks()
    }

    private fun fetchBooks() {
        binding.swipeRefresh.isRefreshing = true
        binding.txtEmpty.visibility = View.GONE
        executor.execute {
            val result = repository.fetchLatest()
            runOnUiThread {
                binding.swipeRefresh.isRefreshing = false
                result.onSuccess { books ->
                    allBooks = books
                    setupCategorySpinner(books)
                    applyFilters()
                }.onFailure {
                    if (allBooks.isEmpty()) {
                        binding.txtEmpty.text = getString(R.string.load_error)
                        binding.txtEmpty.visibility = View.VISIBLE
                    }
                }
            }
        }
    }

    private fun setupCategorySpinner(books: List<Book>) {
        val categories = linkedSetOf(getString(R.string.all_categories))
        categories.addAll(books.map { it.category }.filter { it.isNotBlank() }.distinct().sorted())
        val adapterSpinner = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, categories.toList())
        binding.spinnerCategory.adapter = adapterSpinner
        binding.spinnerCategory.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                currentCategory = categories.toList()[position]
                applyFilters()
            }
            override fun onNothingSelected(parent: AdapterView<*>?) {}
        }
    }

    private fun applyFilters() {
        val allLabel = getString(R.string.all_categories)
        val filtered = allBooks.filter { book ->
            val matchesCategory = currentCategory == allLabel || book.category.equals(currentCategory, ignoreCase = true)
            val matchesQuery = currentQuery.isBlank() ||
                book.title.contains(currentQuery, ignoreCase = true) ||
                book.author.contains(currentQuery, ignoreCase = true) ||
                book.category.contains(currentQuery, ignoreCase = true)
            matchesCategory && matchesQuery
        }
        adapter.submit(filtered)
        binding.txtEmpty.visibility = if (filtered.isEmpty() && allBooks.isNotEmpty()) View.VISIBLE else View.GONE
        if (filtered.isEmpty() && allBooks.isNotEmpty()) {
            binding.txtEmpty.text = getString(R.string.no_results)
        }
    }

    private fun openBook(book: Book) {
        val intent = Intent(this, BookDetailActivity::class.java)
        intent.putExtra(BookDetailActivity.EXTRA_BOOK_ID, book.id)
        intent.putExtra(BookDetailActivity.EXTRA_BOOK_TITLE, book.title)
        intent.putExtra(BookDetailActivity.EXTRA_BOOK_AUTHOR, book.author)
        intent.putExtra(BookDetailActivity.EXTRA_BOOK_CATEGORY, book.category)
        intent.putExtra(BookDetailActivity.EXTRA_BOOK_PRICE, book.price)
        intent.putExtra(BookDetailActivity.EXTRA_BOOK_COVER, book.cover)
        intent.putExtra(BookDetailActivity.EXTRA_BOOK_DESCRIPTION, book.description)
        intent.putExtra(BookDetailActivity.EXTRA_BOOK_PREVIEW, book.preview)
        intent.putExtra(BookDetailActivity.EXTRA_BOOK_RAZORPAY, book.razorpayLink)
        intent.putExtra(BookDetailActivity.EXTRA_BOOK_FREE, book.free)
        intent.putExtra(BookDetailActivity.EXTRA_BOOK_FILE_URL, book.fileUrl)
        startActivity(intent)
    }
}
