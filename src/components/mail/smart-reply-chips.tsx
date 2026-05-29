"use client";

interface SmartReplyChipsProps {
  subject?: string | null;
  onSelect: (text: string) => void;
}

type Category =
  | "invoice"
  | "meeting"
  | "question"
  | "urgent"
  | "thanks"
  | "default";

const CHIP_MAP: Record<Category, string[]> = {
  invoice: [
    "Thanks, I'll process this shortly.",
    "Can you send a revised invoice?",
    "Payment has been sent — please confirm.",
  ],
  meeting: [
    "That time works for me.",
    "Can we reschedule to later this week?",
    "Please send a calendar invite.",
  ],
  question: [
    "Happy to help — let me check on this.",
    "Can you provide more details?",
    "I'll get back to you by end of day.",
  ],
  urgent: [
    "On it — I'll respond ASAP.",
    "Got it, I'm looking into this now.",
    "Thanks for flagging. I'll prioritize this.",
  ],
  thanks: [
    "You're welcome!",
    "Happy to help anytime.",
    "Glad it worked out!",
  ],
  default: [
    "Thanks for reaching out.",
    "Got it — I'll follow up soon.",
    "Acknowledged, speak soon.",
  ],
};

function detectCategory(subject: string | null | undefined): Category {
  if (!subject) return "default";
  const s = subject.toLowerCase();

  if (/invoice|payment|bill|receipt|charge|refund|due|quote|estimate/.test(s)) {
    return "invoice";
  }
  if (/meet|schedule|call|sync|zoom|calendar|appointment|availability|time/.test(s)) {
    return "meeting";
  }
  if (/urgent|asap|immediately|critical|emergency|priority|p0|p1/.test(s)) {
    return "urgent";
  }
  if (/thank|thanks|appreciate|grateful|cheers/.test(s)) {
    return "thanks";
  }
  if (/question|help|support|how|what|why|where|when|issue|problem|trouble/.test(s)) {
    return "question";
  }

  return "default";
}

export function SmartReplyChips({ subject, onSelect }: SmartReplyChipsProps) {
  const category = detectCategory(subject);
  const chips = CHIP_MAP[category];

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <button
          key={chip}
          type="button"
          onClick={() => onSelect(chip)}
          className="rounded-full border px-3 py-1 text-sm hover:bg-accent transition-colors"
        >
          ✨ {chip}
        </button>
      ))}
    </div>
  );
}
