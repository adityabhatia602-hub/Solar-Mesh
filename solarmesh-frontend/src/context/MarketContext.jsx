import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { WS_BASE_URL } from '../utils/constants';
import { useAuthContext } from './AuthContext';

const MarketContext = createContext(null);

export const MarketProvider = ({ children }) => {
  const { token, user } = useAuthContext();
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // 'connecting' | 'connected' | 'disconnected' | 'error'
  const [liveTrades, setLiveTrades] = useState([]);
  const [recentEvents, setRecentEvents] = useState([]);
  const [lastGridUpdate, setLastGridUpdate] = useState(null);
  const [lastTelemetry, setLastTelemetry] = useState(null);
  const [refreshCounter, setRefreshCounter] = useState(0);

  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);

  const triggerGlobalRefresh = useCallback(() => {
    setRefreshCounter((prev) => prev + 1);
  }, []);

  const connectWebSocket = useCallback(() => {
    if (!token) {
      if (wsRef.current) {
        wsRef.current.close();
      }
      setConnectionStatus('disconnected');
      return;
    }

    // Clear any pending reconnection timer
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    try {
      setConnectionStatus('connecting');
      const wsUrl = `${WS_BASE_URL}?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus('connected');
        reconnectAttemptsRef.current = 0;

        // Subscribe to standard channels
        const channels = ['trades', 'orders', 'grid', 'telemetry'];
        channels.forEach((channel) => {
          ws.send(JSON.stringify({ action: 'subscribe', channel }));
        });

        // Also subscribe to personal user channel if available
        if (user?.id) {
          ws.send(JSON.stringify({ action: 'subscribe', channel: `user:${user.id}` }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);

          // Confirmation responses
          if (payload.ok || payload.error) return;

          // Event notification
          const eventItem = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            timestamp: new Date().toISOString(),
            ...payload,
          };

          setRecentEvents((prev) => [eventItem, ...prev.slice(0, 49)]);

          // Handle specific event types
          if (payload.type === 'trade') {
            setLiveTrades((prev) => [payload.data, ...prev.slice(0, 24)]);
            triggerGlobalRefresh();
          } else if (payload.type === 'order_created' || payload.type === 'order_cancelled') {
            triggerGlobalRefresh();
          } else if (payload.type === 'grid_update' || payload.type === 'trade_settled') {
            setLastGridUpdate(payload);
            triggerGlobalRefresh();
          } else if (payload.type === 'telemetry') {
            setLastTelemetry(payload.data);
            triggerGlobalRefresh();
          }
        } catch (err) {
          console.error('Error parsing WS message:', err);
        }
      };

      ws.onerror = () => {
        setConnectionStatus('error');
      };

      ws.onclose = () => {
        setConnectionStatus('disconnected');
        // Exponential backoff reconnect
        const delay = Math.min(1000 * Math.pow(1.5, reconnectAttemptsRef.current), 15000);
        reconnectAttemptsRef.current += 1;
        reconnectTimeoutRef.current = setTimeout(() => {
          if (token) {
            connectWebSocket();
          }
        }, delay);
      };
    } catch (err) {
      console.error('WebSocket connection error:', err);
      setConnectionStatus('error');
    }
  }, [token, user?.id, triggerGlobalRefresh]);

  useEffect(() => {
    connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connectWebSocket]);

  const value = {
    connectionStatus,
    liveTrades,
    recentEvents,
    lastGridUpdate,
    lastTelemetry,
    refreshCounter,
    triggerGlobalRefresh,
  };

  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
};

export const useMarketContext = () => {
  const context = useContext(MarketContext);
  if (!context) {
    throw new Error('useMarketContext must be used within a MarketProvider');
  }
  return context;
};

export default MarketContext;
