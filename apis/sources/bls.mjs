// ONS — Office for National Statistics (UK)
// Replaces BLS (US Bureau of Labor Statistics).
// UK labour market, CPI, GDP. No auth required.

import { safeFetch } from '../utils/fetch.mjs';

const BASE = 'https://api.ons.gov.uk';

// Key ONS dataset/time-series identifiers
// ONS uses a /timeseries/{seriesId}/dataset/{datasetId}/data endpoint
const SERIES = {
  // Labour market (from LMS dataset)
  'MGSX': { label: 'UK Unemployment Rate (%)', dataset: 'LMS' },
  'MGRZ': { label: 'UK Employment Rate (%)', dataset: 'LMS' },
  'KA6D': { label: 'Claimant Count (thousands)', dataset: 'LMS' },
  'KAC3': { label: 'Average Weekly Earnings (growth %)', dataset: 'LMS' },
  // CPI inflation (from MM23 dataset)
  'D7G7': { label: 'CPI Annual Rate (%)', dataset: 'MM23' },
  'D7G8': { label: 'CPIH Annual Rate (%)', dataset: 'MM23' },
  'DKO8': { label: 'RPI Annual Rate (%)', dataset: 'MM23' },
  // GDP (from QNA dataset)
  'IHYP': { label: 'GDP Quarterly Growth (%)', dataset: 'QNA' },
};

// Fetch latest data for an ONS time series
async function getSeriesData(seriesId, datasetId) {
  const url = `${BASE}/timeseries/${seriesId}/dataset/${datasetId}/data`;
  return safeFetch(url, { timeout: 15000 });
}

// Extract latest observation from ONS response
function extractLatest(data) {
  // ONS returns months, quarters, and years arrays
  const months = data?.months || [];
  const quarters = data?.quarters || [];

  // Try months first (most granular), then quarters
  const series = months.length > 0 ? months : quarters;
  if (!series.length) return null;

  // ONS returns sorted chronologically, latest is last
  const sorted = [...series].sort((a, b) => {
    const da = a.date || `${a.year}-${(a.month || a.quarter || '01')}`;
    const db = b.date || `${b.year}-${(b.month || b.quarter || '01')}`;
    return db.localeCompare(da);
  });

  const latest = sorted[0];
  if (!latest || latest.value === '' || latest.value === null) return null;

  return {
    value: parseFloat(latest.value),
    period: latest.date || `${latest.year} ${latest.month || latest.quarter || ''}`.trim(),
    label: latest.label || null,
  };
}

// Get month-over-month change
function momChange(data) {
  const months = data?.months || [];
  if (months.length < 2) return null;

  const sorted = [...months]
    .filter(m => m.value !== '' && m.value !== null)
    .sort((a, b) => {
      const da = a.date || `${a.year}-${a.month}`;
      const db = b.date || `${b.year}-${b.month}`;
      return db.localeCompare(da);
    });

  if (sorted.length < 2) return null;
  const curr = parseFloat(sorted[0].value);
  const prev = parseFloat(sorted[1].value);
  if (isNaN(curr) || isNaN(prev) || prev === 0) return null;

  return {
    current: curr,
    previous: prev,
    change: +(curr - prev).toFixed(4),
    changePct: +(((curr - prev) / prev) * 100).toFixed(4),
    currentPeriod: sorted[0].date || sorted[0].label,
    previousPeriod: sorted[1].date || sorted[1].label,
  };
}

// Briefing — pull latest UK labour market, CPI, GDP
export async function briefing() {
  const entries = Object.entries(SERIES);
  const responses = await Promise.all(
    entries.map(async ([seriesId, meta]) => {
      try {
        const data = await getSeriesData(seriesId, meta.dataset);
        return { seriesId, meta, data };
      } catch (e) {
        return { seriesId, meta, data: null, error: e.message };
      }
    })
  );

  const indicators = [];
  const signals = [];

  for (const { seriesId, meta, data, error } of responses) {
    if (error || !data) {
      indicators.push({ id: seriesId, label: meta.label, value: null, date: null });
      continue;
    }

    const latest = extractLatest(data);
    const mom = momChange(data);

    if (!latest) {
      indicators.push({ id: seriesId, label: meta.label, value: null, date: null });
      continue;
    }

    indicators.push({
      id: seriesId,
      label: meta.label,
      value: latest.value,
      period: latest.period,
      date: latest.period,
      momChange: mom?.change ?? null,
      momChangePct: mom?.changePct ?? null,
    });

    // Generate signals
    if (seriesId === 'MGSX' && latest.value > 5.0) {
      signals.push(`UK unemployment elevated at ${latest.value}%`);
    }
    if (seriesId === 'D7G7' && latest.value > 4.0) {
      signals.push(`UK CPI elevated at ${latest.value}% — above BoE 2% target`);
    }
    if (seriesId === 'IHYP' && latest.value < 0) {
      signals.push(`UK GDP contracted ${latest.value}% — recession risk`);
    }
    if (seriesId === 'KA6D' && mom && mom.change > 20) {
      signals.push(`Claimant count surged by ${mom.change}K`);
    }
  }

  return {
    source: 'ONS',
    timestamp: new Date().toISOString(),
    indicators,
    signals,
  };
}

if (process.argv[1]?.endsWith('bls.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
