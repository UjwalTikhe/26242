/**
 * Mongoose models for sensor diagnostics
 */
import { Schema, model } from 'mongoose';
import {
  Device,
  SensorReading,
  DiagnosticSession,
  SafetyThreshold,
  DeviceAlert,
} from '@sih/contracts';

export interface DeviceDoc {
  _id: string;
  deviceId: string;
  serialNumber?: string;
  type: 'wearable' | 'handheld' | 'fixed';
  name: string;
  sensors: ('acoustic' | 'pressure' | 'gas_concentration' | 'temperature' | 'uv' | 'proximity' | 'vibration')[];
  associatedTrades: string[];
  firmwareVersion?: string;
  batteryLevel?: number;
  lastSeenAt?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DeviceSchema = new Schema<DeviceDoc>(
  {
    _id: { type: String, required: true },
    deviceId: { type: String, required: true, unique: true },
    serialNumber: { type: String },
    type: { type: String, enum: ['wearable', 'handheld', 'fixed'], required: true },
    name: { type: String, required: true },
    sensors: {
      type: [String],
      enum: ['acoustic', 'pressure', 'gas_concentration', 'temperature', 'uv', 'proximity', 'vibration'],
      required: true,
    },
    associatedTrades: { type: [String], default: [] },
    firmwareVersion: { type: String },
    batteryLevel: { type: Number, min: 0, max: 100 },
    lastSeenAt: { type: Date },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

DeviceSchema.index({ deviceId: 1 });
DeviceSchema.index({ type: 1 });
DeviceSchema.index({ associatedTrades: 1 });

export interface SensorReadingDoc {
  _id: string;
  deviceId: string;
  sessionId: string;
  sensorType: 'acoustic' | 'pressure' | 'gas_concentration' | 'temperature' | 'uv' | 'proximity' | 'vibration';
  unit: string;
  value: number;
  rawValue?: number;
  location?: {
    lat: number;
    lng: number;
    accuracy?: number;
  };
  accuracy?: number;
  alertLevel: 'safe' | 'warning' | 'danger' | 'critical';
  timestamp: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SensorReadingSchema = new Schema<SensorReadingDoc>(
  {
    _id: { type: String, required: true },
    deviceId: { type: String, required: true },
    sessionId: { type: String, required: true },
    sensorType: {
      type: String,
      enum: ['acoustic', 'pressure', 'gas_concentration', 'temperature', 'uv', 'proximity', 'vibration'],
      required: true,
    },
    unit: { type: String, required: true },
    value: { type: Number, required: true },
    rawValue: { type: Number },
    location: {
      lat: { type: Number },
      lng: { type: Number },
      accuracy: { type: Number },
    },
    accuracy: { type: Number, min: 0, max: 1 },
    alertLevel: { type: String, enum: ['safe', 'warning', 'danger', 'critical'], default: 'safe' },
    timestamp: { type: Date, required: true },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

SensorReadingSchema.index({ deviceId: 1, timestamp: -1 });
SensorReadingSchema.index({ sessionId: 1, timestamp: 1 });
SensorReadingSchema.index({ sensorType: 1, timestamp: -1 });
SensorReadingSchema.index({ alertLevel: 1 });

export interface DiagnosticSessionDoc {
  _id: string;
  deviceId: string;
  workerId: string;
  assessmentId?: string;
  trainerId?: string;
  mode: 'leak_detection' | 'welding_hazard' | 'general_monitoring';
  status: 'active' | 'paused' | 'completed' | 'aborted';
  trade?: string;
  scenario?: string;
  startedAt: Date;
  endedAt?: Date;
  readingCount: number;
  maxAlertLevel: 'safe' | 'warning' | 'danger' | 'critical';
  violations: Array<{
    sensorType: string;
    value: number;
    threshold: number;
    at: Date;
    resolvedAt?: Date;
  }>;
  trainerNotes?: string;
  summary?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DiagnosticSessionSchema = new Schema<DiagnosticSessionDoc>(
  {
    _id: { type: String, required: true },
    deviceId: { type: String, required: true },
    workerId: { type: String, required: true },
    assessmentId: { type: String },
    trainerId: { type: String },
    mode: { type: String, enum: ['leak_detection', 'welding_hazard', 'general_monitoring'], required: true },
    status: { type: String, enum: ['active', 'paused', 'completed', 'aborted'], default: 'active' },
    trade: { type: String },
    scenario: { type: String },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date },
    readingCount: { type: Number, default: 0 },
    maxAlertLevel: { type: String, enum: ['safe', 'warning', 'danger', 'critical'], default: 'safe' },
    violations: [
      {
        sensorType: { type: String, required: true },
        value: { type: Number, required: true },
        threshold: { type: Number, required: true },
        at: { type: Date, required: true },
        resolvedAt: { type: Date },
      },
    ],
    trainerNotes: { type: String },
    summary: { type: String },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

DiagnosticSessionSchema.index({ deviceId: 1, startedAt: -1 });
DiagnosticSessionSchema.index({ workerId: 1, startedAt: -1 });
DiagnosticSessionSchema.index({ assessmentId: 1 });
DiagnosticSessionSchema.index({ trainerId: 1, startedAt: -1 });
DiagnosticSessionSchema.index({ status: 1 });

export interface SafetyThresholdDoc {
  _id: string;
  sensorType: 'acoustic' | 'pressure' | 'gas_concentration' | 'temperature' | 'uv' | 'proximity' | 'vibration';
  tradePackId?: string;
  name: string;
  standardRef?: string;
  maxSafe: number;
  warningThreshold: number;
  criticalThreshold: number;
  unit: string;
  durationLimitSec?: number;
  notes?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SafetyThresholdSchema = new Schema<SafetyThresholdDoc>(
  {
    _id: { type: String, required: true },
    sensorType: {
      type: String,
      enum: ['acoustic', 'pressure', 'gas_concentration', 'temperature', 'uv', 'proximity', 'vibration'],
      required: true,
    },
    tradePackId: { type: String },
    name: { type: String, required: true },
    standardRef: { type: String },
    maxSafe: { type: Number, required: true },
    warningThreshold: { type: Number, min: 0, max: 1, default: 0.7 },
    criticalThreshold: { type: Number, min: 0, max: 1, default: 0.9 },
    unit: { type: String, required: true },
    durationLimitSec: { type: Number },
    notes: { type: String },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

SafetyThresholdSchema.index({ sensorType: 1, tradePackId: 1 });
SafetyThresholdSchema.index({ isActive: 1 });

export interface DeviceAlertDoc {
  _id: string;
  sessionId: string;
  deviceId: string;
  sensorType: 'acoustic' | 'pressure' | 'gas_concentration' | 'temperature' | 'uv' | 'proximity' | 'vibration';
  alertLevel: 'safe' | 'warning' | 'danger' | 'critical';
  value: number;
  threshold: number;
  alertTypes: ('visual' | 'audio' | 'haptic' | 'notification')[];
  acknowledged: boolean;
  acknowledgedAt?: Date;
  timestamp: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DeviceAlertSchema = new Schema<DeviceAlertDoc>(
  {
    _id: { type: String, required: true },
    sessionId: { type: String, required: true },
    deviceId: { type: String, required: true },
    sensorType: {
      type: String,
      enum: ['acoustic', 'pressure', 'gas_concentration', 'temperature', 'uv', 'proximity', 'vibration'],
      required: true,
    },
    alertLevel: { type: String, enum: ['safe', 'warning', 'danger', 'critical'], required: true },
    value: { type: Number, required: true },
    threshold: { type: Number, required: true },
    alertTypes: {
      type: [String],
      enum: ['visual', 'audio', 'haptic', 'notification'],
      default: ['visual'],
    },
    acknowledged: { type: Boolean, default: false },
    acknowledgedAt: { type: Date },
    timestamp: { type: Date, required: true },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

DeviceAlertSchema.index({ sessionId: 1, timestamp: -1 });
DeviceAlertSchema.index({ deviceId: 1, timestamp: -1 });
DeviceAlertSchema.index({ acknowledged: 1 });

export const DeviceModel = model<DeviceDoc>('Device', DeviceSchema);
export const SensorReadingModel = model<SensorReadingDoc>('SensorReading', SensorReadingSchema);
export const DiagnosticSessionModel = model<DiagnosticSessionDoc>('DiagnosticSession', DiagnosticSessionSchema);
export const SafetyThresholdModel = model<SafetyThresholdDoc>('SafetyThreshold', SafetyThresholdSchema);
export const DeviceAlertModel = model<DeviceAlertDoc>('DeviceAlert', DeviceAlertSchema);
