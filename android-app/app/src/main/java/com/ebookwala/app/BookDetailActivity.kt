package com.ebookwala.app

import android.content.Intent
import android.graphics.BitmapFactory
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import com.ebookwala.app.databinding.ActivityBookDetailBinding
import java.net.URL
import java.util.concurrent.Executors

class BookDetailActivity : AppCompatActivity() {

    private lateinit var binding: ActivityBookDetailBinding
    private val executor = Executors.newSingleThreadExecutor()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityBookDetailBinding.inflate(layoutInflater)
        setContentView(binding.root)
        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)

        val title = intent.getStringExtra(EXTRA_BOOK_TITLE) ?: ""
        val author = intent.getStringExtra(EXTRA_BOOK_AUTHOR) ?: ""
        val category = intent.getStringExtra(EXTRA_BOOK_CATEGORY) ?: ""
        val price = intent.getIntExtra(EXTRA_BOOK_PRICE, 0)
        val cover = intent.getStringExtra(EXTRA_BOOK_COVER) ?: ""
        val description = intent.getStringExtra(EXTRA_BOOK_DESCRIPTION) ?: ""
        val preview = intent.getStringExtra(EXTRA_BOOK_PREVIEW) ?: ""
        val razorpayLink = intent.getStringExtra(EXTRA_BOOK_RAZORPAY) ?: ""
        val free = intent.getBooleanExtra(EXTRA_BOOK_FREE, false)
        val fileUrl = intent.getStringExtra(EXTRA_BOOK_FILE_URL)

        supportActionBar?.title = title
        binding.txtTitle.text = title
        binding.txtAuthor.text = getString(R.string.by_author, author)
        binding.txtCategory.text = category
        binding.txtDescription.text = description
        binding.txtPreview.text = preview

        if (free) {
            binding.txtPriceBadge.text = getString(R.string.free_badge)
            binding.txtPriceBadge.setBackgroundResource(R.drawable.badge_free_bg)
            binding.btnAction.text = getString(R.string.read_now)
        } else {
            binding.txtPriceBadge.text = "₹$price"
            binding.txtPriceBadge.setBackgroundResource(R.drawable.badge_price_bg)
            binding.btnAction.text = getString(R.string.buy_now)
        }

        binding.btnAction.setOnClickListener {
            if (free) {
                if (!fileUrl.isNullOrBlank()) {
                    val intent = Intent(this, ReaderActivity::class.java)
                    intent.putExtra(ReaderActivity.EXTRA_PDF_URL, fileUrl)
                    intent.putExtra(ReaderActivity.EXTRA_TITLE, title)
                    startActivity(intent)
                } else {
                    binding.txtFileStatus.visibility = View.VISIBLE
                }
            } else {
                if (razorpayLink.isNotBlank()) {
                    // Payment pages (Razorpay, UPI app redirects, OTP flows) are opened in the
                    // device's own browser rather than an in-app WebView, exactly like the
                    // website's own checkout links — this is the safe, standard way to handle
                    // payments and avoids broken UPI-intent redirects inside a WebView.
                    val intent = Intent(Intent.ACTION_VIEW, android.net.Uri.parse(razorpayLink))
                    startActivity(intent)
                }
            }
        }

        loadCover(cover)
    }

    private fun loadCover(url: String) {
        if (url.isBlank()) return
        executor.execute {
            try {
                val bitmap = URL(url).openStream().use { BitmapFactory.decodeStream(it) }
                if (bitmap != null) {
                    runOnUiThread { binding.imgCover.setImageBitmap(bitmap) }
                }
            } catch (e: Exception) {
                // keep placeholder
            }
        }
    }

    override fun onSupportNavigateUp(): Boolean {
        onBackPressedDispatcher.onBackPressed()
        return true
    }

    companion object {
        const val EXTRA_BOOK_ID = "book_id"
        const val EXTRA_BOOK_TITLE = "book_title"
        const val EXTRA_BOOK_AUTHOR = "book_author"
        const val EXTRA_BOOK_CATEGORY = "book_category"
        const val EXTRA_BOOK_PRICE = "book_price"
        const val EXTRA_BOOK_COVER = "book_cover"
        const val EXTRA_BOOK_DESCRIPTION = "book_description"
        const val EXTRA_BOOK_PREVIEW = "book_preview"
        const val EXTRA_BOOK_RAZORPAY = "book_razorpay"
        const val EXTRA_BOOK_FREE = "book_free"
        const val EXTRA_BOOK_FILE_URL = "book_file_url"
    }
}
