/**
 * TrapDetector AI
 * Live Binance Market Data & Rule-Based Pattern Analysis
 * Connected strictly to Binance combined ticker streams.
 * ZERO MOCK DATA. NO FAKE ARRAYS. NO RANDOM NUMBERS.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { fetchLiveKlines } from './services/binanceApi';
import { fetchMarketStatus, MarketStatusSnapshot, submitMarketHistory } from './services/marketStatusApi';
import { fetchPushPublicKey, subscribeForPush, unsubscribeFromPush } from './services/pushNotifications';
import { analyzeMarketTrap } from './utils/trapEngine';
import { getSignalDirection } from './utils/tradeSignals';
import { TopHeader } from './components/TopHeader';
import { MainTrapCard } from './components/MainTrapCard';
import { CoinsDrawer } from './components/CoinsDrawer';
import { SelectedCoinsModal } from './components/SelectedCoinsModal';
import { SearchTickerModal } from './components/SearchTickerModal';
import { BottomNavBar } from './components/BottomNavBar';
import { SettingsModal } from './components/SettingsModal';
import { TradeAlertModal } from './components/TradeAlertModal';
import { OrderHistoryPage, ProfilePage } from './components/PaperTradingPages';
import { usePaperTradingContext } from './hooks/usePaperTrading';
import {
  LiveCoinTicker,
  Candle,
  TrapAnalysis,
  BinanceSearchResult,
  MultiTimeframeCandles,
  Timeframe,
} from './types/crypto';
import { BeforeInstallPromptEvent } from './types/pwa';
import { AlertPreferences, isAlertVoiceStyle } from './types/alerts';
import { PaperTradeDirection } from './types/paperTrading';
import { ShieldAlert, Target, AlertOctagon, HelpCircle, ChevronDown, ChevronUp, Settings } from 'lucide-react';

const MAX_COINS = 5;
const STORAGE_KEY = 'trapdetector_selected_coins_v3';
const INITIAL_COINS = ['btcusdt', 'ethusdt', 'bnbusdt', 'solusdt', 'xrpusdt'];
const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m'];
const CANDLE_HISTORY_LIMIT = 120;
const ALERT_PREFERENCES_KEY = 'trapdetector_alert_preferences_v1';
const DEFAULT_ALERT_PREFERENCES: AlertPreferences = {
  browserNotifications: false,
  voiceAlerts: false,
  voiceStyle: 'trade',
};

function readAlertPreferences(): AlertPreferences {
  try {
    const saved = localStorage.getItem(ALERT_PREFERENCES_KEY);
    if (!saved) return DEFAULT_ALERT_PREFERENCES;
    const parsed: unknown = JSON.parse(saved);
    if (!parsed || typeof parsed !== 'object') return DEFAULT_ALERT_PREFERENCES;
    const preferences = parsed as Record<string, unknown>;
    return {
      browserNotifications: preferences.browserNotifications === true,
      voiceAlerts: preferences.voiceAlerts === true,
      voiceStyle: isAlertVoiceStyle(preferences.voiceStyle)
          ? preferences.voiceStyle
          : DEFAULT_ALERT_PREFERENCES.voiceStyle,
    };
  } catch {
    return DEFAULT_ALERT_PREFERENCES;
  }
}

function emptyTimeframes(): MultiTimeframeCandles {
  return { '1m': [], '5m': [], '15m': [] };
}

function mergeCandles(existing: Candle[], incoming: Candle[]): Candle[] {
  const byOpenTime = new Map<number, Candle>();
  for (const candle of existing) byOpenTime.set(candle.openTime, candle);
  for (const candle of incoming) {
    const previous = byOpenTime.get(candle.openTime);
    if (!previous || candle.isClosed || candle.closeTime >= previous.closeTime) {
      byOpenTime.set(candle.openTime, candle);
    }
  }
  return [...byOpenTime.values()]
    .sort((a, b) => a.openTime - b.openTime)
    .slice(-CANDLE_HISTORY_LIMIT);
}

export default function App() {
  const [appRoute, setAppRoute] = useState<'radar' | 'profile' | 'order-history'>(() => {
    if (window.location.pathname === '/profile') return 'profile';
    if (window.location.pathname === '/order-history') return 'order-history';
    return 'radar';
  });
  const [tradeDraft, setTradeDraft] = useState<TrapAnalysis | null>(null);
  const [tradeEntryPrice, setTradeEntryPrice] = useState<number | null>(null);
  const [tradeAlert, setTradeAlert] = useState<TrapAnalysis | null>(null);
  const paperTrading = usePaperTradingContext();
  const paperTradeSymbols = useMemo(
    () => [...new Set(paperTrading.trades
      .filter((trade) => trade.status === 'OPEN')
      .map((trade) => trade.symbol))],
    [paperTrading.trades]
  );

  const navigateTo = useCallback((route: 'radar' | 'profile' | 'order-history') => {
    const path = route === 'radar' ? '/' : `/${route}`;
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    setAppRoute(route);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setAppRoute(
        window.location.pathname === '/order-history'
          ? 'order-history'
          : window.location.pathname === '/profile'
            ? 'profile'
            : 'radar'
      );
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // 1. Mandatory State Management per strict instruction:
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [apiError, setApiError] = useState("");

  // Monitored coins state (Strict validation: max 5 coins)
  const [selectedCoins, setSelectedCoins] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length >= 1 && parsed.length <= MAX_COINS) {
          return parsed.map((s: string) => s.toUpperCase());
        }
      }
    } catch {
      // fallback to initial
    }
    return INITIAL_COINS.map((symbol) => symbol.toUpperCase());
  });

  const [activeSymbol, setActiveSymbol] = useState<string>('BTCUSDT');

  // Real-time market state streamed directly from Binance
  const [tickersMap, setTickersMap] = useState<Record<string, LiveCoinTicker>>({});
  const [candlesMap, setCandlesMap] = useState<Record<string, MultiTimeframeCandles>>({});
  const [allStreamedTickers, setAllStreamedTickers] = useState<BinanceSearchResult[]>([]);
  const [priceFlash, setPriceFlash] = useState<Record<string, 'up' | 'down' | null>>({});
  const [lastStreamTick, setLastStreamTick] = useState<number>(0);
  const [serverAnalyses, setServerAnalyses] = useState<Record<string, TrapAnalysis>>({});
  const [marketWorkerStatus, setMarketWorkerStatus] = useState<MarketStatusSnapshot['status'] | 'offline'>('warming_up');
  const [marketStatus, setMarketStatus] = useState<{ status: 'active' | 'warming_up'; readySymbols: number; lastError: string | null }>({
    status: 'warming_up',
    readySymbols: 0,
    lastError: null,
  });
  const [hasServerMarketData, setHasServerMarketData] = useState(false);

  // Modals & Drawers
  const [isSelectedCoinsOpen, setIsSelectedCoinsOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isCoinsDrawerOpen, setIsCoinsDrawerOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isPwaInstalled, setIsPwaInstalled] = useState(() =>
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
  const [installError, setInstallError] = useState('');
  const [alertPreferences, setAlertPreferences] = useState<AlertPreferences>(readAlertPreferences);
  const [pushSubscriptionActive, setPushSubscriptionActive] = useState(false);
  const [pushSetupLoading, setPushSetupLoading] = useState(true);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  );
  const [alertSettingsError, setAlertSettingsError] = useState('');

  useEffect(() => {
    let isCancelled = false;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setNotificationPermission('unsupported');
      setPushSetupLoading(false);
      return;
    }

    const initializePushNotifications = async () => {
      try {
        if (typeof Notification !== 'undefined') {
          setNotificationPermission(Notification.permission);
        }
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (isCancelled) return;
        setPushSubscriptionActive(Boolean(subscription));

        if (subscription) {
          if (!isCancelled) {
            setAlertPreferences((current) => ({ ...current, browserNotifications: true }));
          }
        } else if (
          alertPreferences.browserNotifications &&
          typeof Notification !== 'undefined' &&
          Notification.permission === 'granted'
        ) {
          const publicKey = await fetchPushPublicKey();
          await subscribeForPush(registration, publicKey);
          if (!isCancelled) {
            setPushSubscriptionActive(true);
            setAlertPreferences((current) => ({ ...current, browserNotifications: true }));
          }
        } else if (!isCancelled) {
          setAlertPreferences((current) => ({ ...current, browserNotifications: false }));
        }
      } catch (error) {
        console.error('Unable to initialize background push notifications.', error);
        if (!isCancelled) {
          setPushSubscriptionActive(false);
          setAlertPreferences((current) => ({ ...current, browserNotifications: false }));
          setAlertSettingsError(
            error instanceof Error
              ? `Could not restore push notifications: ${error.message}`
              : 'Could not restore push notifications on this device. Try enabling them again in Settings.'
          );
        }

      } finally {
        if (!isCancelled) {
          setPushSetupLoading(false);
        }
      }
    };

    void initializePushNotifications();
    return () => {
      isCancelled = true;
    };
  }, []);

  const prevPricesRef = useRef<Record<string, number>>({});
  const previousSignalTypesRef = useRef<Record<string, TrapAnalysis['signalType']>>({});
  const selectedCoinsRef = useRef<string[]>(selectedCoins);
  const wsRef = useRef<WebSocket | null>(null);
  const priceFlashTimersRef = useRef<Record<string, number>>({});
  const showPriceFlash = useCallback((symbol: string, direction: 'up' | 'down') => {
    setPriceFlash((current) => ({ ...current, [symbol]: direction }));
    const previousTimer = priceFlashTimersRef.current[symbol];
    if (previousTimer !== undefined) window.clearTimeout(previousTimer);
    priceFlashTimersRef.current[symbol] = window.setTimeout(() => {
      setPriceFlash((current) => ({ ...current, [symbol]: null }));
      delete priceFlashTimersRef.current[symbol];
    }, 500);
  }, []);

  useEffect(() => {
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setIsPwaInstalled(true);
      setInstallPrompt(null);
      setInstallError('');
    };
    const standaloneQuery = window.matchMedia('(display-mode: standalone)');
    const updateStandaloneState = () => {
      setIsPwaInstalled(
        standaloneQuery.matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true
      );
    };

    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    standaloneQuery.addEventListener('change', updateStandaloneState);
    updateStandaloneState();

    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
      standaloneQuery.removeEventListener('change', updateStandaloneState);
    };
  }, []);

  const installApplication = useCallback(async () => {
    if (!installPrompt) return;
    setInstallError('');
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === 'accepted') setIsPwaInstalled(true);
      setInstallPrompt(null);
    } catch (error) {
      console.error('Unable to prompt for TrapDetector installation.', error);
      setInstallError('The browser could not start installation. Please try the browser menu.');
    }
  }, [installPrompt]);

  useEffect(() => {
    try {
      localStorage.setItem(ALERT_PREFERENCES_KEY, JSON.stringify(alertPreferences));
    } catch (error) {
      console.warn('Unable to save notification and sound preferences.', error);
    }
  }, [alertPreferences]);

  const toggleBrowserNotifications = useCallback(async () => {
    setAlertSettingsError('');
    setPushSetupLoading(true);
    if (pushSubscriptionActive) {
      try {
        if ('serviceWorker' in navigator && 'PushManager' in window) {
          const registration = await navigator.serviceWorker.ready;
          await unsubscribeFromPush(registration);
        }
        setPushSubscriptionActive(false);
        setAlertPreferences((current) => ({ ...current, browserNotifications: false }));
      } catch (error) {
        console.error('Unable to disable push notifications on this device.', error);
        setAlertSettingsError(
          error instanceof Error
            ? `Could not disable push notifications: ${error.message}`
            : 'Could not disable push notifications. Please try again.'
        );
      } finally {
        setPushSetupLoading(false);
      }
      return;
    }
    if (typeof Notification === 'undefined') {
      setNotificationPermission('unsupported');
      setAlertSettingsError('Browser notifications are not supported in this browser.');
      setPushSetupLoading(false);
      return;
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setNotificationPermission('unsupported');
      setAlertSettingsError('Background push notifications are not supported in this browser.');
      setPushSetupLoading(false);
      return;
    }

    try {
      const publicKey = await fetchPushPublicKey();
      const permission = Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission === 'granted') {
        const registration = await navigator.serviceWorker.ready;
        await subscribeForPush(registration, publicKey);
        setPushSubscriptionActive(true);
        setAlertPreferences((current) => ({ ...current, browserNotifications: true }));
      } else if (permission === 'denied') {
        setAlertSettingsError('Notification permission was denied. Enable it in your browser site settings.');
      } else {
        setAlertSettingsError('Notifications remain off until browser permission is granted.');
      }
    } catch (error) {
      console.error('Unable to request browser notification permission.', error);
      setAlertSettingsError(
        error instanceof Error
          ? `Could not enable push notifications: ${error.message}`
          : 'Could not enable push notifications. Check your browser settings.'
      );
    } finally {
      setPushSetupLoading(false);
    }
  }, [pushSubscriptionActive]);

  const speakAlert = useCallback((message: string) => {
    if (!('speechSynthesis' in window)) {
      setAlertSettingsError('Voice alerts are not supported by this browser.');
      return;
    }
    try {
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.lang = 'en-US';
      utterance.rate = 1.05;
      utterance.pitch = 1.1;
      utterance.onerror = (event) => {
        console.warn('Voice alert could not be played.', event.error);
      };
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      console.error('Unable to play voice alert.', error);
      setAlertSettingsError('Voice alert could not be played by this browser.');
    }
  }, []);

  const testVoiceAlert = useCallback(() => {
    setAlertSettingsError('');
    const phrase = alertPreferences.voiceStyle === 'trade'
      ? 'Trade trade trade trade trade!'
      : alertPreferences.voiceStyle === 'paisa'
        ? 'Paisa paisa paisa!'
        : 'TrapDetector voice alerts are ready.';
    speakAlert(phrase);
  }, [alertPreferences.voiceStyle, speakAlert]);

  const analyses = useMemo(() => {
    const nextAnalyses: Record<string, TrapAnalysis> = {};
    for (const symbol of selectedCoins) {
      const serverAnalysis = serverAnalyses[symbol];
      if (serverAnalysis) {
        nextAnalyses[symbol] = serverAnalysis;
        continue;
      }
      const ticker = tickersMap[symbol];
      const candles = candlesMap[symbol];
      if (!ticker || !candles) continue;
      const analysis = analyzeMarketTrap(ticker, candles);
      if (analysis) nextAnalyses[symbol] = analysis;
    }
    return nextAnalyses;
  }, [candlesMap, selectedCoins, serverAnalyses, tickersMap]);

  useEffect(() => {
    let isCancelled = false;
    let requestInProgress = false;
    let timer: number | undefined;
    let activeRequest: AbortController | undefined;

    const pollMarketStatus = async () => {
      if (requestInProgress || isCancelled) return;
      requestInProgress = true;
      activeRequest = new AbortController();
      try {
        const snapshot = await fetchMarketStatus(selectedCoins, activeRequest.signal);
        if (isCancelled) return;
        setMarketWorkerStatus(snapshot.status);
        setMarketStatus({
          status: snapshot.status === 'live' ? 'active' : 'warming_up',
          readySymbols: snapshot.readySymbols,
          lastError: snapshot.lastError,
        });
        setHasServerMarketData(snapshot.symbols.some((item) => item.ticker !== null));
        if (snapshot.updatedAt) setLastStreamTick(snapshot.updatedAt);
        const nextAnalyses: Record<string, TrapAnalysis> = {};
        const nextTickers: Record<string, LiveCoinTicker> = {};
        const nextCandles: Record<string, MultiTimeframeCandles> = {};
        for (const item of snapshot.symbols) {
          if (item.analysis) nextAnalyses[item.symbol] = item.analysis;
          if (item.ticker) nextTickers[item.symbol] = item.ticker;
          nextCandles[item.symbol] = item.candles;
        }
        setServerAnalyses(nextAnalyses);
        setTickersMap((previous) => ({ ...previous, ...nextTickers }));
        setCandlesMap((previous) => {
          const merged = { ...previous };
          for (const [symbol, incoming] of Object.entries(nextCandles)) {
            const existing = merged[symbol] ?? emptyTimeframes();
            merged[symbol] = {
              '1m': mergeCandles(existing['1m'], incoming['1m']),
              '5m': mergeCandles(existing['5m'], incoming['5m']),
              '15m': mergeCandles(existing['15m'], incoming['15m']),
            };
          }
          return merged;
        });
      } catch (error) {
        if (!isCancelled && !(error instanceof DOMException && error.name === 'AbortError')) {
          setMarketWorkerStatus('offline');
          setMarketStatus({
            status: 'warming_up',
            readySymbols: 0,
            lastError: error instanceof Error ? error.message : 'Unable to fetch backend market status.',
          });
          console.warn('Unable to fetch backend market status; continuing with available live data.', error);
        }
      } finally {
        requestInProgress = false;
        if (!isCancelled) timer = window.setTimeout(() => void pollMarketStatus(), 5_000);
      }
    };

    const refreshOnFocus = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      void pollMarketStatus();
    };
    window.addEventListener('focus', refreshOnFocus);
    void pollMarketStatus();

    return () => {
      isCancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      activeRequest?.abort();
      window.removeEventListener('focus', refreshOnFocus);
    };
  }, [selectedCoins]);

  useEffect(() => {
    for (const symbol of selectedCoins) {
      const analysis = analyses[symbol];
      if (!analysis || (!isLiveConnected && !hasServerMarketData)) continue;

      const previousSignal = previousSignalTypesRef.current[symbol];
      previousSignalTypesRef.current[symbol] = analysis.signalType;
      if (
        previousSignal === analysis.signalType ||
        analysis.signalType === 'NEUTRAL_SCANNING'
      ) {
        continue;
      }

      if (
        appRoute === 'radar' &&
        (analysis.severity === 'CRITICAL' ||
          analysis.severity === 'OPPORTUNITY' ||
          analysis.signalType === 'SCALP_OPPORTUNITY') &&
        Number.isFinite(analysis.currentPrice) &&
        analysis.currentPrice > 0 &&
        Number.isFinite(analysis.suggestedSL) &&
        Number.isFinite(analysis.suggestedTarget)
      ) {
        setTradeAlert((current) => current ?? analysis);
      }

      const actionDescription = analysis.actionType === 'ENTRY'
        ? 'Potential buy pattern detected.'
        : 'Risk alert. Avoid chasing this move.';
      if (alertPreferences.voiceAlerts) {
        const phrase = alertPreferences.voiceStyle === 'trade'
          ? 'Trade trade trade trade trade!'
          : alertPreferences.voiceStyle === 'paisa'
            ? 'Paisa paisa paisa!'
            : 'Signal alert.';
        speakAlert(`${phrase} ${analysis.baseAsset}. ${analysis.headline} ${actionDescription}`);
      }

      if (
        alertPreferences.browserNotifications &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted'
      ) {
        const title = analysis.actionType === 'ENTRY'
          ? `${analysis.baseAsset}: BUY pattern`
          : `${analysis.baseAsset}: Trading risk alert`;
        const body = `${analysis.headline} ${analysis.actionAdvice}`;
        void (async () => {
          try {
            const registration = await navigator.serviceWorker?.getRegistration();
            if (registration) {
              await registration.showNotification(title, {
                body,
                icon: '/icon-192.png',
                tag: `trapdetector-${analysis.symbol}-${analysis.signalType}`,
              });
            } else {
              new Notification(title, { body, icon: '/icon-192.png' });
            }
          } catch (error) {
            console.error(`Unable to show browser notification for ${analysis.symbol}.`, error);
          }
        })();
      }
    }
  }, [alertPreferences, analyses, appRoute, hasServerMarketData, isLiveConnected, selectedCoins, speakAlert]);

  useEffect(() => {
    selectedCoinsRef.current = selectedCoins;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedCoins));
    } catch {
      // storage quiet
    }
  }, [selectedCoins]);

  useEffect(() => {
    if (!selectedCoins.includes(activeSymbol)) {
      setActiveSymbol(selectedCoins[0] || 'BTCUSDT');
    }
  }, [selectedCoins, activeSymbol]);

  // Bootstrap all analysis timeframes once per selection; sequential requests avoid bursts.
  useEffect(() => {
    let isCancelled = false;

    const syncBrowserHistory = async (
      symbol: string,
      timeframe: Timeframe,
      candles: Candle[]
    ) => {
      let attempt = 0;
      while (!isCancelled) {
        try {
          await submitMarketHistory(symbol, timeframe, candles);
          return;
        } catch (error) {
          if (isCancelled) return;
          const retryDelay = Math.min(1000 * (2 ** Math.min(attempt, 5)), 30_000);
          attempt += 1;
          console.warn(
            `Unable to sync Binance ${timeframe} candles to the backend for ${symbol}; retrying in ${retryDelay}ms.`,
            error
          );
          await new Promise((resolve) => window.setTimeout(resolve, retryDelay));
        }
      }
    };

    async function loadInitialCandles() {
      for (const symbol of selectedCoins) {
        for (const timeframe of TIMEFRAMES) {
          if (isCancelled) return;
          try {
            const incoming = await fetchLiveKlines(symbol, timeframe, 100);
            if (isCancelled) return;
            setCandlesMap((previous) => {
              const current = previous[symbol] ?? emptyTimeframes();
              return {
                ...previous,
                [symbol]: {
                  ...current,
                  [timeframe]: mergeCandles(current[timeframe], incoming),
                },
              };
            });
            void syncBrowserHistory(symbol, timeframe, incoming);
          } catch (error) {
            console.warn(`Unable to load Binance ${timeframe} candles for ${symbol}.`, error);
          }
        }
      }
    }

    void loadInitialCandles();

    return () => {
      isCancelled = true;
    };
  }, [selectedCoins]);

  // Refresh higher-timeframe context only at its own interval, never on each market tick.
  useEffect(() => {
    let isCancelled = false;
    let refreshInProgress = false;
    const refreshTimeframe = async (timeframe: '15m') => {
      if (refreshInProgress || isCancelled) return;
      refreshInProgress = true;
      try {
        for (const symbol of selectedCoins) {
          if (isCancelled) return;
          try {
            const incoming = await fetchLiveKlines(symbol, timeframe, 100);
            if (isCancelled) return;
            setCandlesMap((previous) => {
              const current = previous[symbol] ?? emptyTimeframes();
              return {
                ...previous,
                [symbol]: {
                  ...current,
                  [timeframe]: mergeCandles(current[timeframe], incoming),
                },
              };
            });
          } catch (error) {
            console.warn(`Unable to refresh Binance ${timeframe} candles for ${symbol}.`, error);
          }
        }
      } finally {
        refreshInProgress = false;
      }
    };
    const fifteenMinuteTimer = window.setInterval(
      () => void refreshTimeframe('15m'),
      5 * 60 * 1000
    );

    return () => {
      isCancelled = true;
      window.clearInterval(fifteenMinuteTimer);
    };
  }, [selectedCoins]);

  // Subscribe to ticker/search data and 1m/5m live klines.
  useEffect(() => {
    let ws: WebSocket | null = null;
    let isCleanedUp = false;
    let reconnectTimer: number | null = null;
    let reconnectAttempt = 0;

    const closeCurrentSocket = () => {
      const currentSocket = ws;
      ws = null;
      if (wsRef.current === currentSocket) wsRef.current = null;
      if (!currentSocket) return;

      currentSocket.onopen = null;
      currentSocket.onmessage = null;
      currentSocket.onerror = null;
      currentSocket.onclose = null;
      if (currentSocket.readyState !== WebSocket.CLOSED) currentSocket.close();
    };

    const scheduleReconnect = () => {
      if (isCleanedUp || reconnectTimer !== null) return;

      closeCurrentSocket();
      setIsLiveConnected(false);
      const delaySeconds = Math.min(2 ** reconnectAttempt, 10);
      reconnectAttempt += 1;
      setApiError(`Connecting to live Binance data... retrying in ${delaySeconds}s`);
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connectWebSocket();
      }, delaySeconds * 1000);
    };

    function connectWebSocket() {
      if (isCleanedUp || ws !== null) return;
      try {
        const streams = [
          ...selectedCoins.flatMap((symbol) => [
            `${symbol.toLowerCase()}@ticker`,
            `${symbol.toLowerCase()}@kline_1m`,
            `${symbol.toLowerCase()}@kline_5m`,
          ]),
          ...paperTradeSymbols
            .filter((symbol) => !selectedCoins.includes(symbol))
            .map((symbol) => `${symbol.toLowerCase()}@ticker`),
          '!ticker@arr',
        ].join('/');
        ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
        wsRef.current = ws;
        const currentSocket = ws;

        currentSocket.onmessage = (event) => {
          if (isCleanedUp || ws !== currentSocket) return;

          try {
            const payload: unknown = JSON.parse(event.data);
            const stream =
              payload && typeof payload === 'object' && 'stream' in payload
                ? payload.stream
                : undefined;
            const data =
              payload && typeof payload === 'object' && 'data' in payload
                ? payload.data
                : payload;
            const now = Date.now();

            if (
              typeof stream === 'string' &&
              (stream.endsWith('@kline_1m') || stream.endsWith('@kline_5m'))
            ) {
              if (!data || typeof data !== 'object' || !('e' in data) || data.e !== 'kline') return;
              const message = data as Record<string, unknown>;
              const kline = message.k;
              if (
                typeof message.s !== 'string' ||
                !kline ||
                typeof kline !== 'object'
              ) return;

              const rawKline = kline as Record<string, unknown>;
              const numericFields = ['t', 'T', 'o', 'h', 'l', 'c', 'v', 'q', 'V'];
              if (
                numericFields.some((field) => !Number.isFinite(Number(rawKline[field]))) ||
                typeof rawKline.x !== 'boolean'
              ) return;

              const symbol = message.s.toUpperCase();
              if (
                !selectedCoinsRef.current.includes(symbol) &&
                !paperTradeSymbols.includes(symbol)
              ) return;
              const timeframe: '1m' | '5m' = stream.endsWith('@kline_5m') ? '5m' : '1m';
              const candle: Candle = {
                openTime: Number(rawKline.t),
                closeTime: Number(rawKline.T),
                open: Number(rawKline.o),
                high: Number(rawKline.h),
                low: Number(rawKline.l),
                close: Number(rawKline.c),
                volume: Number(rawKline.v),
                quoteVolume: Number(rawKline.q),
                takerBuyVolume: Number(rawKline.V),
                isClosed: rawKline.x,
              };
              if (candle.close <= 0 || candle.volume < 0 || candle.high < candle.low) return;

              setIsLiveConnected(true);
              setApiError('');
              reconnectAttempt = 0;
              setLastStreamTick(now);
              setCandlesMap((prev) => {
                const current = prev[symbol] ?? emptyTimeframes();
                return {
                  ...prev,
                  [symbol]: {
                    ...current,
                    [timeframe]: mergeCandles(current[timeframe], [candle]),
                  },
                };
              });

              if (timeframe !== '1m') return;
              setTickersMap((prev) => {
                const ticker = prev[symbol];
                if (!ticker) return prev;
                const previousPrice = prevPricesRef.current[symbol] ?? ticker.price;
                if (candle.close > previousPrice) {
                  showPriceFlash(symbol, 'up');
                } else if (candle.close < previousPrice) {
                  showPriceFlash(symbol, 'down');
                }
                prevPricesRef.current[symbol] = candle.close;
                return {
                  ...prev,
                  [symbol]: { ...ticker, price: candle.close, lastUpdated: now },
                };
              });
              return;
            }

            const items = Array.isArray(data) ? data : [data];
            const tickers = items.filter(
              (item): item is Record<string, unknown> =>
                item !== null &&
                typeof item === 'object' &&
                typeof item.s === 'string' &&
                ['c', 'P', 'h', 'l', 'v', 'q'].every((field) =>
                  Number.isFinite(Number(item[field]))
                ) &&
                Number(item.c) > 0
            );
            if (tickers.length === 0) return;

            setIsLiveConnected(true);
            setApiError('');
            reconnectAttempt = 0;
            setLastStreamTick(now);

            const usdtList: BinanceSearchResult[] = [];
            const activeSet = new Set([...selectedCoinsRef.current, ...paperTradeSymbols]);
            const incomingUpdates: Record<string, LiveCoinTicker> = {};

            for (const item of tickers) {
              const symbol = (item.s as string).toUpperCase();
              if (!symbol.endsWith('USDT')) continue;

              const price = Number(item.c);
              const changePercent = Number(item.P);
              const quoteVol = Number(item.q);
              const baseAsset = symbol.replace('USDT', '');

              if (
                !symbol.includes('UPUSDT') &&
                !symbol.includes('DOWNUSDT') &&
                !symbol.includes('BULLUSDT') &&
                !symbol.includes('BEARUSDT')
              ) {
                usdtList.push({
                  symbol,
                  baseAsset,
                  price,
                  priceChangePercent: changePercent,
                  quoteVolume: quoteVol,
                });
              }

              if (activeSet.has(symbol)) {
                incomingUpdates[symbol] = {
                  symbol,
                  baseAsset,
                  quoteAsset: 'USDT',
                  price,
                  priceChangePercent: changePercent,
                  high24h: Number(item.h),
                  low24h: Number(item.l),
                  volume24h: Number(item.v),
                  quoteVolume24h: quoteVol,
                  lastUpdated: now,
                };

                const previousPrice = prevPricesRef.current[symbol] ?? price;
                if (price > previousPrice) {
                  showPriceFlash(symbol, 'up');
                } else if (price < previousPrice) {
                  showPriceFlash(symbol, 'down');
                }
                prevPricesRef.current[symbol] = price;
              }
            }

            usdtList.sort((a, b) => b.quoteVolume - a.quoteVolume);
            setAllStreamedTickers(usdtList);
            setTickersMap((prev) => ({ ...prev, ...incomingUpdates }));
          } catch (parseError) {
            console.error('WebSocket payload parsing error:', parseError);
          }
        };

        currentSocket.onerror = () => {
          if (isCleanedUp || ws !== currentSocket) return;
          scheduleReconnect();
        };

        currentSocket.onclose = () => {
          if (isCleanedUp || ws !== currentSocket) return;
          scheduleReconnect();
        };
      } catch (error) {
        console.error('Unable to initialize Binance WebSocket.', error);
        if (!isCleanedUp) {
          scheduleReconnect();
        }
      }
    }

    connectWebSocket();

    return () => {
      isCleanedUp = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
      closeCurrentSocket();
      Object.values(priceFlashTimersRef.current).forEach((timer) => window.clearTimeout(timer));
      priceFlashTimersRef.current = {};
    };
  }, [paperTradeSymbols, selectedCoins]);

  // Strict validation: Max 5 coins
  const addCoin = useCallback(
    (symbol: string): { success: boolean; message: string } => {
      const clean = symbol.trim().toUpperCase();
      if (!clean) return { success: false, message: 'Invalid symbol' };

      if (selectedCoins.includes(clean)) {
        return { success: false, message: `${clean} is already tracked.` };
      }

      if (selectedCoins.length >= MAX_COINS) {
        return {
          success: false,
          message: `Maximum limit of ${MAX_COINS} coins reached. Remove a coin to add ${clean}.`,
        };
      }

      setSelectedCoins((prev) => [...prev, clean]);
      setActiveSymbol(clean);
      return { success: true, message: `Added ${clean} to live 24/7 tracker.` };
    },
    [selectedCoins]
  );

  const removeCoin = useCallback(
    (symbol: string): { success: boolean; message: string } => {
      if (selectedCoins.length <= 1) {
        return { success: false, message: 'You must track at least 1 coin.' };
      }
      setSelectedCoins((prev) => prev.filter((s) => s !== symbol));
      return { success: true, message: `Removed ${symbol} from tracker.` };
    },
    [selectedCoins]
  );

  const replaceCoin = useCallback(
    (oldSymbol: string, newSymbol: string): { success: boolean; message: string } => {
      const cleanNew = newSymbol.trim().toUpperCase();
      if (selectedCoins.includes(cleanNew)) {
        return { success: false, message: `${cleanNew} is already tracked.` };
      }
      setSelectedCoins((prev) => prev.map((s) => (s === oldSymbol ? cleanNew : s)));
      setActiveSymbol(cleanNew);
      return { success: true, message: `Replaced ${oldSymbol} with ${cleanNew}.` };
    },
    [selectedCoins]
  );

  // Prefer explicit rule alerts over neutral observations; no numeric score is synthesized.
  const sortedAnalyses = useMemo(() => {
    const priority: Record<TrapAnalysis['signalType'], number> = {
      RETAIL_TRAP_BHEED: 0,
      STOP_LOSS_HUNT_ENTRY: 1,
      SCALP_OPPORTUNITY: 2,
      FAKE_BREAKOUT: 3,
      NEUTRAL_SCANNING: 4,
    };
    return Object.values(analyses).sort(
      (a, b) => priority[a.signalType] - priority[b.signalType]
    );
  }, [analyses]);

  const topActiveTrap = sortedAnalyses.find(
    (analysis) => analysis.signalType !== 'NEUTRAL_SCANNING'
  );
  const currentAnalysis = analyses[activeSymbol] || topActiveTrap;

  // =========================================================================
  // 5. Hard UI Blocker: EXACT logic requested by user
  // =========================================================================
  if (!isLiveConnected && !hasServerMarketData && appRoute === 'radar') {
    return (
      <div className="relative h-screen w-screen bg-gray-900 text-red-500 flex flex-col items-center justify-center font-bold text-xl">
        <button
          type="button"
          onClick={() => setIsSettingsOpen(true)}
          className="absolute top-4 right-4 w-11 h-11 rounded-xl border border-slate-700 bg-slate-800 text-slate-200 flex items-center justify-center"
          aria-label="Open settings"
        >
          <Settings className="w-5 h-5" />
        </button>
        {apiError ? apiError : "Waiting for Live Binance WebSocket Data..."}
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          installPrompt={installPrompt}
          isInstalled={isPwaInstalled}
          installError={installError}
          onInstall={() => void installApplication()}
          alertPreferences={alertPreferences}
          notificationPermission={notificationPermission}
          pushSubscriptionActive={pushSubscriptionActive}
          pushSetupLoading={pushSetupLoading}
          alertSettingsError={alertSettingsError}
          onToggleNotifications={() => void toggleBrowserNotifications()}
          onToggleVoiceAlerts={() => {
            setAlertSettingsError('');
            setAlertPreferences((current) => ({ ...current, voiceAlerts: !current.voiceAlerts }));
          }}
          onChangeVoiceStyle={(voiceStyle) =>
            setAlertPreferences((current) => ({ ...current, voiceStyle }))
          }
          onTestVoice={testVoiceAlert}
        />
      </div>
    );
  }

  // Dashboard & Logic render ONLY when real live data is actively streaming
  return (
    <div className="min-h-screen bg-gray-950 text-slate-100 flex flex-col font-sans pb-24 lg:pb-8 selection:bg-rose-500/30 selection:text-rose-200 transition-all duration-300">
      {/* Top Header */}
      <TopHeader
        coinCount={selectedCoins.length}
        maxCoins={MAX_COINS}
        onOpenSelectedCoins={() => setIsSelectedCoinsOpen(true)}
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenProfile={() => navigateTo('profile')}
        isConnected={isLiveConnected}
        marketStatus={marketStatus}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 lg:pt-8 flex flex-col gap-6 lg:gap-8 transition-all duration-300">
        {appRoute === 'radar' ? (
        <>
        {/* Real-time streaming status banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800/60">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              LIVE WEBSOCKET STREAM
            </span>
            <span>·</span>
            <span>{selectedCoins.length} Coins Monitored</span>
            <span>·</span>
            <span>Last Stream Tick: {new Date(lastStreamTick).toLocaleTimeString()}</span>
            <span>·</span>
            <span className={marketWorkerStatus === 'offline' ? 'text-rose-400' : 'text-cyan-300'}>
              Backend {marketWorkerStatus === 'live'
                ? 'LIVE'
                : marketWorkerStatus === 'offline'
                  ? 'OFFLINE'
                  : marketWorkerStatus === 'partial'
                    ? 'PARTIAL'
                    : 'WARMING'}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            {topActiveTrap && (
              <span className="text-[11px] font-mono text-amber-300 bg-amber-950/60 border border-amber-800/80 px-2 py-0.5 rounded-md">
                #1 Rule Alert: {topActiveTrap.baseAsset} · {topActiveTrap.badgeText}
              </span>
            )}
          </div>
        </div>

        {/* Home Page Main View: Displays #1 active trade or Trap Alert detected by AI */}
        <MainTrapCard
          analysis={currentAnalysis || topActiveTrap}
          allAnalyses={analyses}
          selectedCoins={selectedCoins}
          activeSymbol={activeSymbol}
          onSelectCoin={(sym) => setActiveSymbol(sym)}
          priceFlash={priceFlash[activeSymbol] || null}
          isTopRanked={activeSymbol === topActiveTrap?.symbol}
          onBookTrade={(analysis) => {
            const entryPrice = tickersMap[analysis.symbol]?.price ?? analysis.currentPrice;
            setTradeDraft({ ...analysis, currentPrice: entryPrice });
            setTradeEntryPrice(entryPrice);
            navigateTo('profile');
          }}
        />

        <CoinsDrawer
          isOpen={isCoinsDrawerOpen}
          onClose={() => setIsCoinsDrawerOpen(false)}
          analyses={analyses}
          selectedCoins={selectedCoins}
          activeSymbol={activeSymbol}
          onSelectCoin={(sym) => {
            setActiveSymbol(sym);
            setIsCoinsDrawerOpen(false);
          }}
        />

        {/* Education Drawer explaining Inverse Logic */}
        <div className="w-full bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 transition-all">
          <button
            type="button"
            onClick={() => setIsGuideOpen(!isGuideOpen)}
            className="w-full flex items-center justify-between text-left cursor-pointer group"
          >
            <div className="flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-rose-400" />
              <span className="text-xs font-bold text-slate-200 group-hover:text-white transition-colors">
                How TrapDetector AI Protects You (Inverse Trading Rules)
              </span>
            </div>
            {isGuideOpen ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {isGuideOpen && (
            <div className="mt-3 pt-3 border-t border-slate-800/60 space-y-3 text-xs text-slate-300 leading-relaxed">
              <div className="flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-rose-300 block">1. Retail FOMO (&quot;Bheed aa rahi hai&quot;)</strong>
                  When both 1m and 5m indicator panels reach at least 7/10 BUY votes, three consecutive green 1m candles with plateauing or dropping volume trigger a DO NOT CHASE warning.
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <Target className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-emerald-300 block">2. Stop-Loss Hunt Entries</strong>
                  The 15m close must remain above EMA-50, and both lower-timeframe panels must reach at least 7/10 SELL votes. Then a completed 1m candle must sweep below the prior 15-candle low, reclaim it, form a lower wick over half its range, and trade over 1.5 times average volume. This pattern cannot identify who traded.
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <AlertOctagon className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-amber-300 block">3. Volume &amp; Order Flow Confirmation</strong>
                  With the 15m trend below EMA-50 and extreme bullish retail consensus on 1m/5m, a completed 1m candle that exceeds the prior 15-candle high on below-average volume is flagged. Alerts are rule-based observations, not trade guarantees.
                </div>
              </div>
              <p className="text-slate-400">
                The engine loads 100 candles for each 1m, 5m, and 15m timeframe. 1m/5m update over WebSocket; 15m refreshes on its own interval. Until all three series have 100 candles and indicator calculations are available, the app shows &quot;Gathering 100-Candle MTF Data...&quot;.
              </p>
            </div>
          )}
        </div>
        </>
        ) : appRoute === 'profile' ? (
          <ProfilePage
            availableFunding={paperTrading.availableFunding}
            allocationPercent={paperTrading.allocationPercent}
            trades={paperTrading.trades}
            prices={Object.fromEntries(
              Object.entries(tickersMap).map(([symbol, ticker]) => [symbol, ticker.price])
            )}
            draft={tradeDraft ? {
              symbol: tradeDraft.symbol,
              direction: getSignalDirection(tradeDraft),
              signalType: tradeDraft.signalType,
              entryPrice: tradeEntryPrice ?? tradeDraft.currentPrice,
            } : null}
            analysis={tradeDraft ?? undefined}
            onFundingChange={paperTrading.setAvailableFunding}
            onAllocationChange={paperTrading.setAllocationPercent}
            onOpenTrade={(symbol, direction: PaperTradeDirection, entryPrice, signalType) => {
              paperTrading.openTrade(symbol, direction, entryPrice, signalType);
            }}
            onCloseTrade={paperTrading.closeTrade}
            onOpenHistory={() => navigateTo('order-history')}
            onClearDraft={() => {
              setTradeDraft(null);
              setTradeEntryPrice(null);
            }}
          />
        ) : (
          <OrderHistoryPage
            trades={paperTrading.trades}
            onBack={() => navigateTo('profile')}
          />
        )}
      </main>

      <BottomNavBar
        onOpenCoinsDrawer={() => setIsCoinsDrawerOpen(true)}
        onOpenSearch={() => setIsSearchOpen(true)}
        remainingCount={Math.max(0, selectedCoins.length - 1)}
        onOpenProfile={() => navigateTo('profile')}
        onOpenRadar={() => navigateTo('radar')}
      />

      <TradeAlertModal
        analysis={appRoute === 'radar' ? tradeAlert : null}
        livePrice={tradeAlert ? tickersMap[tradeAlert.symbol]?.price : undefined}
        onBookTrade={(analysis, entryPrice) => {
          setTradeDraft({ ...analysis, currentPrice: entryPrice });
          setTradeEntryPrice(entryPrice);
          setTradeAlert(null);
          setActiveSymbol(analysis.symbol);
          navigateTo('profile');
        }}
        onDismiss={() => setTradeAlert(null)}
      />

      {/* Selected Coins Manager (Triggered by Top-Left Mascot Logo) */}
      <SelectedCoinsModal
        isOpen={isSelectedCoinsOpen}
        onClose={() => setIsSelectedCoinsOpen(false)}
        selectedCoins={selectedCoins}
        maxCoins={MAX_COINS}
        tickers={tickersMap}
        analyses={analyses}
        onRemoveCoin={removeCoin}
        onOpenSearch={() => {
          setIsSelectedCoinsOpen(false);
          setIsSearchOpen(true);
        }}
        onSelectActiveCoin={(sym) => {
          setActiveSymbol(sym);
          setIsSelectedCoinsOpen(false);
        }}
      />

      {/* Real Binance Ticker Search Modal (Triggered by Search Box) */}
      <SearchTickerModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        selectedCoins={selectedCoins}
        maxCoins={MAX_COINS}
        streamedTickers={allStreamedTickers}
        onAddCoin={addCoin}
        onRemoveCoin={removeCoin}
        onReplaceCoin={replaceCoin}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        installPrompt={installPrompt}
        isInstalled={isPwaInstalled}
        installError={installError}
        onInstall={() => void installApplication()}
        alertPreferences={alertPreferences}
        notificationPermission={notificationPermission}
        pushSubscriptionActive={pushSubscriptionActive}
        pushSetupLoading={pushSetupLoading}
        alertSettingsError={alertSettingsError}
        onToggleNotifications={() => void toggleBrowserNotifications()}
        onToggleVoiceAlerts={() => {
          setAlertSettingsError('');
          setAlertPreferences((current) => ({ ...current, voiceAlerts: !current.voiceAlerts }));
        }}
        onChangeVoiceStyle={(voiceStyle) =>
          setAlertPreferences((current) => ({ ...current, voiceStyle }))
        }

        onTestVoice={testVoiceAlert}
      />
    </div>
  );
}
