# ─────────────────────────────────────────────────────────────────────────────
# TaxiApp — ProGuard / R8 rules
# These rules are appended to the default Android rules when minifyEnabled=true.
# ─────────────────────────────────────────────────────────────────────────────

# ── React Native ──────────────────────────────────────────────────────────────
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-keepclassmembers class * {
    @com.facebook.react.uimanager.annotations.ReactProp <methods>;
}
-keepclassmembers class * {
    @com.facebook.react.bridge.ReactMethod <methods>;
}

# ── React Native Config (.env injection) ─────────────────────────────────────
-keep class com.lugg.reactnativeconfig.** { *; }

# ── Stripe ────────────────────────────────────────────────────────────────────
-keep class com.stripe.** { *; }
-keep class com.reactnativestripesdk.** { *; }
-keep class com.google.gson.** { *; }
-keepattributes Signature
-keepattributes *Annotation*
-dontwarn com.stripe.**

# ── Firebase / Google Play Services ──────────────────────────────────────────
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# ── OkHttp (React Native networking) ─────────────────────────────────────────
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.annotation.**
-keepnames class okhttp3.internal.publicsuffix.PublicSuffixDatabase

# ── Socket.IO ─────────────────────────────────────────────────────────────────
-keep class io.socket.** { *; }
-dontwarn io.socket.**

# ── React Native Maps ─────────────────────────────────────────────────────────
-keep class com.airbnb.android.react.maps.** { *; }

# ── React Native Image Picker ─────────────────────────────────────────────────
-keep class com.imagepicker.** { *; }

# ── Async Storage ─────────────────────────────────────────────────────────────
-keep class com.reactnativecommunity.asyncstorage.** { *; }

# ── React Native Safe Area Context ────────────────────────────────────────────
-keep class com.th3rdwave.safeareacontext.** { *; }

# ── React Navigation / Screens ───────────────────────────────────────────────
-keep class com.swmansion.** { *; }
-keep class com.horcrux.** { *; }

# ── Hermes JS engine ─────────────────────────────────────────────────────────
-keep class com.facebook.hermes.unicode.** { *; }

# ── Android fundamentals ─────────────────────────────────────────────────────
-keepclassmembers class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator *;
}
-keepclassmembers class * implements java.io.Serializable {
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}

# Preserve line numbers in crash reports
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# ── Suppress known third-party warnings ──────────────────────────────────────
-dontwarn org.bouncycastle.**
-dontwarn org.conscrypt.**
-dontwarn org.openjsse.**
-dontwarn javax.naming.**
-dontwarn sun.misc.**

# ── Firebase Crashlytics ──────────────────────────────────────────────────────
-keepattributes SourceFile,LineNumberTable
-keep public class * extends java.lang.Exception
-keep class com.google.firebase.crashlytics.** { *; }

# ── react-native-in-app-review ───────────────────────────────────────────────
-keep class com.google.android.play.core.** { *; }

# ── react-native-background-actions ──────────────────────────────────────────
-keep class com.asterinet.reaction.bgactions.** { *; }

# ── @react-native-community/geolocation ──────────────────────────────────────
-keep class com.reactnativecommunity.geolocation.** { *; }
