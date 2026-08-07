export const VOICE_ASSISTANT_CAPABILITIES_RESPONSE = `## Everything the voice assistant can do

You can speak naturally and use follow-up requests. The assistant supports multilingual speech, corrects transcription grammar, and keeps the original speech available in the chat.

### Contacts — GoHighLevel and HubSpot
- List recent contacts and find a contact by name, phone, or email.
- Create, update, and delete contacts.

### GoHighLevel
- **Calendars:** list, open, create, update, and delete calendars.
- **Availability and appointments:** check free slots, list appointments, book appointments, and cancel appointments.
- **Pipelines and opportunities:** list pipelines; list or find opportunities; create, update, move, change status, and delete opportunities.
- **Conversations and messaging:** list, search, and read conversations; send messages through supported channels such as SMS and email.

### HubSpot
- **Deals:** list recent deals.
- **Companies:** list, find, create, update, and delete companies; attach or detach contacts and deals.
- **Tickets:** list, find, create, update, and delete tickets; attach or detach contacts, companies, and deals.
- **Products:** list, find, create, update, and delete products.
- **Orders:** list, find, create, update, and delete orders; attach or detach contacts, companies, and deals.

### CRM assistance
- Ask questions about CRM concepts or your CRM records.
- Continue multi-step tasks with follow-up answers such as names, dates, times, pipelines, or stages.

HubSpot deal editing, HubSpot pipelines, and HubSpot calendars or appointments are not currently available through the voice assistant.`;

export function looksLikeCapabilityQuestion(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return false;

  return (
    /\bwhat (?:all )?(?:can|does) (?:you|the app|this app|the voice assistant|voice assistant) do\b/.test(normalized) ||
    /\b(?:list|show|tell me|give me) (?:me )?(?:all |every )?(?:your |the )?(?:capabilit(?:y|ies)|features?|functions?|commands?|actions?)\b/.test(normalized) ||
    /\b(?:all|everything) (?:that )?(?:you|the app|this app|the voice assistant) can do\b/.test(normalized) ||
    /^(?:voice )?(?:help|commands|capabilities|features)$/.test(normalized)
  );
}
