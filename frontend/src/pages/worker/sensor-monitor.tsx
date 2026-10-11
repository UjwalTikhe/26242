import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/providers';
import { apiClient } from '../../lib/api-client';

interface SensorReading {
  id: string;
  sensorType: string;
  unit: string;
  value: number;
  alertLevel: 'safe' | 'warning' | 'danger' | 'critical';
  timestamp: string;
}

interface Session {
  id: string;
  mode: string;
  status: string;
  trade?: string;
  scenario?: string;
  startedAt: string;
  readingCount: number;
  maxAlertLevel: string;
  violations: Array<{
    sensorType: string;
    value: number;
    threshold: number;
    at: string;
  }>;
}

export default function SensorMonitor() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [readings, setReadings] = useState<SensorReading[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [currentReading, setCurrentReading] = useState<{ type: string; value: number; unit: string } | null>(null);

  useEffect(() => {
    if (!id) return;

    // Fetch session details
    apiClient.get(`/diagnostic-sessions/${id}`).then((res) => {
      setSession(res.data);
      setIsConnected(res.data.status === 'active');
    }).catch(console.error);

    // Fetch readings
    apiClient.get(`/diagnostic-sessions/${id}/readings?limit=50`).then((res) => {
      setReadings(res.data.items);
    }).catch(console.error);

    // Simulate real-time sensor data (in production, this would be WebSocket)
    const interval = setInterval(() => {
      if (session?.status === 'active') {
        simulateSensorReading();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [id, session?.status]);

  const simulateSensorReading = () => {
    // Simulate sensor data for demo purposes
    const sensorTypes = ['temperature', 'gas_concentration', 'uv', 'pressure'];
    const type = sensorTypes[Math.floor(Math.random() * sensorTypes.length)];
    let value: number;
    let unit: string;

    switch (type) {
      case 'temperature':
        value = 25 + Math.random() * 50; // 25-75°C
        unit = '°C';
        break;
      case 'gas_concentration':
        value = Math.random() * 2000; // 0-2000 ppm
        unit = 'ppm';
        break;
      case 'uv':
        value = Math.random() * 10; // 0-10 mW/cm²
        unit = 'mW/cm²';
        break;
      case 'pressure':
        value = 1000 + Math.random() * 500; // 1000-1500 mbar
        unit = 'mbar';
        break;
      default:
        value = 0;
        unit = '';
    }

    setCurrentReading({ type, value, unit });

    // Submit reading to API
    apiClient.post('/sensor-readings', {
      sessionId: id,
      sensorType: type,
      unit,
      value,
      timestamp: new Date().toISOString(),
    }).then((res) => {
      setReadings((prev) => [res.data, ...prev].slice(0, 50));
      // Refresh session to get updated alerts
      apiClient.get(`/diagnostic-sessions/${id}`).then((r) => setSession(r.data));
    }).catch(console.error);
  };

  const completeSession = async () => {
    try {
      await apiClient.post(`/diagnostic-sessions/${id}/complete`);
      navigate(`/worker/a/${id}/result`);
    } catch (error) {
      console.error('Failed to complete session:', error);
    }
  };

  const getAlertColor = (level: string) => {
    switch (level) {
      case 'safe': return 'bg-green-500';
      case 'warning': return 'bg-yellow-500';
      case 'danger': return 'bg-orange-500';
      case 'critical': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getAlertTextColor = (level: string) => {
    switch (level) {
      case 'safe': return 'text-green-600';
      case 'warning': return 'text-yellow-600';
      case 'danger': return 'text-orange-600';
      case 'critical': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading session...</p>
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
              <h1 className="text-2xl font-bold text-gray-900">Sensor Monitor</h1>
              <p className="text-sm text-gray-600">
                {session.trade} - {session.scenario}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className={`px-3 py-1 rounded-full text-sm font-medium ${isConnected ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                {isConnected ? '● Active' : '○ Inactive'}
              </div>
              {session.status === 'active' && (
                <button
                  onClick={completeSession}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                  Complete Session
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Current Reading Panel */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Real-time Sensor Data</h2>

              {currentReading ? (
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-8 mb-6">
                  <div className="text-center">
                    <p className="text-sm text-gray-600 uppercase tracking-wide mb-2">
                      {currentReading.type.replace('_', ' ')}
                    </p>
                    <p className="text-6xl font-bold text-gray-900 mb-2">
                      {currentReading.value.toFixed(1)}
                    </p>
                    <p className="text-xl text-gray-600">{currentReading.unit}</p>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 rounded-lg p-8 mb-6">
                  <div className="text-center">
                    <p className="text-gray-400">Waiting for sensor data...</p>
                  </div>
                </div>
              )}

              {/* Alert Status */}
              <div className={`p-4 rounded-lg ${getAlertColor(session.maxAlertLevel)} bg-opacity-10 border-2 ${getAlertColor(session.maxAlertLevel)} bg-opacity-20`}>
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${getAlertColor(session.maxAlertLevel)}`} />
                  <div>
                    <p className={`font-semibold ${getAlertTextColor(session.maxAlertLevel)}`}>
                      Maximum Alert Level: {session.maxAlertLevel.toUpperCase()}
                    </p>
                    <p className="text-sm text-gray-600">
                      {session.violations.length} violation(s) detected
                    </p>
                  </div>
                </div>
              </div>

              {/* Violations List */}
              {session.violations.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Recent Violations</h3>
                  <div className="space-y-2">
                    {session.violations.slice(-5).map((violation, idx) => (
                      <div key={idx} className="bg-red-50 border border-red-200 rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-red-800">
                            {violation.sensorType.replace('_', ' ')}
                          </span>
                          <span className="text-sm text-red-600">
                            {violation.value.toFixed(1)} / {violation.threshold}
                          </span>
                        </div>
                        <p className="text-xs text-red-600 mt-1">
                          {new Date(violation.at).toLocaleTimeString()}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Session Stats */}
          <div>
            <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Session Stats</h2>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600">Status</p>
                  <p className="text-lg font-semibold text-gray-900 capitalize">{session.status}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Mode</p>
                  <p className="text-lg font-semibold text-gray-900 capitalize">{session.mode.replace('_', ' ')}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Readings Collected</p>
                  <p className="text-lg font-semibold text-gray-900">{session.readingCount}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Duration</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 60000)} min
                  </p>
                </div>
              </div>
            </div>

            {/* Safety Guidance */}
            <div className="bg-blue-50 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-blue-900 mb-3">Safety Guidance</h2>
              <ul className="space-y-2 text-sm text-blue-800">
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 mt-1">•</span>
                  <span>Stay within safe distance from hazardous sources</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 mt-1">•</span>
                  <span>Monitor sensor readings continuously</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 mt-1">•</span>
                  <span>Immediately evacuate on critical alerts</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 mt-1">•</span>
                  <span>Report all violations to trainer</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Readings History */}
        <div className="mt-6 bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Reading History</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">Time</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">Sensor</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">Value</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">Status</th>
                </tr>
              </thead>
              <tbody>
                {readings.slice(0, 20).map((reading) => (
                  <tr key={reading.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {new Date(reading.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-900 capitalize">
                      {reading.sensorType.replace('_', ' ')}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-900">
                      {reading.value.toFixed(1)} {reading.unit}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getAlertColor(reading.alertLevel)} text-white`}>
                        {reading.alertLevel.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
