// Strip personal contact info from chat messages.
// Keeps the deal inside CryptoBazar.

const REPLACE = "[hidden — keep chat in CryptoBazar]";

const PATTERNS: RegExp[] = [
  // phone numbers (7+ digits, spaces/dashes allowed)
  /(\+?\d[\d\s().-]{6,}\d)/g,
  // emails
  /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi,
  // social handles / urls
  /\b(t\.me|telegram\.me|wa\.me|whatsapp\.com|instagram\.com|fb\.com|facebook\.com|twitter\.com|x\.com|signal\.me|discord\.gg)\/\S+/gi,
  // bare @handles
  /(^|\s)@[a-z0-9_.-]{3,}/gi,
];

export function sanitizeMessage(input: string): { clean: string; blocked: boolean } {
  let clean = input;
  let blocked = false;
  for (const re of PATTERNS) {
    if (re.test(clean)) {
      blocked = true;
      clean = clean.replace(re, REPLACE);
    }
  }
  return { clean, blocked };
}
