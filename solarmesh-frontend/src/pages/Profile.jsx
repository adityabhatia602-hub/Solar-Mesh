import React, { useState, useEffect, useCallback } from 'react';
import {
  User as UserIcon,
  Wallet,
  Cpu,
  PlusCircle,
  ShieldCheck,
  Zap,
  Sun,
  Battery,
  History,
  Check,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { walletApi } from '../api/wallet';
import { gridApi } from '../api/grid';
import PageHeader from '../components/layout/PageHeader';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Badge from '../components/common/Badge';
import Modal from '../components/common/Modal';
import { formatCurrency, formatKwh, formatDate } from '../utils/formatters';

export const Profile = () => {
  const { user, isProsumer } = useAuth();

  const [wallet, setWallet] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [devices, setDevices] = useState([]);
  const [nodes, setNodes] = useState([]);

  // Deposit modal
  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState('100');
  const [depositing, setDepositing] = useState(false);

  // Register device modal
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [deviceNodeId, setDeviceNodeId] = useState('');
  const [deviceType, setDeviceType] = useState('solar_panel');
  const [deviceCapacity, setDeviceCapacity] = useState('10.0');
  const [registeringDevice, setRegisteringDevice] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [walletData, ledgerData, devicesData, nodesData] = await Promise.all([
        walletApi.getWallet().catch(() => null),
        walletApi.getLedger(30).catch(() => []),
        gridApi.getMyDevices().catch(() => []),
        gridApi.getNodes().catch(() => []),
      ]);
      if (walletData) setWallet(walletData);
      setLedger(ledgerData);
      setDevices(devicesData);
      setNodes(nodesData);
      if (nodesData.length > 0 && !deviceNodeId) {
        setDeviceNodeId(nodesData[0].id);
      }
    } catch (err) {
      console.error('Failed to load profile data:', err);
    }
  }, [deviceNodeId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDeposit = async () => {
    try {
      setDepositing(true);
      await walletApi.depositSelf(Number(depositAmount));
      await loadData();
      setIsDepositOpen(false);
    } catch (err) {
      console.error('Deposit error:', err);
    } finally {
      setDepositing(false);
    }
  };

  const handleRegisterDevice = async (e) => {
    e.preventDefault();
    try {
      setRegisteringDevice(true);
      await gridApi.registerDevice({
        name: deviceName,
        node_id: deviceNodeId,
        device_type: deviceType,
        capacity_kwh: Number(deviceCapacity),
      });
      await loadData();
      setIsDeviceModalOpen(false);
      setDeviceName('');
    } catch (err) {
      console.error('Device registration failed:', err);
    } finally {
      setRegisteringDevice(false);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 max-w-5xl mx-auto">
      <PageHeader
        title="Account & Energy Asset Inventory"
        subtitle="Manage user credentials, microgrid wallet balances, and interconnected smart meter devices"
      />

      {/* User Information & Wallet Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* User Card */}
        <Card title="User Credentials" icon={UserIcon}>
          <div className="space-y-3 text-xs">
            <div>
              <span className="text-slate-400 block">Full Name</span>
              <span className="font-bold text-slate-800 text-sm">{user?.full_name || '—'}</span>
            </div>
            <div>
              <span className="text-slate-400 block">Email Address</span>
              <span className="font-medium text-slate-700">{user?.email || '—'}</span>
            </div>
            <div>
              <span className="text-slate-400 block">Participant Role</span>
              <Badge variant={isProsumer ? 'amber' : 'blue'}>
                {user?.role?.toUpperCase()}
              </Badge>
            </div>
            <div>
              <span className="text-slate-400 block">Account Status</span>
              <span className="inline-flex items-center text-emerald-700 font-bold">
                <Check className="w-3.5 h-3.5 mr-1 text-emerald-600" /> Active & Verified
              </span>
            </div>
          </div>
        </Card>

        {/* Wallet Balances Card */}
        <Card
          title="Microgrid Wallet"
          icon={Wallet}
          className="lg:col-span-2"
          action={
            <Button
              variant="primary"
              size="xs"
              icon={PlusCircle}
              onClick={() => setIsDepositOpen(true)}
            >
              Test Faucet Deposit
            </Button>
          }
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Available</span>
              <span className="text-lg font-extrabold text-emerald-700">
                {formatCurrency(wallet?.available ?? 0)}
              </span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">In Escrow</span>
              <span className="text-lg font-extrabold text-amber-700">
                {formatCurrency(wallet?.reserved ?? 0)}
              </span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Energy Sold</span>
              <span className="text-lg font-extrabold text-slate-900">
                {formatKwh(wallet?.energy_kwh_sold ?? 0)}
              </span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Energy Bought</span>
              <span className="text-lg font-extrabold text-slate-900">
                {formatKwh(wallet?.energy_kwh_bought ?? 0)}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Connected Physical Hardware Devices */}
      <Card
        title="Connected Smart Meters & Energy Assets"
        subtitle="Hardware registered to physical grid nodes"
        icon={Cpu}
        action={
          <Button
            variant="secondary"
            size="xs"
            icon={PlusCircle}
            onClick={() => setIsDeviceModalOpen(true)}
          >
            Register Device
          </Button>
        }
      >
        {devices.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs">
            No energy hardware registered yet. Click "Register Device" to attach a solar inverter or meter.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {devices.map((device) => {
              const node = nodes.find((n) => n.id === device.node_id);
              return (
                <div
                  key={device.id}
                  className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">{device.name}</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      Online
                    </span>
                  </div>
                  <div className="text-slate-500">
                    Type: <span className="font-semibold text-slate-700 capitalize">{device.device_type?.replace('_', ' ')}</span>
                  </div>
                  <div className="text-slate-500">
                    Capacity: <span className="font-semibold text-slate-700">{device.capacity_kwh} kWh</span>
                  </div>
                  <div className="text-slate-500">
                    Connected Node: <span className="font-mono font-bold text-slate-800">{node ? node.code : device.node_id}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Wallet Ledger History */}
      <Card
        title="Financial Ledger History"
        subtitle="Double-entry bookkeeping of all credits, escrow reserves, and settlements"
        icon={History}
      >
        {ledger.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs">
            No financial entries in ledger yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">Entry Type</th>
                  <th className="py-2.5 px-4">Amount</th>
                  <th className="py-2.5 px-4">Balance After</th>
                  <th className="py-2.5 px-4">Memo / Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ledger.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-4">
                      <span className="font-mono font-bold uppercase text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-800">
                        {entry.entry_type}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-bold text-slate-900">
                      {formatCurrency(entry.amount)}
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-slate-700">
                      {formatCurrency(entry.balance_after)}
                    </td>
                    <td className="py-2.5 px-4 text-slate-500">
                      {entry.memo || entry.reference || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Deposit Faucet Modal */}
      <Modal
        isOpen={isDepositOpen}
        onClose={() => setIsDepositOpen(false)}
        title="Hackathon Test Wallet Faucet"
        subtitle="Instantly deposit mock USD testnet currency into your wallet"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {['50', '100', '500'].map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => setDepositAmount(amt)}
                className={`py-2 px-3 rounded-lg text-sm font-semibold border transition-all ${
                  depositAmount === amt
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                ${amt}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Custom Amount ($)
            </label>
            <input
              type="number"
              min="1"
              max="10000"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100">
            <Button variant="secondary" onClick={() => setIsDepositOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              isLoading={depositing}
              onClick={handleDeposit}
            >
              Deposit Funds
            </Button>
          </div>
        </div>
      </Modal>

      {/* Device Registration Modal */}
      <Modal
        isOpen={isDeviceModalOpen}
        onClose={() => setIsDeviceModalOpen(false)}
        title="Register Energy Hardware Device"
        subtitle="Connect a rooftop solar inverter, home battery, or smart meter to a grid node"
      >
        <form onSubmit={handleRegisterDevice} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Device Name / Label
            </label>
            <input
              type="text"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder="e.g. South Roof Solar Array (5kW)"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Hardware Type
            </label>
            <select
              value={deviceType}
              onChange={(e) => setDeviceType(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="solar_panel">Solar PV Panel Array</option>
              <option value="battery">Energy Storage System (Battery)</option>
              <option value="meter">Smart Bi-Directional Meter</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Grid Interconnection Substation
            </label>
            <select
              value={deviceNodeId}
              onChange={(e) => setDeviceNodeId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              required
            >
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.code} — {n.name} ({n.region})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Capacity (kWh or kW peak rating)
            </label>
            <input
              type="number"
              step="0.5"
              min="0.5"
              max="500"
              value={deviceCapacity}
              onChange={(e) => setDeviceCapacity(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              required
            />
          </div>

          <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100">
            <Button variant="secondary" onClick={() => setIsDeviceModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={registeringDevice}
            >
              Register Asset
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Profile;
