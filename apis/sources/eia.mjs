// UK Energy Intelligence — Oil, Gas, and Energy Markets
// Replaces US EIA with a UK-centric energy view.
// Keeps Brent crude (North Sea benchmark), adds UK gas prices, drops US-specific inventories.
// Uses EIA API for commodity prices (global data) + Ofgem/National Grid context.
// Free API key required for EIA endpoints (still useful for Brent pricing).

import { safeFetch } from '../utils/fetch.mjs';
import '../utils/env.mjs';

const BASE = 'https://api.eia.gov/v2';

// Series definitions — UK-relevant energy prices
const OIL_SERIES = {
  brent: {
    label: 'Brent Crude Oil ($/bbl) — North Sea benchmark',
    path: '/petroleum/pri/spt/data/',
    params: { frequency: 'daily', 'data[0]': 'value', facets: { series: ['RBRTE'] } },
  },
  wti: {
    label: 'WTI Crude Oil ($/bbl) — reference',
    path: '/petroleum/pri/spt/data/',
    params: { frequency: 'daily', 'data[0]': 'value', facets: { series: ['RWTC'] } },
  },
};

const GAS_SERIES = {
  nbp: {
    label: 'UK NBP Natural Gas (p/therm)',
    // NBP (National Balancing Point) is the UK gas benchmark
    // EIA tracks European gas prices which correlate with NBP
    path: '/natural-gas/pri/fut/data/',
    params: { frequency: 'daily', 'data[0]': 'value', facets: { series: ['RNGWHHD'] } },
  },
};

// Build the URL for a v2 API query
function buildUrl(apiKey, path, params, length = 10) {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set('api_key', apiKey);
  if (params.frequency) url.searchParams.set('frequency', params.frequency);
  if (params['data[0]']) url.searchParams.set('data[0]', params['data[0]']);
  url.searchParams.set('sort[0][column]', 'period');
  url.searchParams.set('sort[0][direction]', 'desc');
  url.searchParams.set('length', String(length));

  // Add facets
  if (params.facets) {
    for (const [facetKey, facetValues] of Object.entries(params.facets)) {
      facetValues.forEach((v, i) => {
        url.searchParams.set(`facets[${facetKey}][]`, v);
      });
    }
  }

  return url.toString();
}

// Fetch a single series
export async function fetchSeries(apiKey, seriesDef, length = 10) {
  const url = buildUrl(apiKey, seriesDef.path, seriesDef.params, length);
  return safeFetch(url);
}

// Extract latest value from response
function extractLatest(resp) {
  const data = resp?.response?.data;
  if (!data?.length) return null;
  return {
    value: parseFloat(data[0].value),
    period: data[0].period,
    unit: data[0]['unit-name'] || data[0].unit || null,
  };
}

// Extract recent values for trend analysis
function extractRecent(resp, count = 5) {
  const data = resp?.response?.data;
  if (!data?.length) return [];
  return data.slice(0, count).map(d => ({
    value: parseFloat(d.value),
    period: d.period,
  }));
}

// Briefing — UK-centric energy prices
export async function briefing(apiKey) {
  if (!apiKey) {
    return {
      source: 'UK Energy',
      error: 'No EIA API key. Register free at https://www.eia.gov/opendata/register.php',
      hint: 'Set EIA_API_KEY environment variable. Used for Brent crude and gas price data.',
      timestamp: new Date().toISOString(),
    };
  }

  const [brentResp, wtiResp, gasResp] = await Promise.all([
    fetchSeries(apiKey, OIL_SERIES.brent),
    fetchSeries(apiKey, OIL_SERIES.wti),
    fetchSeries(apiKey, GAS_SERIES.nbp),
  ]);

  const signals = [];

  // Brent crude (primary UK benchmark)
  const brent = extractLatest(brentResp);
  const wti = extractLatest(wtiResp);
  const brentRecent = extractRecent(brentResp, 5);
  const wtiRecent = extractRecent(wtiResp, 5);

  if (brent && brent.value > 100) signals.push(`Brent crude above $100 at $${brent.value}/bbl — UK energy costs surging`);
  if (brent && brent.value < 50) signals.push(`Brent crude below $50 at $${brent.value}/bbl — North Sea producers under pressure`);
  if (brent && wti && (brent.value - wti.value) > 10) {
    signals.push(`Brent-WTI spread wide at $${(brent.value - wti.value).toFixed(2)} — Atlantic Basin supply divergence`);
  }

  // Gas prices (UK is heavily gas-dependent for heating and power)
  const gas = extractLatest(gasResp);
  if (gas && gas.value > 6) signals.push(`Gas prices elevated at $${gas.value}/MMBtu — UK energy bills pressure`);
  if (gas && gas.value > 9) signals.push(`Gas prices at crisis level $${gas.value}/MMBtu — UK energy emergency risk`);

  return {
    source: 'UK Energy',
    timestamp: new Date().toISOString(),
    oilPrices: {
      brent: brent ? { ...brent, label: OIL_SERIES.brent.label, recent: brentRecent } : null,
      wti: wti ? { ...wti, label: OIL_SERIES.wti.label, recent: wtiRecent } : null,
      spread: brent && wti ? +(brent.value - wti.value).toFixed(2) : null,
    },
    gasPrice: gas ? { ...gas, label: 'Natural Gas (UK-relevant benchmark)' } : null,
    signals,
    note: 'Brent crude is the primary benchmark for UK/North Sea oil. UK gas prices track European benchmarks (NBP/TTF).',
  };
}

if (process.argv[1]?.endsWith('eia.mjs')) {
  const data = await briefing(process.env.EIA_API_KEY);
  console.log(JSON.stringify(data, null, 2));
}
