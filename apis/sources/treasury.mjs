// UK Debt Management Office & HM Treasury — Government debt, gilt yields, fiscal data
// Replaces US Treasury Fiscal Data. No auth required.

import { safeFetch, today, daysAgo } from '../utils/fetch.mjs';

const DMO_BASE = 'https://www.dmo.gov.uk/data';

// Fetch UK gilt yield data from DMO
async function getGiltYields() {
  // DMO provides gilt data via their website; we use the XML/JSON feeds
  // Fall back to BoE gilt yield data which is more reliably available as JSON
  const endDate = today();
  const startDate = daysAgo(30);
  const params = new URLSearchParams({
    'Datefrom': startDate.replace(/-/g, '/').replace(/^(\d{4})\/(\d{2})\/(\d{2})$/, '$3/$2/$1'),
    'Dateto': endDate.replace(/-/g, '/').replace(/^(\d{4})\/(\d{2})\/(\d{2})$/, '$3/$2/$1'),
    'SeriesCodes': 'IUDMNZC,IUDMNPY,IUDMNOL',
    'CSVF': 'TN',
    'UsingCodes': 'Y',
    'VPD': 'Y',
    'VFD': 'N',
  });
  return safeFetch(
    `https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?${params}`,
    { raw: true }
  );
}

// Parse BoE CSV for gilt yields
function parseGiltYields(text) {
  if (!text || typeof text !== 'string') return [];
  const lines = text.split('\n').filter(l => l.trim());
  const records = [];
  for (const line of lines) {
    // Format: DATE, 2Y_YIELD, 10Y_YIELD, 30Y_YIELD
    const parts = line.split(',').map(s => s.trim());
    const dateMatch = parts[0]?.match(/\d{2}\s\w{3}\s\d{4}/);
    if (dateMatch) {
      const values = parts.slice(1).map(v => parseFloat(v)).filter(v => !isNaN(v));
      if (values.length > 0) {
        records.push({
          date: dateMatch[0],
          gilt2y: values[0] ?? null,
          gilt10y: values[1] ?? null,
          gilt30y: values[2] ?? null,
        });
      }
    }
  }
  records.sort((a, b) => new Date(b.date) - new Date(a.date));
  return records;
}

// Fetch UK government debt data from ONS
async function getUKDebt() {
  // ONS public finance series: RUTN = PSND ex (public sector net debt excluding banks)
  return safeFetch(
    `https://api.ons.gov.uk/timeseries/RUTN/dataset/PUSF/data`,
    { timeout: 15000 }
  );
}

// Briefing — UK government debt and gilt yields
export async function briefing() {
  const [giltText, debtData] = await Promise.all([
    getGiltYields(),
    getUKDebt(),
  ]);

  const giltRecords = parseGiltYields(giltText);
  const signals = [];

  // Process gilt yields
  const latestGilt = giltRecords[0];
  if (latestGilt) {
    if (latestGilt.gilt10y > 5) {
      signals.push(`10-Year Gilt yield elevated at ${latestGilt.gilt10y}%`);
    }
    if (latestGilt.gilt2y && latestGilt.gilt10y && latestGilt.gilt2y > latestGilt.gilt10y) {
      signals.push(`UK GILT CURVE INVERTED: 2Y (${latestGilt.gilt2y}%) > 10Y (${latestGilt.gilt10y}%)`);
    }
  }

  // Process UK debt
  const months = debtData?.months || debtData?.quarters || [];
  const sortedDebt = [...months]
    .filter(m => m.value !== '' && m.value !== null)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 5);

  const latestDebt = sortedDebt[0];
  if (latestDebt) {
    const debtPct = parseFloat(latestDebt.value);
    if (!isNaN(debtPct) && debtPct > 100) {
      signals.push(`UK public sector net debt at ${debtPct}% of GDP`);
    }
  }

  return {
    source: 'HM Treasury / DMO',
    timestamp: new Date().toISOString(),
    giltYields: giltRecords.slice(0, 10).map(r => ({
      date: r.date,
      gilt2y: r.gilt2y,
      gilt10y: r.gilt10y,
      gilt30y: r.gilt30y,
    })),
    debt: sortedDebt.map(d => ({
      date: d.date || d.label,
      value: d.value,
      unit: 'percent of GDP',
    })),
    signals,
  };
}

if (process.argv[1]?.endsWith('treasury.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
