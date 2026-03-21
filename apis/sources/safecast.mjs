// Safecast — Global radiation monitoring (150M+ readings)
// No auth required. CC0 public domain. Citizen-science network.
// UK-centric: monitors UK nuclear sites + key global sites of UK interest.

import { safeFetch } from '../utils/fetch.mjs';

const BASE = 'https://api.safecast.org';

// Get recent measurements in an area
export async function getMeasurements(opts = {}) {
  const {
    latitude = null,
    longitude = null,
    distance = 100, // km
    limit = 50,
    since = null,
  } = opts;

  const params = new URLSearchParams({ limit: String(limit) });
  if (latitude && longitude) {
    params.set('latitude', String(latitude));
    params.set('longitude', String(longitude));
    params.set('distance', String(distance * 1000)); // meters
  }
  if (since) params.set('since', since);

  return safeFetch(`${BASE}/measurements.json?${params}`);
}

// Key nuclear sites to monitor — UK sites + sites of UK strategic interest
const NUCLEAR_SITES = {
  // UK operational & decommissioning sites
  sellafield:     { lat: 54.42, lon: -3.50,  label: 'Sellafield (UK)', radius: 50 },
  hinkleyPoint:   { lat: 51.21, lon: -3.13,  label: 'Hinkley Point C (UK)', radius: 50 },
  sizewell:       { lat: 52.22, lon: 1.62,   label: 'Sizewell (UK)', radius: 50 },
  faslane:        { lat: 56.07, lon: -4.82,  label: 'HMNB Clyde / Faslane (UK Trident)', radius: 50 },
  aldermaston:    { lat: 51.37, lon: -1.15,  label: 'AWE Aldermaston (UK)', radius: 50 },
  // Near-neighbours / European sites of UK concern
  gravelines:     { lat: 51.02, lon: 2.11,   label: 'Gravelines NPP (France — nearest to UK)', radius: 50 },
  // Global flashpoints
  zaporizhzhia:   { lat: 47.51, lon: 34.58,  label: 'Zaporizhzhia NPP (Ukraine)', radius: 100 },
  yongbyon:       { lat: 39.8,  lon: 125.75, label: 'Yongbyon (North Korea)', radius: 100 },
};

// Briefing — check radiation levels near key nuclear sites
export async function briefing() {
  const results = await Promise.all(
    Object.entries(NUCLEAR_SITES).map(async ([key, site]) => {
      const data = await getMeasurements({
        latitude: site.lat,
        longitude: site.lon,
        distance: site.radius,
        limit: 10,
      });

      const measurements = Array.isArray(data) ? data : [];
      const values = measurements.map(m => m.value).filter(v => typeof v === 'number');
      const avgCPM = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;

      return {
        site: site.label,
        key,
        recentReadings: values.length,
        avgCPM,
        maxCPM: values.length > 0 ? Math.max(...values) : null,
        // Normal background: 10-80 CPM. >100 CPM warrants attention.
        anomaly: avgCPM !== null && avgCPM > 100,
        lastReading: measurements[0]?.captured_at || null,
      };
    })
  );

  const anomalies = results.filter(r => r.anomaly);

  return {
    source: 'Safecast',
    timestamp: new Date().toISOString(),
    sites: results,
    signals: anomalies.length > 0
      ? anomalies.map(a => `ELEVATED RADIATION at ${a.site}: ${a.avgCPM?.toFixed(1)} CPM (normal: 10-80)`)
      : ['All monitored nuclear sites within normal radiation levels'],
  };
}

if (process.argv[1]?.endsWith('safecast.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
