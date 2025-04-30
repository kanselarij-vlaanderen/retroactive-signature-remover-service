import { PDFDocument } from "pdf-lib";

export default async function isFileSigned(pdfBytes) {
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