import { PDFDocument } from "pdf-lib";
import { shareUriToPath } from "./file";
import fs from "fs";

export default async function isFileSigned(physicalUri) {
  const filePath = shareUriToPath(physicalUri);
  const pdfBytes = fs.readFileSync(filePath);

  const pdfDoc = await PDFDocument.load(pdfBytes);

  const form = pdfDoc.getForm();

  let hasSignatures = false;

  for (const field of form.getFields()) {
    if (field.constructor.name === 'PDFSignature') {
      hasSignatures = true;
    }
  }
  
  return hasSignatures;
}