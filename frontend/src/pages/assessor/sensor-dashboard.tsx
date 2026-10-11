import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../lib/api-client';

interface DiagnosticSession {
  id: string;
  deviceId: string;
  workerId: string;
  mode: string;
  status: string;
  trade?: string;
  scenario?: string;
  startedAt: string;
  endedAt?: string;
  readingCount: number;
  maxAlertLevel: string;
  violations: Array<{
    sensorType: string;
    value: number;
    threshold: number;
    at: string;
  }>;
  trainerNotes?: string;
}

interface SensorReading {
  id: string;
  sensorType: string;
  unit: string;
  value: number;
  alertLevel: string;
  timestamp: string;
}

export default function SensorDashboard() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<DiagnosticSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<DiagnosticSession | null>(null);
  const [readings, setReadings] = useState<SensorReading[]>([]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      const res = await apiClient.get('/diagnostic-sessions');
      setSessions(res.data.items);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
      setLoading(false);
    }
  };

  const selectSession = async (session: DiagnosticSession) => {
    setSelectedSession(session);
    setNotes(session.trainerNotes || '');

    try {
      const res = await apiClient.get(`/diagnostic-sessions/${session.id}/readings?limit=100`);
      setReadings(res.data.items);
    } catch (error) {
      console.error('Failed to fetch readings:', error);
    }
  };

  const saveNotes = async () => {
    if (!selectedSession) return;

    try {
      await apiClient.post(`/diagnostic-sessions/${selectedSession.id}/summary`, {
        trainerNotes: notes,
      });
      alert('Notes saved successfully');
      fetchSessions();
    } catch (error) {
      console.error('Failed to save notes:', error);
      alert('Failed to save notes');
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Diagnostic Sessions Dashboard</h1>
              <p className="text-sm text-gray-600">Review trainee diagnostic sessions and sensor data</p>
            </div>
            <button
              onClick={() => navigate('/assessor')}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading sessions...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Sessions List */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Sessions ({sessions.length})</h2>
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {sessions.map((session) => (
                    <div
                      key={session.id}
                      onClick={() => selectSession(session)}
                      className={`p-4 rounded-lg border-2 cursor-pointer transition ${
                        selectedSession?.id === session.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-900 capitalize">
                          {session.mode.replace('_', ' ')}
                        </span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getAlertColor(session.maxAlertLevel)} text-white`}>
                          {session.maxAlertLevel.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-1">{session.trade || 'General'}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(session.startedAt).toLocaleString()}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs text-gray-500">{session.readingCount} readings</span>
                        <span className="text-xs text-gray-500">•</span>
                        <span className="text-xs text-gray-500 capitalize">{session.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Session Details */}
            <div className="lg:col-span-2">
              {selectedSession ? (
                <div className="space-y-6">
                  {/* Session Overview */}
                  <div className="bg-white rounded-xl shadow-sm p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Session Overview</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Mode</p>
                        <p className="text-lg font-semibold text-gray-900 capitalize">
                          {selectedSession.mode.replace('_', ' ')}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Trade</p>
                        <p className="text-lg font-semibold text-gray-900">{selectedSession.trade || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Readings</p>
                        <p className="text-lg font-semibold text-gray-900">{selectedSession.readingCount}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Max Alert</p>
                        <p className={`text-lg font-semibold ${getAlertTextColor(selectedSession.maxAlertLevel)}`}>
                          {selectedSession.maxAlertLevel.toUpperCase()}
                        </p>
                      </div>
                    </div>

                    {selectedSession.scenario && (
                      <div className="mt-4">
                        <p className="text-sm text-gray-600">Scenario</p>
                        <p className="text-gray-900">{selectedSession.scenario}</p>
                      </div>
                    )}

                    <div className="mt-4 pt-4 border-t">
                      <p className="text-sm text-gray-600">Duration</p>
                      <p className="text-gray-900">
                        {selectedSession.endedAt
                          ? `${Math.floor((new Date(selectedSession.endedAt).getTime() - new Date(selectedSession.startedAt).getTime()) / 60000)} minutes`
                          : 'In progress'
                        }
                      </p>
                    </div>
                  </div>

                  {/* Violations */}
                  {selectedSession.violations.length > 0 && (
                    <div className="bg-white rounded-xl shadow-sm p-6">
                      <h2 className="text-lg font-semibold text-gray-900 mb-4">
                        Safety Violations ({selectedSession.violations.length})
                      </h2>
                      <div className="space-y-3">
                        {selectedSession.violations.map((violation, idx) => (
                          <div key={idx} className="bg-red-50 border border-red-200 rounded-lg p-4">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-red-800 capitalize">
                                {violation.sensorType.replace('_', ' ')}
                              </span>
                              <span className="text-red-600 font-semibold">
                                {violation.value.toFixed(1)} / {violation.threshold}
                              </span>
                            </div>
                            <p className="text-sm text-red-600 mt-1">
                              {new Date(violation.at).toLocaleString()}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Readings Chart/Table */}
                  <div className="bg-white rounded-xl shadow-sm p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">
                      Sensor Readings ({readings.length})
                    </h2>
                    <div className="overflow-x-auto max-h-96 overflow-y-auto">
                      <table className="w-full">
                        <thead className="sticky top-0 bg-white">
                          <tr className="border-b">
                            <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">Time</th>
                            <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">Sensor</th>
                            <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">Value</th>
                            <th className="text-left py-3 px-4 text-sm font-semibold text-gray-900">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {readings.map((reading) => (
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

                  {/* Trainer Notes */}
                  <div className="bg-white rounded-xl shadow-sm p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Trainer Notes</h2>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Add your observations and feedback for this session..."
                      className="w-full h-32 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    />
                    <div className="flex justify-end mt-4">
                      <button
                        onClick={saveNotes}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                      >
                        Save Notes
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-xl shadow-sm p-12 text-center">
                  <div className="text-gray-400 mb-4">
                    <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Select a Session</h3>
                  <p className="text-gray-600">Choose a diagnostic session from the list to view details</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
