package com.ebookwala.app

import android.content.Context
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets

/**
 * Fetches the live catalog from ebookwala.github.io/books.json — the exact
 * same file the website reads — and caches the last successful copy on disk
 * so the app still has something to show offline / if the network is slow.
 */
class BooksRepository(private val context: Context) {

    private val cacheFile: File
        get() = File(context.filesDir, "books_cache.json")

    fun loadCached(): List<Book>? {
        return try {
            if (cacheFile.exists()) {
                Book.listFromJson(cacheFile.readText(StandardCharsets.UTF_8))
            } else null
        } catch (e: Exception) {
            null
        }
    }

    /** Network call — must run off the main thread. */
    fun fetchLatest(): Result<List<Book>> {
        return try {
            val url = URL(BuildConfig.BOOKS_JSON_URL)
            val connection = url.openConnection() as HttpURLConnection
            connection.connectTimeout = 15000
            connection.readTimeout = 15000
            connection.requestMethod = "GET"
            connection.setRequestProperty("Accept", "application/json")

            val code = connection.responseCode
            if (code != HttpURLConnection.HTTP_OK) {
                connection.disconnect()
                return Result.failure(Exception("HTTP $code"))
            }

            val text = connection.inputStream.bufferedReader(StandardCharsets.UTF_8).use { it.readText() }
            connection.disconnect()

            val books = Book.listFromJson(text)
            cacheFile.writeText(text, StandardCharsets.UTF_8)
            Result.success(books)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
