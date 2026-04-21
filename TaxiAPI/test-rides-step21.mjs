/**
 * Step 21 test — Cash payment confirmation
 *
 * Scenarios:
 *  A) Full flow: request → accept → start → complete → pay-cash
 *     - Driver confirms cash, paymentStatus → paid
 *     - Client receives 'payment_confirmed' WS event
 *  B) Cannot confirm payment on a non-completed ride (403)
 *  C) Cannot confirm payment twice (403)
 *
 * Run: node test-rides-step21.mjs
 */

import { io } from 'socket.io-client';

const BASE = 'http://localhost:3014';

async function post(path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

function pass(msg) { console.log(`  ✅  ${msg}`); }
function fail(msg) { console.error(`  ❌  ${msg}`); process.exitCode = 1; }
function section(msg) { console.log(`\n── ${msg}`); }

async function login(phone, password) {
  const r = await post('/auth/login', { phone, password });
  if (r.status !== 200) throw new Error(`Login failed: ${JSON.stringify(r.body)}`);
  return r.body.accessToken;
}

function connectWs(token) {
  return new Promise((resolve, reject) => {
    const s = io(BASE, { auth: { token }, transports: ['websocket'], timeout: 5000 });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}

function waitFor(socket, event, ms = 4000) {
  return new Promise(resolve => {
    socket.once(event, d => resolve(d));
    setTimeout(() => resolve(null), ms);
  });
}

(async () => {
  console.log('=== Step 21: Cash payment confirmation ===\n');

  section('Setup');
  let clientToken, driverToken;
  try {
    clientToken = await login('+37492000001', 'Test1234!');
    driverToken = await login('+37492000002', 'Test1234!');
    pass('Logged in');
  } catch (e) { fail(e.message); return; }

  let driverSocket, clientSocket;
  try {
    driverSocket = await connectWs(driverToken);
    clientSocket = await connectWs(clientToken);
    pass('WebSocket connected');
  } catch (e) { fail(e.message); return; }

  await new Promise(resolve => {
    driverSocket.emit('gps_update', { lat: 40.188, lng: 44.514 });
    driverSocket.once('gps_ack', resolve);
    setTimeout(resolve, 1200);
  });
  await new Promise(r => setTimeout(r, 300));
  pass('Driver GPS published');

  // ── A: Full flow → pay-cash ──────────────────────────────────────────────
  section('A — Full flow: complete ride then pay cash');

  const rideReqP = waitFor(driverSocket, 'ride_request');
  const reqR = await post('/rides/request', {
    pickupLat: 40.1872, pickupLng: 44.5152,
    pickupAddress: 'Republic Square', radiusKm: 10,
  }, clientToken);
  if (reqR.status !== 201) { fail(`requestRide: ${JSON.stringify(reqR.body)}`); driverSocket.disconnect(); clientSocket.disconnect(); return; }
  const rideId = reqR.body.id;
  await rideReqP;
  pass(`Ride created: ${rideId}`);

  await post(`/rides/${rideId}/accept`, {}, driverToken);
  await post(`/rides/${rideId}/start`, {}, driverToken);
  const completeR = await post(`/rides/${rideId}/complete`, {}, driverToken);
  if (completeR.status !== 200 || completeR.body.status !== 'completed') {
    fail(`complete failed: ${JSON.stringify(completeR.body)}`); driverSocket.disconnect(); clientSocket.disconnect(); return;
  }
  pass(`Ride completed, paymentStatus: ${completeR.body.paymentStatus}`);

  // Listen for payment_confirmed on client BEFORE calling pay-cash
  const payConfirmP = waitFor(clientSocket, 'payment_confirmed');

  const payR = await post(`/rides/${rideId}/pay-cash`, {}, driverToken);
  if (payR.status === 200 && payR.body.paymentStatus === 'paid') {
    pass(`paymentStatus → ${payR.body.paymentStatus}`);
  } else {
    fail(`pay-cash → ${payR.status}: ${JSON.stringify(payR.body)}`);
  }

  const payEvent = await payConfirmP;
  if (payEvent && payEvent.rideId === rideId && payEvent.paymentMethod === 'cash') {
    pass(`Client received 'payment_confirmed' (method: ${payEvent.paymentMethod}, status: ${payEvent.paymentStatus})`);
  } else {
    fail(`Client did not receive payment_confirmed: ${JSON.stringify(payEvent)}`);
  }

  // ── B: Cannot pay-cash on a non-completed ride ────────────────────────────
  section('B — Cannot confirm cash on non-completed ride (403)');

  await new Promise(r => setTimeout(r, 200));
  await new Promise(resolve => {
    driverSocket.emit('gps_update', { lat: 40.187, lng: 44.514 });
    setTimeout(resolve, 800);
  });
  await new Promise(r => setTimeout(r, 200));

  const rideReqP2 = waitFor(driverSocket, 'ride_request');
  const reqR2 = await post('/rides/request', {
    pickupLat: 40.1872, pickupLng: 44.5152, radiusKm: 10,
  }, clientToken);
  if (reqR2.status !== 201) { fail(`requestRide(2): ${JSON.stringify(reqR2.body)}`); driverSocket.disconnect(); clientSocket.disconnect(); return; }
  const rideId2 = reqR2.body.id;
  await rideReqP2;
  await post(`/rides/${rideId2}/accept`, {}, driverToken);
  // Ride is now accepted but NOT completed

  const earlyPayR = await post(`/rides/${rideId2}/pay-cash`, {}, driverToken);
  if (earlyPayR.status === 403) {
    pass(`Cannot pay-cash on accepted ride (403): ${earlyPayR.body.message}`);
  } else {
    fail(`Expected 403, got ${earlyPayR.status}: ${JSON.stringify(earlyPayR.body)}`);
  }

  // Clean up — cancel the ride
  await post(`/rides/${rideId2}/cancel`, {}, driverToken);

  // ── C: Cannot pay twice ───────────────────────────────────────────────────
  section('C — Cannot confirm payment twice (403)');
  const dupPayR = await post(`/rides/${rideId}/pay-cash`, {}, driverToken);
  if (dupPayR.status === 403) {
    pass(`Duplicate pay-cash correctly rejected (403): ${dupPayR.body.message}`);
  } else {
    fail(`Expected 403, got ${dupPayR.status}: ${JSON.stringify(dupPayR.body)}`);
  }

  driverSocket.disconnect();
  clientSocket.disconnect();

  console.log('\n=== Done ===');
  console.log(`Exit code: ${process.exitCode ?? 0}`);
})();
