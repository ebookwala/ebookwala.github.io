package com.ebookwala.app

import android.app.PendingIntent
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Receives the FCM push sent by the notifyNewBooks Cloud Function whenever
 * books.json gets a new book (or the admin sends an offer the same way).
 * Every install is subscribed to the "new_books" topic — see
 * NotificationHelper.subscribeToNewBookAlerts() — so no per-user login or
 * token bookkeeping is needed, matching how the site itself emails anyone
 * who has logged in.
 */
class EbookwalaMessagingService : FirebaseMessagingService() {

    override fun onMessageReceived(message: RemoteMessage) {
        val title = message.notification?.title ?: getString(R.string.app_name)
        val body = message.notification?.body ?: return
        showNotification(title, body)
    }

    override fun onNewToken(token: String) {
        // No per-device registration needed: alerts go out by topic, not by
        // token. Nothing to do here, but Firebase requires the override.
    }

    private fun showNotification(title: String, body: String) {
        NotificationHelper.ensureChannel(this)

        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, NotificationHelper.CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        try {
            NotificationManagerCompat.from(this).notify(NOTIFICATION_ID, notification)
        } catch (_: SecurityException) {
            // POST_NOTIFICATIONS permission not granted (Android 13+) — the
            // app still works, the user just won't see this alert.
        }
    }

    companion object {
        private const val NOTIFICATION_ID = 1001
    }
}
