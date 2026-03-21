// Bank of England — UK Economic & Financial Data
// Replaces FRED (US Federal Reserve). Uses BoE Statistical Interactive Database (IADB).
// Key indicators: Bank Rate, gilt yields, CPI, RPI, money supply, GBP exchange rates
// No API key required — public JSON endpoints.

import { safeFetch, today, daysAgo } from '../utils/fetch.mjs';

const BASE = 'https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp';

// BoE series codes for key UK macro indicators
const KEY_SERIES = {
  // Bank Rate & short-term rates
  IUDBEDR: 'Bank Rate (Base Rate)',
  // Gilt yields
  IUDMNZC: '2-Year Gilt Yield',
  IUDMNPY: '10-Year Gilt Yield',
  IUDMNOL: '30-Year Gilt Yield',
  // Inflation
  D7BT: 'CPI Annual Rate',
  D7BZ: 'CPI Core (ex Energy, Food, Alcohol & Tobacco)',
  CZBH: 'RPI Annual Rate',
  // Money & credit
  LPMAUYN: 'M4 Money Supply (annual growth)',
  LPMBL2C: 'Consumer Credit (annual growth)',
  // Exchange rates
  XUDLGBD: 'GBP/USD Exchange Rate',
  XUDLERS: 'GBP/EUR Exchange Rate',
  // Housing
  IUDMNZR: 'Mortgage Rate (SVR avg)',
};

// Fetch recent observations for a series from the BoE IADB
async function getSeriesLatest(seriesId) {
  // BoE IADB CSV/JSON endpoint
  const endDate = today();
  const startDate = daysAgo(120);
  const params = new URLSearchParams({
    'Datefrom': startDate.replace(/-/g, '/').replace(/^(\d{4})\/(\d{2})\/(\d{2})$/, '$3/$2/$1'),
    'Dateto': endDate.replace(/-/g, '/').replace(/^(\d{4})\/(\d{2})\/(\d{2})$/, '$3/$2/$1'),
    'SeriesCodes': seriesId,
    'CSVF': 'TN',
    'UsingCodes': 'Y',
    'VPD': 'Y',
    'VFD': 'N',
  });
  const url = `${BASE}?${params}`;
  const text = await safeFetch(url, { raw: true });
  return text;
}

// Parse BoE CSV response into observations
function parseBoeResponse(text, seriesId) {
  if (!text || typeof text !== 'string') return [];
  const lines = text.split('\n').filter(l => l.trim());
  // Find the header line and data
  const observations = [];
  for (const line of lines) {
    // BoE format: DATE, VALUE (tab or comma separated)
    const match = line.match(/(\d{2}\s\w{3}\s\d{4})\s*,\s*([-\d.]+)/);
    if (match) {
      const dateStr = match[1];
      const value = parseFloat(match[2]);
      if (!isNaN(value)) {
        observations.push({ date: dateStr, value });
      }
    }
  }
  // Sort by date descending (most recent first)
  observations.sort((a, b) => new Date(b.date) - new Date(a.date));
  return observations;
}

// Briefing — pull all key UK indicators
export async function briefing() {
  const entries = Object.entries(KEY_SERIES);

  // Fetch all series in parallel
  const results = await Promise.all(
    entries.map(async ([id, label]) => {
      try {
        const rawData = await getSeriesLatest(id);
        const obs = parseBoeResponse(rawData, id);
        if (!obs.length) return { id, label, value: null, date: null, recent: [] };
        return {
          id,
          label,
          value: obs[0].value,
          date: obs[0].date,
          recent: obs.slice(0, 5).map(o => o.value),
        };
      } catch {
        return { id, label, value: null, date: null, recent: [] };
      }
    })
  );

  // Compute derived signals
  const get = (id) => results.find(r => r.id === id)?.value;
  const bankRate = get('IUDBEDR');
  const gilt2y = get('IUDMNZC');
  const gilt10y = get('IUDMNPY');
  const cpi = get('D7BT');
  const gbpusd = get('XUDLGBD');

  const signals = [];

  // Yield curve inversion check (2y vs 10y gilt)
  if (gilt2y !== null && gilt10y !== null && gilt2y > gilt10y) {
    signals.push(`GILT YIELD CURVE INVERTED (10Y-2Y: ${(gilt10y - gilt2y).toFixed(2)}%) — recession signal`);
  }

  // High inflation
  if (cpi !== null && cpi > 4) signals.push(`UK CPI elevated at ${cpi}% — above BoE 2% target`);
  if (cpi !== null && cpi > 8) signals.push(`UK CPI crisis-level at ${cpi}%`);

  // Bank rate signals
  if (bankRate !== null && bankRate >= 5) signals.push(`Bank Rate at ${bankRate}% — restrictive monetary policy`);

  // GBP weakness
  if (gbpusd !== null && gbpusd < 1.20) signals.push(`GBP/USD weak at ${gbpusd} — sterling under pressure`);
  if (gbpusd !== null && gbpusd < 1.10) signals.push(`GBP/USD critical at ${gbpusd} — sterling crisis`);

  return {
    source: 'Bank of England',
    timestamp: new Date().toISOString(),
    indicators: results.filter(r => r.value !== null),
    signals,
  };
}

if (process.argv[1]?.endsWith('fred.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
