/**
 * Step 18 end-to-end test — Ride request / accept / decline flow
 *
 * Prerequisites:
 *  - Server running on port 3009
 *  - A registered CLIENT user   (+37491000001 / password: Test1234!)
 *  - A registered DRIVER user   (+37492000002 / password: Test1234!)
 *    with is_approved = true in the DB
 *  - Driver connected via WebSocket and GPS updated (so they appear in geo)
 *
 * Run:  node test-rides-step18.mjs
 */

import { io } from 'socket.io-client';

const BASE = 'http://localhost:3011';

// ── helpers ──────────────────────────────────────────────────────────────────
async function post(path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

async function get(path, token, params = {}) {
  const url = new URL(`${BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

function pass(msg) { console.log(`  ✅  ${msg}`); }
function fail(msg) { console.error(`  ❌  ${msg}`); process.exitCode = 1; }
function section(msg) { console.log(`\n── ${msg}`); }

// ── login ─────────────────────────────────────────────────────────────────────
async function login(phone, password) {
  const r = await post('/auth/login', { phone, password });
  if (r.status !== 200) throw new Error(`Login failed for ${phone}: ${JSON.stringify(r.body)}`);
  return r.body.accessToken;
}

// ── WebSocket connection ───────────────────────────────────────────────────────
function connectWs(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, {
      auth: { token },
      transports: ['websocket'],
      timeout: 5000,
    });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', (e) => reject(e));
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
(async () => {
  console.log('=== Step 18: Ride request / accept / decline ===\n');

  // ── 1. Login both users ───────────────────────────────────────────────────
  section('1. Login client + driver');
  let clientToken, driverToken;
  try {
    clientToken = await login('+37492000001', 'Test1234!');
    pass('Client logged in');
  } catch (e) { fail(e.message); return; }

  try {
    driverToken = await login('+37492000002', 'Test1234!');
    pass('Driver logged in');
  } catch (e) { fail(e.message); return; }

  // ── 2. Connect driver via WebSocket + publish GPS ─────────────────────────
  section('2. Driver connects via WebSocket and publishes GPS');
  let driverSocket;
  try {
    driverSocket = await connectWs(driverToken);
    pass('Driver WebSocket connected');
  } catch (e) { fail(`WS connect failed: ${e.message}`); return; }

  // Send GPS — Yerevan city center
  const PICKUP_LAT = 40.1872;
  const PICKUP_LNG = 44.5152;

  await new Promise((resolve) => {
    driverSocket.emit('gps_update', { lat: PICKUP_LAT + 0.002, lng: PICKUP_LNG + 0.002 });
    driverSocket.once('gps_ack', resolve);
    setTimeout(resolve, 1000); // fallback
  });
  pass('Driver GPS published');

  // Small delay to ensure Redis is updated
  await new Promise(r => setTimeout(r, 300));

  // ── 3. Client also connects via WebSocket (to receive ride_accepted) ───────
  section('3. Client connects via WebSocket');
  let clientSocket;
  try {
    clientSocket = await connectWs(clientToken);
    pass('Client WebSocket connected');
  } catch (e) { fail(`Client WS connect failed: ${e.message}`); return; }

  // ── 4. Client requests a ride ─────────────────────────────────────────────
  section('4. POST /rides/request (client)');

  // Listen for ride_request on the driver side BEFORE sending the request
  const rideRequestPromise = new Promise((resolve) => {
    driverSocket.once('ride_request', (data) => {
      resolve(data);
    });
    setTimeout(() => resolve(null), 5000); // 5s timeout
  });

  const reqResult = await post('/rides/request', {
    pickupLat: PICKUP_LAT,
    pickupLng: PICKUP_LNG,
    pickupAddress: 'Republic Square, Yerevan',
    dropoffLat: 40.195,
    dropoffLng: 44.512,
    dropoffAddress: 'Northern Avenue, Yerevan',
    radiusKm: 10,
  }, clientToken);

  if (reqResult.status === 201) {
    pass(`Ride created — id: ${reqResult.body.id}, status: ${reqResult.body.status}`);
  } else {
    fail(`POST /rides/request → ${reqResult.status}: ${JSON.stringify(reqResult.body)}`);
    driverSocket.disconnect();
    clientSocket.disconnect();
    return;
  }

  const rideId = reqResult.body.id;

  // Wait for ride_request WS event on driver
  const rideRequestEvent = await rideRequestPromise;
  if (rideRequestEvent && rideRequestEvent.rideId === rideId) {
    pass(`Driver received 'ride_request' WS event for ride ${rideId}`);
  } else if (rideRequestEvent) {
    fail(`Driver received ride_request but rideId mismatch: ${JSON.stringify(rideRequestEvent)}`);
  } else {
    fail('Driver did NOT receive ride_request event within 5s');
  }

  // ── 5. Test role guard: client cannot accept ───────────────────────────────
  section('5. Role guard: client cannot call accept (expect 403)');
  const clientAcceptResult = await post(`/rides/${rideId}/accept`, {}, clientToken);
  if (clientAcceptResult.status === 403) {
    pass('Client correctly denied from /accept (403 Forbidden)');
  } else {
    fail(`Expected 403 but got ${clientAcceptResult.status}: ${JSON.stringify(clientAcceptResult.body)}`);
  }

  // ── 6. Driver declines the ride ───────────────────────────────────────────
  section('6. POST /rides/:id/decline (driver)');

  // Listen for ride_cancelled on client (in case no other drivers available)
  const rideCancelledPromise = new Promise((resolve) => {
    clientSocket.once('ride_cancelled', (data) => resolve({ event: 'ride_cancelled', data }));
    // Also listen for a potential re-dispatch (another driver gets the request)
    setTimeout(() => resolve({ event: 'timeout', data: null }), 3000);
  });

  const declineResult = await post(`/rides/${rideId}/decline`, {}, driverToken);
  if (declineResult.status === 200) {
    pass(`Driver declined — server says: "${declineResult.body.message}"`);
  } else {
    fail(`POST /rides/:id/decline → ${declineResult.status}: ${JSON.stringify(declineResult.body)}`);
  }

  const cancelResult = await rideCancelledPromise;
  if (cancelResult.event === 'ride_cancelled') {
    pass(`Client received 'ride_cancelled' event (no more drivers): ${JSON.stringify(cancelResult.data)}`);
  } else {
    // Could be that re-dispatch happened (if another driver exists) — that's also valid
    pass('No ride_cancelled event (possible re-dispatch to another driver — that is correct behaviour)');
  }

  // ── 7. Full accept flow — request a new ride and accept it ────────────────
  section('7. Full accept flow: request → driver accepts → client notified');

  // Re-publish GPS (in case it expired)
  await new Promise((resolve) => {
    driverSocket.emit('gps_update', { lat: PICKUP_LAT + 0.001, lng: PICKUP_LNG + 0.001 });
    setTimeout(resolve, 500);
  });
  await new Promise(r => setTimeout(r, 300));

  const rideRequestPromise2 = new Promise((resolve) => {
    driverSocket.once('ride_request', (data) => resolve(data));
    setTimeout(() => resolve(null), 5000);
  });

  const rideAcceptedPromise = new Promise((resolve) => {
    clientSocket.once('ride_accepted', (data) => resolve(data));
    setTimeout(() => resolve(null), 8000);
  });

  const reqResult2 = await post('/rides/request', {
    pickupLat: PICKUP_LAT,
    pickupLng: PICKUP_LNG,
    pickupAddress: 'Republic Square, Yerevan',
    radiusKm: 10,
  }, clientToken);

  if (reqResult2.status === 201) {
    pass(`2nd ride created — id: ${reqResult2.body.id}`);
  } else {
    fail(`2nd POST /rides/request → ${reqResult2.status}: ${JSON.stringify(reqResult2.body)}`);
    driverSocket.disconnect(); clientSocket.disconnect();
    return;
  }

  const rideId2 = reqResult2.body.id;

  const rideReq2Event = await rideRequestPromise2;
  if (rideReq2Event && rideReq2Event.rideId === rideId2) {
    pass(`Driver received 'ride_request' for ride ${rideId2}`);
  } else {
    fail(`Driver did not receive ride_request for ride ${rideId2}: ${JSON.stringify(rideReq2Event)}`);
    driverSocket.disconnect(); clientSocket.disconnect();
    return;
  }

  // Driver accepts
  const acceptResult = await post(`/rides/${rideId2}/accept`, {}, driverToken);
  if (acceptResult.status === 200 && acceptResult.body.status === 'accepted') {
    pass(`Driver accepted — ride status: ${acceptResult.body.status}`);
  } else {
    fail(`POST /rides/:id/accept → ${acceptResult.status}: ${JSON.stringify(acceptResult.body)}`);
  }

  // Wait for ride_accepted on client
  const rideAcceptedEvent = await rideAcceptedPromise;
  if (rideAcceptedEvent && rideAcceptedEvent.rideId === rideId2) {
    pass(`Client received 'ride_accepted' WS event for ride ${rideId2}`);
    pass(`  driver name: ${rideAcceptedEvent.driverName}, plate: ${rideAcceptedEvent.vehiclePlate}`);
  } else {
    fail(`Client did NOT receive ride_accepted event: ${JSON.stringify(rideAcceptedEvent)}`);
  }

  // ── 8. Duplicate accept should fail ───────────────────────────────────────
  section('8. Duplicate accept should fail (ride already accepted)');
  const dupAccept = await post(`/rides/${rideId2}/accept`, {}, driverToken);
  if (dupAccept.status === 403) {
    pass('Duplicate accept correctly rejected (403)');
  } else {
    fail(`Expected 403 for duplicate accept, got ${dupAccept.status}: ${JSON.stringify(dupAccept.body)}`);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  driverSocket.disconnect();
  clientSocket.disconnect();

  console.log('\n=== Done ===');
  console.log(`Exit code: ${process.exitCode ?? 0}`);
})();
