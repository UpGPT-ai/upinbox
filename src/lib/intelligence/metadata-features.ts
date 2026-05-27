/**
 * Extract structural metadata features from an email.
 *
 * PRIVACY CRITICAL:
 * This module extracts ONLY statistical/structural features.
 * The raw subject text, body text, and email addresses are NEVER included
 * in the output. Only numerical counts, ratios, and boolean flags.
 *
 * These features are safe to send to the Intelligence API.
 */

import type { EmailMetadataFeatures } from './types';

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com',
  'aol.com', 'protonmail.com', 'mail.com', 'zoho.com', 'yandex.com',
]);

const BULK_SENDING_DOMAINS = new Set([
  'sendgrid.net', 'mailchimp.com', 'constantcontact.com', 'mailerlite.com',
  'klaviyo.com', 'drip.com', 'campaignmonitor.com', 'sendinblue.com',
  'amazonses.com', 'sparkpostmail.com', 'mailgun.org',
]);

function classifyDomain(emailAddress: string): EmailMetadataFeatures['senderDomainType'] {
  const domainMatch = emailAddress.match(/@([^>@\s]+)/);
  if (!domainMatch) return 'unknown';
  const domain = domainMatch[1].toLowerCase();

  // Check for bulk sender patterns
  if (BULK_SENDING_DOMAINS.has(domain)) return 'bulk';
  for (const bulkDomain of BULK_SENDING_DOMAINS) {
    if (domain.endsWith(`.${bulkDomain}`)) return 'bulk';
  }

  if (FREE_EMAIL_DOMAINS.has(domain)) return 'free';
  return 'corporate';
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function detectPunctuationPattern(text: string): string {
  if (!text) return 'normal';
  const exclamations = (text.match(/!/g) ?? []).length;
  const questions = (text.match(/\?/g) ?? []).length;
  const total = text.length;
  if (exclamations / total > 0.02) return 'high-exclamation';
  if (questions / total > 0.02) return 'question-heavy';
  return 'normal';
}

function detectGreeting(text: string): boolean {
  const greetingPatterns = /^(hi|hello|hey|dear|greetings|good morning|good afternoon|good evening|howdy)/im;
  return greetingPatterns.test(text.slice(0, 200));
}

function detectSalutation(text: string): boolean {
  const salutationPatterns = /(sincerely|regards|best regards|warm regards|thanks|thank you|cheers|yours|with love|take care)\s*[\n,]?$/im;
  return salutationPatterns.test(text.slice(-300));
}

/**
 * Extract metadata features from email content.
 *
 * @param opts - Raw email fields (used for feature extraction only, not stored or transmitted)
 * @returns Structural features safe for the Intelligence API
 */
export function extractMetadataFeatures(opts: {
  subject?: string;
  fromEmail?: string;
  bodyText?: string;
  headers?: Record<string, string>;
}): EmailMetadataFeatures {
  const { subject = '', fromEmail = '', bodyText = '', headers = {} } = opts;

  // Count caps ratio from subject (statistical only)
  const upperCount = (subject.match(/[A-Z]/g) ?? []).length;
  const letterCount = (subject.match(/[a-zA-Z]/g) ?? []).length;
  const capsRatio = letterCount > 0 ? upperCount / letterCount : 0;

  // URL detection
  const urlMatches = bodyText.match(/https?:\/\/\S+/g) ?? [];

  return {
    subjectWordCount: countWords(subject),
    bodyWordCount: countWords(bodyText),
    hasAttachment: false, // caller should set this from email metadata
    senderDomainType: classifyDomain(fromEmail),
    capsRatio: Math.round(capsRatio * 100) / 100,
    hasUrls: urlMatches.length > 0,
    urlCount: urlMatches.length,
    punctuationPattern: detectPunctuationPattern(subject + ' ' + bodyText.slice(0, 200)),
    hasGreeting: detectGreeting(bodyText),
    hasSalutation: detectSalutation(bodyText),
    listUnsubscribePresent: 'list-unsubscribe' in headers || 'List-Unsubscribe' in headers,
  };
}
