package com.ebookwala.app

import org.json.JSONArray
import org.json.JSONObject

/**
 * Mirrors the structure of books.json on https://ebookwala.github.io/books.json
 * Any new book added to that file (and so, to the website) shows up here too
 * the next time the app refreshes its catalog — no app update required.
 *
 * `fileUrl` is optional and NOT currently present on the website's books.json.
 * When the site owner adds a "fileUrl" field pointing at a PDF for a free book,
 * this app will automatically unlock the in-app reader for it. Until then, free
 * books that have no fileUrl show the same "coming soon" message the website
 * shows today.
 */
data class Book(
    val id: String,
    val title: String,
    val author: String,
    val category: String,
    val price: Int,
    val cover: String,
    val description: String,
    val preview: String,
    val razorpayLink: String,
    val free: Boolean,
    val fileUrl: String?
) {
    val isReadableNow: Boolean
        get() = free && !fileUrl.isNullOrBlank()

    companion object {
        fun listFromJson(text: String): List<Book> {
            val arr = JSONArray(text)
            val out = ArrayList<Book>(arr.length())
            for (i in 0 until arr.length()) {
                out.add(fromJson(arr.getJSONObject(i)))
            }
            return out
        }

        private fun fromJson(o: JSONObject): Book {
            // Paid books on the site are already hosted as flat PDFs at the repo
            // root, e.g. https://ebookwala.github.io/naukri-ya-business.pdf. We
            // still prefer an explicit "fileUrl"/"pdfUrl"/"file" key when present.
            val explicitFile = o.optString("fileUrl", "").ifBlank {
                o.optString("pdfUrl", "").ifBlank { o.optString("file", "") }
            }
            return Book(
                id = o.optString("id"),
                title = o.optString("title"),
                author = o.optString("author"),
                category = o.optString("category"),
                price = o.optInt("price", 0),
                cover = o.optString("cover"),
                description = o.optString("description"),
                preview = o.optString("preview"),
                razorpayLink = o.optString("razorpayLink"),
                free = o.optBoolean("free", o.optInt("price", 0) == 0),
                fileUrl = explicitFile.ifBlank { null }
            )
        }
    }
}
