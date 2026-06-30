import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

// Thin wrapper around the Resend SDK. Centralises the API key / from-address
// config and the (small) HTML templates so callers just say "send this code".
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend | null;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    this.from =
      this.config.get<string>('MAIL_FROM') ??
      'AI Concierge <onboarding@resend.dev>';

    // Allow the server to boot without a key (e.g. local runs that don't touch
    // signup). Sending will throw a clear error instead of crashing on import.
    this.resend = apiKey ? new Resend(apiKey) : null;
    if (!this.resend) {
      this.logger.warn(
        'RESEND_API_KEY is not set — verification emails will fail to send.',
      );
    }
  }

  async sendVerificationCode(
    email: string,
    name: string | null,
    code: string,
  ): Promise<void> {
    if (!this.resend) {
      throw new Error('Email service is not configured (missing RESEND_API_KEY)');
    }

    const greeting = name ? `Hi ${name},` : 'Hi,';
    const { error } = await this.resend.emails.send({
      from: this.from,
      to: email,
      subject: `${code} is your AI Concierge verification code`,
      text: `${greeting}\n\nYour AI Concierge verification code is ${code}.\nIt expires shortly. If you didn't request this, you can ignore this email.`,
      html: this.verificationHtml(greeting, code),
    });

    if (error) {
      this.logger.error(`Resend failed to send verification code: ${error.message}`);
      throw new Error('Failed to send verification email');
    }
  }

  private verificationHtml(greeting: string, code: string): string {
    return `
      <div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 420px; margin: 0 auto; padding: 24px; color: #202124;">
        <p style="font-size: 15px;">${greeting}</p>
        <p style="font-size: 15px;">Use the code below to verify your email address and finish setting up your AI Concierge account.</p>
        <div style="font-size: 32px; font-weight: 700; letter-spacing: 8px; text-align: center; padding: 16px 0; color: #1A73E8;">${code}</div>
        <p style="font-size: 13px; color: #5F6368;">This code expires shortly. If you didn't request it, you can safely ignore this email.</p>
      </div>
    `;
  }
}
