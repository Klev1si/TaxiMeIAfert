/**
 * Driver Simulation Script — Step 52: Live Location Tracking Test
 *
 * Simulates a full driver session:
 *   1. Logs in as a driver
 *   2. Connects to the WebSocket
 *   3. Goes online
 *   4. Broadcasts GPS every 3 seconds (moves along a fake route)
 *   5. Auto-accepts incoming ride requests
 *   6. Marks en-route, then starts the ride after a delay
 *
 * Usage:
 *   node test-driver-simulation.js
 *
 * Prerequisites (install once in this folder):
 *   npm install axios socket.io-client
 */

const axios         = require('axios');
const { io }        = require('socket.io-client');

// ─── CONFIGURE THESE ─────────────────────────────────────────────────────────
const API_URL         = 'http://localhost:3000';   // ← script runs on your PC (same machine as API)
// const API_URL      = 'http://10.0.2.2:3000';   // ← only use this FROM INSIDE the Android emulator
const DRIVER_PHONE    = '+38344999998';             // ← your driver account phone
const DRIVER_PASSWORD = 'Klevis.12';              // ← your driver account password
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fake GPS route: driver starts ~800m north-west of the pickup and drives
 * toward the client at 42.21015, 20.73453.
 */
const ROUTE = [
  { lat: 42.21715, lng: 20.72853 },  // start ~800m away
  { lat: 42.21650, lng: 20.72950 },
  { lat: 42.21580, lng: 20.73050 },
  { lat: 42.21500, lng: 20.73130 },
  { lat: 42.21420, lng: 20.73210 },
  { lat: 42.21340, lng: 20.73280 },
  { lat: 42.21260, lng: 20.73340 },
  { lat: 42.21180, lng: 20.73390 },
  { lat: 42.21100, lng: 20.73420 },
  { lat: 42.21015, lng: 20.73453 },  // arrives at client pickup
];

// ─────────────────────────────────────────────────────────────────────────────

let accessToken = null;
let gpsInterval = null;
let routeIndex  = 0;

async function login() {
  console.log(`\n[1] Logging in as driver ${DRIVER_PHONE}...`);
  try {
    const { data } = await axios.post(`${API_URL}/auth/login`, {
      phone:    DRIVER_PHONE,
      password: DRIVER_PASSWORD,
    });
    accessToken = data.accessToken;
    console.log(`    ✅ Token received: ${accessToken.slice(0, 40)}...`);
  } catch (err) {
    console.error('    ❌ Login failed:', err.response?.data || err.message);
    process.exit(1);
  }
}

function connectSocket() {
  console.log(`\n[2] Connecting WebSocket to ${API_URL}...`);

  const socket = io(API_URL, {
    auth:       { token: accessToken },
    transports: ['websocket'],
  });

  socket.on('connect', () => {
    console.log(`    ✅ Connected — socket id: ${socket.id}`);

    // Go online
    console.log('\n[3] Going online (driver_online)...');
    socket.emit('driver_online');
  });

  socket.on('online_ack', () => {
    console.log('    ✅ Online — now broadcasting GPS every 3s');
    console.log('       (open the CLIENT app and request a ride)\n');
    startGpsBroadcast(socket);
  });

  socket.on('gps_ack', ({ lat, lng }) => {
    process.stdout.write(`    📍 GPS ack  lat=${lat.toFixed(5)}  lng=${lng.toFixed(5)}\r`);
  });

  socket.on('ride_request', async (payload) => {
    console.log(`\n\n[4] ⚡ Ride request received!`);
    console.log(`    rideId:   ${payload.rideId}`);
    console.log(`    pickup:   ${payload.pickupLat}, ${payload.pickupLng}`);
    if (payload.pickupAddress) console.log(`    address:  ${payload.pickupAddress}`);

    // Accept after 2 seconds (gives the UI a moment to show "Finding driver…")
    console.log('    Accepting in 2 seconds...');
    await sleep(2000);

    try {
      await apiPost(`/rides/${payload.rideId}/accept`);
      console.log('    ✅ Ride accepted!');
    } catch (e) {
      console.error('    ❌ Accept failed:', e.response?.data || e.message);
      return;
    }

    await sleep(1500);

    try {
      await apiPost(`/rides/${payload.rideId}/en-route`);
      console.log('    ✅ Marked en-route — client should see "Driver on the way"');
    } catch (e) {
      console.error('    ❌ En-route failed:', e.response?.data || e.message);
    }

    // After 15 seconds, simulate arriving at pickup
    console.log('    Marking arrived in 15s...');
    await sleep(15000);

    try {
      await apiPost(`/rides/${payload.rideId}/arrived`);
      console.log('    ✅ Marked arrived — client should see arrival notice');
    } catch (e) {
      console.error('    ❌ Arrived failed:', e.response?.data || e.message);
    }

    // After 5 more seconds, start the ride
    console.log('    Starting ride in 5s...');
    await sleep(5000);

    try {
      await apiPost(`/rides/${payload.rideId}/start`);
      console.log('    ✅ Ride started — client should see "Ride in progress"');
    } catch (e) {
      console.error('    ❌ Start failed:', e.response?.data || e.message);
    }

    // After 20 more seconds, complete the ride
    console.log('    Completing ride in 20s...');
    await sleep(20000);

    try {
      await apiPost(`/rides/${payload.rideId}/complete`, {
        distanceKm:      Number((Math.random() * 5 + 1).toFixed(2)),
        durationMinutes: Number((Math.random() * 10 + 5).toFixed(0)),
        totalFare:       Number((Math.random() * 10 + 3).toFixed(2)),  // fallback for solo drivers
      });
      console.log('    ✅ Ride completed!');
      console.log('       → Client will now see the Cash / Card payment screen.');
      console.log('       → If client chooses Cash, call /pay-cash manually from the real driver app.');
    } catch (e) {
      console.error('    ❌ Complete failed:', e.response?.data || e.message);
    }

    // ⚠️  Do NOT call /pay-cash here automatically.
    // The client must first choose their payment method (cash or card) on their
    // PayCash screen. Cash confirmation happens when the real driver taps
    // "Confirm Cash Received" in the app, not from this simulation script.
  });

  socket.on('connect_error', (err) => {
    console.error('    ❌ WebSocket error:', err.message);
    process.exit(1);
  });

  socket.on('disconnect', (reason) => {
    console.log(`\n⚠️  Disconnected: ${reason}`);
    if (gpsInterval) clearInterval(gpsInterval);
  });

  return socket;
}

function startGpsBroadcast(socket) {
  gpsInterval = setInterval(() => {
    const pos = ROUTE[routeIndex % ROUTE.length];
    socket.emit('gps_update', pos);
    routeIndex++;
  }, 3000);
}

async function apiPost(path, body = {}) {
  return axios.post(`${API_URL}${path}`, body, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Entry point ─────────────────────────────────────────────────────────────

(async () => {
  console.log('═══════════════════════════════════════════════');
  console.log('  TaxiApp — Driver Simulation Script');
  console.log('  Tests: live GPS tracking, ride accept/start');
  console.log('═══════════════════════════════════════════════');

  await login();
  connectSocket();

  console.log('\nPress Ctrl+C to stop.\n');
})();
