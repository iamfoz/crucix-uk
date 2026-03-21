// Yahoo Finance — Live UK & Global Market Quotes (no API key required)
// UK-centric: FTSE indices, UK blue chips, Gilts, GBP pairs, plus global commodities/crypto

import { safeFetch } from '../utils/fetch.mjs';

const BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

// UK-centric symbols
const SYMBOLS = {
  // UK Indices
  '^FTSE': 'FTSE 100',
  '^FTMC': 'FTSE 250',
  '^FTAI': 'FTSE AIM All-Share',
  // UK Blue Chips (London-listed)
  'SHEL.L': 'Shell',
  'AZN.L': 'AstraZeneca',
  'HSBA.L': 'HSBC',
  'ULVR.L': 'Unilever',
  'BP.L': 'BP',
  'LLOY.L': 'Lloyds Banking',
  'RIO.L': 'Rio Tinto',
  'BAE.L': 'BAE Systems',
  // UK Gilts / Bond ETFs
  'IGLT.L': 'iShares UK Gilts',
  'INXG.L': 'iShares Index-Linked Gilts',
  // GBP Currency Pairs
  'GBPUSD=X': 'GBP/USD',
  'GBPEUR=X': 'GBP/EUR',
  // Global Reference (S&P 500 for comparison)
  'SPY': 'S&P 500',
  // Commodities
  'GC=F': 'Gold',
  'BZ=F': 'Brent Crude',
  // Crypto (GBP-denominated)
  'BTC-GBP': 'Bitcoin (GBP)',
  'ETH-GBP': 'Ethereum (GBP)',
  // Volatility
  '^VIX': 'VIX',
};

async function fetchQuote(symbol) {
  try {
    const url = `${BASE}/${encodeURIComponent(symbol)}?range=5d&interval=1d&includePrePost=false`;
    const data = await safeFetch(url, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta || {};
    const quotes = result.indicators?.quote?.[0] || {};
    const closes = quotes.close || [];
    const timestamps = result.timestamp || [];

    // Get current price and previous close
    const price = meta.regularMarketPrice ?? closes[closes.length - 1];
    const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? closes[closes.length - 2];
    const change = price && prevClose ? price - prevClose : 0;
    const changePct = prevClose ? (change / prevClose) * 100 : 0;

    // Build 5-day history
    const history = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] != null) {
        history.push({
          date: new Date(timestamps[i] * 1000).toISOString().split('T')[0],
          close: Math.round(closes[i] * 100) / 100,
        });
      }
    }

    return {
      symbol,
      name: SYMBOLS[symbol] || meta.shortName || symbol,
      price: Math.round(price * 100) / 100,
      prevClose: Math.round((prevClose || 0) * 100) / 100,
      change: Math.round(change * 100) / 100,
      changePct: Math.round(changePct * 100) / 100,
      currency: meta.currency || 'GBP',
      exchange: meta.exchangeName || '',
      marketState: meta.marketState || 'UNKNOWN',
      history,
    };
  } catch (e) {
    return { symbol, name: SYMBOLS[symbol] || symbol, error: e.message };
  }
}

export async function briefing() {
  return collect();
}

export async function collect() {
  const symbols = Object.keys(SYMBOLS);
  const results = await Promise.allSettled(
    symbols.map(s => fetchQuote(s))
  );

  const quotes = {};
  let ok = 0;
  let failed = 0;

  for (const r of results) {
    const q = r.status === 'fulfilled' ? r.value : null;
    if (q && !q.error) {
      quotes[q.symbol] = q;
      ok++;
    } else {
      failed++;
      const sym = q?.symbol || 'unknown';
      quotes[sym] = q || { symbol: sym, error: 'fetch failed' };
    }
  }

  // Categorize for easy dashboard consumption
  return {
    quotes,
    summary: {
      totalSymbols: symbols.length,
      ok,
      failed,
      timestamp: new Date().toISOString(),
    },
    indexes: pickGroup(quotes, ['^FTSE', '^FTMC', '^FTAI', 'SPY']),
    ukStocks: pickGroup(quotes, ['SHEL.L', 'AZN.L', 'HSBA.L', 'ULVR.L', 'BP.L', 'LLOY.L', 'RIO.L', 'BAE.L']),
    gilts: pickGroup(quotes, ['IGLT.L', 'INXG.L']),
    forex: pickGroup(quotes, ['GBPUSD=X', 'GBPEUR=X']),
    commodities: pickGroup(quotes, ['GC=F', 'BZ=F']),
    crypto: pickGroup(quotes, ['BTC-GBP', 'ETH-GBP']),
    volatility: pickGroup(quotes, ['^VIX']),
  };
}

function pickGroup(quotes, symbols) {
  return symbols.map(s => quotes[s]).filter(Boolean);
}
