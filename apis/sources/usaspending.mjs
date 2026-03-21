// UK Government Contracts & Defence Spending
// Replaces USAspending (US Federal spending).
// Uses Contracts Finder API (Crown Commercial Service) and GOV.UK open data.
// No auth required.

import { safeFetch, daysAgo } from '../utils/fetch.mjs';

const CONTRACTS_FINDER_BASE = 'https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search';

// Search recent UK government contracts
export async function searchContracts(opts = {}) {
  const {
    keyword = 'defence',
    limit = 20,
    publishedFrom = daysAgo(30),
    publishedTo = daysAgo(0),
  } = opts;

  const params = new URLSearchParams({
    keyword,
    publishedFrom,
    publishedTo,
    size: String(limit),
  });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(`${CONTRACTS_FINDER_BASE}?${params}`, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });
    clearTimeout(timer);
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      return { error: `HTTP ${res.status}: ${errBody.slice(0, 300)}`, results: [] };
    }
    return res.json();
  } catch (e) {
    return { error: e.message, results: [] };
  }
}

// Search for MoD / defence-specific contracts
export async function getDefenceContracts(days = 30) {
  return searchContracts({
    keyword: 'defence military',
    limit: 20,
    publishedFrom: daysAgo(days),
    publishedTo: daysAgo(0),
  });
}

// Search for broader government spending notices
export async function getGovernmentContracts(days = 30) {
  return searchContracts({
    keyword: '',
    limit: 20,
    publishedFrom: daysAgo(days),
    publishedTo: daysAgo(0),
  });
}

// Extract contract info from OCDS release format
function extractContract(release) {
  const tender = release?.tender || {};
  const awards = release?.awards || [];
  const buyer = release?.buyer || {};

  const award = awards[0] || {};
  const supplier = award?.suppliers?.[0] || {};

  return {
    title: tender.title || release?.tag?.[0] || 'Untitled',
    description: (tender.description || '').slice(0, 300),
    buyer: buyer.name || 'Unknown',
    value: tender.value?.amount || award?.value?.amount || null,
    currency: tender.value?.currency || award?.value?.currency || 'GBP',
    supplier: supplier.name || null,
    publishedDate: release?.date || release?.publishedDate || null,
    status: tender.status || null,
    region: tender.deliveryLocation?.description || null,
  };
}

// Briefing — recent UK government and defence contracts
export async function briefing() {
  const [defence, general] = await Promise.all([
    getDefenceContracts(14),
    getGovernmentContracts(14),
  ]);

  const defenceReleases = defence?.releases || [];
  const generalReleases = general?.releases || [];

  return {
    source: 'UK Contracts Finder',
    timestamp: new Date().toISOString(),
    recentDefenceContracts: defenceReleases.slice(0, 10).map(extractContract),
    recentGovernmentContracts: generalReleases.slice(0, 10).map(extractContract),
    ...(defence?.error ? { defenceError: defence.error } : {}),
    ...(general?.error ? { generalError: general.error } : {}),
  };
}

if (process.argv[1]?.endsWith('usaspending.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
