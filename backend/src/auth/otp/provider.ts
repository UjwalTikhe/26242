/**
 * Phone-OTP provider interface + factory.
 *
 * Default is `mock` (no external calls, fixed/logged code) so the whole flow
 * runs locally and in tests. Swap via OTP_PROVIDER=firebase|msg91 and provide
 * keys — no code changes.
 */
import { env } from '../../config/env.js';
import { logger } from '../../logger.js';
import { AppError } from '../../errors.js';

export interface OtpProvider {
  readonly name: 'mock' | 'firebase' | 'msg91';
  /** Generate the numeric code the worker must type. */
  generateCode(): string;
  /** Deliver the code. Throws AppError(502) on provider failure. */
  send(phone: string, code: string): Promise<void>;
  /** true when the provider itself manages verification (Firebase) — the
   * local OtpCode record is then a fallback/audit trail only. */
  readonly remoteVerify: boolean;
}

function randomOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/* ------------------------------- mock ---------------------------- */

class MockOtpProvider implements OtpProvider {
  readonly name = 'mock' as const;
  readonly remoteVerify = false;

  generateCode(): string {
    return env.OTP_MOCK_CODE && env.NODE_ENV !== 'production' ? env.OTP_MOCK_CODE : randomOtp();
  }

  async send(phone: string, code: string): Promise<void> {
    // Always visible in logs so demos/tests can read it without SMS.
    logger.info({ phone, code }, '[otp:mock] code issued');
  }
}

/* ------------------------------ firebase ------------------------- */

/**
 * Firebase Identity Toolkit phone auth (REST).
 * Requires FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
 * ONLY if you mint custom tokens; for sendOtp/verify the Web API key flow is
 * used — set FIREBASE_WEB_API_KEY. Marked best-effort: not exercised in tests
 * without credentials.
 */
class FirebaseOtpProvider implements OtpProvider {
  readonly name = 'firebase' as const;
  readonly remoteVerify = true;
  private apiKey = process.env.FIREBASE_WEB_API_KEY ?? '';

  generateCode(): string {
    return randomOtp(); // Firebase ignores this for signIn flows; local trail only
  }

  async send(phone: string, code: string): Promise<void> {
    if (!this.apiKey) {
      logger.warn('FIREBASE_WEB_API_KEY not set — falling back to mock delivery');
      await new MockOtpProvider().send(phone, code);
      return;
    }
    try {
      const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phoneNumber: phone, recaptchaToken: 'mobile-flow' }),
        },
      );
      if (!res.ok) throw new Error(`firebase ${res.status}: ${await res.text()}`);
    } catch (err) {
      logger.error({ err }, 'firebase sendOtp failed');
      throw new AppError(502, 'otp_provider_error', 'Could not send OTP via Firebase');
    }
  }
}

/* ------------------------------- msg91 --------------------------- */

class Msg91OtpProvider implements OtpProvider {
  readonly name = 'msg91' as const;
  readonly remoteVerify = false;

  generateCode(): string {
    return randomOtp();
  }

  async send(phone: string, code: string): Promise<void> {
    const authKey = env.MSG91_AUTH_KEY;
    if (!authKey) {
      logger.warn('MSG91_AUTH_KEY not set — falling back to mock delivery');
      await new MockOtpProvider().send(phone, code);
      return;
    }
    try {
      const res = await fetch('https://control.msg91.com/api/v5/otp', {
        method: 'POST',
        headers: { authkey: authKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mobile: phone.replace(/^\+/, ''),
          otp: code,
          template_id: env.MSG91_TEMPLATE_ID || undefined,
          sender: env.MSG91_SENDER_ID || undefined,
        }),
      });
      const body = (await res.json()) as { type?: string };
      if (!res.ok || body.type === 'error') throw new Error(JSON.stringify(body));
    } catch (err) {
      logger.error({ err }, 'msg91 sendOtp failed');
      throw new AppError(502, 'otp_provider_error', 'Could not send OTP via MSG91');
    }
  }
}

/* ------------------------------ factory -------------------------- */

let cached: OtpProvider | null = null;

export function getOtpProvider(): OtpProvider {
  if (cached) return cached;
  cached =
    env.OTP_PROVIDER === 'firebase'
      ? new FirebaseOtpProvider()
      : env.OTP_PROVIDER === 'msg91'
        ? new Msg91OtpProvider()
        : new MockOtpProvider();
  return cached;
}
