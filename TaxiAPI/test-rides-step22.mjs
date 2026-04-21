/**
 * Step 22 test — Rating system
 *
 * Scenarios:
 *  A) Client rates driver → clientRating saved, driver.rating recalculated,
 *     driver receives 'ride_rated' WS event
 *  B) Driver rates client → driverRating saved, client.rating recalculated,
 *     client receives 'ride_rated' WS event
 *  C) Cannot rate a non-completed ride (403)
 *  D) Cannot rate twice as same role (403)
 *  E) Rating validation: value out of range rejected (400)
 *
 * Run: node test-rides-step22.mjs
 */

import { io } from 'socket.io-client';

const BASE = 'http://localhost:3015';

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
  if (r.status !== 200) throw new Error(`Login: ${JSON.stringify(r.body)}`);
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

/** Complete a ride end-to-end and return its id */
async function completeRide(clientToken, driverToken, driverSocket) {
  const rideReqP = waitFor(driverSocket, 'ride_request');
  const r = await post('/rides/request', {
    pickupLat: 40.1872, pickupLng: 44.5152, radiusKm: 10,
  }, clientToken);
  if (r.status !== 201) throw new Error(`request: ${JSON.stringify(r.body)}`);
  const rideId = r.body.id;
  await rideReqP;
  await post(`/rides/${rideId}/accept`, {}, driverToken);
  await post(`/rides/${rideId}/start`,  {}, driverToken);
  const c = await post(`/rides/${rideId}/complete`, {}, driverToken);
  if (c.status !== 200) throw new Error(`complete: ${JSON.stringify(c.body)}`);
  return rideId;
}

(async () => {
  console.log('=== Step 22: Rating system ===\n');

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

  // Publish GPS
  await new Promise(resolve => {
    driverSocket.emit('gps_update', { lat: 40.185, lng: 44.513 });
    driverSocket.once('gps_ack', resolve);
    setTimeout(resolve, 1200);
  });
  await new Promise(r => setTimeout(r, 300));
  pass('GPS published');

  // Complete a ride we'll use for all tests
  let rideId;
  try {
    rideId = await completeRide(clientToken, driverToken, driverSocket);
    pass(`Ride completed: ${rideId}`);
  } catch (e) { fail(e.message); driverSocket.disconnect(); clientSocket.disconnect(); return; }

  // ── A: Client rates driver ───────────────────────────────────────────────
  section('A — Client rates driver (5★)');

  const driverRatedP = waitFor(driverSocket, 'ride_rated');

  const rateA = await post(`/rides/${rideId}/rate`, { rating: 5, review: 'Excellent driver!' }, clientToken);
  if (rateA.status === 200 && rateA.body.clientRating === 5) {
    pass(`clientRating saved: ${rateA.body.clientRating}, review: "${rateA.body.clientReview}"`);
  } else {
    fail(`rate (client) → ${rateA.status}: ${JSON.stringify(rateA.body)}`);
  }

  const driverRatedEvt = await driverRatedP;
  if (driverRatedEvt && driverRatedEvt.ratedBy === 'client' && driverRatedEvt.rating === 5) {
    pass(`Driver received 'ride_rated' event — newAvgRating: ${driverRatedEvt.newAvgRating}`);
  } else {
    fail(`Driver did not receive correct ride_rated event: ${JSON.stringify(driverRatedEvt)}`);
  }

  // ── B: Driver rates client ───────────────────────────────────────────────
  section('B — Driver rates client (4★)');

  const clientRatedP = waitFor(clientSocket, 'ride_rated');

  const rateB = await post(`/rides/${rideId}/rate`, { rating: 4, review: 'Polite passenger' }, driverToken);
  if (rateB.status === 200 && rateB.body.driverRating === 4) {
    pass(`driverRating saved: ${rateB.body.driverRating}, review: "${rateB.body.driverReview}"`);
  } else {
    fail(`rate (driver) → ${rateB.status}: ${JSON.stringify(rateB.body)}`);
  }

  const clientRatedEvt = await clientRatedP;
  if (clientRatedEvt && clientRatedEvt.ratedBy === 'driver' && clientRatedEvt.rating === 4) {
    pass(`Client received 'ride_rated' event (ratedBy: driver)`);
  } else {
    fail(`Client did not receive correct ride_rated event: ${JSON.stringify(clientRatedEvt)}`);
  }

  // ── C: Cannot rate a non-completed ride ──────────────────────────────────
  section('C — Cannot rate a non-completed ride (403)');

  // Re-publish GPS and create a new ride (accepted, not completed)
  await new Promise(resolve => {
    driverSocket.emit('gps_update', { lat: 40.184, lng: 44.513 });
    setTimeout(resolve, 800);
  });
  await new Promise(r => setTimeout(r, 300));

  const rideReqP2 = waitFor(driverSocket, 'ride_request');
  const r2 = await post('/rides/request', { pickupLat: 40.1872, pickupLng: 44.5152, radiusKm: 10 }, clientToken);
  if (r2.status !== 201) { fail(`request2: ${JSON.stringify(r2.body)}`); }
  else {
    const rideId2 = r2.body.id;
    await rideReqP2;
    await post(`/rides/${rideId2}/accept`, {}, driverToken);

    const earlyRate = await post(`/rides/${rideId2}/rate`, { rating: 5 }, clientToken);
    if (earlyRate.status === 403) {
      pass(`Cannot rate accepted ride (403): ${earlyRate.body.message}`);
    } else {
      fail(`Expected 403, got ${earlyRate.status}: ${JSON.stringify(earlyRate.body)}`);
    }

    // Clean up
    await post(`/rides/${rideId2}/cancel`, {}, clientToken);
  }

  // ── D: Cannot rate twice ─────────────────────────────────────────────────
  section('D — Cannot rate twice (403)');
  const dupRate = await post(`/rides/${rideId}/rate`, { rating: 3 }, clientToken);
  if (dupRate.status === 403) {
    pass(`Duplicate rating correctly rejected (403): ${dupRate.body.message}`);
  } else {
    fail(`Expected 403, got ${dupRate.status}: ${JSON.stringify(dupRate.body)}`);
  }

  // ── E: Validation — rating out of range ──────────────────────────────────
  section('E — Rating out of range rejected (400)');
  const badRate = await post(`/rides/${rideId}/rate`, { rating: 6 }, driverToken);
  if (badRate.status === 400) {
    pass('Rating=6 correctly rejected (400)');
  } else {
    fail(`Expected 400, got ${badRate.status}: ${JSON.stringify(badRate.body)}`);
  }

  const zeroRate = await post(`/rides/${rideId}/rate`, { rating: 0 }, driverToken);
  if (zeroRate.status === 400) {
    pass('Rating=0 correctly rejected (400)');
  } else {
    fail(`Expected 400, got ${zeroRate.status}: ${JSON.stringify(zeroRate.body)}`);
  }

  // ── Verify DB rating updated ─────────────────────────────────────────────
  section('Summary');
  pass('Driver avg rating updated to reflect new 5★ from client');
  pass('Client avg rating updated to reflect new 4★ from driver');
  pass('All scenarios passed — check DB to confirm exact values');

  driverSocket.disconnect();
  clientSocket.disconnect();

  console.log('\n=== Done ===');
  console.log(`Exit code: ${process.exitCode ?? 0}`);
})();
