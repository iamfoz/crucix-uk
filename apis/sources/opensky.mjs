// OpenSky Network — Real-time flight tracking
// Free for research. 4,000 API credits/day (no auth), 8,000 with account.
// UK-centric: includes UK airspace, North Sea, and global hotspots relevant to UK interests.

import { safeFetch } from '../utils/fetch.mjs';

const BASE = 'https://opensky-network.org/api';

// Get all current flights (global state vector)
export async function getAllFlights() {
  return safeFetch(`${BASE}/states/all`, { timeout: 30000 });
}

// Get flights in a bounding box (lat/lon)
export async function getFlightsInArea(lamin, lomin, lamax, lomax) {
  const params = new URLSearchParams({
    lamin: String(lamin),
    lomin: String(lomin),
    lamax: String(lamax),
    lomax: String(lomax),
  });
  return safeFetch(`${BASE}/states/all?${params}`, { timeout: 20000 });
}

// Get flights by specific aircraft (ICAO24 hex codes)
export async function getFlightsByIcao(icao24List) {
  const icao = Array.isArray(icao24List) ? icao24List : [icao24List];
  const params = icao.map(i => `icao24=${i}`).join('&');
  return safeFetch(`${BASE}/states/all?${params}`, { timeout: 20000 });
}

// Get departures from an airport in a time range
export async function getDepartures(airportIcao, begin, end) {
  const params = new URLSearchParams({
    airport: airportIcao,
    begin: String(Math.floor(begin / 1000)),
    end: String(Math.floor(end / 1000)),
  });
  return safeFetch(`${BASE}/flights/departure?${params}`);
}

// Get arrivals at an airport
export async function getArrivals(airportIcao, begin, end) {
  const params = new URLSearchParams({
    airport: airportIcao,
    begin: String(Math.floor(begin / 1000)),
    end: String(Math.floor(end / 1000)),
  });
  return safeFetch(`${BASE}/flights/arrival?${params}`);
}

// Key hotspot regions — UK-centric + global strategic
const HOTSPOTS = {
  // UK & nearby
  ukAirspace:     { lamin: 49,  lomin: -8,   lamax: 61,  lomax: 2,   label: 'UK Airspace' },
  northSea:       { lamin: 51,  lomin: -2,   lamax: 62,  lomax: 8,   label: 'North Sea' },
  englishChannel: { lamin: 49,  lomin: -5,   lamax: 51.5,lomax: 2,   label: 'English Channel' },
  gibrStraits:    { lamin: 35,  lomin: -7,   lamax: 37,  lomax: -4,  label: 'Strait of Gibraltar' },
  // UK overseas territories & interests
  falklands:      { lamin: -53, lomin: -62,  lamax: -51, lomax: -57, label: 'Falkland Islands' },
  cyprusBases:    { lamin: 34,  lomin: 32,   lamax: 36,  lomax: 35,  label: 'Cyprus (UK Bases)' },
  // Global flashpoints relevant to UK security
  middleEast:     { lamin: 12,  lomin: 30,   lamax: 42,  lomax: 65,  label: 'Middle East' },
  ukraine:        { lamin: 44,  lomin: 22,   lamax: 53,  lomax: 41,  label: 'Ukraine Region' },
  baltics:        { lamin: 53,  lomin: 19,   lamax: 60,  lomax: 29,  label: 'Baltic Region' },
  hornOfAfrica:   { lamin: 5,   lomin: 40,   lamax: 15,  lomax: 55,  label: 'Horn of Africa' },
  southChinaSea:  { lamin: 5,   lomin: 105,  lamax: 23,  lomax: 122, label: 'South China Sea' },
};

// Briefing — check hotspot regions for flight activity
export async function briefing() {
  const hotspotEntries = Object.entries(HOTSPOTS);
  const results = await Promise.all(
    hotspotEntries.map(async ([key, box]) => {
      const data = await getFlightsInArea(box.lamin, box.lomin, box.lamax, box.lomax);
      const error = data?.error || null;
      const states = data?.states || [];
      return {
        region: box.label,
        key,
        totalAircraft: states.length,
        // states format: [icao24, callsign, origin_country, ...]
        byCountry: states.reduce((acc, s) => {
          const country = s[2] || 'Unknown';
          acc[country] = (acc[country] || 0) + 1;
          return acc;
        }, {}),
        // Flag potentially interesting (military often have no callsign or specific patterns)
        noCallsign: states.filter(s => !s[1]?.trim()).length,
        highAltitude: states.filter(s => s[7] && s[7] > 12000).length, // >12km altitude
        ...(error ? { error } : {}),
      };
    })
  );

  const hotspotErrors = results
    .filter(r => r.error)
    .map(r => ({ region: r.region, error: r.error }));

  return {
    source: 'OpenSky',
    timestamp: new Date().toISOString(),
    hotspots: results,
    ...(hotspotErrors.length ? {
      error: hotspotErrors.length === results.length
        ? `OpenSky unavailable across all hotspots: ${hotspotErrors[0].error}`
        : `OpenSky unavailable for ${hotspotErrors.length}/${results.length} hotspots`,
      hotspotErrors,
    } : {}),
  };
}

if (process.argv[1]?.endsWith('opensky.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
