/**
 * Handlers for sensor diagnostics endpoints
 */
import type { z } from 'zod';
import type {
  RegisterDeviceReq,
  CreateDiagnosticSessionReq,
  SensorReadingReq,
  SessionSummaryReq,
} from '@sih/contracts';
import {
  DeviceModel,
  SensorReadingModel,
  DiagnosticSessionModel,
  SafetyThresholdModel,
  DeviceAlertModel,
} from '../../models/sensor.models.js';
import { logger } from '../../logger.js';
import { userOr401, type HandlerCtx, type HandlerMap } from './types.js';

export const sensorHandlers: HandlerMap = {
  'post /api/v1/devices': async (ctx: HandlerCtx) => {
    const auth = userOr401(ctx);
    const input = ctx.body as z.infer<typeof RegisterDeviceReq>;
    const device = await DeviceModel.create({
      ...input,
      lastSeenAt: new Date(),
    });
    return { status: 201, data: device };
  },

  'get /api/v1/devices': async (ctx: HandlerCtx) => {
    const query = ctx.query as { page?: string; limit?: string };
    const page = Number(query?.page ?? 1);
    const limit = Number(query?.limit ?? 20);
    const skip = (page - 1) * limit;
    const devices = await DeviceModel.find({ isActive: true })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    const total = await DeviceModel.countDocuments({ isActive: true });
    return {
      status: 200,
      data: {
        items: devices,
        meta: { page, limit, total, hasMore: skip + devices.length < total },
      },
    };
  },

  'get /api/v1/devices/:id': async (ctx: HandlerCtx) => {
    const device = await DeviceModel.findOne({ _id: ctx.params.id, isActive: true }).lean();
    if (!device) {
      return { status: 404, data: { error: 'not_found', message: 'Device not found' } };
    }
    return { status: 200, data: device };
  },

  'patch /api/v1/devices/:id': async (ctx: HandlerCtx) => {
    const { batteryLevel, isActive } = ctx.body as any;
    const device = await DeviceModel.findOneAndUpdate(
      { _id: ctx.params.id },
      {
        ...(batteryLevel !== undefined && { batteryLevel }),
        ...(isActive !== undefined && { isActive }),
        lastSeenAt: new Date(),
      },
      { new: true },
    ).lean();
    if (!device) {
      return { status: 404, data: { error: 'not_found', message: 'Device not found' } };
    }
    return { status: 200, data: device };
  },

  'post /api/v1/diagnostic-sessions': async (ctx: HandlerCtx) => {
    const auth = userOr401(ctx);
    const input = ctx.body as z.infer<typeof CreateDiagnosticSessionReq>;
    const session = await DiagnosticSessionModel.create({
      ...input,
      workerId: auth.id,
      startedAt: new Date(),
    });
    return { status: 201, data: session };
  },

  'get /api/v1/diagnostic-sessions': async (ctx: HandlerCtx) => {
    const auth = userOr401(ctx);
    const query = ctx.query as { page?: string; limit?: string; workerId?: string; trainerId?: string };
    const page = Number(query?.page ?? 1);
    const limit = Number(query?.limit ?? 20);
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (auth.role === 'worker') {
      filter.workerId = auth.id;
    } else if (auth.role === 'assessor' || auth.role === 'authorized_assessor') {
      filter.trainerId = auth.id;
    }
    if (query?.workerId) filter.workerId = query.workerId;
    if (query?.trainerId) filter.trainerId = query.trainerId;

    const sessions = await DiagnosticSessionModel.find(filter)
      .sort({ startedAt: -1 })
      .skip(skip)
      .limit(limit);
    const total = await DiagnosticSessionModel.countDocuments(filter);
    return {
      status: 200,
      data: {
        items: sessions,
        meta: { page, limit, total, hasMore: skip + sessions.length < total },
      },
    };
  },

  'get /api/v1/diagnostic-sessions/:id': async (ctx: HandlerCtx) => {
    const session = await DiagnosticSessionModel.findOne({ _id: ctx.params.id }).lean();
    if (!session) {
      return { status: 404, data: { error: 'not_found', message: 'Session not found' } };
    }
    return { status: 200, data: session };
  },

  'post /api/v1/diagnostic-sessions/:id/complete': async (ctx: HandlerCtx) => {
    const session = await DiagnosticSessionModel.findOneAndUpdate(
      { _id: ctx.params.id, status: 'active' },
      {
        status: 'completed',
        endedAt: new Date(),
      },
      { new: true },
    ).lean();
    if (!session) {
      return { status: 404, data: { error: 'not_found', message: 'Session not found or not active' } };
    }
    return { status: 200, data: session };
  },

  'post /api/v1/diagnostic-sessions/:id/summary': async (ctx: HandlerCtx) => {
    const auth = userOr401(ctx);
    const input = ctx.body as z.infer<typeof SessionSummaryReq>;
    const session = await DiagnosticSessionModel.findOneAndUpdate(
      { _id: ctx.params.id },
      {
        trainerNotes: input.trainerNotes,
        trainerId: auth.id,
      },
      { new: true },
    ).lean();
    if (!session) {
      return { status: 404, data: { error: 'not_found', message: 'Session not found' } };
    }
    return { status: 200, data: session };
  },

  'post /api/v1/sensor-readings': async (ctx: HandlerCtx) => {
    const auth = userOr401(ctx);
    const input = ctx.body as z.infer<typeof SensorReadingReq>;

    // Get the session to verify ownership
    const session = await DiagnosticSessionModel.findOne({ _id: input.sessionId });
    if (!session || session.workerId !== auth.id) {
      return { status: 404, data: { error: 'not_found', message: 'Session not found or unauthorized' } };
    }

    // Find applicable safety threshold
    const threshold = await SafetyThresholdModel.findOne({
      sensorType: input.sensorType,
      tradePackId: session.trade,
      isActive: true,
    });

    // Determine alert level based on threshold
    let alertLevel: 'safe' | 'warning' | 'danger' | 'critical' = 'safe';
    if (threshold) {
      const warningLevel = threshold.maxSafe * threshold.warningThreshold;
      const criticalLevel = threshold.maxSafe * threshold.criticalThreshold;

      if (input.value >= threshold.maxSafe) {
        alertLevel = 'critical';
      } else if (input.value >= criticalLevel) {
        alertLevel = 'danger';
      } else if (input.value >= warningLevel) {
        alertLevel = 'warning';
      }
    }

    // Create sensor reading
    const reading = await SensorReadingModel.create({
      ...input,
      deviceId: session.deviceId,
      alertLevel,
      timestamp: new Date(input.timestamp),
    });

    // Update session reading count and max alert level
    const alertLevels = ['safe', 'warning', 'danger', 'critical'] as const;
    const currentMaxIndex = alertLevels.indexOf(session.maxAlertLevel);
    const newMaxIndex = alertLevels.indexOf(alertLevel);
    const newMaxAlertLevel = newMaxIndex > currentMaxIndex ? alertLevel : session.maxAlertLevel;

    await DiagnosticSessionModel.updateOne(
      { _id: input.sessionId },
      {
        $inc: { readingCount: 1 },
        $set: { maxAlertLevel: newMaxAlertLevel },
      },
    );

    // If alert level is warning or higher, create an alert
    if (alertLevel !== 'safe') {
      const violation = {
        sensorType: input.sensorType,
        value: input.value,
        threshold: threshold?.maxSafe || 0,
        at: new Date(input.timestamp),
      };

      await DiagnosticSessionModel.updateOne(
        { _id: input.sessionId },
        { $push: { violations: violation } },
      );

      await DeviceAlertModel.create({
        sessionId: input.sessionId,
        deviceId: session.deviceId,
        sensorType: input.sensorType,
        alertLevel,
        value: input.value,
        threshold: threshold?.maxSafe || 0,
        alertTypes: ['visual', 'audio'],
        timestamp: new Date(input.timestamp),
      });
    }

    return { status: 201, data: reading };
  },

  'get /api/v1/sensor-readings': async (ctx: HandlerCtx) => {
    const query = ctx.query as { page?: string; limit?: string; sessionId?: string; deviceId?: string };
    const page = Number(query?.page ?? 1);
    const limit = Number(query?.limit ?? 20);
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (query?.sessionId) filter.sessionId = query.sessionId;
    if (query?.deviceId) filter.deviceId = query.deviceId;

    const readings = await SensorReadingModel.find(filter)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit);
    const total = await SensorReadingModel.countDocuments(filter);
    return {
      status: 200,
      data: {
        items: readings,
        meta: { page, limit, total, hasMore: skip + readings.length < total },
      },
    };
  },

  'get /api/v1/diagnostic-sessions/:id/readings': async (ctx: HandlerCtx) => {
    const query = ctx.query as { page?: string; limit?: string };
    const page = Number(query?.page ?? 1);
    const limit = Number(query?.limit ?? 100);
    const skip = (page - 1) * limit;

    const readings = await SensorReadingModel.find({ sessionId: ctx.params.id })
      .sort({ timestamp: 1 })
      .skip(skip)
      .limit(limit);
    const total = await SensorReadingModel.countDocuments({ sessionId: ctx.params.id });
    return {
      status: 200,
      data: {
        items: readings,
        meta: { page, limit, total, hasMore: skip + readings.length < total },
      },
    };
  },

  'get /api/v1/safety-thresholds': async (ctx: HandlerCtx) => {
    const query = ctx.query as { page?: string; limit?: string; sensorType?: string; tradePackId?: string };
    const page = Number(query?.page ?? 1);
    const limit = Number(query?.limit ?? 20);
    const skip = (page - 1) * limit;

    const filter: any = { isActive: true };
    if (query?.sensorType) filter.sensorType = query.sensorType;
    if (query?.tradePackId) filter.tradePackId = query.tradePackId;

    const thresholds = await SafetyThresholdModel.find(filter)
      .sort({ sensorType: 1, tradePackId: 1 })
      .skip(skip)
      .limit(limit);
    const total = await SafetyThresholdModel.countDocuments(filter);
    return {
      status: 200,
      data: {
        items: thresholds,
        meta: { page, limit, total, hasMore: skip + thresholds.length < total },
      },
    };
  },

  'get /api/v1/safety-thresholds/:id': async (ctx: HandlerCtx) => {
    const threshold = await SafetyThresholdModel.findOne({ _id: ctx.params.id, isActive: true }).lean();
    if (!threshold) {
      return { status: 404, data: { error: 'not_found', message: 'Threshold not found' } };
    }
    return { status: 200, data: threshold };
  },

  'get /api/v1/diagnostic-sessions/:id/alerts': async (ctx: HandlerCtx) => {
    const query = ctx.query as { page?: string; limit?: string };
    const page = Number(query?.page ?? 1);
    const limit = Number(query?.limit ?? 20);
    const skip = (page - 1) * limit;

    const alerts = await DeviceAlertModel.find({ sessionId: ctx.params.id })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit);
    const total = await DeviceAlertModel.countDocuments({ sessionId: ctx.params.id });
    return {
      status: 200,
      data: {
        items: alerts,
        meta: { page, limit, total, hasMore: skip + alerts.length < total },
      },
    };
  },

  'post /api/v1/device-alerts/:id/acknowledge': async (ctx: HandlerCtx) => {
    const alert = await DeviceAlertModel.findOneAndUpdate(
      { _id: ctx.params.id },
      {
        acknowledged: true,
        acknowledgedAt: new Date(),
      },
      { new: true },
    ).lean();
    if (!alert) {
      return { status: 404, data: { error: 'not_found', message: 'Alert not found' } };
    }
    return { status: 200, data: alert };
  },
};
