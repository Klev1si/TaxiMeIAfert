export default function PublicSupportPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm p-8 md:p-12">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Support</h1>
        <p className="text-sm text-slate-500 mb-8">
          We're here to help with your TaxiMeIAfert account.
        </p>

        <section className="space-y-6 text-slate-700 leading-relaxed">
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5">
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Contact us</h2>
            <p className="mb-1">
              📧{' '}
              <a href="mailto:support@taximeiafert.com" className="text-indigo-600 underline">
                support@taximeiafert.com
              </a>
            </p>
            <p>We reply within 1–2 business days.</p>
          </div>

          <h2 className="text-xl font-semibold text-slate-900 mt-8">Common questions</h2>

          <div>
            <h3 className="font-semibold text-slate-900">How do I subscribe as a driver?</h3>
            <p>
              Open the app → Profile → Subscription. Pick a plan (monthly,
              3-month or yearly) and choose Card or Cash. Cash payments are
              confirmed by an admin once received.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-slate-900">I paid but my subscription still shows blocked.</h3>
            <p>
              Card payments activate within seconds after Paysera confirms. If
              you paid in cash, an admin needs to mark you as paid — this
              usually happens within a working day. Email support if it's been
              longer.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-slate-900">Drivers disappear from the live map after I lock my phone.</h3>
            <p>
              Make sure you granted "Allow always" for location on Android, and
              that the "TaxiApp — online" notification is visible in your
              status bar while you're online.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-slate-900">How do I delete my account?</h3>
            <p>
              Email{' '}
              <a href="mailto:support@taximeiafert.com" className="text-indigo-600 underline">
                support@taximeiafert.com
              </a>{' '}
              from the email address associated with your account, or contact
              us in-app from Profile → Support. We remove your profile within
              30 days, subject to legal retention.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-slate-900">Reporting a driver or rider</h3>
            <p>
              After any trip you can rate 1–5 stars and leave feedback. For
              urgent safety issues, email support with the trip ID (visible in
              Ride History) and we'll investigate the same day.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
