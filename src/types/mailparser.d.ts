declare module "mailparser" {
  import type { Buffer } from "node:buffer";

  export type MailParserAddress = {
    value: Array<{ address?: string; name?: string }>;
  } | undefined;

  export type MailParserAttachment = {
    filename?: string;
    contentType?: string;
    contentDisposition?: string;
    contentId?: string;
    size: number;
    content: Buffer;
  };

  export type ParsedMail = {
    messageId?: string;
    subject?: string;
    date?: Date;
    from?: MailParserAddress;
    to?: MailParserAddress;
    cc?: MailParserAddress;
    bcc?: MailParserAddress;
    replyTo?: MailParserAddress;
    text?: string;
    html?: string | false;
    attachments: MailParserAttachment[];
  };

  export function simpleParser(source: Buffer | string): Promise<ParsedMail>;
}
