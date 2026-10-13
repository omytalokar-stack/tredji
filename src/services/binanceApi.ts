/**
 * Live Binance REST and Market Service
 * Fetches real market prices, 24h tickers, and klines directly from Binance.
 * NO MOCK DATA.
 */
import { Candle, LiveCoinTicker, BinanceSearchResult, Timeframe } from '../types/crypto';

// Primary and fallback Binance REST endpoints
const BINANCE_REST_ENDPOINTS = [
  'https://api.binance.com/api/v3',
  'https://data-api.binance.vision/api/v3',
  'https://api1.binance.com/api/v3',
  'https://api3.binance.com/api/v3',
];

/**
 * Fetch with automatic mirror fallback
 */
async function fetchBinanceWithFallback<T>(path: string): Promise<T> {
  let lastError: Error | null = null;
  let rateLimitError: Error | null = null;

  for (const baseUrl of BINANCE_REST_ENDPOINTS) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 418 || response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          rateLimitError = new Error(
            `Binance rate limit response HTTP ${response.status}${retryAfter ? `; retry after ${retryAfter}s` : ''}`
          );
          throw rateLimitError;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data as T;
    } catch (err: any) {
      lastError = err;
      // try next mirror
    }
  }

  throw rateLimitError || lastError || new Error('Failed to reach Binance REST API');
}

/**
 * Fetches the latest real Binance candles for a requested timeframe.
 */
export async function fetchLiveKlines(
  symbol: string,
  interval: Timeframe = '1m',
  limit = 100
): Promise<Candle[]> {
  const rawKlines = await fetchBinanceWithFallback<any[][]>(
    `/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`
  );

  if (!Array.isArray(rawKlines) || rawKlines.length !== limit) {
    throw new Error(`No candle data returned from Binance for ${symbol}`);
  }

  const candles = rawKlines.map((k) => ({
    openTime: Number(k[0]),
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]),
    closeTime: Number(k[6]),
    quoteVolume: Number(k[7]),
    takerBuyVolume: Number(k[9]),
    isClosed: Number(k[6]) < Date.now(),
  }));

  if (
    candles.some((candle) =>
      [
        candle.openTime,
        candle.closeTime,
        candle.open,
        candle.high,
        candle.low,
        candle.close,
        candle.volume,
        candle.quoteVolume,
        candle.takerBuyVolume,
      ].some((value) => !Number.isFinite(value))
    )
  ) {
    throw new Error(`Binance returned invalid candle data for ${symbol} ${interval}`);
  }
  return candles;
}

/**
 * Fetches 24-hour ticker statistics for a specific symbol
 */
export async function fetch24hTicker(symbol: string): Promise<LiveCoinTicker> {
  const data = await fetchBinanceWithFallback<any>(
    `/ticker/24hr?symbol=${encodeURIComponent(symbol)}`
  );

  const baseAsset = symbol.replace(/USDT$|BUSD$|USDC$/, '');
  const quoteAsset = symbol.substring(baseAsset.length) || 'USDT';

  return {
    symbol: data.symbol,
    baseAsset,
    quoteAsset,
    price: parseFloat(data.lastPrice),
    priceChangePercent: parseFloat(data.priceChangePercent),
    high24h: parseFloat(data.highPrice),
    low24h: parseFloat(data.lowPrice),
    volume24h: parseFloat(data.volume),
    quoteVolume24h: parseFloat(data.quoteVolume),
    lastUpdated: Date.now(),
  };
}

/**
 * Fetches all active USDT pairs from Binance for the Search Modal
 */
export async function searchBinanceTickers(searchQuery: string): Promise<BinanceSearchResult[]> {
  const allTickers = await fetchBinanceWithFallback<any[]>('/ticker/24hr');

  if (!Array.isArray(allTickers)) {
    throw new Error('Failed to load Binance tickers');
  }

  const query = searchQuery.trim().toUpperCase();

  // Filter only USDT pairs with valid quote volume
  const usdtPairs = allTickers.filter((item) => {
    const sym = item.symbol || '';
    if (!sym.endsWith('USDT')) return false;
    // Exclude leveraged tokens like BTCUP, BTCDOWN, BEAR, BULL
    if (sym.includes('UPUSDT') || sym.includes('DOWNUSDT') || sym.includes('BULLUSDT') || sym.includes('BEARUSDT')) {
      return false;
    }
    return true;
  });

  const filtered = usdtPairs
    .filter((item) => {
      if (!query) return true;
      const base = item.symbol.replace('USDT', '');
      return base.includes(query) || item.symbol.includes(query);
    })
    .map((item) => ({
      symbol: item.symbol,
      baseAsset: item.symbol.replace('USDT', ''),
      price: parseFloat(item.lastPrice),
      priceChangePercent: parseFloat(item.priceChangePercent),
      quoteVolume: parseFloat(item.quoteVolume),
    }))
    // Sort by 24h trading volume so top liquid coins appear first
    .sort((a, b) => b.quoteVolume - a.quoteVolume);

  return filtered.slice(0, 30); // Return top 30 matching liquid coins
}
