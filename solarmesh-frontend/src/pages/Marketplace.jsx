import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeftRight,
  Plus,
  Filter,
  RefreshCw,
  Layers,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useMarket } from '../hooks/useMarket';
import { marketApi } from '../api/market';
import { gridApi } from '../api/grid';

import PageHeader from '../components/layout/PageHeader';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import OrderBook from '../components/marketplace/OrderBook';
import PlaceOrderModal from '../components/marketplace/PlaceOrderModal';
import OrdersTable from '../components/marketplace/OrdersTable';
import MarketClearingTrigger from '../components/marketplace/MarketClearingTrigger';

export const Marketplace = () => {
  const { user, isProsumer } = useAuth();
  const { refreshCounter } = useMarket();

  const [orderBook, setOrderBook] = useState(null);
  const [orders, setOrders] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [nodes, setNodes] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [modalSide, setModalSide] = useState('offer');
  const [modalPrice, setModalPrice] = useState('');
  const [cancellingId, setCancellingId] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadMarketData = useCallback(async () => {
    try {
      setLoading(true);
      const [obData, ordersData, nodesData] = await Promise.all([
        marketApi.getOrderBook(selectedNodeId || null).catch(() => null),
        marketApi.getMyOrders(statusFilter || null).catch(() => []),
        gridApi.getNodes().catch(() => []),
      ]);

      if (obData) setOrderBook(obData);
      setOrders(ordersData);
      setNodes(nodesData);
    } catch (err) {
      console.warn('Error loading market data:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedNodeId, statusFilter]);

  useEffect(() => {
    loadMarketData();
  }, [loadMarketData, refreshCounter]);

  const handleCancelOrder = async (orderId) => {
    try {
      setCancellingId(orderId);
      await marketApi.cancelOrder(orderId);
      await loadMarketData();
    } catch (err) {
      console.error('Cancel order error:', err);
    } finally {
      setCancellingId(null);
    }
  };

  const handleSelectPriceFromBook = (price, sideToTake) => {
    setModalPrice(price.toString());
    setModalSide(sideToTake);
    setIsOrderModalOpen(true);
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        title="Decentralized Energy Trading Floor"
        subtitle="Submit bids and asks to the continuous double auction market or trigger algorithmic clearing"
        actions={
          <div className="flex items-center space-x-2">
            <Button
              variant="secondary"
              size="sm"
              icon={RefreshCw}
              onClick={loadMarketData}
              isLoading={loading}
            >
              Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => {
                setModalSide(isProsumer ? 'offer' : 'bid');
                setModalPrice('');
                setIsOrderModalOpen(true);
              }}
            >
              Create New Order
            </Button>
          </div>
        }
      />

      {/* Autonomous Matching Trigger */}
      <MarketClearingTrigger onMatched={loadMarketData} />

      {/* Node Filter Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-white border border-slate-200/80 rounded-xl">
        <div className="flex items-center space-x-2 text-xs font-semibold text-slate-700">
          <Filter className="w-4 h-4 text-slate-400" />
          <span>Filter Order Book by Grid Node:</span>
        </div>
        <select
          value={selectedNodeId}
          onChange={(e) => setSelectedNodeId(e.target.value)}
          className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
        >
          <option value="">All Grid Substations (Global Network)</option>
          {nodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.code} — {n.name} ({n.region})
            </option>
          ))}
        </select>
      </div>

      {/* Order Book Component */}
      <OrderBook
        orderBook={orderBook}
        onSelectPrice={handleSelectPriceFromBook}
      />

      {/* User's Orders Section */}
      <Card
        title="My Active & Historical Orders"
        subtitle="Manage your posted bids, offers, and fill states"
        icon={Layers}
        action={
          <div className="flex items-center space-x-1.5">
            {['', 'open', 'filled', 'cancelled'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize transition-colors ${
                  statusFilter === st
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {st || 'All Orders'}
              </button>
            ))}
          </div>
        }
      >
        <OrdersTable
          orders={orders}
          onCancelOrder={handleCancelOrder}
          cancellingId={cancellingId}
        />
      </Card>

      {/* Order Placement Modal */}
      <PlaceOrderModal
        isOpen={isOrderModalOpen}
        onClose={() => setIsOrderModalOpen(false)}
        initialSide={modalSide}
        initialPrice={modalPrice}
        onOrderPlaced={loadMarketData}
      />
    </div>
  );
};

export default Marketplace;
