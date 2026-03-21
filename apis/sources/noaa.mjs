// UK Met Office & Environment Agency — Severe weather warnings & flood alerts
// Replaces NOAA/NWS (US only). No auth required for RSS/Atom feeds.

import { safeFetch } from '../utils/fetch.mjs';

// Met Office severe weather warnings RSS
const METOFFICE_WARNINGS_URL = 'https://www.metoffice.gov.uk/public/data/PWSCache/WarningsRSS/Region/UK';
// Environment Agency flood warnings API
const EA_FLOOD_URL = 'https://environment.data.gov.uk/flood-monitoring/id/floods';

// Get active Met Office weather warnings via their API
async function getMetOfficeWarnings() {
  // Met Office Datapoint-style warnings
  return safeFetch(
    'https://www.metoffice.gov.uk/public/data/PWSCache/WarningsRSS/Region/UK',
    { timeout: 15000, raw: true }
  );
}

// Parse RSS XML for weather warnings
function parseWarningsRSS(xml) {
  if (!xml || typeof xml !== 'string') return [];
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = block.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() || '';
    const desc = block.match(/<description>([\s\S]*?)<\/description>/i)?.[1]?.trim() || '';
    const link = block.match(/<link>([\s\S]*?)<\/link>/i)?.[1]?.trim() || '';
    const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1]?.trim() || '';
    if (title) items.push({ title, description: desc, link, pubDate });
  }
  return items;
}

// Get Environment Agency flood warnings
async function getFloodWarnings() {
  return safeFetch(`${EA_FLOOD_URL}?_limit=50`, { timeout: 15000 });
}

// Categorise flood severity
function floodSeverityLabel(severity) {
  switch (severity) {
    case 1: return 'Severe Flood Warning';   // Danger to life
    case 2: return 'Flood Warning';          // Flooding expected
    case 3: return 'Flood Alert';            // Flooding possible
    case 4: return 'Warning Removed';
    default: return `Severity ${severity}`;
  }
}

// Briefing — UK severe weather and flood alerts
export async function briefing() {
  const [warningsXml, floodData] = await Promise.all([
    getMetOfficeWarnings().catch(() => null),
    getFloodWarnings().catch(() => null),
  ]);

  // Parse Met Office warnings
  const weatherWarnings = parseWarningsRSS(warningsXml);

  // Parse Environment Agency flood warnings
  const floodItems = floodData?.items || [];
  const severeFloods = floodItems.filter(f => f.severityLevel === 1);
  const floodWarnings = floodItems.filter(f => f.severityLevel === 2);
  const floodAlerts = floodItems.filter(f => f.severityLevel === 3);

  // Categorise weather warnings by type
  const storms = weatherWarnings.filter(w => /storm|wind|gale/i.test(w.title));
  const rain = weatherWarnings.filter(w => /rain|flood/i.test(w.title));
  const snow = weatherWarnings.filter(w => /snow|ice|frost|blizzard/i.test(w.title));
  const heat = weatherWarnings.filter(w => /heat|hot|temperature/i.test(w.title));
  const fog = weatherWarnings.filter(w => /fog|mist|visibility/i.test(w.title));
  const other = weatherWarnings.filter(w => {
    const t = w.title || '';
    return !/storm|wind|gale|rain|flood|snow|ice|frost|blizzard|heat|hot|temperature|fog|mist|visibility/i.test(t);
  });

  return {
    source: 'UK Met Office / Environment Agency',
    timestamp: new Date().toISOString(),
    weatherWarnings: {
      total: weatherWarnings.length,
      summary: {
        storms: storms.length,
        rain: rain.length,
        snow: snow.length,
        heat: heat.length,
        fog: fog.length,
        other: other.length,
      },
      warnings: weatherWarnings.slice(0, 15).map(w => ({
        title: w.title,
        description: w.description?.slice(0, 200),
        date: w.pubDate,
      })),
    },
    floodWarnings: {
      total: floodItems.length,
      summary: {
        severeFloodWarnings: severeFloods.length,
        floodWarnings: floodWarnings.length,
        floodAlerts: floodAlerts.length,
      },
      topAlerts: floodItems.slice(0, 15).map(f => ({
        description: f.description || f.label || '',
        severity: floodSeverityLabel(f.severityLevel),
        severityLevel: f.severityLevel,
        area: f.floodArea?.label || f.eaAreaName || '',
        county: f.floodArea?.county || '',
        timeRaised: f.timeRaised || null,
        timeSeverityChanged: f.timeSeverityChanged || null,
      })),
    },
  };
}

if (process.argv[1]?.endsWith('noaa.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
