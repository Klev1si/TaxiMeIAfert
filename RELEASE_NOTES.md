# Release Notes

## 1.93 (Android versionCode 106 · iOS build 31)

Reliability release: fixes drivers silently dropping offline after a network
blip, clients getting stuck on "searching for driver" when live events were
missed, and makes the first-ride 50% discount visible and correctly gated.

### Store "What's New"

#### English (en)

**Google Play**

> We fixed drivers unexpectedly appearing offline after a weak-signal moment, and passengers occasionally getting stuck on "searching for a driver." Your first-ride 50% discount now shows clearly on your receipt. Smoother, more reliable rides.

**App Store**

> New in 1.93
> • Drivers stay online reliably after network drops — no more restarting the app.
> • Fixed passengers getting stuck on "searching for a driver" when the trip had actually progressed.
> • Your first-ride 50% discount now shows clearly on the receipt.

#### Albanian (sq)

**Google Play**

> Rregulluam problemin ku shoferët dukeshin jashtë linje pas një sinjali të dobët, dhe pasagjerët herë-herë ngeleshin te "duke kërkuar shofer". Zbritja 50% për udhëtimin e parë tani shfaqet qartë në faturë. Udhëtime më të qeta e më të besueshme.

**App Store**

> E re në 1.93
> • Shoferët qëndrojnë online në mënyrë të besueshme pas ndërprerjeve të rrjetit — pa rinisur aplikacionin.
> • U rregullua ngecja e pasagjerëve te "duke kërkuar shofer" kur udhëtimi kishte vazhduar realisht.
> • Zbritja 50% për udhëtimin e parë tani shfaqet qartë në faturë.

#### Spanish (es)

**Google Play**

> Corregimos que los conductores aparecieran desconectados tras una mala señal y que los pasajeros a veces se quedaran en "buscando conductor". Tu 50% de descuento del primer viaje ahora se muestra claramente en el recibo. Viajes más fluidos y fiables.

**App Store**

> Novedades en la 1.93
> • Los conductores permanecen conectados de forma fiable tras cortes de red, sin reiniciar la app.
> • Corregido el bloqueo de pasajeros en "buscando conductor" cuando el viaje ya había avanzado.
> • Tu 50% de descuento del primer viaje ahora aparece claramente en el recibo.

#### French (fr)

**Google Play**

> Nous avons corrigé les chauffeurs apparaissant hors ligne après une coupure réseau et les passagers parfois bloqués sur « recherche d'un chauffeur ». Votre réduction de 50 % sur la première course s'affiche désormais clairement sur le reçu. Des trajets plus fluides et fiables.

**App Store**

> Nouveautés de la 1.93
> • Les chauffeurs restent connectés de façon fiable après une coupure réseau, sans redémarrer l'app.
> • Correction du blocage des passagers sur « recherche d'un chauffeur » alors que la course avait avancé.
> • Votre réduction de 50 % sur la première course s'affiche désormais clairement sur le reçu.

#### Turkish (tr)

**Google Play**

> Zayıf sinyal sonrası sürücülerin çevrimdışı görünmesini ve yolcuların bazen "sürücü aranıyor" ekranında takılmasını düzelttik. İlk yolculuk %50 indiriminiz artık makbuzda net görünüyor. Daha akıcı ve güvenilir yolculuklar.

**App Store**

> 1.93'te yenilikler
> • Sürücüler ağ kesintilerinden sonra uygulamayı yeniden başlatmadan güvenilir şekilde çevrimiçi kalır.
> • Yolcuların, yolculuk aslında ilerlemişken "sürücü aranıyor" ekranında takılması düzeltildi.
> • İlk yolculuk %50 indiriminiz artık makbuzda net görünüyor.

### Internal changelog

**Socket state recovery on reconnect (drivers + clients)**

- The server drops a driver from its geo index on every socket disconnect
  (Android Doze kills sockets constantly) and only re-adds them on
  `driver_online`, which the client never re-sent — so drivers silently went
  offline until an app restart. `socket.ts` now remembers the desired online
  state and re-emits `driver_online` on every (re)connect.
- socket.io does not replay events missed while disconnected, so a client that
  missed `ride_accepted`/`ride_completed` was stuck on "searching for driver."
  Added `socketService.onReconnect()` and an ActiveRideScreen re-sync (on
  reconnect and on app-foreground) that re-fetches the live ride, advances the
  status, or moves the client on if the ride finished while they were offline.

**First-ride discount visibility**

- The automatic first-ride 50% off (platform-absorbed; driver already receives
  the full pre-discount fare) was applied silently. The `ride_completed` payload
  and PayCash receipt now show a labeled "First-ride 50% off −€X" line plus a
  "Covered by TaxiMeIAfert" note. The home banner is now re-checked on focus so
  it disappears immediately after the first completed ride instead of lingering.

No schema changes. Builds on 1.92.

## 1.92 (Android versionCode 105 · iOS build 31)

Single-feature release: passengers who sign in with Google or Apple are now
asked to add and verify a phone number, so a driver always has a reachable
contact. Verification is a one-time SMS code, and clients are guided to add
their number before their first booking.

### Store "What's New"

#### English (en)

**Google Play**

> Signing in with Google or Apple? You'll now be asked to add and verify your phone number so your driver can reach you for pickups. It's a quick, one-time SMS code — and once verified you're ready to book.

**App Store**

> New in 1.92
> • Add your phone in seconds: if you sign in with Google or Apple, we'll now help you add and verify a phone number so your driver can always reach you.
> • Verification is a single SMS code, and you only do it once.
> • You'll be guided to add your number before your first booking.

#### Albanian (sq)

**Google Play**

> Hyni me Google ose Apple? Tani do t'ju kërkohet të shtoni dhe verifikoni numrin tuaj të telefonit që shoferi t'ju kontaktojë për marrjen. Është një kod i shpejtë SMS, vetëm një herë — dhe pasi ta verifikoni, jeni gati të rezervoni.

**App Store**

> E re në 1.92
> • Shtoni telefonin në pak sekonda: nëse hyni me Google ose Apple, tani ju ndihmojmë të shtoni dhe verifikoni një numër telefoni që shoferi t'ju gjejë gjithmonë.
> • Verifikimi është një kod i vetëm SMS, dhe e bëni vetëm një herë.
> • Do të udhëzoheni ta shtoni numrin para rezervimit të parë.

#### Spanish (es)

**Google Play**

> ¿Inicias sesión con Google o Apple? Ahora te pediremos que añadas y verifiques tu número de teléfono para que tu conductor pueda localizarte en la recogida. Es un código SMS rápido y de una sola vez; una vez verificado, ya puedes reservar.

**App Store**

> Novedades en la 1.92
> • Añade tu teléfono en segundos: si inicias sesión con Google o Apple, ahora te ayudamos a añadir y verificar un número para que tu conductor siempre pueda localizarte.
> • La verificación es un único código SMS, y solo se hace una vez.
> • Te guiaremos para añadir tu número antes de tu primera reserva.

#### French (fr)

**Google Play**

> Vous vous connectez avec Google ou Apple ? Nous vous demanderons désormais d'ajouter et de vérifier votre numéro de téléphone pour que votre chauffeur puisse vous joindre lors de la prise en charge. C'est un code SMS rapide et unique — une fois vérifié, vous pouvez réserver.

**App Store**

> Nouveautés de la 1.92
> • Ajoutez votre téléphone en quelques secondes : si vous vous connectez avec Google ou Apple, nous vous aidons désormais à ajouter et vérifier un numéro pour que votre chauffeur puisse toujours vous joindre.
> • La vérification se fait avec un seul code SMS, une seule fois.
> • Vous serez guidé pour ajouter votre numéro avant votre première réservation.

#### Turkish (tr)

**Google Play**

> Google veya Apple ile mi giriş yapıyorsunuz? Sürücünüzün sizi alırken ulaşabilmesi için artık telefon numaranızı ekleyip doğrulamanız istenecek. Hızlı ve tek seferlik bir SMS kodudur — doğruladıktan sonra yolculuk ayırtmaya hazırsınız.

**App Store**

> 1.92'de yenilikler
> • Telefonunuzu saniyeler içinde ekleyin: Google veya Apple ile giriş yaparsanız, sürücünüzün size her zaman ulaşabilmesi için bir numara ekleyip doğrulamanıza yardımcı oluyoruz.
> • Doğrulama tek bir SMS kodudur ve yalnızca bir kez yapılır.
> • İlk rezervasyonunuzdan önce numaranızı eklemeniz için yönlendirileceksiniz.

### Internal changelog

**New: phone capture for Google/Apple sign-ins**

- Google and Apple logins never return a phone number, so those clients
  previously had no reachable contact and could still book. They are now
  required to add and verify one.
- **Backend:** new authenticated `POST /auth/attach-phone` (OTP-verified;
  guards against a number already linked to another account). `requestRide()`
  now rejects clients without a verified phone using a stable `PHONE_REQUIRED`
  code. No schema changes, no data migration — existing rows are only updated
  in place.
- **Mobile:** new `AddPhoneScreen` (enter phone → SMS code), reached both
  proactively (a home-screen nudge for clients with no number) and reactively
  (booking routes there instead of showing an error). Localized in all five
  languages (en/sq/es/fr/tr).

No other functional changes — 1.92 builds on 1.91.
