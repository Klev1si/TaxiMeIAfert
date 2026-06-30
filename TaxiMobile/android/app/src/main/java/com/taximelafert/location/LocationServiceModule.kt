package com.taximelafert.location

import android.content.Context
import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * JS bridge for [LocationForegroundService].
 *
 * Exposes startService() / stopService() to JS and forwards each location fix
 * from the service as a 'DriverLocationUpdate' event the JS layer can subscribe
 * to via NativeEventEmitter.
 */
class LocationServiceModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    override fun getName(): String = "LocationService"

    @ReactMethod
    fun startService(promise: Promise) {
        try {
            val intent = Intent(ctx, LocationForegroundService::class.java).apply {
                action = LocationForegroundService.ACTION_START
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(intent)
            } else {
                ctx.startService(intent)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("E_START_SERVICE", e.message ?: "Failed to start foreground service", e)
        }
    }

    @ReactMethod
    fun stopService(promise: Promise) {
        try {
            val intent = Intent(ctx, LocationForegroundService::class.java).apply {
                action = LocationForegroundService.ACTION_STOP
            }
            ctx.startService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("E_STOP_SERVICE", e.message ?: "Failed to stop foreground service", e)
        }
    }

    // RN built-in NativeEventEmitter expects these two methods to exist.
    @ReactMethod fun addListener(eventName: String) { /* no-op */ }
    @ReactMethod fun removeListeners(count: Int)    { /* no-op */ }

    companion object {
        @Volatile private var reactContext: ReactApplicationContext? = null

        fun emitLocation(lat: Double, lng: Double, accuracy: Float) {
            val ctx = reactContext ?: return
            if (!ctx.hasActiveReactInstance()) return
            val payload = Arguments.createMap().apply {
                putDouble("latitude",  lat)
                putDouble("longitude", lng)
                putDouble("accuracy",  accuracy.toDouble())
                putDouble("timestamp", System.currentTimeMillis().toDouble())
            }
            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("DriverLocationUpdate", payload)
        }
    }

    init { reactContext = ctx }
}
