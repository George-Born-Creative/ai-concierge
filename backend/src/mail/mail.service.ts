import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

// Thin wrapper around Nodemailer. Uses a well-known service (Gmail by default)
// so callers only need an account user + password (an App Password for Gmail).
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;
  // Outside production, we never block signup on email. If SMTP isn't set up or
  // the send fails, the 6-digit code is just printed to the server console so
  // the flow can be tested without any mail credentials.
  private readonly isProd: boolean;

  constructor(private readonly config: ConfigService) {
    this.isProd = this.config.get<string>('NODE_ENV') === 'production';
    const service = this.config.get<string>('MAIL_SERVICE') ?? 'gmail';
    const user = this.config.get<string>('MAIL_USER')?.trim();
    // Gmail shows App Passwords grouped as "abcd efgh ijkl mnop"; strip any
    // whitespace so a pasted-with-spaces password still authenticates.
    const pass = this.config.get<string>('MAIL_PASS')?.replace(/\s+/g, '');

    this.from =
      this.config.get<string>('MAIL_FROM') ??
      user ??
      'AI Concierge <no-reply@localhost>';

    // Allow the server to boot without mail config (e.g. local runs that don't
    // touch signup). Sending throws a clear error instead of crashing on boot.
    if (user && pass) {
      this.transporter = nodemailer.createTransport({
        service,
        auth: { user, pass },
      });
    } else {
      this.transporter = null;
      this.logger.warn(
        this.isProd
          ? 'Mail is not configured (need MAIL_USER and MAIL_PASS) — verification emails will fail to send.'
          : 'Mail is not configured — verification codes will be printed to the console (dev mode).',
      );
    }
  }

  async sendVerificationCode(
    email: string,
    name: string | null,
    code: string,
  ): Promise<void> {
    if (!this.transporter) {
      if (!this.isProd) {
        this.logDevCode(email, code);
        return;
      }
      throw new Error(
        'Email service is not configured (missing MAIL_USER / MAIL_PASS)',
      );
    }

    const greeting = name ? `Hi ${name},` : 'Hi,';
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: email,
        subject: `${code} is your AI Concierge verification code`,
        text: `${greeting}\n\nYour AI Concierge verification code is ${code}.\nIt expires shortly. If you didn't request this, you can ignore this email.`,
        html: this.verificationHtml(greeting, code),
      });
    } catch (err) {
      this.logger.error(
        `Nodemailer failed to send verification code: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      // Credentials were configured but the send failed (e.g. bad login). Do
      // NOT pretend it worked — surface the error so the app shows a real
      // failure instead of a misleading "code sent". Use the console fallback
      // only when no credentials are configured (transporter is null above).
      throw new Error('Failed to send verification email');
    }
  }

  async sendPasswordResetCode(
    email: string,
    name: string | null,
    code: string,
  ): Promise<void> {
    if (!this.transporter) {
      if (!this.isProd) {
        this.logDevResetCode(email, code);
        return;
      }
      throw new Error(
        'Email service is not configured (missing MAIL_USER / MAIL_PASS)',
      );
    }

    const greeting = name ? `Hi ${name},` : 'Hi,';
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: email,
        subject: `${code} is your AI Concierge password reset code`,
        text: `${greeting}\n\nYour AI Concierge password reset code is ${code}.\nEnter it in the app to set a new password. It expires shortly. If you didn't request this, you can ignore this email and your password will stay the same.`,
        html: this.resetHtml(greeting, code),
      });
    } catch (err) {
      this.logger.error(
        `Nodemailer failed to send password reset code: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw new Error('Failed to send password reset email');
    }
  }

  // Dev-only: print the verification code so it can be used without email.
  private logDevCode(email: string, code: string): void {
    this.logger.warn(
      `[DEV] Verification code for ${email}: ${code} (email not sent)`,
    );
  }

  // Dev-only: print the password reset code so it can be used without email.
  private logDevResetCode(email: string, code: string): void {
    this.logger.warn(
      `[DEV] Password reset code for ${email}: ${code} (email not sent)`,
    );
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

  private resetHtml(greeting: string, code: string): string {
    return `
      <div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 420px; margin: 0 auto; padding: 24px; color: #202124;">
        <p style="font-size: 15px;">${greeting}</p>
        <p style="font-size: 15px;">Use the code below to reset your AI Concierge password. Enter it in the app, then choose a new password.</p>
        <div style="font-size: 32px; font-weight: 700; letter-spacing: 8px; text-align: center; padding: 16px 0; color: #1A73E8;">${code}</div>
        <p style="font-size: 13px; color: #5F6368;">This code expires shortly. If you didn't request a password reset, you can safely ignore this email and your password will stay the same.</p>
      </div>
    `;
  }
}
