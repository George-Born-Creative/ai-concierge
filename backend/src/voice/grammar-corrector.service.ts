import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

import { OpenAIKeysService } from '../openai-keys/openai-keys.service';

const GRAMMAR_CORRECTOR_SYSTEM_PROMPT = `You are a specialized grammar correction component for an AI CRM voice assistant.

Your task is to correct grammar, spelling, punctuation, capitalization, and speech-to-text transcription mistakes in the user's spoken transcript.

Rules:
1. Do NOT answer questions or respond conversationally.
2. Do NOT execute commands or alter the user's intent.
3. Preserve exact names, email addresses, phone numbers, dates, numbers, URLs, and technical CRM terms (such as GoHighLevel, GHL, HubSpot, Zapier, Twilio, OpenAI, SMS).
4. Preserve spoken intent while turning fragmented or misheard speech into natural, grammatically correct English sentences.
5. Return ONLY the corrected transcript string with no commentary, no quotes, and no markdown formatting.`;

@Injectable()
export class GrammarCorrectorService {
  private readonly logger = new Logger(GrammarCorrectorService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly openAiKeysService: OpenAIKeysService,
  ) {}

  /**
   * Corrects the grammar, capitalization, and STT errors in a raw transcript.
   *
   * @param rawTranscript Raw text output from Whisper/Speech-to-Text.
   * @param userId App user ID for resolving user-specific OpenAI API keys.
   * @returns Corrected transcript string, or rawTranscript if correction fails.
   */
  async correctGrammar(rawTranscript: string, userId?: string): Promise<string> {
    const trimmed = rawTranscript?.trim();
    if (!trimmed) return rawTranscript ?? '';

    try {
      let apiKey: string | undefined;
      if (userId) {
        try {
          apiKey = await this.openAiKeysService.getDecryptedKey(userId);
        } catch {
          apiKey = this.configService.get<string>('OPENAI_API_KEY');
        }
      } else {
        apiKey = this.configService.get<string>('OPENAI_API_KEY');
      }

      if (!apiKey) {
        this.logger.warn('No OpenAI API key available for grammar correction — returning raw transcript');
        return trimmed;
      }

      const client = new OpenAI({ apiKey });

      const textModel =
        this.configService.get<string>('OPENAI_TEXT_MODEL') || 'gpt-4o-mini';

      const completion = await client.chat.completions.create({
        model: textModel,
        temperature: 0.1,
        max_tokens: 300,
        messages: [
          { role: 'system', content: GRAMMAR_CORRECTOR_SYSTEM_PROMPT },
          { role: 'user', content: trimmed },
        ],
      });

      const corrected = completion.choices[0]?.message?.content?.trim();
      if (!corrected) {
        this.logger.warn('Grammar correction returned empty response — using raw transcript');
        return trimmed;
      }

      return corrected;
    } catch (err: any) {
      this.logger.error(
        `Grammar correction failed: ${err?.message || err}. Falling back to raw transcript.`,
        err?.stack,
      );
      return trimmed;
    }
  }
}
