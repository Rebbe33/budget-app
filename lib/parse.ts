import { norm } from './categorize';
import { toISO } from './dates';

/** "12,5" -> 12.5 ; "1 234,56 €" -> 1234.56 ; "1.234,56" -> 1234.56 ; "" -> null */
export function parseNum(input: string): number | null {
  let s = input.replace(/[\s €]/g, '').replace(/eur(os?)?$/i, '');
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  if (!/^[+-]?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export interface QuickParsed {
  amount: number | null; // toujours positif
  label: string;
  income: boolean;
}

/** Saisie rapide : "12,50 leclerc", "leclerc 12.5", "+80 petit boulot peinture" */
export function parseQuick(input: string): QuickParsed {
  let text = input.trim();
  let income = false;
  if (text.startsWith('+')) {
    income = true;
    text = text.slice(1).trim();
  }
  const tokens = text.split(/\s+/).filter(Boolean);
  const isNum = (t: string) => /^[-+]?\d+([.,]\d{1,2})?(€|eur|euros?)?$/i.test(t);
  let idx = -1;
  if (tokens.length && isNum(tokens[0])) idx = 0;
  else {
    for (let i = tokens.length - 1; i >= 0; i--) {
      if (isNum(tokens[i])) {
        idx = i;
        break;
      }
    }
  }
  if (idx === -1) return { amount: null, label: tokens.join(' '), income };
  const raw = tokens[idx];
  if (raw.startsWith('+')) income = true;
  const amount = parseNum(raw.replace(/^[-+]/, ''));
  const label = tokens
    .filter((_, i) => i !== idx)
    .filter((t) => t !== '€' && t.toLowerCase() !== 'eur')
    .join(' ');
  return { amount: amount !== null && amount > 0 ? amount : null, label, income };
}

// ---------------------------------------------------------------------------
// Import de relevés bancaires (CSV CIC & co, OFX)
// ---------------------------------------------------------------------------

export interface ParsedRow {
  date: string;
  label: string;
  amount: number; // signé
}

export function decodeText(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

export function parseDate(s: string): string | null {
  const t = s.trim();
  let m = t.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})/);
  if (m) return toISO(new Date(+m[3], +m[2] - 1, +m[1]));
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return toISO(new Date(+m[1], +m[2] - 1, +m[3]));
  m = t.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2})$/);
  if (m) return toISO(new Date(2000 + +m[3], +m[2] - 1, +m[1]));
  return null;
}

function splitCSVLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delim) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

export function parseCSV(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!lines.length) return [];
  const sample = lines.slice(0, 10).join('\n');
  const counts: Record<string, number> = {
    ';': (sample.match(/;/g) || []).length,
    ',': (sample.match(/,/g) || []).length,
    '\t': (sample.match(/\t/g) || []).length,
  };
  const delim = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];

  // ligne d'en-tête : contient "date" et un libellé / montant / débit
  let headerIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const cells = splitCSVLine(lines[i], delim).map(norm);
    if (cells.some((c) => c.includes('date')) && cells.some((c) => /libell|descr|intitul|montant|debit|credit|operation|label|amount/.test(c))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];
  const head = splitCSVLine(lines[headerIdx], delim).map(norm);

  const dateIdx = (() => {
    const i = head.findIndex((c) => c.includes('date') && !c.includes('valeur'));
    return i !== -1 ? i : head.findIndex((c) => c.includes('date'));
  })();
  const debitIdx = head.findIndex((c) => c.includes('debit'));
  const creditIdx = head.findIndex((c) => c.includes('credit'));
  const amountIdx = head.findIndex((c) => c.includes('montant') || c.includes('amount'));
  const labelIdxs = head
    .map((c, i) => (/libell|descr|intitul|detail|memo|label|operation$/.test(c) && !c.includes('date') ? i : -1))
    .filter((i) => i !== -1);

  const rows: ParsedRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = splitCSVLine(lines[i], delim);
    const date = parseDate(cells[dateIdx] ?? '');
    if (!date) continue;

    let amount: number | null = null;
    if (debitIdx !== -1 || creditIdx !== -1) {
      const d = debitIdx !== -1 ? parseNum(cells[debitIdx] ?? '') : null;
      const c = creditIdx !== -1 ? parseNum(cells[creditIdx] ?? '') : null;
      if (d) amount = -Math.abs(d);
      else if (c) amount = Math.abs(c);
    } else if (amountIdx !== -1) {
      amount = parseNum(cells[amountIdx] ?? '');
    }
    if (amount === null || amount === 0) continue;

    const label = labelIdxs
      .map((j) => (cells[j] ?? '').trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    rows.push({ date, label: label || 'Opération', amount });
  }
  return rows;
}

export function parseOFX(text: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  const re = /<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const block = m[1];
    const dt = block.match(/<DTPOSTED>(\d{4})(\d{2})(\d{2})/i);
    const amt = block.match(/<TRNAMT>\s*([-+0-9.,]+)/i);
    if (!dt || !amt) continue;
    const name = (block.match(/<NAME>([^<\r\n]*)/i)?.[1] ?? '').trim();
    const memo = (block.match(/<MEMO>([^<\r\n]*)/i)?.[1] ?? '').trim();
    const amount = parseNum(amt[1]);
    if (amount === null || amount === 0) continue;
    const label = [name, memo && memo !== name ? memo : ''].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    rows.push({ date: `${dt[1]}-${dt[2]}-${dt[3]}`, label: label || 'Opération', amount });
  }
  return rows;
}

export function parseBankFile(buf: ArrayBuffer): ParsedRow[] {
  const text = decodeText(buf);
  if (/<OFX|OFXHEADER|<STMTTRN>/i.test(text)) return parseOFX(text);
  return parseCSV(text);
}

// ---------------------------------------------------------------------------
// Import PDF (page « Opérations » du site CIC imprimée / enregistrée en PDF)
// ---------------------------------------------------------------------------

const PDF_ROW =
  /^(\d{2}\/\d{2}\/\d{4})\s*(.*?)\s*(?:d.tail\s*)?([+-])\s*((?:\d{1,3}(?:[\s ]\d{3})+|\d+),\d{2})\s*EUR\s*$/i;

/**
 * Lit les lignes de texte d'un PDF CIC. Seules les opérations « enregistrées » sont importées :
 * celles « en cours d'enregistrement » sont ignorées (leur libellé change ensuite, elles feraient des doublons)
 * et reviendront dans le prochain export.
 */
export function parsePdfLines(lines: string[]): { rows: ParsedRow[]; pending: number } {
  const rows: ParsedRow[] = [];
  let pending = 0;
  let section: 'all' | 'pending' | 'booked' = 'all';
  for (const raw of lines) {
    const line = raw.replace(/\s+/g, ' ').trim();
    const n = norm(line);
    if (n.startsWith('operations en cours')) {
      section = 'pending';
      continue;
    }
    if (n.startsWith('operations enregistrees')) {
      section = 'booked';
      continue;
    }
    const m = line.match(PDF_ROW);
    if (!m) continue;
    const date = parseDate(m[1]);
    const amount = parseNum(m[4]);
    if (!date || amount === null || amount === 0) continue;
    if (section === 'pending') {
      pending++;
      continue;
    }
    const label = m[2].replace(/\s+/g, ' ').trim();
    rows.push({ date, label: label || 'Opération', amount: m[3] === '-' ? -amount : amount });
  }
  return { rows, pending };
}

export function isPdf(buf: ArrayBuffer): boolean {
  const head = new Uint8Array(buf.slice(0, 5));
  return String.fromCharCode(...head) === '%PDF-';
}
