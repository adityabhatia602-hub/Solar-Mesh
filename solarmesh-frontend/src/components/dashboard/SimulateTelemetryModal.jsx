import React, { useState, useEffect } from 'react';
import { Sun, Battery, Home, Send, Check } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { gridApi } from '../../api/grid';
import { telemetryApi } from '../../api/telemetry';
import { useToast } from '../../hooks/useToast';

export const SimulateTelemetryModal = ({ isOpen, onClose, onTelemetrySent }) => {
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [productionKwh, setProductionKwh] = useState('8.4');
  const [consumptionKwh, setConsumptionKwh] = useState('3.2');
  const [batteryKwh, setBatteryKwh] = useState('11.5');
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  // Fetch devices or nodes
  useEffect(() => {
    if (!isOpen) return;

    const loadDevices = async () => {
      try {
        let devList = await gridApi.getMyDevices();
        if (devList.length === 0) {
          // If user doesn't have a device registered yet, auto-register a default solar device for seamless testing
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
      await telemetryApi.ingestTelemetry({
        device_id: selectedDeviceId,
        production_kwh: Number(productionKwh),
        consumption_kwh: Number(consumptionKwh),
        battery_kwh: Number(batteryKwh),
      });

      toast.success(
        `Meter telemetry ingested: Gen ${productionKwh} kWh | Load ${consumptionKwh} kWh | Bat ${batteryKwh} kWh`
      );

      if (onTelemetrySent) {
        onTelemetrySent({
          production_kwh: Number(productionKwh),
          consumption_kwh: Number(consumptionKwh),
          battery_kwh: Number(batteryKwh),
        });
      }

      onClose();
    } catch (err) {
      toast.error('Failed to submit telemetry: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Simulate Smart Meter Reading"
      subtitle="Broadcast generation, household load, and battery metrics to the microgrid"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Target Meter / Solar Asset
          </label>
          <select
            value={selectedDeviceId}
            onChange={(e) => setSelectedDeviceId(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none font-medium"
            required
          >
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.device_type?.replace('_', ' ')} • {d.capacity_kwh} kWh)
              </option>
            ))}
          </select>
        </div>

        {/* Sliders / Number inputs */}
        <div className="space-y-3 pt-1">
          {/* Solar Generation */}
          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
            <div className="flex justify-between items-center text-xs font-semibold text-slate-700 mb-1">
              <span className="flex items-center space-x-1.5">
                <Sun className="w-4 h-4 text-slate-600" />
                <span>Solar PV Generation</span>
              </span>
              <span className="font-bold text-sm text-slate-900">{productionKwh} kWh</span>
            </div>
            <input
              type="range"
              min="0"
              max="25"
              step="0.1"
              value={productionKwh}
              onChange={(e) => setProductionKwh(e.target.value)}
              className="w-full accent-emerald-600"
            />
          </div>

          {/* Consumption */}
          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
            <div className="flex justify-between items-center text-xs font-semibold text-slate-700 mb-1">
              <span className="flex items-center space-x-1.5">
                <Home className="w-4 h-4 text-slate-600" />
                <span>Household Consumption</span>
              </span>
              <span className="font-bold text-sm text-slate-900">{consumptionKwh} kWh</span>
            </div>
            <input
              type="range"
              min="0"
              max="20"
              step="0.1"
              value={consumptionKwh}
              onChange={(e) => setConsumptionKwh(e.target.value)}
              className="w-full accent-emerald-600"
            />
          </div>

          {/* Battery */}
          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
            <div className="flex justify-between items-center text-xs font-semibold text-slate-700 mb-1">
              <span className="flex items-center space-x-1.5">
                <Battery className="w-4 h-4 text-slate-600" />
                <span>Battery Storage Level</span>
              </span>
              <span className="font-bold text-sm text-slate-900">{batteryKwh} kWh</span>
            </div>
            <input
              type="range"
              min="0"
              max="20"
              step="0.5"
              value={batteryKwh}
              onChange={(e) => setBatteryKwh(e.target.value)}
              className="w-full accent-emerald-600"
            />
          </div>
        </div>

        {/* Calculated Surplus / Deficit Note */}
        <div className="text-xs text-slate-600 text-center py-1.5 font-medium bg-slate-50 rounded-lg border border-slate-200/70">
          Net Energy Balance:{' '}
          <span className="font-bold text-emerald-700">
            {Number(productionKwh) >= Number(consumptionKwh)
              ? `+${(Number(productionKwh) - Number(consumptionKwh)).toFixed(1)} kWh Export Surplus`
              : `-${(Number(consumptionKwh) - Number(productionKwh)).toFixed(1)} kWh Import Deficit`}
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
            Broadcast Telemetry
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default SimulateTelemetryModal;
