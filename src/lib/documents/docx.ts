import { strToU8, zipSync } from "fflate";

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function paragraph(value: string, kind: "title" | "brand" | "motto" | "body") {
  const pStyle = kind === "title" ? '<w:spacing w:after="280"/><w:keepNext/>' : '<w:spacing w:after="160" w:line="276" w:lineRule="auto"/>';
  const runProps = kind === "title"
    ? '<w:b/><w:color w:val="0B264F"/><w:sz w:val="34"/>'
    : kind === "brand"
      ? '<w:b/><w:color w:val="0B264F"/><w:sz w:val="20"/>'
      : kind === "motto"
        ? '<w:i/><w:color w:val="B78936"/><w:sz w:val="18"/>'
        : '<w:color w:val="202B3C"/><w:sz w:val="22"/>';
  const runs = value.split("\n").map((line, index) => `${index ? "<w:br/>" : ""}<w:r><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/>${runProps}</w:rPr><w:t xml:space="preserve">${escapeXml(line || " ")}</w:t></w:r>`).join("");
  return `<w:p><w:pPr>${pStyle}</w:pPr>${runs}</w:p>`;
}

/** Creates a small, branded OOXML Word file entirely in the browser. */
export function generateAiDocumentDocx(input: { title: string; content: string; companyName: string; motto: string }) {
  const paragraphs = [
    paragraph(input.companyName, "brand"),
    paragraph(input.motto, "motto"),
    paragraph(input.title, "title"),
    ...input.content.split(/\n\s*\n/).map((block) => paragraph(block.trim(), "body")),
  ];
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.join("")}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const files = {
    "[Content_Types].xml": strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    "_rels/.rels": strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    "word/document.xml": strToU8(documentXml),
  };
  return zipSync(files, { level: 6 });
}
