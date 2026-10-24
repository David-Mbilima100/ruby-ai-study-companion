
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";

GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/legacy/build/pdf.worker.mjs",
  import.meta.url
).toString();

export async function extractPdfText(file: File): Promise<string> {
  if (file.type !== "application/pdf") {
    throw new Error("Please upload a PDF file.");
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error("PDF must be smaller than 5 MB.");
  }

  const data = new Uint8Array(await file.arrayBuffer());

  const pdf = await getDocument({ data }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    pages.push(
      content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
    );
  }

  const fullText = pages.join("\n\n").trim();

  if (!fullText) {
    throw new Error(
      "No readable text found. This PDF may be scanned and require OCR."
    );
  }

  return fullText;
}
