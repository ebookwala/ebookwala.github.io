package com.ebookwala.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.util.Log
import com.google.firebase.messaging.FirebaseMessaging

/**
 * Sets up the "new_books" notification channel and subscribes this install
 * to the "new_books" FCM topic, so it receives the push the notifyNewBooks
 * Cloud Function sends whenever a new ebook is published. Wrapped in
 * try/catch throughout: until app/google-services.json is added to the
 * project (see android-app/README.md), Firebase isn't actually initialized
 * here, and these calls would otherwise crash the app on first launch.
 */
object NotificationHelper {

    const val CHANNEL_ID = "new_books"
    private const val TOPIC = "new_books"
    private const val TAG = "NotificationHelper"

    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        try {
            val channel = NotificationChannel(
                CHANNEL_ID,
                context.getString(R.string.notif_channel_name),
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = context.getString(R.string.notif_channel_description)
            }
            val manager = context.getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        } catch (e: Exception) {
            Log.w(TAG, "Could not create notification channel", e)
        }
    }

    fun subscribeToNewBookAlerts(context: Context) {
        ensureChannel(context)
        try {
            FirebaseMessaging.getInstance().subscribeToTopic(TOPIC)
        } catch (e: Exception) {
            // Firebase not initialized yet (google-services.json missing) —
            // safe to ignore, app continues to work without push alerts.
            Log.w(TAG, "Skipping FCM topic subscription", e)
        }
    }
}
