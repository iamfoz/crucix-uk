// UK Radiation Monitoring — Environment Agency & Nuclear Decommissioning Authority
// Replaces EPA RadNet (US). Monitors ambient radiation near UK nuclear sites.
// Uses Radioactive Incident Monitoring Network (RIMNET) concepts with publicly
// available data from Safecast and UK government open data.
// No auth required.

import { safeFetch } from '../utils/fetch.mjs';

const SAFECAST_BASE = 'https://api.safecast.org';

// Key UK nuclear sites and installations
const MONITORING_STATIONS = {
  sellafield:     { label: 'Sellafield, Cumbria',          lat: 54.42, lon: -3.50 },
  hinkleyPoint:   { label: 'Hinkley Point, Somerset',      lat: 51.21, lon: -3.13 },
  sizewell:       { label: 'Sizewell, Suffolk',             lat: 52.22, lon: 1.62 },
  torness:        { label: 'Torness, East Lothian',         lat: 55.97, lon: -2.40 },
  hunterston:     { label: 'Hunterston, North Ayrshire',    lat: 55.72, lon: -4.90 },
  hartlepool:     { label: 'Hartlepool, County Durham',     lat: 54.63, lon: -1.18 },
  heysham:        { label: 'Heysham, Lancashire',           lat: 54.03, lon: -2.91 },
  dungeness:      { label: 'Dungeness, Kent',               lat: 50.91, lon: 0.96 },
  aldermaston:    { label: 'AWE Aldermaston, Berkshire',    lat: 51.37, lon: -1.15 },
  faslane:        { label: 'HMNB Clyde (Faslane), Argyll',  lat: 56.07, lon: -4.82 },
};

// Analyte types that indicate concerning radiation
const KEY_ANALYTES = [
  'GROSS BETA',
  'GROSS ALPHA',
  'IODINE-131',
  'CESIUM-137',
  'CESIUM-134',
  'STRONTIUM-90',
  'TRITIUM',
];

// Normal background radiation thresholds (CPM — counts per minute from Safecast sensors)
// UK background: typically 10-80 CPM
const THRESHOLDS = {
  normal: 80,    // CPM — upper end of normal UK background
  elevated: 150, // CPM — warrants attention
  high: 300,     // CPM — significant concern
};

// Get recent Safecast measurements near a UK nuclear site
async function getMeasurementsNearSite(site, limit = 15) {
  const params = new URLSearchParams({
    latitude: String(site.lat),
    longitude: String(site.lon),
    distance: String(50000), // 50km radius in metres
    limit: String(limit),
  });
  return safeFetch(`${SAFECAST_BASE}/measurements.json?${params}`, { timeout: 15000 });
}

// Check a reading against thresholds
function assessReading(avgCPM, site) {
  if (avgCPM === null || avgCPM <= 0) return null;
  if (avgCPM > THRESHOLDS.high) {
    return { level: 'HIGH', threshold: THRESHOLDS.high, ratio: (avgCPM / THRESHOLDS.high).toFixed(1) };
  }
  if (avgCPM > THRESHOLDS.elevated) {
    return { level: 'ELEVATED', threshold: THRESHOLDS.elevated, ratio: (avgCPM / THRESHOLDS.elevated).toFixed(1) };
  }
  if (avgCPM > THRESHOLDS.normal) {
    return { level: 'ABOVE_NORMAL', threshold: THRESHOLDS.normal, ratio: (avgCPM / THRESHOLDS.normal).toFixed(1) };
  }
  return null;
}

// Briefing — check radiation levels near UK nuclear sites
export async function briefing() {
  const signals = [];

  const siteResults = await Promise.all(
    Object.entries(MONITORING_STATIONS).map(async ([key, site]) => {
      try {
        const data = await getMeasurementsNearSite(site);
        const measurements = Array.isArray(data) ? data : [];
        const values = measurements.map(m => m.value).filter(v => typeof v === 'number' && v > 0);
        const avgCPM = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
        const maxCPM = values.length > 0 ? Math.max(...values) : null;
        const assessment = assessReading(avgCPM, site);

        if (assessment) {
          signals.push(
            `${assessment.level} RADIATION near ${site.label}: ` +
            `${avgCPM?.toFixed(1)} CPM avg (${assessment.ratio}x ${assessment.level === 'ABOVE_NORMAL' ? 'normal' : 'threshold'})`
          );
        }

        return {
          site: site.label,
          key,
          lat: site.lat,
          lon: site.lon,
          recentReadings: values.length,
          avgCPM: avgCPM ? +avgCPM.toFixed(1) : null,
          maxCPM,
          status: assessment ? assessment.level : 'NORMAL',
          lastReading: measurements[0]?.captured_at || null,
        };
      } catch (e) {
        return {
          site: site.label,
          key,
          lat: site.lat,
          lon: site.lon,
          recentReadings: 0,
          avgCPM: null,
          maxCPM: null,
          status: 'NO_DATA',
          error: e.message,
        };
      }
    })
  );

  return {
    source: 'UK Radiation Monitoring',
    timestamp: new Date().toISOString(),
    totalSites: siteResults.length,
    sites: siteResults,
    signals: signals.length > 0
      ? signals
      : ['All UK nuclear site readings within normal background levels'],
    thresholds: THRESHOLDS,
    note: 'Data sourced from Safecast citizen-science network sensors near UK nuclear installations. Official RIMNET data is not publicly available via API.',
  };
}

// Run standalone
if (process.argv[1]?.endsWith('epa.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
