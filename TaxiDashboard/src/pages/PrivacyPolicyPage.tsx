export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm p-8 md:p-12">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-slate-500 mb-8">
          TaxiMeIAfert — last updated 3 July 2026
        </p>

        <section className="space-y-6 text-slate-700 leading-relaxed">
          <p>
            This privacy policy describes how TaxiMeIAfert (“we”, “our”, “the app”)
            collects, uses, and protects the information you provide when you use
            our mobile applications and web dashboard.
          </p>

          <h2 className="text-xl font-semibold text-slate-900 mt-8">1. Information we collect</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong>Account information:</strong> phone number, name, email
              address, and (for drivers and companies) documents you upload for
              verification.
            </li>
            <li>
              <strong>Location data:</strong> real-time GPS position while you are
              a driver online or a rider requesting a trip. Riders’ pickup and
              drop-off locations are stored per trip.
            </li>
            <li>
              <strong>Payment metadata:</strong> subscription status and payment
              references. We do not store full card numbers — card processing is
              handled by Paysera and Stripe.
            </li>
            <li>
              <strong>Device information:</strong> push notification token, device
              model, OS version, and crash logs (via Firebase Crashlytics).
            </li>
          </ul>

          <h2 className="text-xl font-semibold text-slate-900 mt-8">2. How we use it</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>Match riders with nearby drivers and calculate fares.</li>
            <li>Show drivers on the live map to riders and dispatchers.</li>
            <li>Send push notifications, SMS, and email for ride events, subscription reminders, and account alerts.</li>
            <li>Detect fraud, enforce our terms, and comply with local law.</li>
          </ul>

          <h2 className="text-xl font-semibold text-slate-900 mt-8">3. Sharing</h2>
          <p>
            We share the minimum information necessary with the counterparty of a
            trip (rider ↔ driver: first name and vehicle plate), our payment
            processors (Paysera, Stripe), our SMS provider (Twilio), and cloud
            infrastructure providers (Google Firebase, Railway, Vercel). We do
            not sell your data.
          </p>

          <h2 className="text-xl font-semibold text-slate-900 mt-8">4. Location while backgrounded</h2>
          <p>
            Drivers granting “Allow always” location permission allow the app to
            keep sharing their position with the platform while their phone is
            locked or another app is in the foreground. This is required so
            riders can see their driver on the map during an active trip. You
            can revoke this permission at any time from your device settings.
          </p>

          <h2 className="text-xl font-semibold text-slate-900 mt-8">5. Data retention</h2>
          <p>
            Trip records, subscription payment history, and account data are
            retained for as long as the account is active plus 24 months, or as
            required by local tax and consumer-protection law.
          </p>

          <h2 className="text-xl font-semibold text-slate-900 mt-8">6. Your rights</h2>
          <p>
            You can request access to, correction of, or deletion of your
            personal data at any time by emailing{' '}
            <a href="mailto:support@taximeiafert.com" className="text-indigo-600 underline">
              support@taximeiafert.com
            </a>
            . Account deletion removes your profile within 30 days, subject to
            legal retention obligations.
          </p>

          <h2 className="text-xl font-semibold text-slate-900 mt-8">7. Children</h2>
          <p>
            The service is not directed at children under 13 and we do not
            knowingly collect information from them.
          </p>

          <h2 className="text-xl font-semibold text-slate-900 mt-8">8. Contact</h2>
          <p>
            Questions about this policy? Email{' '}
            <a href="mailto:support@taximeiafert.com" className="text-indigo-600 underline">
              support@taximeiafert.com
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
