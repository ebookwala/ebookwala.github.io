package com.ebookwala.app

import android.graphics.BitmapFactory
import android.os.Handler
import android.os.Looper
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import java.net.URL
import java.util.concurrent.Executors

class BooksAdapter(
    private val onClick: (Book) -> Unit
) : RecyclerView.Adapter<BooksAdapter.VH>() {

    private val items = ArrayList<Book>()
    private val executor = Executors.newFixedThreadPool(4)
    private val mainHandler = Handler(Looper.getMainLooper())

    fun submit(newItems: List<Book>) {
        items.clear()
        items.addAll(newItems)
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, position: Int): VH {
        val v = LayoutInflater.from(parent.context).inflate(R.layout.item_book, parent, false)
        return VH(v)
    }

    override fun getItemCount(): Int = items.size

    override fun onBindViewHolder(holder: VH, position: Int) {
        val book = items[position]
        holder.title.text = book.title
        holder.category.text = book.category
        holder.cover.setImageResource(R.drawable.cover_placeholder)
        holder.cover.tag = book.cover

        if (book.free) {
            holder.priceBadge.text = holder.priceBadge.context.getString(R.string.free_badge)
            holder.priceBadge.setBackgroundResource(R.drawable.badge_free_bg)
        } else {
            holder.priceBadge.text = "₹${book.price}"
            holder.priceBadge.setBackgroundResource(R.drawable.badge_price_bg)
        }

        holder.itemView.setOnClickListener { onClick(book) }

        loadCoverInto(holder.cover, book.cover)
    }

    private fun loadCoverInto(imageView: ImageView, url: String) {
        if (url.isBlank()) return
        executor.execute {
            try {
                val bitmap = URL(url).openStream().use { BitmapFactory.decodeStream(it) }
                if (bitmap != null) {
                    mainHandler.post {
                        if (imageView.tag == url) {
                            imageView.setImageBitmap(bitmap)
                        }
                    }
                }
            } catch (e: Exception) {
                // Keep placeholder on failure.
            }
        }
    }

    class VH(view: View) : RecyclerView.ViewHolder(view) {
        val cover: ImageView = view.findViewById(R.id.imgCover)
        val title: TextView = view.findViewById(R.id.txtTitle)
        val category: TextView = view.findViewById(R.id.txtCategory)
        val priceBadge: TextView = view.findViewById(R.id.txtPriceBadge)
    }
}
