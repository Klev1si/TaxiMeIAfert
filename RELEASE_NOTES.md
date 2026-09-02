# Release Notes

## 1.95 (Android versionCode 108 · iOS build auto-set in Codemagic)

Your **first in-city ride is now free** (previously 50% off). The offer applies
to short in-city trips; longer inter-city rides are not included. Drivers are
still paid in full — the platform covers the fare.

### Store "What's New"

#### English (en)

**Google Play**

> Even better welcome offer: your first in-city ride is now FREE (was 50% off). Just add your phone and book a short in-city trip — it's free automatically. Drivers are always paid in full.

**App Store**

> New in 1.95
> • Your first in-city ride is now FREE (previously 50% off).
> • Applies to short in-city trips; inter-city trips aren't included.
> • Add your phone, book, and it's applied automatically.

#### Albanian (sq)

**Google Play**

> Ofertë edhe më e mirë: udhëtimi yt i parë brenda qytetit tani është FALAS (më parë 50% zbritje). Shto numrin e telefonit dhe rezervo një udhëtim brenda qytetit — falas automatikisht. Shoferët paguhen gjithmonë plotësisht.

**App Store**

> E re në 1.95
> • Udhëtimi yt i parë brenda qytetit tani është FALAS (më parë 50% zbritje).
> • Vlen për udhëtime të shkurtra brenda qytetit; udhëtimet mes qyteteve nuk përfshihen.
> • Shto telefonin, rezervo, dhe aplikohet automatikisht.

#### Spanish (es)

**Google Play**

> Oferta de bienvenida aún mejor: tu primer viaje dentro de la ciudad ahora es GRATIS (antes 50% de descuento). Añade tu teléfono y reserva un viaje corto en la ciudad — gratis automáticamente. Los conductores siempre cobran el importe completo.

**App Store**

> Novedades en la 1.95
> • Tu primer viaje dentro de la ciudad ahora es GRATIS (antes 50% de descuento).
> • Válido para viajes cortos en la ciudad; los viajes entre ciudades no se incluyen.
> • Añade tu teléfono, reserva y se aplica automáticamente.

#### French (fr)

**Google Play**

> Offre de bienvenue encore meilleure : votre première course en ville est désormais GRATUITE (au lieu de -50%). Ajoutez votre téléphone et réservez un trajet en ville — gratuit automatiquement. Les chauffeurs sont toujours payés en totalité.

**App Store**

> Nouveautés de la 1.95
> • Votre première course en ville est désormais GRATUITE (au lieu de -50%).
> • Valable pour les trajets courts en ville ; les trajets entre villes ne sont pas inclus.
> • Ajoutez votre téléphone, réservez, et c'est appliqué automatiquement.

#### Turkish (tr)

**Google Play**

> Daha da iyi karşılama teklifi: şehir içi ilk yolculuğunuz artık ÜCRETSİZ (önceden %50 indirim). Telefonunuzu ekleyin ve kısa bir şehir içi yolculuk ayırtın — otomatik olarak ücretsiz. Sürücüler her zaman tam ücret alır.

**App Store**

> 1.95'te yenilikler
> • Şehir içi ilk yolculuğunuz artık ÜCRETSİZ (önceden %50 indirim).
> • Kısa şehir içi yolculuklar için geçerli; şehirler arası yolculuklar dahil değil.
> • Telefonunuzu ekleyin, ayırtın, otomatik uygulanır.

### Internal changelog

- **`rides.service.ts`:** first-ride promo changed from 50%-off-capped-€5 to a
  free ride, gated to in-city trips via distance (`FREE_FIRST_RIDE_MAX_KM`,
  default 10 km). `totalFare → 0`; platform absorbs the whole fare so the driver
  still earns the full amount. Fails closed on unknown/over-limit distance.
- **Copy (en/sq/fr/es/tr):** home banner, onboarding slide 4, and PayCash
  receipt label updated from "50% off" to "free in-city first ride".

Builds on 1.94.

## 1.94 (Android versionCode 107 · iOS build auto-set in Codemagic)

Fixes the live-trip share map that disappeared after a few seconds, lets you
add intermediate stops by tapping the map without losing your destination, and
adds a minimize button to the destination sheet so you can pick a spot on the
map and reopen to confirm.

### Store "What's New"

#### English (en)

**Google Play**

> Fixes: the live-trip share map no longer disappears after a few seconds; adding a stop by tapping the map no longer replaces your destination; and you can now minimize the destination panel to pick a spot on the map, then reopen to confirm.

**App Store**

> New in 1.94
> • Live-trip share map stays put instead of vanishing after a few seconds.
> • Add an intermediate stop by tapping the map — it no longer overwrites your destination.
> • Minimize the destination panel to choose a spot on the map, then reopen to confirm.

#### Albanian (sq)

**Google Play**

> Rregullime: harta e ndarjes së udhëtimit nuk zhduket më pas disa sekondash; shtimi i një ndalese duke trokitur hartën nuk e zëvendëson më destinacionin; dhe tani mund të minimizoni panelin e destinacionit për të zgjedhur një vend në hartë, pastaj ta rihapni për konfirmim.

**App Store**

> E re në 1.94
> • Harta e ndarjes së udhëtimit qëndron në vend, nuk zhduket pas disa sekondash.
> • Shto një ndalesë duke trokitur hartën — nuk e mbishkruan më destinacionin.
> • Minimizo panelin e destinacionit për të zgjedhur një vend në hartë, pastaj rihape për konfirmim.

#### Spanish (es)

**Google Play**

> Correcciones: el mapa para compartir el viaje ya no desaparece a los pocos segundos; añadir una parada tocando el mapa ya no reemplaza tu destino; y ahora puedes minimizar el panel de destino para elegir un punto en el mapa y reabrirlo para confirmar.

**App Store**

> Novedades en la 1.94
> • El mapa para compartir el viaje ya no desaparece a los pocos segundos.
> • Añade una parada tocando el mapa: ya no sobrescribe tu destino.
> • Minimiza el panel de destino para elegir un punto en el mapa y reábrelo para confirmar.

#### French (fr)

**Google Play**

> Corrections : la carte de partage du trajet ne disparaît plus après quelques secondes ; ajouter un arrêt en touchant la carte ne remplace plus votre destination ; et vous pouvez désormais réduire le panneau de destination pour choisir un point sur la carte, puis le rouvrir pour confirmer.

**App Store**

> Nouveautés de la 1.94
> • La carte de partage du trajet reste affichée au lieu de disparaître après quelques secondes.
> • Ajoutez un arrêt en touchant la carte — cela ne remplace plus votre destination.
> • Réduisez le panneau de destination pour choisir un point sur la carte, puis rouvrez-le pour confirmer.

#### Turkish (tr)

**Google Play**

> Düzeltmeler: yolculuk paylaşım haritası artık birkaç saniye sonra kaybolmuyor; haritaya dokunarak durak eklemek artık varış noktanızın yerine geçmiyor; ve artık varış noktası panelini küçültüp haritada bir nokta seçip, sonra onaylamak için yeniden açabilirsiniz.

**App Store**

> 1.94'te yenilikler
> • Yolculuk paylaşım haritası birkaç saniye sonra kaybolmak yerine yerinde kalır.
> • Haritaya dokunarak durak ekleyin — artık varış noktanızın üzerine yazmaz.
> • Varış noktası panelini küçültüp haritada bir nokta seçin, ardından onaylamak için yeniden açın.

### Internal changelog

- **Live-trip page (`legal/track.html`):** `renderUI` rebuilt `#main.innerHTML`
  (incl. the `#map` div) on every 5s poll, detaching Leaflet's container. Build
  the shell once, patch text values in place, reset map refs on any rebuild.
- **RideRequest map tap:** `handleMapPress` now routes a tap to the stop being
  added/edited when `editingStopIdx` is active, instead of always overwriting
  `dropoff` (which made stops replace the destination).
- **RideRequest sheet:** collapse/expand handle so the sheet can be minimized to
  pick a destination on the map, then reopened to confirm. New i18n keys.

Builds on 1.93.

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
