import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { CrmProvider } from '@prisma/client';
import OpenAI, { APIError, toFile } from 'openai';

import { OpenAIKeysService } from '../openai-keys/openai-keys.service';
import { PrismaService } from '../prisma/prisma.service';

// Whisper currently caps single uploads at 25 MB. We enforce client-side
// before bothering OpenAI; the FileInterceptor also rejects above the same
// limit.
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

// Subset of intents the assistant produces. New intents land here when we
// add new CRM actions. `unknown` is the fallback so the assistant never
// crashes on an out-of-vocabulary command.
const SUPPORTED_INTENTS = [
  'list_contacts',
  'find_contact',
  'create_contact',
  'update_contact',
  'delete_contact',
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

const NORMALIZER_SYSTEM_PROMPT = `You convert voice-command transcripts for a CRM assistant into a strict JSON schema. The user is speaking to control GoHighLevel or HubSpot.

Output JSON with this exact shape (no markdown, no commentary):
{
  "intent": one of ${SUPPORTED_INTENTS.map((i) => `"${i}"`).join(', ')},
  "confidence": number between 0 and 1,
  "entities": { ... extracted fields like name, email, phone, title, notes, amount, ... },
  "needs_clarification": boolean,
  "notes": string or null
}

Rules:
- Pick "unknown" if the command does not fit any intent.
- Normalize phone numbers to digits only.
- Lowercase emails.
- If a required field is missing, set "needs_clarification": true.
- Never invent entities that the user did not say.`;

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

    let intent: TranscribeResult['intent'];
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        temperature: 0,
        messages: [
          { role: 'system', content: NORMALIZER_SYSTEM_PROMPT },
          { role: 'user', content: transcript },
        ],
      });
      const raw = completion.choices[0]?.message?.content ?? '{}';
      intent = this.parseIntent(raw);
    } catch (err) {
      const message = formatOpenAIError(err, 'intent');
      this.logger.warn(`Normalizer failure for ${userId}: ${message}`);
      // Best-effort: return the transcript even if normalization failed so the
      // user still sees what they said.
      intent = {
        intent: 'unknown',
        confidence: 0,
        entities: {},
        needs_clarification: true,
        notes: message,
      };
    }

    await this.audit(userId, 'voice.transcribe', 'success', {
      intent: intent.intent,
      confidence: intent.confidence,
    });

    return { transcript, intent };
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
