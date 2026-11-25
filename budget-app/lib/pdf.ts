export interface TextItem {
  str: string;
  x: number;
  y: number;
}

/** Regroupe les morceaux de texte d'une page PDF en lignes (même hauteur), de gauche à droite. */
export function linesFromItems(items: TextItem[]): string[] {
  const sorted = [...items].filter((i) => i.str.trim() !== '').sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: TextItem[][] = [];
  for (const it of sorted) {
    const cur = lines[lines.length - 1];
    if (cur && Math.abs(cur[0].y - it.y) <= 2.5) cur.push(it);
    else lines.push([it]);
  }
  return lines.map((l) => l.sort((a, b) => a.x - b.x).map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim());
}

/** Extrait le texte d'un PDF, ligne par ligne (dans le navigateur). */
export async function extractPdfLines(buf: ArrayBuffer): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const out: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items: TextItem[] = [];
    for (const it of content.items) {
      if ('str' in it) items.push({ str: it.str, x: it.transform[4], y: it.transform[5] });
    }
    out.push(...linesFromItems(items));
  }
  return out;
}
