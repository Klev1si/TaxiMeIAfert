package com.taximelafert

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
    createRidesNotificationChannel()
  }

  /**
   * Create a HIGH-importance notification channel for ride events.
   * This is required on Android 8+ for notifications to actually wake the
   * device when the screen is locked. The FCM payload references this channel
   * via android.notification.channelId = "taxiapp_rides".
   *
   * Channels are created once and ignored on subsequent calls — safe to call
   * every app start.
   */
  private fun createRidesNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

    val channelId   = "taxiapp_rides"
    val channelName = "Rides & Bookings"
    val channelDesc = "Incoming ride requests, scheduled rides, and booking updates."

    val channel = NotificationChannel(
      channelId,
      channelName,
      NotificationManager.IMPORTANCE_HIGH,
    ).apply {
      description = channelDesc
      enableLights(true)
      enableVibration(true)
      setShowBadge(true)
      lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC

      val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
      val audioAttrs = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()
      setSound(soundUri, audioAttrs)
    }

    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.createNotificationChannel(channel)
  }
}
