import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../lib/api-client';

interface Device {
  id: string;
  deviceId: string;
  name: string;
  type: string;
  sensors: string[];
  associatedTrades: string[];
  batteryLevel?: number;
}

export default function NewDiagnostic() {
  const navigate = useNavigate();
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [mode, setMode] = useState('leak_detection');
  const [trade, setTrade] = useState('');
  const [scenario, setScenario] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchDevices();
  }, []);

  const fetchDevices = async () => {
    try {
      const res = await apiClient.get('/devices');
      setDevices(res.data.items);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch devices:', error);
      setLoading(false);
    }
  };

  const createSession = async () => {
    if (!selectedDevice) {
      alert('Please select a device');
      return;
    }

    setCreating(true);
    try {
      const res = await apiClient.post('/diagnostic-sessions', {
        deviceId: selectedDevice.deviceId,
        mode,
        trade: trade || undefined,
        scenario: scenario || undefined,
      });
      navigate(`/worker/sensor/${res.data.id}`);
    } catch (error) {
      console.error('Failed to create session:', error);
      alert('Failed to create session');
      setCreating(false);
    }
  };

  const scenariosByMode: Record<string, string[]> = {
    leak_detection: [
      'Water pipe leak detection',
      'Gas line leak detection',
      'Pipe network inspection',
      'Pressure testing',
    ],
    welding_hazard: [
      'Arc welding safety',
      'Gas cutting operations',
      'UV exposure monitoring',
      'Heat proximity check',
    ],
    general_monitoring: [
      'Workspace monitoring',
      'Environmental safety check',
      'Equipment health check',
    ],
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading devices...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">New Diagnostic Session</h1>
              <p className="text-sm text-gray-600">Start a new sensor-based diagnostic session</p>
            </div>
            <button
              onClick={() => navigate('/worker')}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-6">
          {/* Device Selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-3">
              Select Device
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {devices.map((device) => (
                <div
                  key={device.id}
                  onClick={() => setSelectedDevice(device)}
                  className={`p-4 rounded-lg border-2 cursor-pointer transition ${
                    selectedDevice?.id === device.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-900">{device.name}</span>
                    {device.batteryLevel !== undefined && (
                      <span className={`text-sm ${
                        device.batteryLevel > 50 ? 'text-green-600' : device.batteryLevel > 20 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {device.batteryLevel}%
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 capitalize">{device.type}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {device.sensors.slice(0, 3).map((sensor) => (
                      <span key={sensor} className="px-2 py-1 bg-gray-100 rounded text-xs text-gray-600 capitalize">
                        {sensor.replace('_', ' ')}
                      </span>
                    ))}
                    {device.sensors.length > 3 && (
                      <span className="px-2 py-1 bg-gray-100 rounded text-xs text-gray-600">
                        +{device.sensors.length - 3}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {devices.length === 0 && (
              <p className="text-sm text-gray-500 mt-2">No devices available. Please register a device first.</p>
            )}
          </div>

          {/* Diagnostic Mode */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-3">
              Diagnostic Mode
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { value: 'leak_detection', label: 'Leak Detection', icon: '💧' },
                { value: 'welding_hazard', label: 'Welding Hazard', icon: '🔥' },
                { value: 'general_monitoring', label: 'General Monitoring', icon: '📊' },
              ].map((option) => (
                <div
                  key={option.value}
                  onClick={() => setMode(option.value)}
                  className={`p-4 rounded-lg border-2 cursor-pointer transition text-center ${
                    mode === option.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-3xl mb-2">{option.icon}</div>
                  <p className="font-medium text-gray-900">{option.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Trade Selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-3">
              Trade (Optional)
            </label>
            <select
              value={trade}
              onChange={(e) => setTrade(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select trade...</option>
              <option value="electrician">Electrician</option>
              <option value="plumber">Plumber</option>
              <option value="welder">Welder</option>
              <option value="mason">Mason</option>
            </select>
          </div>

          {/* Scenario Selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-3">
              Scenario
            </label>
            <select
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select scenario...</option>
              {scenariosByMode[mode]?.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Summary */}
          {selectedDevice && (
            <div className="bg-blue-50 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 mb-2">Session Summary</h3>
              <div className="space-y-1 text-sm text-blue-800">
                <p><strong>Device:</strong> {selectedDevice.name}</p>
                <p><strong>Mode:</strong> {mode.replace('_', ' ')}</p>
                <p><strong>Trade:</strong> {trade || 'Not specified'}</p>
                <p><strong>Scenario:</strong> {scenario || 'Not specified'}</p>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <div className="flex justify-end gap-4">
            <button
              onClick={() => navigate('/worker')}
              className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
            >
              Cancel
            </button>
            <button
              onClick={createSession}
              disabled={!selectedDevice || creating}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? 'Creating...' : 'Start Session'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
