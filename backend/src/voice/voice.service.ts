import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { CrmProvider } from '@prisma/client';
import OpenAI, { APIError, toFile } from 'openai';

import { OpenAIKeysService } from '../openai-keys/openai-keys.service';
import { PrismaService } from '../prisma/prisma.service';

// Whisper currently caps single uploads at 25 MB. We enforce client-side
// before bothering OpenAI; the FileInterceptor also rejects above the same
// limit.
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
// Force English transcription — avoids Whisper guessing Arabic/other locales on short clips.
const VOICE_LANGUAGE = 'en';
const WHISPER_PROMPT =
  'English speech only. CRM voice commands about contacts, calendars, and appointments.';

// Subset of intents the assistant produces. New intents land here when we
// add new CRM actions. `unknown` is the fallback so the assistant never
// crashes on an out-of-vocabulary command.
const SUPPORTED_INTENTS = [
  'list_contacts',
  'find_contact',
  'create_contact',
  'update_contact',
  'delete_contact',
  'list_calendars',
  'get_calendar',
  'create_calendar',
  'update_calendar',
  'delete_calendar',
  'get_free_slots',
  'list_appointments',
  'create_appointment',
  'cancel_appointment',
  'create_note',
  'create_task',
  'create_opportunity',
  'create_deal',
  'log_call',
  'unknown',
] as const;
type Intent = (typeof SUPPORTED_INTENTS)[number];

export type TranscribeResult = {
  transcript: string;
  intent: {
    intent: Intent;
    confidence: number;
    entities: Record<string, string | number | boolean | null>;
    needs_clarification: boolean;
    notes: string | null;
  };
};

const NORMALIZER_SYSTEM_PROMPT = `You interpret casual spoken or typed commands for a GoHighLevel CRM assistant. Users speak in everyday English — not rigid command templates.

Language (required):
- Input is always English. Output must be English only.
- The "notes" field and all entity string values must be in English — never Arabic or any other language.
- If the transcript looks non-English, still infer the closest English CRM intent; do not echo foreign-language text in notes.

Output JSON with this exact shape (no markdown, no commentary):
{
  "intent": one of ${SUPPORTED_INTENTS.map((i) => `"${i}"`).join(', ')},
  "confidence": number between 0 and 1,
  "entities": { ... extracted fields },
  "needs_clarification": boolean,
  "notes": string or null
}

Intent examples (informal → intent):
- "pull up my contacts", "who do I have in there", "show recent people" → list_contacts
- "look up Sarah", "got anyone named Mike?", "find the guy with 555-1234" → find_contact
- "add John Smith 555-1234", "put Sarah in", "save a contact for jane@test.com" → create_contact
- "remove Sarah", "delete Mike from the list", "get rid of that contact" → delete_contact
- "what calendars do I have", "show my calendars" → list_calendars
- "open the sales calendar", "show calendar details" → get_calendar
- "create a calendar called Sales", "add a new booking calendar" → create_calendar
- "update the sales calendar", "rename my calendar" → update_calendar
- "delete the test calendar" → delete_calendar
- "what slots are free tomorrow", "show available times this week" → get_free_slots
- "what's on my calendar", "any meetings tomorrow", "show upcoming appointments" → list_appointments
- "book Sarah tomorrow at 2pm", "schedule a call with Mike Friday at 10", "set up a meeting with John" → create_appointment
- "cancel Sarah's appointment", "remove tomorrow's meeting with Mike" → cancel_appointment

Entity rules:
- find_contact / delete_contact: put the search target in "query" (name, phone, or email the user mentioned). Also set "name", "phone", or "email" when obvious.
- create_contact: extract "name" (full name), or "firstName" + "lastName", plus "phone" and/or "email".
- get_calendar: "calendarId" or "calendarName".
- create_calendar: "name" (required), optional "description", "isActive".
- update_calendar: "calendarId" or "calendarName", plus fields to change ("name", "description", "isActive").
- delete_calendar: "calendarId" or "calendarName".
- get_free_slots: "calendarId" or "calendarName"; "startDate" and "endDate" as Unix ms, or "days" ahead (max 31-day window); optional "timezone", "userId".
- list_appointments: optional "startTime" / "endTime" as ISO 8601, or "days" as number of days ahead (default 14).
- create_appointment: "contactName" or "name", "title", "calendarName" if mentioned, "startTime" as ISO 8601 (infer from spoken date/time), optional "endTime" or "durationMinutes" (default 30).
- cancel_appointment: "query", "contactName", "title", and/or "startTime" to identify the booking.
- Normalize phone to digits with optional leading +.
- Lowercase emails.
- If the user clearly wants an action but a required detail is missing, set needs_clarification true and notes to a short, friendly question (not formal).
- Pick "unknown" only when it is not a CRM/contact/calendar action at all.
- Never invent details the user did not say.`;

@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);

  constructor(
    private readonly keys: OpenAIKeysService,
    private readonly prisma: PrismaService,
  ) {}

  // m4a (or any Whisper-supported format) → transcript → normalized JSON.
  // Uses the user's own OpenAI key, never a shared one.
  async transcribe(
    userId: string,
    file: Express.Multer.File | undefined,
  ): Promise<TranscribeResult> {
    if (!file) {
      throw new BadRequestException('Audio file is required (multipart field "file")');
    }
    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Audio file is empty');
    }
    if (file.size > MAX_AUDIO_BYTES) {
      throw new BadRequestException('Audio file is too large (max 25 MB)');
    }

    const apiKey = await this.keys.getDecryptedKey(userId);
    const keyStatus = await this.keys.getStatus(userId);
    const openai = new OpenAI({ apiKey });

    const filename = file.originalname || 'voice.m4a';
    const audioFile = await toFile(file.buffer, filename, { type: file.mimetype });

    let transcript: string;
    try {
      const whisper = await openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        language: VOICE_LANGUAGE,
        prompt: WHISPER_PROMPT,
      });
      transcript = whisper.text?.trim() ?? '';
    } catch (err) {
      const message = formatOpenAIError(err, 'transcription');
      this.logger.warn(
        `Whisper failure for ${userId} (key ···${keyStatus.last4 ?? '????'}): ${message}`,
      );
      await this.audit(userId, 'voice.transcribe', 'failure', { stage: 'whisper', message });
      throw new BadRequestException(message);
    }

    if (!transcript) {
      await this.audit(userId, 'voice.transcribe', 'success', { stage: 'whisper_empty' });
      return {
        transcript: '',
        intent: {
          intent: 'unknown',
          confidence: 0,
          entities: {},
          needs_clarification: true,
          notes: 'No speech detected.',
        },
      };
    }

    const intent = await this.interpretText(userId, transcript, openai);

    await this.audit(userId, 'voice.transcribe', 'success', {
      intent: intent.intent,
      confidence: intent.confidence,
    });

    return { transcript, intent };
  }

  async interpret(userId: string, text: string): Promise<TranscribeResult['intent']> {
    const trimmed = text.trim();
    if (!trimmed) {
      return {
        intent: 'unknown',
        confidence: 0,
        entities: {},
        needs_clarification: true,
        notes: 'Say what you want to do with your contacts.',
      };
    }

    const apiKey = await this.keys.getDecryptedKey(userId);
    const openai = new OpenAI({ apiKey });
    return this.interpretText(userId, trimmed, openai);
  }

  private async interpretText(
    userId: string,
    text: string,
    openai: OpenAI,
  ): Promise<TranscribeResult['intent']> {
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        temperature: 0,
        messages: [
          { role: 'system', content: NORMALIZER_SYSTEM_PROMPT },
          {
            role: 'user',
            content: `English command:\n${text}`,
          },
        ],
      });
      const raw = completion.choices[0]?.message?.content ?? '{}';
      return this.parseIntent(raw);
    } catch (err) {
      const message = formatOpenAIError(err, 'intent');
      this.logger.warn(`Normalizer failure for ${userId}: ${message}`);
      return {
        intent: 'unknown',
        confidence: 0,
        entities: {},
        needs_clarification: true,
        notes: message,
      };
    }
  }

  private parseIntent(raw: string): TranscribeResult['intent'] {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {
        intent: 'unknown',
        confidence: 0,
        entities: {},
        needs_clarification: true,
        notes: 'Normalizer returned invalid JSON.',
      };
    }

    const candidate = typeof parsed.intent === 'string' ? (parsed.intent as Intent) : 'unknown';
    const intent: Intent = (SUPPORTED_INTENTS as readonly string[]).includes(candidate)
      ? candidate
      : 'unknown';

    const confidence = clamp01(parsed.confidence);
    const entities =
      typeof parsed.entities === 'object' && parsed.entities !== null
        ? (parsed.entities as Record<string, string | number | boolean | null>)
        : {};
    const needsClarification = parsed.needs_clarification === true || intent === 'unknown';
    const notes = typeof parsed.notes === 'string' ? parsed.notes : null;

    return { intent, confidence, entities, needs_clarification: needsClarification, notes };
  }

  private async audit(
    userId: string,
    action: string,
    status: 'success' | 'failure',
    payload?: Record<string, unknown>,
  ) {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId,
          action,
          provider: null as CrmProvider | null,
          status,
          payload: payload ? (payload as object) : undefined,
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to write audit log ${action}: ${(err as Error).message}`);
    }
  }
}

function clamp01(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function formatOpenAIError(err: unknown, stage: 'transcription' | 'intent'): string {
  if (err instanceof APIError) {
    if (err.status === 429) {
      return 'Your OpenAI account has no remaining quota. Add billing or credits at platform.openai.com, then try again or rotate your key in Profile.';
    }
    if (err.status === 401) {
      return 'Your OpenAI API key is invalid or revoked. Rotate it in Profile → OpenAI key.';
    }
    if (err.status === 403) {
      return 'Your OpenAI API key cannot access this model. Check permissions or rotate the key in Profile.';
    }
  }

  const raw = err instanceof Error ? err.message : 'Request failed';
  if (/429|quota|rate limit|insufficient/i.test(raw)) {
    return 'Your OpenAI account has no remaining quota. Add billing or credits at platform.openai.com, then try again or rotate your key in Profile.';
  }
  if (/401|invalid.*api key|incorrect api key/i.test(raw)) {
    return 'Your OpenAI API key is invalid or revoked. Rotate it in Profile → OpenAI key.';
  }

  const label = stage === 'transcription' ? 'Transcription' : 'Intent parsing';
  return `${label} failed: ${raw}`;
}
