import { readFileSync } from "node:fs";
import { join } from "node:path";

import { unzipSync, zipSync } from "fflate";

import { letterHtmlToText } from "@/lib/letters/sanitize";
import type { LetterRecord } from "@/lib/letters/types";

type DocxWorkspace = { name: string; legal_name?: string | null };

const templatePath = join(process.cwd(), "public", "letterhead", "betanor-letterhead-v3.docx");

function xmlText(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function displayDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${Number(match[2])}/${Number(match[3])}/${match[1].slice(-2)}` : value;
}

function run(text: string, options: { bold?: boolean } = {}) {
  const rPr = `<w:rPr><w:rFonts w:ascii="DM Sans" w:eastAsia="DM Sans" w:hAnsi="DM Sans" w:cs="DM Sans"/><w:color w:val="000000"/>${options.bold ? "<w:b/><w:bCs/>" : ""}<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>`;
  return `<w:r>${rPr}<w:t xml:space="preserve">${xmlText(text)}</w:t></w:r>`;
}

function paragraph(text = "", options: { align?: "left" | "right"; bold?: boolean; after?: number } = {}) {
  const alignment = options.align ? `<w:jc w:val="${options.align}"/>` : "";
  const spacing = `<w:spacing w:before="120" w:after="${options.after ?? 120}" w:line="276" w:lineRule="auto"/>`;
  return `<w:p><w:pPr>${spacing}${alignment}</w:pPr>${text ? run(text, { bold: options.bold }) : run(" ")}</w:p>`;
}

function lineParagraphs(value: string) {
  return value.split(/\r?\n/).map((line) => paragraph(line));
}

function bodyXml(letter: LetterRecord, workspace: DocxWorkspace, originalDocumentXml: string) {
  const section = originalDocumentXml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/)?.[0] ?? "";
  const body: string[] = [];
  body.push(paragraph(`Date: ${displayDate(letter.letter_date)}`, { align: "right", after: 120 }));
  body.push(paragraph(`Reference number: ${letter.reference_number}`, { align: "right", after: 420 }));
  body.push(...lineParagraphs([letter.recipient_name, letter.recipient_title, letter.recipient_organization, letter.recipient_address, letter.recipient_email].filter(Boolean).join("\n")));
  body.push(paragraph(`Subject: ${letter.subject}`, { bold: true, after: 240 }));
  body.push(paragraph(letter.salutation, { after: 180 }));
  const letterBody = letterHtmlToText(letter.body_html);
  if (letterBody) body.push(...lineParagraphs(letterBody));
  body.push(paragraph(letter.closing, { after: 360 }));
  body.push(paragraph(letter.signatory, { bold: true, after: 80 }));
  if (letter.signatory_title) body.push(paragraph(letter.signatory_title));
  if (letter.cc) body.push(paragraph(`CC: ${letter.cc}`, { after: 80 }));
  if (!body.length) body.push(paragraph(workspace.legal_name || workspace.name));
  return `<w:body>${body.join("")}${section}</w:body>`;
}

/** Fills the supplied Betanor letterhead while preserving its header/footer package parts. */
export function generateLetterDocx(letter: LetterRecord, workspace: DocxWorkspace) {
  const template = readFileSync(templatePath);
  const files = unzipSync(new Uint8Array(template));
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const documentXml = decoder.decode(files["word/document.xml"]);
  files["word/document.xml"] = encoder.encode(documentXml.replace(/<w:body>[\s\S]*?<\/w:body>/, bodyXml(letter, workspace, documentXml)));
  return Buffer.from(zipSync(files, { level: 6 }));
}
