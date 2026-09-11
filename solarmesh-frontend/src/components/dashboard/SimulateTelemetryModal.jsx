import React, { useState, useEffect } from 'react';
import { Sun, Battery, Home, Send, Check } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { gridApi } from '../../api/grid';
import { telemetryApi } from '../../api/telemetry';

export const SimulateTelemetryModal = ({ isOpen, onClose, onTelemetrySent }) => {
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [productionKwh, setProductionKwh] = useState('8.4');
  const [consumptionKwh, setConsumptionKwh] = useState('3.2');
  const [batteryKwh, setBatteryKwh] = useState('11.5');
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Fetch devices or nodes
  useEffect(() => {
    if (!isOpen) return;

    const loadDevices = async () => {
      try {
        let devList = await gridApi.getMyDevices();
        if (devList.length === 0) {
          // If user doesn't have a device registered yet, fetch nodes and auto-register a default solar device for seamless hackathon testing!
          const nodes = await gridApi.getNodes();
          const targetNode = nodes[0] || { id: 'node-1' };
          const newDev = await gridApi.registerDevice({
            name: 'Rooftop Solar Array Alpha',
            node_id: targetNode.id,
            device_type: 'solar_panel',
            capacity_kwh: 12.0,
          });
          devList = [newDev];
        }
        setDevices(devList);
        if (devList.length > 0) {
          setSelectedDeviceId(devList[0].id);
        }
      } catch (err) {
        console.error('Error fetching devices:', err);
      }
    };

    loadDevices();
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedDeviceId) return;

    try {
      setLoading(true);
      setSuccessMsg('');
      await telemetryApi.ingestTelemetry({
        device_id: selectedDeviceId,
        production_kwh: Number(productionKwh),
        consumption_kwh: Number(consumptionKwh),
        battery_kwh: Number(batteryKwh),
      });

      setSuccessMsg('Telemetry successfully ingested and broadcasted via WebSocket!');
      if (onTelemetrySent) {
        onTelemetrySent({
          production_kwh: Number(productionKwh),
          consumption_kwh: Number(consumptionKwh),
          battery_kwh: Number(batteryKwh),
        });
      }

      setTimeout(() => {
        setSuccessMsg('');
        onClose();
      }, 1200);
    } catch (err) {
      console.error('Failed to submit telemetry:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Simulate Smart Meter Reading"
      subtitle="Broadcast live solar PV, household load, and battery metrics to the mesh"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {successMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800 flex items-center space-x-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Target Meter / Device
          </label>
          <select
            value={selectedDeviceId}
            onChange={(e) => setSelectedDeviceId(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none font-medium"
            required
          >
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.device_type} - {d.capacity_kwh} kWh cap)
              </option>
            ))}
          </select>
        </div>

        {/* Sliders / Number inputs */}
        <div className="space-y-3.5 pt-2">
          {/* Solar Generation */}
          <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl">
            <div className="flex justify-between items-center text-xs font-semibold text-amber-900 mb-1">
              <span className="flex items-center space-x-1.5">
                <Sun className="w-4 h-4 text-amber-600" />
                <span>Solar Generation (kWh)</span>
              </span>
              <span className="font-bold text-sm text-amber-700">{productionKwh} kWh</span>
            </div>
            <input
              type="range"
              min="0"
              max="25"
              step="0.1"
              value={productionKwh}
              onChange={(e) => setProductionKwh(e.target.value)}
              className="w-full accent-amber-500"
            />
          </div>

          {/* Consumption */}
          <div className="p-3 bg-blue-50/70 border border-blue-200/80 rounded-xl">
            <div className="flex justify-between items-center text-xs font-semibold text-blue-900 mb-1">
              <span className="flex items-center space-x-1.5">
                <Home className="w-4 h-4 text-blue-600" />
                <span>Household Consumption (kWh)</span>
              </span>
              <span className="font-bold text-sm text-blue-700">{consumptionKwh} kWh</span>
            </div>
            <input
              type="range"
              min="0"
              max="20"
              step="0.1"
              value={consumptionKwh}
              onChange={(e) => setConsumptionKwh(e.target.value)}
              className="w-full accent-blue-600"
            />
          </div>

          {/* Battery */}
          <div className="p-3 bg-purple-50/70 border border-purple-200/80 rounded-xl">
            <div className="flex justify-between items-center text-xs font-semibold text-purple-900 mb-1">
              <span className="flex items-center space-x-1.5">
                <Battery className="w-4 h-4 text-purple-600" />
                <span>Battery Storage Level (kWh)</span>
              </span>
              <span className="font-bold text-sm text-purple-700">{batteryKwh} kWh</span>
            </div>
            <input
              type="range"
              min="0"
              max="20"
              step="0.5"
              value={batteryKwh}
              onChange={(e) => setBatteryKwh(e.target.value)}
              className="w-full accent-purple-600"
            />
          </div>
        </div>

        {/* Calculated Surplus / Deficit Note */}
        <div className="text-xs text-slate-500 text-center py-1 font-medium">
          Surplus available for sale:{' '}
          <span className="font-bold text-emerald-600">
            {Math.max(0, Number(productionKwh) - Number(consumptionKwh)).toFixed(1)} kWh
          </span>
        </div>

        <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100">
          <Button variant="secondary" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={loading}
            icon={Send}
          >
            Publish Telemetry
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default SimulateTelemetryModal;
