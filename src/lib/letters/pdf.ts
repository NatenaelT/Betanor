import { createHash } from "node:crypto";
import { deflateSync, inflateSync } from "node:zlib";

import { BETANOR_LOGO_DATA_URI } from "@/lib/brand-assets";
import { letterHtmlToText } from "@/lib/letters/sanitize";
import type { LetterRecord } from "@/lib/letters/types";

type PdfWorkspace = { name: string; legal_name?: string | null; registered_address?: string | null; tin?: string | null; vat_registration_number?: string | null; timezone?: string | null };

function pdfText(value: string) {
  return value.normalize("NFKD").replace(/[^\x20-\x7E]/g, "?").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function pngRgb(dataUri: string) {
  try {
    const raw = Buffer.from(dataUri.split(",")[1] ?? "", "base64");
    if (raw.readUInt32BE(0) !== 0x89504e47) return null;
    let offset = 8; let width = 0; let height = 0; let colorType = 6; let bitDepth = 8; const chunks: Buffer[] = [];
    while (offset + 12 <= raw.length) {
      const length = raw.readUInt32BE(offset); const type = raw.toString("ascii", offset + 4, offset + 8); const body = raw.subarray(offset + 8, offset + 8 + length); offset += 12 + length;
      if (type === "IHDR") { width = body.readUInt32BE(0); height = body.readUInt32BE(4); bitDepth = body[8]; colorType = body[9]; }
      if (type === "IDAT") chunks.push(body);
      if (type === "IEND") break;
    }
    if (!width || !height || bitDepth !== 8 || ![0, 2, 4, 6].includes(colorType)) return null;
    const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 4 ? 2 : 4; const stride = width * channels; const packed = inflateSync(Buffer.concat(chunks)); const pixels = Buffer.alloc(width * height * 3); let inOffset = 0; let prev = Buffer.alloc(stride);
    for (let y = 0; y < height; y += 1) {
      const filter = packed[inOffset++]; const row = Buffer.from(packed.subarray(inOffset, inOffset + stride)); inOffset += stride;
      for (let x = 0; x < stride; x += 1) { const left = x >= channels ? row[x - channels] : 0; const up = prev[x] ?? 0; const upperLeft = x >= channels ? prev[x - channels] ?? 0 : 0; if (filter === 1) row[x] = (row[x] + left) & 255; else if (filter === 2) row[x] = (row[x] + up) & 255; else if (filter === 3) row[x] = (row[x] + Math.floor((left + up) / 2)) & 255; else if (filter === 4) { const p = left + up - upperLeft; const pa = Math.abs(p - left); const pb = Math.abs(p - up); const pc = Math.abs(p - upperLeft); row[x] = (row[x] + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upperLeft)) & 255; } }
      for (let x = 0; x < width; x += 1) { const source = x * channels; const target = (y * width + x) * 3; if (colorType === 0 || colorType === 4) pixels[target] = pixels[target + 1] = pixels[target + 2] = row[source]; else { pixels[target] = row[source]; pixels[target + 1] = row[source + 1]; pixels[target + 2] = row[source + 2]; } }
      prev = row;
    }
    return { width, height, data: deflateSync(pixels) };
  } catch { return null; }
}

function wrap(value: string, max = 92) {
  const words = value.split(/\s+/).filter(Boolean); const lines: string[] = []; let current = "";
  for (const word of words) { if ((current + (current ? " " : "") + word).length > max && current) { lines.push(current); current = word; } else current += `${current ? " " : ""}${word}`; }
  if (current) lines.push(current); return lines;
}

function canonicalSnapshot(letter: LetterRecord) {
  return JSON.stringify({ reference_number: letter.reference_number, letter_date: letter.letter_date, letter_type: letter.letter_type, department_id: letter.department_id, prepared_by: letter.prepared_by, approved_by: letter.approved_by, recipient_name: letter.recipient_name, recipient_title: letter.recipient_title, recipient_organization: letter.recipient_organization, recipient_address: letter.recipient_address, recipient_email: letter.recipient_email, cc: letter.cc, subject: letter.subject, salutation: letter.salutation, body_html: letter.body_html, closing: letter.closing, signatory: letter.signatory, signatory_title: letter.signatory_title, customer_id: letter.customer_id, employee_id: letter.employee_id, tender_id: letter.tender_id, project_id: letter.project_id, contract_id: letter.contract_id, quotation_id: letter.quotation_id, rfq_id: letter.rfq_id, source_letter_id: letter.source_letter_id, related_type: letter.related_type });
}

export function letterContentHash(letter: LetterRecord) { return createHash("sha256").update(canonicalSnapshot(letter)).digest("hex"); }

export function generateLetterPdf(letter: LetterRecord, workspace: PdfWorkspace) {
  const image = pngRgb(BETANOR_LOGO_DATA_URI); const objects: string[] = []; const pageStreams: string[] = []; const navy = "0.047 0.149 0.31"; const gold = "0.847 0.639 0.227";
  const address = [workspace.registered_address, workspace.tin ? `TIN ${workspace.tin}` : null, workspace.vat_registration_number ? `VAT ${workspace.vat_registration_number}` : null].filter(Boolean).join("  ·  ");
  const lines: Array<{ text: string; size?: number; bold?: boolean; color?: string; gap?: number }> = [];
  lines.push({ text: workspace.legal_name || workspace.name, size: 15, bold: true, color: navy }); lines.push({ text: "Always Welcome, Always Ready.", size: 8, color: gold }); if (address) lines.push({ text: address, size: 8, color: "0.33 0.39 0.48" }); lines.push({ text: "", gap: 15 }); lines.push({ text: `${letter.reference_number}    ${letter.letter_date}`, size: 9, color: "0.16 0.2 0.27" }); lines.push({ text: "", gap: 12 }); lines.push({ text: letter.recipient_name, size: 10, bold: true }); if (letter.recipient_title) lines.push({ text: letter.recipient_title, size: 9 }); lines.push({ text: letter.recipient_organization, size: 9 }); if (letter.recipient_address) for (const addressLine of letter.recipient_address.split(/\r?\n/)) lines.push({ text: addressLine, size: 9 }); if (letter.recipient_email) lines.push({ text: letter.recipient_email, size: 9 }); lines.push({ text: "", gap: 12 }); lines.push({ text: `Subject: ${letter.subject}`, size: 10, bold: true, color: navy }); lines.push({ text: "", gap: 12 }); lines.push({ text: letter.salutation, size: 10 });
  for (const paragraph of letterHtmlToText(letter.body_html).split(/\n+/)) for (const line of wrap(paragraph)) lines.push({ text: line, size: 10 });
  lines.push({ text: "", gap: 10 }); lines.push({ text: letter.closing, size: 10 }); lines.push({ text: "", gap: 26 }); lines.push({ text: letter.signatory, size: 10, bold: true }); if (letter.signatory_title) lines.push({ text: letter.signatory_title, size: 9 });
  let y = 704; let stream = "q\n";
  stream += `${navy} rg 54 728 504 2 re f\n`; if (image) stream += `q 54 650 62 62 cm /Im1 Do Q\n`; else stream += `${gold} rg 54 675 58 38 re f\n`;
  for (const line of lines) { if (line.gap) { y -= line.gap; continue; } if (y < 62) { stream += "Q"; pageStreams.push(stream); stream = "q\n"; y = 730; } const size = line.size ?? 10; stream += `${line.color ?? "0.16 0.2 0.27"} rg BT /${line.bold ? "F2" : "F1"} ${size} Tf 54 ${y} Td (${pdfText(line.text)}) Tj ET\n`; y -= size + 6; }
  stream += `0.33 0.39 0.48 rg BT /F1 7 Tf 54 38 Td (${pdfText(`${workspace.name}  ·  ${workspace.timezone || "Africa/Addis_Ababa"}`)}) Tj ET\nQ`; pageStreams.push(stream);
  const addObject = (content: string) => { objects.push(content); return objects.length; };
  const font1 = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"); const font2 = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"); let imageObject = 0; if (image) imageObject = addObject(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${image.data.length} >>\nstream\n${image.data.toString("binary")}\nendstream`);
  const pageObjectNumbers: number[] = []; for (const pageStream of pageStreams) { const streamObject = addObject(`<< /Length ${Buffer.byteLength(pageStream, "binary")} >>\nstream\n${pageStream}\nendstream`); const resources = imageObject ? `<< /Font << /F1 ${font1} 0 R /F2 ${font2} 0 R >> /XObject << /Im1 ${imageObject} 0 R >> >>` : `<< /Font << /F1 ${font1} 0 R /F2 ${font2} 0 R >> >>`; pageObjectNumbers.push(addObject(`<< /Type /Page /Parent PAGES /MediaBox [0 0 612 792] /Resources ${resources} /Contents ${streamObject} 0 R >>`)); }
  const pagesObject = addObject(`<< /Type /Pages /Kids [${pageObjectNumbers.map((number) => `${number} 0 R`).join(" ")}] /Count ${pageObjectNumbers.length} >>`); const catalogObject = addObject(`<< /Type /Catalog /Pages ${pagesObject} 0 R >>`);
  let result = "%PDF-1.4\n%âãÏÓ\n"; const offsets = [0]; objects.forEach((object, index) => { const body = object.replace(/PAGES/g, `${pagesObject} 0 R`); offsets.push(Buffer.byteLength(result, "binary")); result += `${index + 1} 0 obj\n${body}\nendobj\n`; }); const xref = Buffer.byteLength(result, "binary"); result += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`; for (let index = 1; index < offsets.length; index += 1) result += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`; result += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogObject} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(result, "binary");
}
