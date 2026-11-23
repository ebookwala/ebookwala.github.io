package com.ebookwala.app

import android.annotation.SuppressLint
import android.net.Uri
import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import com.ebookwala.app.databinding.ActivityReaderBinding

/**
 * A small built-in reader for free books. It loads an HTML+JS page bundled in
 * assets/pdfjs that renders a remote PDF page-by-page using PDF.js — no
 * external app, and no internet needed for the reader itself, only to fetch
 * the book's PDF the first time (pages stay in the WebView's cache after).
 */
class ReaderActivity : AppCompatActivity() {

    private lateinit var binding: ActivityReaderBinding

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityReaderBinding.inflate(layoutInflater)
        setContentView(binding.root)
        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)

        val pdfUrl = intent.getStringExtra(EXTRA_PDF_URL) ?: ""
        val title = intent.getStringExtra(EXTRA_TITLE) ?: getString(R.string.app_name)
        supportActionBar?.title = title

        val settings: WebSettings = binding.webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.allowFileAccess = true
        settings.allowFileAccessFromFileURLs = true
        settings.allowUniversalAccessFromFileURLs = true
        settings.cacheMode = WebSettings.LOAD_DEFAULT

        binding.webView.webViewClient = WebViewClient()

        val encoded = Uri.encode(pdfUrl)
        binding.webView.loadUrl("file:///android_asset/pdfjs/reader.html?file=$encoded")
    }

    override fun onSupportNavigateUp(): Boolean {
        onBackPressedDispatcher.onBackPressed()
        return true
    }

    override fun onDestroy() {
        binding.webView.destroy()
        super.onDestroy()
    }

    companion object {
        const val EXTRA_PDF_URL = "pdf_url"
        const val EXTRA_TITLE = "title"
    }
}
