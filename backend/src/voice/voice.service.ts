/// <reference types="multer" />
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
  'list_pipelines',
  'list_opportunities',
  'find_opportunity',
  'create_opportunity',
  'update_opportunity',
  'update_opportunity_status',
  'delete_opportunity',
  'list_companies',
  'find_company',
  'create_company',
  'update_company',
  'delete_company',
  'attach_contact_to_company',
  'detach_contact_from_company',
  'attach_deal_to_company',
  'detach_deal_from_company',
  'list_tickets',
  'find_ticket',
  'create_ticket',
  'update_ticket',
  'delete_ticket',
  'attach_ticket_to_contact',
  'detach_ticket_from_contact',
  'attach_ticket_to_company',
  'detach_ticket_from_company',
  'attach_ticket_to_deal',
  'detach_ticket_from_deal',
  'list_products',
  'find_product',
  'create_product',
  'update_product',
  'delete_product',
  'list_orders',
  'find_order',
  'create_order',
  'update_order',
  'delete_order',
  'attach_order_to_contact',
  'detach_order_from_contact',
  'attach_order_to_company',
  'detach_order_from_company',
  'attach_order_to_deal',
  'detach_order_from_deal',
  'create_note',
  'create_task',
  'create_deal',
  'log_call',
  'unknown',
] as const;
type Intent = (typeof SUPPORTED_INTENTS)[number];

export type VoiceIntentPayload = {
  intent: Intent;
  confidence: number;
  entities: Record<string, string | number | boolean | null>;
  needs_clarification: boolean;
  notes: string | null;
};

/**
 * Response shape for POST /voice/transcribe.
 *
 * Historically this endpoint also ran the gpt-4o-mini intent normalizer
 * before responding, doubling perceived latency on every voice command.
 * The normalizer now runs in /assistant/.../commands instead, where it
 * has access to conversation history + session context anyway. Voice
 * just returns the transcript as soon as Whisper finishes.
 */
export type TranscribeResult = {
  transcript: string;
};

const NORMALIZER_SYSTEM_PROMPT = `You interpret casual spoken or typed commands for a GoHighLevel CRM assistant. Users speak in everyday English — not rigid command templates.

Language (required):
- Input is always English. Output must be English only.
- The "notes" field and all entity string values must be in English — never Arabic or any other language.
- If the transcript looks non-English, still infer the closest English CRM intent; do not echo foreign-language text in notes.

Calendar / date math (required):
- Always use the proleptic Gregorian calendar (no Hijri, no Julian, no other system).
- The user prompt includes a "Current date/time (Gregorian calendar)" block. Treat that as the authoritative "now" — do NOT rely on internal knowledge of today's date.
- "today" = the date in the Now block. "tomorrow" = Now + 1 day. "yesterday" = Now - 1 day. "Friday" / "Monday" / etc. = the next occurrence of that weekday on or after Now. "next week" = +7 days. "in two weeks" = +14 days.
- The year for any computed date MUST be the current Gregorian year (or the next one only if the date would otherwise be in the past). Never emit a year from before the Now block.
- "startTime" and "endTime" entities must be ISO 8601 with the same UTC offset shown in the Now block (e.g. "2026-05-28T14:00:00+03:00"). Do not emit a bare date.
- "9am" → "09:00". "2pm" → "14:00". If no time is given for an appointment, ask for one via needs_clarification — do not assume midnight.

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
- "what pipelines do I have", "show my sales pipelines" → list_pipelines
- "show my opportunities", "list open deals", "what's in the Sales pipeline" → list_opportunities
- "find the website redesign opportunity", "look up John's deal" → find_opportunity
- "create an opportunity called Website Redesign for John Smith worth 2500 in Sales Pipeline", "add a deal worth $2500 for John", "put Website Redesign into Sales Pipeline", "create a sales opportunity for John Smith" → create_opportunity
- "rename the Acme deal", "update opportunity Website Redesign to 3500", "move the John deal to Negotiation stage" → update_opportunity
- "mark the Acme deal won", "set the Website Redesign opportunity to lost", "move that opportunity to abandoned" → update_opportunity_status
- "delete the Acme opportunity", "remove the John Smith deal" → delete_opportunity
- "list my companies", "show recent companies", "what accounts do I have", "pull up my organizations" → list_companies
- "find the Acme company", "look up the company acme.com", "show me Globex" → find_company
- "create a company called Acme Corp with domain acme.com in the software industry", "add an account named Globex", "save Initech as a company in Boston" → create_company
- "update Acme's industry to software", "set the Globex phone to 555-1234", "rename Initech to Initech LLC", "change that company's website to acme.com" → update_company
- "delete the Acme company", "remove the Globex account", "drop Initech from my companies" → delete_company
- "attach John Smith to Acme", "associate Sarah with the Globex company", "link contact jane@test.com to Initech" → attach_contact_to_company
- "detach John Smith from Acme", "unlink Sarah from Globex", "remove the contact association from Initech" → detach_contact_from_company
- "attach the Website Redesign deal to Acme", "link deal 12345 to Globex", "associate that opportunity with Initech" → attach_deal_to_company
- "detach the Website Redesign deal from Acme", "unlink deal 12345 from Globex" → detach_deal_from_company
- "list my tickets", "show recent tickets", "what support tickets do I have", "any open tickets" → list_tickets
- "find the login bug ticket", "look up the ticket about billing", "show me ticket 12345" → find_ticket
- "create a ticket titled Login bug", "open a ticket about the checkout crash with high priority", "log a support ticket called Refund request" → create_ticket
- "set the Login bug ticket priority to urgent", "rename that ticket to Payment failure", "move the ticket to stage Waiting on us", "change its priority to low" → update_ticket
- "delete the Login bug ticket", "remove that ticket", "close out ticket 12345" → delete_ticket
- "attach the Login bug ticket to John Smith", "link that ticket to jane@test.com" → attach_ticket_to_contact
- "detach the Login bug ticket from John Smith", "unlink that ticket from Sarah" → detach_ticket_from_contact
- "attach the Login bug ticket to Acme", "associate that ticket with the Globex company" → attach_ticket_to_company
- "detach the Login bug ticket from Acme", "unlink that ticket from Globex" → detach_ticket_from_company
- "attach the Login bug ticket to the Website Redesign deal", "link that ticket to deal 12345" → attach_ticket_to_deal
- "detach the Login bug ticket from the Website Redesign deal" → detach_ticket_from_deal
- "list my products", "show my product catalog", "what products do I sell", "show recent products" → list_products
- "find the Pro Plan product", "look up the product with SKU ABC-123", "show me product 12345" → find_product
- "create a product called Pro Plan for $99", "add a product named Onboarding Fee priced at 250 with SKU OB-1" → create_product
- "raise the Pro Plan price to 129", "rename that product to Pro Plan Annual", "update the product SKU to PP-2", "change its cost to 40" → update_product
- "delete the Pro Plan product", "remove that product", "delete product 12345" → delete_product
- "list my orders", "show recent orders", "what orders do I have", "show my order history" → list_orders
- "find the order for Acme", "look up order 12345", "show me the March renewal order" → find_order
- "create an order called March Renewal for $499", "add an order named Q2 Hardware with status Packing", "open an order for 1200 dollars" → create_order
- "mark the March Renewal order as shipped", "set that order total to 650", "rename the order to Q2 Renewal", "move the order to stage Processing" → update_order
- "delete the March Renewal order", "remove that order", "delete order 12345" → delete_order
- "attach the March Renewal order to John Smith", "link that order to jane@test.com" → attach_order_to_contact
- "detach the March Renewal order from John Smith", "unlink that order from Sarah" → detach_order_from_contact
- "attach the March Renewal order to Acme", "associate that order with the Globex company" → attach_order_to_company
- "detach the March Renewal order from Acme", "unlink that order from Globex" → detach_order_from_company
- "attach the March Renewal order to the Website Redesign deal", "link that order to deal 12345" → attach_order_to_deal
- "detach the March Renewal order from the Website Redesign deal" → detach_order_from_deal

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
- list_opportunities: optional "pipelineName"/"pipelineId", "pipelineStageName"/"pipelineStageId", "status" (open/won/lost/abandoned/all), "contactName"/"contactId", "query", "limit".
- find_opportunity: put the search target in "query" — the user's words (deal/opportunity name, contact mentioned, or phrase). Optional "pipelineName".
- create_opportunity: "contactName" or "contactId" (REQUIRED — GHL won't accept an opportunity without a contact; extract from "for X", "with X", "X's deal"), "name" (the opportunity title — usually the phrase after "called"/"named", or the noun phrase the user is creating), "pipelineName" or "pipelineId" (the pipeline the deal lives in, REQUIRED), optional "pipelineStageName"/"pipelineStageId", optional "monetaryValue" (number — extract from "worth 2500", "5000 dollars", "$2.5k"; ALSO accept obvious typos / mishearings like "wars 2500", "wort 2500", "wert 2500" as monetary value), optional "status" (default "open"), optional "assignedTo", optional "source". When some required fields are missing, still emit intent "create_opportunity" with the fields you have AND set needs_clarification = true asking ONE specific missing field.
- update_opportunity: "opportunityId"/"opportunityName"/"query" to identify which; plus any of "name", "pipelineName"/"pipelineId", "pipelineStageName"/"pipelineStageId", "status", "monetaryValue", "assignedTo", "source".
- update_opportunity_status: "opportunityId"/"opportunityName"/"query" to identify; "status" required (open/won/lost/abandoned); optional "lostReasonId" when status is "lost".
- delete_opportunity: "opportunityId"/"opportunityName"/"query".
- For any opportunity intent that refers to "it" / "that deal" / "the opportunity", reuse lastOpportunityId/lastOpportunityName/lastPipelineId/lastPipelineName from session context.
- list_companies: no entities required.
- find_company / delete_company: put the search target in "query" (company name or domain). Also set "companyName" or "companyDomain" when obvious.
- create_company: "companyName" (REQUIRED — extract from "called X", "named X", or "company X"), optional "companyDomain" (extract from "domain X" / "at acme.com" / "website acme.com"), optional "companyPhone", "companyIndustry", "companyCity", "companyState", "companyCountry", "companyEmployees" (number — extract from "10 employees", "5 people", "team of 25"), "companyDescription", "companyWebsite". If only "name" is given, that means the company name.
- update_company: identify the company via "companyId", "companyName", or "companyDomain" (or session lastCompanyId); plus any of "newCompanyName", "companyDomain", "companyPhone", "companyIndustry", "companyCity", "companyState", "companyCountry", "companyEmployees", "companyDescription", "companyWebsite" to set.
- attach_contact_to_company / detach_contact_from_company: identify the company via "companyName"/"companyDomain"/"companyId" (or session lastCompanyId), and the contact via "contactName"/"contactId"/"contactEmail"/"contactPhone".
- attach_deal_to_company / detach_deal_from_company: identify the company via "companyName"/"companyDomain"/"companyId" (or session lastCompanyId), and the deal via "dealName" or "dealId".
- For any company intent that refers to "it" / "that company" / "the account", reuse lastCompanyId/lastCompanyName from session context.
- list_tickets: no entities required.
- find_ticket / delete_ticket: put the search target in "query" (ticket subject or keyword). Also set "ticketSubject" or "ticketId" when obvious.
- create_ticket: "ticketSubject" (REQUIRED — extract from "titled X", "called X", "about X"), optional "ticketContent" (the description/body), optional "ticketPriority" (must be LOW/MEDIUM/HIGH/URGENT — map "urgent"→URGENT, "high"→HIGH, "normal"/"medium"→MEDIUM, "low"→LOW), optional "ticketPipeline", "ticketStage". If only "subject"/"name" is given, that is the ticket subject.
- update_ticket: identify the ticket via "ticketId" or "ticketSubject" (or session lastTicketId); plus any of "newTicketSubject", "newTicketContent", "newTicketPriority" (LOW/MEDIUM/HIGH/URGENT), "newTicketStage" to set.
- attach_ticket_to_contact / detach_ticket_from_contact: identify the ticket via "ticketSubject"/"ticketId" (or session lastTicketId), and the contact via "contactName"/"contactId"/"contactEmail"/"contactPhone".
- attach_ticket_to_company / detach_ticket_from_company: identify the ticket via "ticketSubject"/"ticketId" (or session lastTicketId), and the company via "companyName"/"companyDomain"/"companyId".
- attach_ticket_to_deal / detach_ticket_from_deal: identify the ticket via "ticketSubject"/"ticketId" (or session lastTicketId), and the deal via "dealName" or "dealId".
- For any ticket intent that refers to "it" / "that ticket", reuse lastTicketId/lastTicketSubject from session context.
- list_products / find_product: for find_product put the search target (name or SKU) in "query"; also set "productName" or "productSku" when obvious.
- create_product: "productName" (REQUIRED — extract from "called X", "named X"), optional "productPrice" (number — from "for $99", "priced at 250"), optional "productSku" (from "SKU X"), optional "productDescription", optional "productCost" (number — from "cost 40").
- update_product: identify the product via "productId" or "productName" (or session lastProductId); plus any of "newProductName", "newProductPrice" (number), "newProductSku", "newProductDescription", "newProductCost" (number) to set. A bare "productName" identifies which product, not the new name.
- delete_product: put the product name or SKU in "query" (or "productName"/"productId").
- For any product intent that refers to "it" / "that product", reuse lastProductId/lastProductName from session context.
- list_orders: no entities required.
- find_order / delete_order: put the search target in "query" (order name or keyword). Also set "orderName" or "orderId" when obvious.
- create_order: "orderName" (REQUIRED — extract from "called X", "named X", "for X"), optional "orderTotalPrice" (number — from "for $499", "total 1200", "worth 650"), optional "orderCurrency" (ISO code like USD), optional "orderStatus" (fulfillment status such as Packing/Shipped/Delivered), optional "orderPipeline", "orderStage", "ownerId". Pipeline/stage are defaulted server-side, so don't ask for them. If only "name" is given, that is the order name.
- update_order: identify the order via "orderId" or "orderName" (or session lastOrderId); plus any of "newOrderName", "newOrderTotalPrice" (number), "newOrderStatus", "newOrderCurrency", "newOrderStage" to set. A bare "orderName" identifies which order, not the new name.
- attach_order_to_contact / detach_order_from_contact: identify the order via "orderName"/"orderId" (or session lastOrderId), and the contact via "contactName"/"contactId"/"contactEmail"/"contactPhone".
- attach_order_to_company / detach_order_from_company: identify the order via "orderName"/"orderId" (or session lastOrderId), and the company via "companyName"/"companyDomain"/"companyId".
- attach_order_to_deal / detach_order_from_deal: identify the order via "orderName"/"orderId" (or session lastOrderId), and the deal via "dealName" or "dealId".
- For any order intent that refers to "it" / "that order", reuse lastOrderId/lastOrderName from session context.
- Normalize phone to digits with optional leading +.
- Lowercase emails.
- If the user clearly wants an action but a required detail is missing, set needs_clarification true and notes to a short, friendly question (not formal).
- Pick "unknown" only when it is not a CRM/contact/calendar action at all.
- Never invent details the user did not say.

Spoken email reconstruction (REQUIRED whenever you emit an "email" or "newEmail" entity):
- Voice transcripts arrive as natural language: "john at gmail dot com", "test underscore one at borncreative dot net", "j dot smith at example dot co dot uk". Reconstruct these into a proper email before emitting them.
- Apply these substitutions inside the email span only — never to surrounding English text like "look at me":
  - " at " → "@"
  - " dot " → "."
  - " underscore " → "_"
  - " dash " / " hyphen " → "-"
  - " plus " → "+"
- After substitution, strip all whitespace inside the result and lowercase it.
- Examples:
  - "john at gmail dot com" → "john@gmail.com"
  - "Sarah at example dot com" → "sarah@example.com"
  - "test underscore one at borncreative dot net" → "test_one@borncreative.net"
  - "j dot smith at example dot co dot uk" → "j.smith@example.co.uk"
- If the user spells the address one letter at a time ("j-o-h-n at g-m-a-i-l dot com"), join the letters then apply the rules above.
- The result MUST contain exactly one "@" and at least one "." in the domain. If you cannot reach that shape, omit the email entity entirely and set needs_clarification = true with a short note asking for the email again.

Conversation context (when provided):
- Use prior user/assistant turns to resolve pronouns and omissions ("him", "her", "that appointment", "same calendar", "book them", "that deal", "it").
- Use session context JSON for lastContactName, lastCalendarName, lastAppointmentId, lastOpportunityId, lastOpportunityName, lastPipelineId, lastPipelineName, lastCompanyId, lastCompanyName, lastTicketId, lastTicketSubject, lastProductId, lastProductName, lastOrderId, lastOrderName when the user refers to "that" / "them" / "it".
- If session context has a "pendingIntent" object, the backend is in the middle of collecting fields for it. Treat the latest user message as the answer to "pendingIntent.missing[0]" (the next missing field) and re-emit the SAME intent name with all previous entities plus the new piece. Do NOT switch intents.
- If the latest message is a short follow-up answer (e.g. "Sales", "$2500", "tomorrow at 2", "John Smith", "yes", "sure", "go ahead", "do it"), look at the LAST assistant turn — if it was a clarification question, re-emit the ORIGINAL intent (e.g. create_opportunity) with all previously known entities PLUS the new piece of information the user just provided. Do not ask the same question again, and do not switch intents.
- Treat "yes", "yeah", "yep", "sure", "ok", "okay", "right", "correct", "proceed", "continue", "go ahead", "do it", "sounds good" as positive confirmation of the most recent proposed action — re-emit that action's intent with all known entities and needs_clarification = false.
- Still set needs_clarification when a required field cannot be inferred from history or session.`;

export type ConversationHistoryTurn = {
  command: string;
  response: string;
};

export type SessionContextPayload = Record<string, unknown>;

@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);

  constructor(
    private readonly keys: OpenAIKeysService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // Audio file → transcript via OpenAI's STT endpoint. Uses the user's own
  // OpenAI key, never a shared one. The intent normalizer used to run here
  // too, but it now runs in /assistant/.../commands so the user sees the
  // transcript as soon as Whisper finishes — saves ~1-2s of perceived
  // latency on every voice command.
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
        // gpt-4o-mini-transcribe is a drop-in faster replacement for whisper-1
        // on the same endpoint; ~30-50% lower latency on short English clips.
        model: 'gpt-4o-mini-transcribe',
        language: VOICE_LANGUAGE,
        prompt: WHISPER_PROMPT,
      });
      transcript = reconstructSpokenEmailsInText(whisper.text?.trim() ?? '');
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
      return { transcript: '' };
    }

    // Whisper / gpt-4o-mini-transcribe routinely hallucinate a short stock
    // phrase ("you", "Thank you.", "Bye.", "Thanks for watching") when handed
    // silence or background noise. Treat those as no-speech so the caller
    // surfaces "voice not detected" instead of running a phantom command.
    if (isLikelyHallucination(transcript)) {
      await this.audit(userId, 'voice.transcribe', 'success', {
        stage: 'whisper_noise',
        transcript,
      });
      return { transcript: '' };
    }

    await this.audit(userId, 'voice.transcribe', 'success', { stage: 'whisper_only' });

    return { transcript };
  }

  async interpret(userId: string, text: string): Promise<VoiceIntentPayload> {
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

  async interpretWithContext(
    userId: string,
    text: string,
    history: ConversationHistoryTurn[],
    sessionContext?: SessionContextPayload | null,
  ): Promise<VoiceIntentPayload> {
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
    return this.interpretText(userId, trimmed, openai, history, sessionContext);
  }

  private async interpretText(
    userId: string,
    text: string,
    openai: OpenAI,
    history: ConversationHistoryTurn[] = [],
    sessionContext?: SessionContextPayload | null,
  ): Promise<VoiceIntentPayload> {
    try {
      const userContent = this.buildInterpretUserContent(text, history, sessionContext);
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        temperature: 0,
        messages: [
          { role: 'system', content: NORMALIZER_SYSTEM_PROMPT },
          {
            role: 'user',
            content: userContent,
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

  private buildInterpretUserContent(
    text: string,
    history: ConversationHistoryTurn[],
    sessionContext?: SessionContextPayload | null,
  ): string {
    const parts: string[] = [];

    // Anchor the LLM to the real current date so phrases like "tomorrow",
    // "Friday", "next week" resolve against today (Gregorian) and not the
    // model's stale training cutoff. Without this it routinely emits a
    // startTime in the wrong year.
    parts.push(this.buildNowContext());

    if (sessionContext && Object.keys(sessionContext).length > 0) {
      parts.push(`Session context JSON:\n${JSON.stringify(sessionContext)}`);
    }
    if (history.length > 0) {
      const turns = history
        .slice(-15)
        .map(
          (turn, index) =>
            `Turn ${index + 1}\nUser: ${turn.command}\nAssistant: ${turn.response}`,
        )
        .join('\n\n');
      parts.push(`Prior conversation:\n${turns}`);
    }
    parts.push(`Latest English command:\n${text}`);
    return parts.join('\n\n');
  }

  /**
   * Build a "now" block for the LLM. Uses the GHL calendar timezone when one
   * is configured (so booking math matches what the calendar will accept);
   * otherwise falls back to the server's timezone.
   */
  private buildNowContext(): string {
    const timeZone =
      this.config.get<string>('GHL_CALENDAR_TIMEZONE')?.trim() ||
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      'UTC';

    const now = new Date();

    const dateParts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'long',
    }).formatToParts(now);

    const get = (type: string) => dateParts.find((p) => p.type === type)?.value ?? '';
    const year = get('year');
    const month = get('month');
    const day = get('day');
    const weekday = get('weekday');

    const timeParts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const hour = timeParts.find((p) => p.type === 'hour')?.value ?? '00';
    const minute = timeParts.find((p) => p.type === 'minute')?.value ?? '00';

    const offsetMinutes = this.timeZoneOffsetMinutes(now, timeZone);
    const offsetSign = offsetMinutes >= 0 ? '+' : '-';
    const absOffset = Math.abs(offsetMinutes);
    const offsetHH = String(Math.floor(absOffset / 60)).padStart(2, '0');
    const offsetMM = String(absOffset % 60).padStart(2, '0');
    const offset = `${offsetSign}${offsetHH}:${offsetMM}`;

    return [
      `Current date/time (Gregorian calendar):`,
      `- Now (local): ${year}-${month}-${day}T${hour}:${minute}:00${offset}`,
      `- Weekday: ${weekday}`,
      `- IANA timezone: ${timeZone}`,
      `- Use these as the reference for "today", "tomorrow", weekday names, and "next week".`,
      `- All emitted "startTime" / "endTime" entities MUST be Gregorian ISO 8601 with this offset, e.g. "${year}-${month}-${day}T14:00:00${offset}". Never invent a different year.`,
    ].join('\n');
  }

  /**
   * Minutes east of UTC for the given IANA timezone at the given instant.
   * Works without external deps by re-parsing the formatted output.
   */
  private timeZoneOffsetMinutes(date: Date, timeZone: string): number {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const parts = dtf.formatToParts(date);
    const map: Record<string, string> = {};
    for (const part of parts) {
      if (part.type !== 'literal') map[part.type] = part.value;
    }
    const asUtc = Date.UTC(
      Number(map.year),
      Number(map.month) - 1,
      Number(map.day),
      Number(map.hour === '24' ? '00' : map.hour),
      Number(map.minute),
      Number(map.second),
    );
    return Math.round((asUtc - date.getTime()) / 60000);
  }

  private parseIntent(raw: string): VoiceIntentPayload {
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

/**
 * Convert spoken-email patterns inside a Whisper transcript to proper email
 * addresses BEFORE the LLM normalizer sees them.
 *
 * Whisper transcribes dictated emails as English ("john at gmail dot com"),
 * and frequently inserts commas / periods when the user pauses
 * ("john, at gmail. dot com"). Both throw the downstream LLM off, which then
 * either omits the email or stores the literal "john at gmail dot com".
 *
 * This regex finds the canonical spoken pattern
 *   <identifier> ("dot|underscore|dash|hyphen|plus" <identifier>)* "at"
 *   <identifier> ("dot" <identifier>)+
 * with optional [ ,.] noise between every token, and rebuilds the address.
 *
 * False-positive risk is low because we require BOTH "at" AND at least one
 * "dot <word>" pair on the domain side — a pattern that almost never appears
 * in normal English speech outside of an email dictation.
 */
function reconstructSpokenEmailsInText(text: string): string {
  if (!text) return text;
  if (!/\bat\b/i.test(text) || !/\bdot\b/i.test(text)) return text;

  const pattern =
    /([A-Za-z0-9]+(?:[ ,.]+(?:dot|underscore|dash|hyphen|plus)[ ,.]+[A-Za-z0-9]+)*)[ ,.]+at[ ,.]+([A-Za-z0-9]+(?:[ ,.]+dot[ ,.]+[A-Za-z0-9]+)+)/gi;

  return text.replace(pattern, (_match, local: string, domain: string) => {
    const cleanedLocal = local
      .replace(/[ ,.]+dot[ ,.]+/gi, '.')
      .replace(/[ ,.]+underscore[ ,.]+/gi, '_')
      .replace(/[ ,.]+(?:dash|hyphen)[ ,.]+/gi, '-')
      .replace(/[ ,.]+plus[ ,.]+/gi, '+')
      .toLowerCase();
    const cleanedDomain = domain.replace(/[ ,.]+dot[ ,.]+/gi, '.').toLowerCase();
    return `${cleanedLocal}@${cleanedDomain}`;
  });
}

// Stock phrases Whisper / gpt-4o-mini-transcribe emit on silence or noise.
// Normalized form: lowercased, punctuation stripped, whitespace collapsed.
// Kept deliberately conservative — real conversational confirmations like
// "yes", "yeah", "ok", "sure" are NOT here so follow-up answers still work.
const WHISPER_HALLUCINATIONS: ReadonlySet<string> = new Set([
  'you',
  'thank you',
  'thank you very much',
  'thank you so much',
  'thanks',
  'thanks for watching',
  'thank you for watching',
  'thanks for watching everyone',
  'please subscribe',
  'subscribe',
  'subscribe to my channel',
  'bye',
  'bye bye',
  'goodbye',
  'see you next time',
  'see you in the next video',
  'im sorry',
  'i am sorry',
  'the end',
  'music',
  'applause',
  'silence',
]);

// Lowercase, strip punctuation, collapse whitespace — shared by the
// hallucination checks so the prompt-echo comparison uses the same shape.
function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const NORMALIZED_WHISPER_PROMPT = normalizeForMatch(WHISPER_PROMPT);

/**
 * True when the transcript is empty once punctuation is stripped, matches a
 * known Whisper silence hallucination, or is an echo of our priming prompt.
 * Used to reject phantom transcripts so the app reports "voice not detected"
 * instead of running a stray command.
 */
function isLikelyHallucination(transcript: string): boolean {
  const normalized = normalizeForMatch(transcript);
  if (!normalized) return true;
  if (WHISPER_HALLUCINATIONS.has(normalized)) return true;
  // On silence/noise the model routinely parrots our `prompt` back — either in
  // full ("english speech only crm voice commands …") or a leading fragment.
  // "crm voice commands" never appears in genuine user speech, so any echo of
  // the prompt is treated as no speech.
  if (
    normalized === NORMALIZED_WHISPER_PROMPT ||
    (normalized.length >= 4 && NORMALIZED_WHISPER_PROMPT.startsWith(normalized)) ||
    normalized.includes('crm voice commands')
  ) {
    return true;
  }
  return false;
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
