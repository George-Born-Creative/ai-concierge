import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Twilio from 'twilio';

export type OtpChannel = 'email' | 'sms';

export interface OtpVerificationResult {
  verified: true;
  status: 'approved';
  devMode?: boolean;
}

@Injectable()
export class TwilioService {
  private readonly logger = new Logger(TwilioService.name);
  private client: Twilio.Twilio | null = null;
  private serviceSid: string | null = null;
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

    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID')?.trim();
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN')?.trim();
    this.serviceSid =
      this.config.get<string>('TWILIO_VERIFY_SERVICE_SID')?.trim() || null;

    if (accountSid && authToken && this.serviceSid) {
      try {
        this.client = Twilio(accountSid, authToken);
        this.logger.log(
          `Twilio Verify Service initialized (Service SID: ${this.serviceSid})`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to initialize Twilio client: ${this.errorMessage(error)}`,
        );
        this.client = null;
      }
    } else {
      this.logger.warn(
        this.isProd
          ? 'Twilio Verify is not fully configured (missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_VERIFY_SERVICE_SID).'
          : 'Twilio Verify is not configured — operating in local development OTP fallback mode.',
      );
    }
  }

  isConfigured(): boolean {
    return Boolean(this.client && this.serviceSid);
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

    if (!this.client || !this.serviceSid) {
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
      const verification = await this.client.verify.v2
        .services(this.serviceSid)
        .verifications.create({
          to: recipient,
          channel,
        });

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

    if (!this.client || !this.serviceSid) {
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
      const check = await this.client.verify.v2
        .services(this.serviceSid)
        .verificationChecks.create({
          to: recipient,
          code: cleanCode,
        });

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

  private normalizeRecipient(to: string, channel: OtpChannel): string {
    const recipient = to.trim();
    return channel === 'email' ? recipient.toLowerCase() : recipient;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
