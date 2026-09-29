export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

/**
 * Posts to a Resend-compatible transactional mail API. Errors carry only the
 * HTTP status, never the recipient or the body (which contains the login link).
 */
export function createHttpEmailSender(opts: {
  url: string;
  apiKey: string;
  from: string;
  fetch?: typeof fetch;
}): EmailSender {
  const doFetch = opts.fetch ?? fetch;
  return {
    async send(message) {
      const res = await doFetch(opts.url, {
        method: 'POST',
        headers: { authorization: `Bearer ${opts.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from: opts.from, ...message }),
      });
      if (!res.ok) {
        throw new Error(`email provider responded ${res.status}`);
      }
    },
  };
}

/** Test double: keeps sent messages in memory. */
export function createMemoryEmailSender(): EmailSender & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return {
    sent,
    async send(message) {
      sent.push(message);
    },
  };
}
