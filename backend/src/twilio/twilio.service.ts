import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type OtpChannel = 'email' | 'sms';

export interface OtpVerificationResult {
  verified: true;
  status: 'approved';
  devMode?: boolean;
}

interface TwilioVerificationResponse {
  sid: string;
  status: string;
  to: string;
  channel: string;
}

interface TwilioVerificationCheckResponse {
  status: string;
}

interface TwilioErrorResponse {
  code?: number;
  message?: string;
}

@Injectable()
export class TwilioService {
  private readonly logger = new Logger(TwilioService.name);
  private readonly accountSid: string | null;
  private readonly authToken: string | null;
  private readonly serviceSid: string | null;
  private readonly isProd: boolean;
  private readonly defaultChannel: OtpChannel;

  constructor(private readonly config: ConfigService) {
    this.isProd = this.config.get<string>('NODE_ENV') === 'production';

    const configuredChannel = this.config
      .get<string>('TWILIO_VERIFY_CHANNEL', 'email')
      .trim()
      .toLowerCase();
    this.defaultChannel = configuredChannel === 'sms' ? 'sms' : 'email';
    if (configuredChannel !== 'email' && configuredChannel !== 'sms') {
      this.logger.warn(
        `Unsupported TWILIO_VERIFY_CHANNEL "${configuredChannel}"; defaulting to email.`,
      );
    }

    this.accountSid =
      this.config.get<string>('TWILIO_ACCOUNT_SID')?.trim() || null;
    this.authToken =
      this.config.get<string>('TWILIO_AUTH_TOKEN')?.trim() || null;
    this.serviceSid =
      this.config.get<string>('TWILIO_VERIFY_SERVICE_SID')?.trim() || null;

    if (this.isConfigured()) {
      this.logger.log(
        `Twilio Verify REST client initialized (Service SID: ${this.serviceSid})`,
      );
    } else {
      this.logger.warn(
        this.isProd
          ? 'Twilio Verify is not fully configured (missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_VERIFY_SERVICE_SID).'
          : 'Twilio Verify is not configured — operating in local development OTP fallback mode.',
      );
    }
  }

  isConfigured(): boolean {
    return Boolean(this.accountSid && this.authToken && this.serviceSid);
  }

  async sendOtp(
    to: string,
    channel: OtpChannel = this.defaultChannel,
  ): Promise<{
    status: string;
    sid: string;
    to: string;
    channel: string;
    devMode?: boolean;
  }> {
    const recipient = this.normalizeRecipient(to, channel);

    if (!recipient) {
      throw new BadRequestException('Recipient is required');
    }

    if (!this.isConfigured()) {
      if (!this.isProd) {
        this.logger.warn(
          `[DEV MODE] Mock ${channel} OTP requested for "${recipient}". Dev bypass active (use code 123456 to verify).`,
        );
        return {
          status: 'pending',
          sid: 'dev_mock_sid',
          to: recipient,
          channel,
          devMode: true,
        };
      }
      throw new BadRequestException('Twilio Verify service is not configured');
    }

    try {
      // Equivalent to:
      // curl -X POST .../Verifications --data-urlencode "To=..."
      //   --data-urlencode "Channel=email" -u "ACCOUNT_SID:AUTH_TOKEN"
      const verification =
        await this.postVerifyRequest<TwilioVerificationResponse>(
          'Verifications',
          {
            To: recipient,
            Channel: channel,
          },
        );

      this.logger.log(
        `Twilio ${channel} OTP sent to ${recipient} (status: ${verification.status})`,
      );
      return {
        status: verification.status,
        sid: verification.sid,
        to: verification.to,
        channel: verification.channel,
      };
    } catch (error) {
      this.logger.error(
        `Twilio sendOtp failed for ${recipient}: ${this.errorMessage(error)}`,
      );
      throw new BadRequestException(
        'Unable to send a verification code to that recipient',
      );
    }
  }

  async verifyOtp(to: string, code: string): Promise<OtpVerificationResult> {
    const recipient = to.trim().toLowerCase();
    const cleanCode = code.trim();

    if (!recipient || !cleanCode) {
      throw new BadRequestException('Recipient and OTP code are required');
    }

    if (!this.isConfigured()) {
      if (!this.isProd) {
        const devApproved = cleanCode === '123456';
        this.logger.warn(
          `[DEV MODE] Mock OTP verification check for "${recipient}" with code "${cleanCode}" -> ${
            devApproved ? 'APPROVED' : 'FAILED'
          }`,
        );

        if (!devApproved) {
          throw new BadRequestException(
            'Invalid or expired verification code',
          );
        }

        return { verified: true, status: 'approved', devMode: true };
      }
      throw new BadRequestException('Twilio Verify service is not configured');
    }

    let status: string;
    try {
      const check =
        await this.postVerifyRequest<TwilioVerificationCheckResponse>(
          'VerificationCheck',
          {
            To: recipient,
            Code: cleanCode,
          },
        );

      status = check.status;
      this.logger.log(`Twilio verifyOtp for ${recipient}: ${status}`);
    } catch (error) {
      this.logger.error(
        `Twilio verifyOtp failed for ${recipient}: ${this.errorMessage(error)}`,
      );
      throw new BadRequestException('Invalid or expired verification code');
    }

    if (status !== 'approved') {
      this.logger.warn(
        `Twilio verification was not approved for ${recipient} (status: ${status})`,
      );
      throw new BadRequestException('Invalid or expired verification code');
    }

    return { verified: true, status: 'approved' };
  }

  private async postVerifyRequest<T>(
    resource: 'Verifications' | 'VerificationCheck',
    form: Record<string, string>,
  ): Promise<T> {
    if (!this.accountSid || !this.authToken || !this.serviceSid) {
      throw new Error('Twilio Verify service is not configured');
    }

    const authorization = Buffer.from(
      `${this.accountSid}:${this.authToken}`,
    ).toString('base64');
    const response = await fetch(
      `https://verify.twilio.com/v2/Services/${encodeURIComponent(
        this.serviceSid,
      )}/${resource}`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Basic ${authorization}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(form).toString(),
        signal: AbortSignal.timeout(15_000),
      },
    );

    const payload = (await response.json().catch(() => ({}))) as
      | T
      | TwilioErrorResponse;
    if (!response.ok) {
      const error = payload as TwilioErrorResponse;
      const code = error.code ? ` ${error.code}` : '';
      throw new Error(
        `Twilio API error${code}: ${error.message || response.statusText}`,
      );
    }

    return payload as T;
  }

  private normalizeRecipient(to: string, channel: OtpChannel): string {
    const recipient = to.trim();
    return channel === 'email' ? recipient.toLowerCase() : recipient;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
