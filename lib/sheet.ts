const CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 3_000;

export type FaqItem = { question: string; answer: string };

let cache: { items: FaqItem[]; expiresAt: number } | null = null;

// CSV parser รองรับ quote, comma และขึ้นบรรทัดใหม่ภายใน field
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ถ้าเป็นลิงก์หน้าแก้ไข/แชร์ของ Google Sheet ให้แปลงเป็นลิงก์ export CSV
function toCsvUrl(url: string): string {
  const m = url.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([^/]+)\/(edit|view|htmlview|pubhtml)/);
  if (!m) return url;
  const gid = url.match(/[#?&]gid=(\d+)/)?.[1] ?? "0";
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`;
}

// ตัดช่องว่าง/อักขระล่องหนที่ติดมากับหัวคอลัมน์ และ normalize Unicode
function normHeader(h: string): string {
  return h.replace(/[\s​-‍﻿]/g, "").normalize("NFC");
}

export async function getFaq(): Promise<FaqItem[]> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.items;

  const rawUrl = process.env.SHEET_CSV_URL?.trim();
  if (!rawUrl) throw new Error("SHEET_CSV_URL is not set");

  const res = await fetch(toCsvUrl(rawUrl), {
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Sheet fetch failed: HTTP ${res.status}`);

  const text = (await res.text()).replace(/^﻿/, "");
  if (/^\s*<(!doctype|html)/i.test(text)) {
    throw new Error(
      "SHEET_CSV_URL returned HTML, not CSV (sheet is not public or the URL is not a CSV link)",
    );
  }
  const rows = parseCsv(text);
  const header = (rows[0] ?? []).map(normHeader);
  const qIdx = header.indexOf("คำถาม");
  const aIdx = header.indexOf("คำตอบ");
  if (qIdx < 0 || aIdx < 0) {
    throw new Error(
      `Sheet must have columns "คำถาม" and "คำตอบ" but first row was: ${JSON.stringify(rows[0] ?? [])}`,
    );
  }

  const items = rows
    .slice(1)
    .map((r) => ({
      question: (r[qIdx] ?? "").trim(),
      answer: (r[aIdx] ?? "").trim(),
    }))
    .filter((it) => it.question && it.answer);

  cache = { items, expiresAt: now + CACHE_TTL_MS };
  return items;
}

export function formatFaq(items: FaqItem[]): string {
  return items.map((it) => `คำถาม: ${it.question}\nคำตอบ: ${it.answer}`).join("\n\n");
}
