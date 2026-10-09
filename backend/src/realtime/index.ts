/**
 * Real-time channel (Socket.IO) for live assessment status + AI analysis
 * updates.
 *
 * Auth: the client passes its short-lived access token in the handshake
 * (`auth.token` or `?token=`). We verify it with the same secret as the HTTP
 * API and attach the user to the socket.
 *
 * Rooms:
 *  - `user:<id>`         — every socket for a signed-in user (all their work)
 *  - `assessment:<id>`   — joined on demand via `assessment:subscribe`, only
 *                          after an access check (a worker may only watch
 *                          their own assessments).
 *
 * The module is a no-op until `initRealtime(httpServer)` is called, so unit
 * tests that mount the Express app with supertest are unaffected.
 */
import type { Server as HttpServer } from 'node:http';
import { Server as IOServer, type Socket } from 'socket.io';
import { env } from '../config/env.js';
import { logger } from '../logger.js';
import { verifyAccess, type AuthUser } from '../auth/jwt.js';
import { Assessment } from '../models/assessment.models.js';

let io: IOServer | null = null;

const userRoom = (id: string) => `user:${id}`;
const assessmentRoom = (id: string) => `assessment:${id}`;

export function initRealtime(httpServer: HttpServer): IOServer {
  io = new IOServer(httpServer, {
    path: '/realtime',
    cors: {
      origin: env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token =
      (socket.handshake.auth?.token as string | undefined) ??
      (socket.handshake.query?.token as string | undefined);
    const user = token ? verifyAccess(token) : null;
    if (!user) {
      next(new Error('unauthorized'));
      return;
    }
    (socket.data as { user?: AuthUser }).user = user;
    next();
  });

  io.on('connection', (socket: Socket) => {
    const user = (socket.data as { user: AuthUser }).user;
    void socket.join(userRoom(user.id));

    socket.on(
      'assessment:subscribe',
      async (payload: unknown, ack?: (res: { ok: boolean; error?: string }) => void) => {
        const assessmentId =
          payload && typeof payload === 'object' && typeof (payload as { assessmentId?: unknown }).assessmentId === 'string'
            ? (payload as { assessmentId: string }).assessmentId
            : null;
        if (!assessmentId) {
          ack?.({ ok: false, error: 'assessmentId required' });
          return;
        }
        const assessment = await Assessment.findById(assessmentId).lean();
        const allowed = !!assessment && (user.role !== 'worker' || assessment.workerId === user.id);
        if (!allowed) {
          ack?.({ ok: false, error: 'forbidden' });
          return;
        }
        await socket.join(assessmentRoom(assessmentId));
        ack?.({ ok: true });
      },
    );

    socket.on('assessment:unsubscribe', (payload: unknown) => {
      const assessmentId =
        payload && typeof payload === 'object' && typeof (payload as { assessmentId?: unknown }).assessmentId === 'string'
          ? (payload as { assessmentId: string }).assessmentId
          : null;
      if (assessmentId) void socket.leave(assessmentRoom(assessmentId));
    });
  });

  logger.info({ path: '/realtime' }, 'realtime (socket.io) initialised');
  return io;
}

export function realtimeEnabled(): boolean {
  return io !== null;
}

/** Push an event to everyone watching a given assessment. */
export function emitToAssessment(assessmentId: string, event: string, data: unknown): void {
  io?.to(assessmentRoom(assessmentId)).emit(event, data);
}

/** Push an event to every socket belonging to a user. */
export function emitToUser(userId: string, event: string, data: unknown): void {
  io?.to(userRoom(userId)).emit(event, data);
}
