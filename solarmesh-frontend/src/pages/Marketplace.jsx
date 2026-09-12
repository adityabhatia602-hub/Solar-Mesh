import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeftRight,
  Plus,
  Filter,
  RefreshCw,
  Layers,
  Sun,
  Zap,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useMarket } from '../hooks/useMarket';
import { useToast } from '../hooks/useToast';
import { marketApi } from '../api/market';
import { gridApi } from '../api/grid';

import PageHeader from '../components/layout/PageHeader';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import OrderBook from '../components/marketplace/OrderBook';
import PlaceOrderModal from '../components/marketplace/PlaceOrderModal';
import OrdersTable from '../components/marketplace/OrdersTable';
import DemoSandboxDrawer from '../components/common/DemoSandboxDrawer';

export const Marketplace = () => {
  const { user, isProsumer } = useAuth();
  const { refreshCounter } = useMarket();
  const toast = useToast();

  const [orderBook, setOrderBook] = useState(null);
  const [orders, setOrders] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [nodes, setNodes] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [modalSide, setModalSide] = useState(isProsumer ? 'offer' : 'bid');
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
      toast.info('Listing cancelled. Escrow funds released.');
      await loadMarketData();
    } catch (err) {
      toast.error('Cancel failed: ' + (err.response?.data?.detail || err.message));
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
        title="Community Solar Marketplace"
        subtitle="Buy clean solar energy from nearby homes or sell your excess rooftop electricity"
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
              {isProsumer ? 'Post Solar for Sale' : 'Request Clean Energy'}
            </Button>
          </div>
        }
      />

      {/* Neighborhood Substation Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-white border border-slate-200/80 rounded-xl shadow-2xs">
        <div className="flex items-center space-x-2 text-xs font-semibold text-slate-700">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <span>Filter Listings by Neighborhood Zone:</span>
        </div>
        <select
          value={selectedNodeId}
          onChange={(e) => setSelectedNodeId(e.target.value)}
          className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium bg-white text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
        >
          <option value="">All Neighborhoods (Entire Local Grid)</option>
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
        title="My Active Listings & Orders"
        subtitle="Your posted offers to sell solar and energy buy requests"
        icon={Layers}
        action={
          <div className="flex items-center space-x-1.5">
            {['', 'open', 'filled', 'cancelled'].map((st) => (
              <button
                key={st || 'all'}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize transition-colors cursor-pointer ${
                  statusFilter === st
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {st === '' ? 'All' : st === 'open' ? 'Active' : st === 'filled' ? 'Completed' : 'Cancelled'}
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

      {/* Demo Sandbox Drawer */}
      <DemoSandboxDrawer onActionComplete={loadMarketData} />
    </div>
  );
};

export default Marketplace;
