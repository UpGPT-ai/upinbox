/**
 * UpInbox MCP Tool Definitions
 *
 * These tools are exposed via the MCP server at /api/upinbox/mcp.
 * They allow AI assistants (Claude Desktop, Cursor, etc.) to interact
 * with the user's email inbox programmatically.
 *
 * Full tool implementations: github.com/UpGPT-ai/upinbox-mcp
 *
 * Auth: MCP tokens from upinbox.mcp_tokens table (hashed, scoped).
 * The token hash is compared server-side — plaintext token only given once.
 */

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const MCP_TOOLS: McpTool[] = [
  {
    name: 'list_accounts',
    description: 'List all connected email accounts for this UpInbox user.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'list_mailboxes',
    description: 'List all mailboxes (folders) for an account.',
    inputSchema: {
      type: 'object',
      properties: {
        account_id: {
          type: 'string',
          description: 'The account ID to list mailboxes for. Omit to use primary account.',
        },
      },
    },
  },
  {
    name: 'list_emails',
    description: 'List emails in a mailbox with optional filtering.',
    inputSchema: {
      type: 'object',
      properties: {
        mailbox_id: {
          type: 'string',
          description: 'Mailbox ID. Defaults to Inbox.',
        },
        limit: {
          type: 'number',
          description: 'Max emails to return. Default 20, max 100.',
        },
        filter: {
          type: 'string',
          enum: ['all', 'unread', 'flagged'],
          description: 'Filter emails. Default: all.',
        },
      },
    },
  },
  {
    name: 'read_email',
    description: 'Read the full content of an email by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        email_id: {
          type: 'string',
          description: 'The email ID to read.',
        },
      },
      required: ['email_id'],
    },
  },
  {
    name: 'search_emails',
    description: 'Search emails by text across all mailboxes.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query. Searches subject, sender, and body.',
        },
        limit: {
          type: 'number',
          description: 'Max results. Default 20.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'send_email',
    description: 'Send an email from the user\'s connected account.',
    inputSchema: {
      type: 'object',
      properties: {
        to: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of recipient email addresses.',
        },
        subject: {
          type: 'string',
          description: 'Email subject.',
        },
        body: {
          type: 'string',
          description: 'Email body (plain text or HTML).',
        },
        cc: {
          type: 'array',
          items: { type: 'string' },
          description: 'CC recipients.',
        },
        reply_to_id: {
          type: 'string',
          description: 'Email ID to reply to (sets In-Reply-To header).',
        },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'mark_read',
    description: 'Mark one or more emails as read or unread.',
    inputSchema: {
      type: 'object',
      properties: {
        email_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Email IDs to mark.',
        },
        read: {
          type: 'boolean',
          description: 'True to mark read, false to mark unread.',
        },
      },
      required: ['email_ids', 'read'],
    },
  },
  {
    name: 'move_email',
    description: 'Move an email to a different mailbox.',
    inputSchema: {
      type: 'object',
      properties: {
        email_id: { type: 'string', description: 'Email ID to move.' },
        to_mailbox_id: { type: 'string', description: 'Destination mailbox ID.' },
      },
      required: ['email_id', 'to_mailbox_id'],
    },
  },
  {
    name: 'delete_email',
    description: 'Move an email to Trash (or permanently delete if already in Trash).',
    inputSchema: {
      type: 'object',
      properties: {
        email_id: { type: 'string', description: 'Email ID to delete.' },
      },
      required: ['email_id'],
    },
  },
  {
    name: 'get_triage_result',
    description: 'Get the AI triage classification for an email (category, confidence, signals).',
    inputSchema: {
      type: 'object',
      properties: {
        email_id: { type: 'string', description: 'Email ID to get triage for.' },
      },
      required: ['email_id'],
    },
  },
  {
    name: 'create_draft',
    description: 'Create an email draft without sending it.',
    inputSchema: {
      type: 'object',
      properties: {
        to: {
          type: 'array',
          items: { type: 'string' },
          description: 'Draft recipients.',
        },
        subject: { type: 'string', description: 'Draft subject.' },
        body: { type: 'string', description: 'Draft body.' },
      },
      required: ['subject', 'body'],
    },
  },
  {
    name: 'get_inbox_summary',
    description: 'Get a summary of the inbox: unread count, recent senders, action-required emails.',
    inputSchema: {
      type: 'object',
      properties: {
        account_id: {
          type: 'string',
          description: 'Account ID. Defaults to primary account.',
        },
      },
    },
  },
];

export type McpToolName = typeof MCP_TOOLS[number]['name'];
