import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import FirebaseCore
import FirebaseMessaging
import UserNotifications

@main
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate, MessagingDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // ── Firebase ────────────────────────────────────────────────────────────
    // Reads GoogleService-Info.plist from the bundle. Must be added to the
    // Xcode project before shipping — see docs/ios-setup.md.
    FirebaseApp.configure()

    // ── Google Maps ─────────────────────────────────────────────────────────
    // react-native-maps falls back to Apple Maps on iOS unless the GoogleMaps
    // pod is explicitly linked (via use_frameworks + a pod entry). We ship v1
    // with Apple Maps on iOS to keep the build simple; the GMSApiKey stays in
    // Info.plist for when we opt into Google Maps parity later.

    // ── Push notifications ──────────────────────────────────────────────────
    UNUserNotificationCenter.current().delegate = self
    Messaging.messaging().delegate = self
    application.registerForRemoteNotifications()

    // ── React Native bootstrap ──────────────────────────────────────────────
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "TaxiMobile",
      in: window,
      launchOptions: launchOptions
    )

    return true
  }

  // ── APNS token → Firebase Messaging ───────────────────────────────────────
  func application(_ application: UIApplication,
                   didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    Messaging.messaging().apnsToken = deviceToken
  }

  // Foreground notifications — let iOS show the banner + play sound instead of
  // silently dropping the alert while the user is in the app.
  func userNotificationCenter(_ center: UNUserNotificationCenter,
                              willPresent notification: UNNotification,
                              withCompletionHandler completionHandler:
                                @escaping (UNNotificationPresentationOptions) -> Void) {
    completionHandler([.banner, .sound, .badge])
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
