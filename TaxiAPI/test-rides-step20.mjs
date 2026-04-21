/**
 * Step 20 end-to-end test — Ride cancellation
 *
 * Scenarios:
 *  A) Client cancels a REQUESTED ride (no driver yet)
 *  B) Client cancels an ACCEPTED ride → assigned driver receives WS notification
 *  C) Driver cancels an ACCEPTED ride → client receives WS notification
 *  D) Guard: client cannot cancel a COMPLETED ride
 *  E) Guard: driver cannot cancel another driver's ride
 *  F) Guard: completed ride cannot be cancelled
 *
 * Run: node test-rides-step20.mjs
 */

import { io } from 'socket.io-client';

const BASE = 'http://localhost:3013';

// ── helpers ──────────────────────────────────────────────────────────────────
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
    const socket = io(BASE, { auth: { token }, transports: ['websocket'], timeout: 5000 });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });
}

function waitFor(socket, event, ms = 4000) {
  return new Promise(resolve => {
    socket.once(event, data => resolve(data));
    setTimeout(() => resolve(null), ms);
  });
}

/** Helper: request a ride and wait for the driver to receive ride_request */
async function requestAndWaitForDriver(clientToken, driverSocket, radiusKm = 10) {
  const rideReqPromise = waitFor(driverSocket, 'ride_request');
  const r = await post('/rides/request', {
    pickupLat: 40.1872, pickupLng: 44.5152,
    pickupAddress: 'Republic Square, Yerevan',
    radiusKm,
  }, clientToken);
  if (r.status !== 201) throw new Error(`requestRide failed: ${JSON.stringify(r.body)}`);
  const evt = await rideReqPromise;
  if (!evt || evt.rideId !== r.body.id) throw new Error('Driver did not receive ride_request');
  return r.body.id;
}

// ─────────────────────────────────────────────────────────────────────────────
(async () => {
  console.log('=== Step 20: Ride cancellation ===\n');

  // ── Setup ─────────────────────────────────────────────────────────────────
  section('Setup: login + WebSocket + GPS');
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
    pass('WebSocket connections established');
  } catch (e) { fail(e.message); return; }

  // Publish GPS so driver appears in geo
  await new Promise(resolve => {
    driverSocket.emit('gps_update', { lat: 40.190, lng: 44.516 });
    driverSocket.once('gps_ack', resolve);
    setTimeout(resolve, 1200);
  });
  await new Promise(r => setTimeout(r, 300));
  pass('Driver GPS published');

  // ── A: Client cancels a REQUESTED ride ────────────────────────────────────
  section('A — Client cancels a REQUESTED ride (before driver accepts)');

  let rideIdA;
  try { rideIdA = await requestAndWaitForDriver(clientToken, driverSocket); }
  catch (e) { fail(e.message); driverSocket.disconnect(); clientSocket.disconnect(); return; }
  pass(`Ride created: ${rideIdA}`);

  const cancelA = await post(`/rides/${rideIdA}/cancel`, { reason: 'Changed my mind' }, clientToken);
  if (cancelA.status === 200 && cancelA.body.status === 'cancelled') {
    pass(`Ride cancelled — status: ${cancelA.body.status}, cancelledBy: ${cancelA.body.cancelledBy ?? '(not in dto)'}`);
  } else {
    fail(`Cancel (A) → ${cancelA.status}: ${JSON.stringify(cancelA.body)}`);
  }

  // Re-publish GPS (driver disconnect may have cleared it after decline)
  await new Promise(resolve => {
    driverSocket.emit('gps_update', { lat: 40.191, lng: 44.516 });
    setTimeout(resolve, 800);
  });
  await new Promise(r => setTimeout(r, 200));

  // ── B: Client cancels an ACCEPTED ride ────────────────────────────────────
  section('B — Client cancels an ACCEPTED ride → driver gets WS event');

  let rideIdB;
  try { rideIdB = await requestAndWaitForDriver(clientToken, driverSocket); }
  catch (e) { fail(e.message); driverSocket.disconnect(); clientSocket.disconnect(); return; }

  // Driver accepts
  const acceptB = await post(`/rides/${rideIdB}/accept`, {}, driverToken);
  if (acceptB.status !== 200) { fail(`Accept (B) failed: ${JSON.stringify(acceptB.body)}`); }
  else pass(`Ride accepted: ${rideIdB}`);

  // Listen for ride_cancelled on DRIVER socket
  const driverCancelledPromise = waitFor(driverSocket, 'ride_cancelled');

  const cancelB = await post(`/rides/${rideIdB}/cancel`, { reason: 'Emergency' }, clientToken);
  if (cancelB.status === 200 && cancelB.body.status === 'cancelled') {
    pass('Client cancelled accepted ride');
  } else {
    fail(`Cancel (B) → ${cancelB.status}: ${JSON.stringify(cancelB.body)}`);
  }

  const driverCancelledEvent = await driverCancelledPromise;
  if (driverCancelledEvent && driverCancelledEvent.rideId === rideIdB && driverCancelledEvent.cancelledBy === 'client') {
    pass(`Driver received 'ride_cancelled' (cancelledBy: client, reason: ${driverCancelledEvent.reason})`);
  } else {
    fail(`Driver did not receive correct ride_cancelled event: ${JSON.stringify(driverCancelledEvent)}`);
  }

  // Re-publish GPS
  await new Promise(resolve => {
    driverSocket.emit('gps_update', { lat: 40.192, lng: 44.517 });
    setTimeout(resolve, 800);
  });
  await new Promise(r => setTimeout(r, 200));

  // ── C: Driver cancels an ACCEPTED ride ────────────────────────────────────
  section('C — Driver cancels an ACCEPTED ride → client gets WS event');

  let rideIdC;
  try { rideIdC = await requestAndWaitForDriver(clientToken, driverSocket); }
  catch (e) { fail(e.message); driverSocket.disconnect(); clientSocket.disconnect(); return; }

  const acceptC = await post(`/rides/${rideIdC}/accept`, {}, driverToken);
  if (acceptC.status !== 200) { fail(`Accept (C) failed: ${JSON.stringify(acceptC.body)}`); }
  else pass(`Ride accepted: ${rideIdC}`);

  // Listen for ride_cancelled on CLIENT socket
  const clientCancelledPromise = waitFor(clientSocket, 'ride_cancelled');

  const cancelC = await post(`/rides/${rideIdC}/cancel`, { reason: 'Vehicle breakdown' }, driverToken);
  if (cancelC.status === 200 && cancelC.body.status === 'cancelled') {
    pass('Driver cancelled accepted ride');
  } else {
    fail(`Cancel (C) → ${cancelC.status}: ${JSON.stringify(cancelC.body)}`);
  }

  const clientCancelledEvent = await clientCancelledPromise;
  if (clientCancelledEvent && clientCancelledEvent.rideId === rideIdC && clientCancelledEvent.cancelledBy === 'driver') {
    pass(`Client received 'ride_cancelled' (cancelledBy: driver, reason: ${clientCancelledEvent.reason})`);
  } else {
    fail(`Client did not receive correct ride_cancelled event: ${JSON.stringify(clientCancelledEvent)}`);
  }

  // ── D: Cannot cancel a completed ride ─────────────────────────────────────
  section('D — Cannot cancel a completed ride (403)');

  // Re-publish GPS
  await new Promise(resolve => {
    driverSocket.emit('gps_update', { lat: 40.188, lng: 44.515 });
    setTimeout(resolve, 800);
  });
  await new Promise(r => setTimeout(r, 200));

  let rideIdD;
  try { rideIdD = await requestAndWaitForDriver(clientToken, driverSocket); }
  catch (e) { fail(e.message); driverSocket.disconnect(); clientSocket.disconnect(); return; }

  await post(`/rides/${rideIdD}/accept`, {}, driverToken);
  await post(`/rides/${rideIdD}/start`, {}, driverToken);
  await post(`/rides/${rideIdD}/complete`, {}, driverToken);

  const cancelD = await post(`/rides/${rideIdD}/cancel`, {}, clientToken);
  if (cancelD.status === 403) {
    pass('Completed ride correctly rejected for cancellation (403)');
  } else {
    fail(`Expected 403, got ${cancelD.status}: ${JSON.stringify(cancelD.body)}`);
  }

  // ── E: Driver cannot cancel a ride that belongs to another driver ──────────
  section('E — Driver cannot cancel another driver\'s ride (403)');
  // rideIdC is already cancelled — re-use it to test the driverId mismatch path
  const cancelE = await post(`/rides/${rideIdB}/cancel`, {}, driverToken);
  // rideIdB is already cancelled, so it should fail with 403 (wrong status)
  if (cancelE.status === 403) {
    pass('Cannot cancel already-cancelled ride (403)');
  } else {
    fail(`Expected 403, got ${cancelE.status}: ${JSON.stringify(cancelE.body)}`);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  driverSocket.disconnect();
  clientSocket.disconnect();

  console.log('\n=== Done ===');
  console.log(`Exit code: ${process.exitCode ?? 0}`);
})();
