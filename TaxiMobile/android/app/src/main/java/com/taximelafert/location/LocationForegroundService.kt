package com.taximelafert.location

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.taximelafert.MainActivity

/**
 * Sticky foreground service that keeps the driver's process alive whenever they
 * are online. It posts a persistent notification, requests fused-location
 * updates at a steady cadence (which is what tells the OS "this app is
 * actively using location" and unblocks background delivery on Android 10+),
 * and forwards each fix to JS through LocationServiceModule.
 *
 * Without this, the JS Geolocation.watchPosition() stops firing when the screen
 * locks or the user switches apps — Doze suspends the process and the driver
 * disappears from the live monitor.
 */
class LocationForegroundService : Service() {

    companion object {
        const val CHANNEL_ID         = "taxiapp_driver_location"
        const val NOTIFICATION_ID    = 4242
        const val ACTION_START       = "com.taximelafert.location.START"
        const val ACTION_STOP        = "com.taximelafert.location.STOP"
        private const val UPDATE_INTERVAL_MS = 5_000L
        private const val FASTEST_INTERVAL_MS = 2_000L
    }

    private val fusedClient by lazy { LocationServices.getFusedLocationProviderClient(this) }

    private val locationCallback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            val loc = result.lastLocation ?: return
            LocationServiceModule.emitLocation(loc.latitude, loc.longitude, loc.accuracy)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopUpdatesAndSelf()
                return START_NOT_STICKY
            }
            else -> startForegroundWithNotification()
        }
        return START_STICKY
    }

    private fun startForegroundWithNotification() {
        ensureChannel()
        val notification = buildNotification()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION,
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        requestLocationUpdates()
    }

    private fun requestLocationUpdates() {
        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, UPDATE_INTERVAL_MS)
            .setMinUpdateIntervalMillis(FASTEST_INTERVAL_MS)
            .setWaitForAccurateLocation(false)
            .build()
        try {
            fusedClient.requestLocationUpdates(request, locationCallback, mainLooper)
        } catch (_: SecurityException) {
            // Permission was revoked between start and now — stop quietly.
            stopUpdatesAndSelf()
        }
    }

    private fun stopUpdatesAndSelf() {
        try { fusedClient.removeLocationUpdates(locationCallback) } catch (_: Exception) {}
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        try { fusedClient.removeLocationUpdates(locationCallback) } catch (_: Exception) {}
        super.onDestroy()
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val mgr = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (mgr.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Driver online",
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "Shown while you are online so riders can find you."
            setShowBadge(false)
            enableLights(false)
            enableVibration(false)
            setSound(null, null)
        }
        mgr.createNotificationChannel(channel)
    }

    private fun buildNotification(): Notification {
        val openAppIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pending = PendingIntent.getActivity(
            this, 0, openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("TaxiApp — online")
            .setContentText("Sharing your location with riders nearby.")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(pending)
            .build()
    }
}
