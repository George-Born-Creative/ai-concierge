import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export type SupportMailRequest = {
  caseReference: string;
  category: string;
  subject: string;
  description: string;
  diagnostics: unknown | null;
  createdAt: Date;
};

export type SupportMailUser = {
  id: string;
  email: string;
  name: string;
  provider: string | null;
  subscriptionStatus: string | null;
};

// Thin wrapper around Nodemailer. Uses a well-known service (Gmail by default)
// so callers only need an account user + password (an App Password for Gmail).
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;
  private readonly supportInbox: string | null;
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
    this.supportInbox =
      this.config.get<string>('SUPPORT_INBOX_EMAIL')?.trim() || null;

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

  async sendSupportRequestToTeam(
    request: SupportMailRequest,
    user: SupportMailUser,
  ): Promise<void> {
    if (!this.transporter) {
      throw new Error('Support email transport is not configured');
    }
    if (!this.supportInbox) {
      throw new Error('Support inbox is not configured');
    }

    const replyTo = this.safeHeader(user.email);
    const subject = `[${request.caseReference}] ${request.category} support request`;
    const accountLines = [
      `Account ID: ${user.id}`,
      `Account email: ${user.email}`,
      `CRM provider: ${user.provider ?? 'not selected'}`,
      `Subscription: ${user.subscriptionStatus ?? 'none'}`,
    ].join('\n');
    const textParts = [
      `Case: ${request.caseReference}`,
      `Category: ${request.category}`,
      `Created: ${request.createdAt.toISOString()}`,
      accountLines,
      `Subject: ${request.subject}`,
      '',
      request.description,
    ];
    const diagnostics = this.formatDiagnostics(request.diagnostics);
    if (diagnostics) {
      textParts.push('', 'Attached technical diagnostics:', diagnostics);
    }
    const text = textParts.join('\n');

    await this.transporter.sendMail({
      from: this.from,
      to: this.safeHeader(this.supportInbox),
      replyTo,
      subject,
      text,
      html: this.supportTeamHtml(request, user),
    });
  }

  async sendSupportRequestConfirmation(
    request: SupportMailRequest,
    user: SupportMailUser,
  ): Promise<void> {
    if (!this.transporter) {
      throw new Error('Support email transport is not configured');
    }

    const greeting = user.name.trim() ? `Hi ${user.name.trim()},` : 'Hi,';
    const text = [
      greeting,
      '',
      'We received your AI Concierge support request.',
      `Case reference: ${request.caseReference}`,
      `Subject: ${request.subject}`,
      '',
      'Keep the case reference for future replies. This message does not promise a response time.',
    ].join('\n');

    await this.transporter.sendMail({
      from: this.from,
      to: this.safeHeader(user.email),
      subject: `${request.caseReference} — request received`,
      text,
      html: this.supportConfirmationHtml(request, greeting),
    });
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

  private supportTeamHtml(
    request: SupportMailRequest,
    user: SupportMailUser,
  ): string {
    const field = (label: string, value: string) => `
      <tr>
        <td style="padding: 6px 12px 6px 0; color: #5F6368; vertical-align: top; white-space: nowrap;">${this.escapeHtml(label)}</td>
        <td style="padding: 6px 0; color: #202124;">${this.escapeHtml(value)}</td>
      </tr>`;

    return `
      <div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px; color: #202124;">
        <h1 style="font-size: 22px; margin: 0 0 18px;">New support request</h1>
        <table style="border-collapse: collapse; width: 100%; font-size: 14px;">
          ${field('Case', request.caseReference)}
          ${field('Category', request.category)}
          ${field('Created', request.createdAt.toISOString())}
          ${field('Account ID', user.id)}
          ${field('Account email', user.email)}
          ${field('CRM provider', user.provider ?? 'not selected')}
          ${field('Subscription', user.subscriptionStatus ?? 'none')}
          ${field('Subject', request.subject)}
        </table>
        <h2 style="font-size: 16px; margin: 24px 0 8px;">Description</h2>
        <div style="font-size: 14px; line-height: 1.55; white-space: pre-wrap; border: 1px solid #E8EAED; border-radius: 8px; padding: 14px;">${this.escapeHtml(request.description)}</div>
        ${this.supportDiagnosticsHtml(request.diagnostics)}
      </div>
    `;
  }

  private supportConfirmationHtml(
    request: SupportMailRequest,
    greeting: string,
  ): string {
    return `
      <div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #202124;">
        <p style="font-size: 15px;">${this.escapeHtml(greeting)}</p>
        <p style="font-size: 15px; line-height: 1.5;">We received your AI Concierge support request.</p>
        <div style="background: #E8F0FE; border-radius: 8px; margin: 20px 0; padding: 16px;">
          <div style="color: #5F6368; font-size: 12px; text-transform: uppercase;">Case reference</div>
          <div style="color: #174EA6; font-size: 22px; font-weight: 700; margin-top: 4px;">${this.escapeHtml(request.caseReference)}</div>
        </div>
        <p style="font-size: 14px;"><strong>Subject:</strong> ${this.escapeHtml(request.subject)}</p>
        <p style="font-size: 13px; color: #5F6368; line-height: 1.5;">Keep this case reference for future replies. This confirmation does not promise a response time.</p>
      </div>
    `;
  }

  private safeHeader(value: string): string {
    return value.replace(/[\r\n]+/g, ' ').trim();
  }

  private supportDiagnosticsHtml(diagnostics: unknown | null): string {
    const formatted = this.formatDiagnostics(diagnostics);
    if (!formatted) return '';
    return `
      <h2 style="font-size: 16px; margin: 24px 0 8px;">Attached technical diagnostics</h2>
      <p style="font-size: 13px; color: #5F6368; line-height: 1.5;">This versioned snapshot was attached with the user's consent.</p>
      <pre style="font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; background: #F8F9FA; border: 1px solid #E8EAED; border-radius: 8px; padding: 14px;">${this.escapeHtml(formatted)}</pre>`;
  }

  private formatDiagnostics(diagnostics: unknown | null): string | null {
    if (!diagnostics) return null;
    try {
      // The intake service already applies the strict allowlist. The cap is a
      // final mail-safety bound and prevents malformed legacy DB rows from
      // creating unexpectedly large messages.
      return JSON.stringify(diagnostics, null, 2).slice(0, 20_000);
    } catch {
      return null;
    }
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
