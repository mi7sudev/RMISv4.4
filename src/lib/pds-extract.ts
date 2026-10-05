// ============================================================================
// RMIS — Document extraction pipeline (spec §8.5 deterministic PDS parser,
// §8.6 AI fallback). SERVER-SIDE ONLY.
//   xlsx/xls/xlsm → deterministic label-anchored parser first, AI fallback
//   pdf  → unpdf text → AI      docx → mammoth text → AI      images → AI vision
// Prompt contract: extract only what is clearly present; NEVER fabricate;
// not found ⇒ null + confidence "none"; dates → YYYY-MM-DD; JSON only.
// The deterministic parser is VERSION-ADAPTIVE: it handles the official
// multi-sheet CS Form 212 (Revised 2017 and agency re-revisions of any year,
// including 2026-era templates), its continuation sheets, and older/lower
// single-sheet legacy PDS layouts, by probing labels with boilerplate
// stripped and resolving table columns from their header rows instead of
// assuming one template's geometry.
// ============================================================================

import * as XLSX from "xlsx";
import fs from "fs";
import path from "path";

export type ConfidentValue = { value: string | number | boolean | null; confidence: "high" | "medium" | "low" | "none" };
export type ExtractionSection = Record<string, ConfidentValue>;
export type ExtractionResult = {
  personalInfo?: ExtractionSection;
  educations?: ExtractionSection[];
  workExperiences?: ExtractionSection[];
  trainings?: ExtractionSection[];
  eligibilities?: ExtractionSection[];
  awards?: ExtractionSection[];
  warnings?: string[];
};

const cv = (value: string | number | null, confidence: ConfidentValue["confidence"] = "high"): ConfidentValue =>
  ({ value: value === "" ? null : value, confidence });

// ── Deterministic PDS parsing (CS Form 212 — version-adaptive) ──────────────

// Roman-numeral section titles ("IV. CIVIL SERVICE ELIGIBILITY", "VII.
// LEARNING AND DEVELOPMENT …") must never anchor a table — the real table
// header sits 1–2 rows below them. "(Continue on separate sheet …)" notes,
// signature rows, and template disclaimer banners are never data.
const NOISE = /cs\s*form|page\s*\d+\s*of|signature|do not abbreviate|^\s*[ivx]+\.\s*$|^\s*[ivxlc]+\s*\.\s|^section\b|continue\s*on\s*separate|over-\s*mark|demonstration\s*data|do\s*not\s*submit/i;

function cellText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "Yes" : "";
  if (typeof v === "object" && v !== null) {
    const obj = v as { text?: string; result?: unknown };
    if (typeof obj.text === "string") return obj.text;
    if (obj.result != null) return String(obj.result);
    return "";
  }
  return String(v).trim();
}

// PDS versions differ in how much boilerplate they embed inside label cells
// ("POSITION TITLE (Write in full/Do not abbreviate)", "(mm/dd/yyyy)",
// "(Continue on separate sheet if necessary)"). Probing the text with
// parentheticals stripped keeps real headers recognizable while page footers
// ("CS FORM 212 (Revised 2017), Page 1 of 4") are still rejected by NOISE.
function probeText(v: unknown): string {
  return cellText(v).replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
}

// "N/A" markers mean the applicant left the cell blank — treat as empty.
const isNA = (s: string) => !s || /^n\/?a\.?$/i.test(s.trim());

// Real PDS cell values are short; anything beyond this is template
// boilerplate (disclaimer banners, instructions) that some versions embed in
// data rows — never extract it as content.
const MAX_VALUE_LEN = 160;
const plausible = (v: string, min: number) => !isNA(v) && v.length >= min && v.length <= MAX_VALUE_LEN;

function findRow(ws: XLSX.WorkSheet, labelRe: RegExp, maxRow = 80, startRow?: number): { row: number; col: number } | null {
  const ref = ws["!ref"];
  if (!ref) return null;
  const range = XLSX.utils.decode_range(ref);
  const rEnd = Math.min(range.e.r, maxRow);
  for (let r = startRow ?? range.s.r; r <= rEnd; r++) {
    for (let c = range.s.c; c <= Math.min(range.e.c, range.s.c + 14); c++) {
      const t = probeText(ws[XLSX.utils.encode_cell({ r, c })]?.v);
      if (t && labelRe.test(t) && !NOISE.test(t)) return { row: r, col: c };
    }
  }
  return null;
}

function scanRight(ws: XLSX.WorkSheet, row: number, startCol: number, maxScan = 12): string {
  const ref = ws["!ref"];
  if (!ref) return "";
  const range = XLSX.utils.decode_range(ref);
  for (let c = startCol + 1; c <= Math.min(range.e.c, startCol + maxScan); c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: row, c })];
    const t = cellText(cell?.v);
    if (t && !NOISE.test(t) && !/^(yes|no)$/i.test(t) && !/^\d{1,2}$/.test(t)) return t;
  }
  return "";
}

function normDate(v: string): string {
  if (!v) return "";
  // Excel serial?
  const num = Number(v);
  if (!Number.isNaN(num) && num > 20000 && num < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) as unknown as number);
    d.setUTCDate(d.getUTCDate() + Math.floor(num));
    return d.toISOString().slice(0, 10);
  }
  const parsed = new Date(v);
  if (!Number.isNaN(parsed.getTime()) && /\d{4}/.test(v)) return parsed.toISOString().slice(0, 10);
  const m = v.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return "";
}

const year4 = (v: string): string => (/^\d{4}$/.test(v.trim()) ? v.trim() : (v.match(/\d{4}/)?.[0] ?? ""));

// ── Version-adaptive table reader ────────────────────────────────────────────
// Every PDS section table (education, eligibility, work, training, awards) is
// located by its HEADER ROW and each field's column is RESOLVED from the
// header labels (header row + up to 3 rows below, covering two-row headers
// with From/To sub-rows). Hardcoded column geometry from one template becomes
// only a fallback, so re-revisions and older/lower layouts that shifted
// columns still parse. Tables are collected from EVERY sheet (main pages and
// continuation sheets alike; Lookup sheets excluded).

type TableRowGetter = (col: number) => string;

type TableSpec = {
  key: "educations" | "workExperiences" | "trainings" | "eligibilities" | "awards";
  headerRe: RegExp;
  fallbackHeaderRe?: RegExp;
  fields: Record<string, { re?: RegExp; fallback: number[] }>;
  maxRows: number;
  build: (get: TableRowGetter, cols: Record<string, number>) => ExtractionSection | null;
};

function resolveColumns(ws: XLSX.WorkSheet, headerRow: number, fields: TableSpec["fields"]): Record<string, number> {
  const ref = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : null;
  const cStart = ref ? ref.s.c : 0;
  const cEnd = ref ? Math.min(ref.e.c, ref.s.c + 14) : 14;
  const cols: Record<string, number> = {};
  for (const [key, spec] of Object.entries(fields)) {
    cols[key] = -1;
    if (spec.re) {
      for (let r = headerRow; r <= headerRow + 3 && cols[key] === -1; r++) {
        for (let c = cStart; c <= cEnd; c++) {
          const t = probeText(ws[XLSX.utils.encode_cell({ r, c })]?.v);
          if (t && spec.re.test(t) && !NOISE.test(t)) {
            cols[key] = c;
            break;
          }
        }
      }
    }
    if (cols[key] === -1) cols[key] = spec.fallback[0] ?? -1;
  }
  return cols;
}

// Pick the first candidate cell that satisfies pred, skipping columns that
// belong to other resolved fields (e.g. the To-date column next to a merged
// title) and the header column's merge-neighbors only when they are free.
function pickCell(cands: number[], exclude: number[], get: TableRowGetter, pred: (v: string) => boolean): string {
  for (const c of cands) {
    if (c < 0 || exclude.includes(c)) continue;
    const v = get(c);
    if (pred(v)) return v;
  }
  return "";
}

function parseTableAcrossSheets(wb: XLSX.WorkBook, spec: TableSpec): ExtractionSection[] {
  const entries: ExtractionSection[] = [];
  for (const name of wb.SheetNames) {
    if (/lookup/i.test(name)) continue;
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const header = findRow(ws, spec.headerRe, 250) ?? (spec.fallbackHeaderRe ? findRow(ws, spec.fallbackHeaderRe, 250) : null);
    if (!header) continue;
    const cols = resolveColumns(ws, header.row, spec.fields);
    const ref = XLSX.utils.decode_range(ws["!ref"]!);
    // A section table ends at the next "(Continue on separate sheet …)" note,
    // the next roman-numeral section title, or a signature row — without this
    // clamp the scan bleeds into the FOLLOWING section's table (e.g. the
    // eligibility window reading the work-experience header row). The note is
    // tested on the RAW text because probeText strips its parentheses.
    let sectionEnd = Math.min(ref.e.r, header.row + spec.maxRows);
    for (let r = header.row + 1; r <= sectionEnd; r++) {
      const raw = [0, 1, 2].map((c) => cellText(ws[XLSX.utils.encode_cell({ r, c })]?.v)).join(" ");
      const probe = [0, 1, 2].map((c) => probeText(ws[XLSX.utils.encode_cell({ r, c })]?.v)).join(" ");
      const tail = [3, 4, 5, 6, 7].map((c) => cellText(ws[XLSX.utils.encode_cell({ r, c })]?.v)).join("");
      if (/continue on separate|signature/i.test(raw) || (/^\s*[ivxlc]+\s*\.\s/i.test(probe) && tail === "")) {
        sectionEnd = r - 1;
        break;
      }
    }
    for (let r = header.row + 1; r <= sectionEnd; r++) {
      const get: TableRowGetter = (c) => (c >= 0 ? cellText(ws[XLSX.utils.encode_cell({ r, c })]?.v) : "");
      try {
        const entry = spec.build(get, cols);
        if (entry) entries.push(entry);
      } catch {
        // malformed row — skip
      }
    }
  }
  return entries;
}

const EDUCATION_LEVEL_MAP = (raw: string): string =>
  /elementary/i.test(raw) ? "Elementary"
  : /secondary|high\s*school/i.test(raw) ? "Secondary"
  : /vocational|trade/i.test(raw) ? "Vocational / Trade"
  : /graduate|post/i.test(raw) ? "Graduate Studies"
  : "College";

const TABLE_SPECS: TableSpec[] = [
  {
    key: "educations",
    headerRe: /name\s*of\s*school/i,
    fields: {
      level: { re: /\blevel\b/i, fallback: [1] },
      school: { re: /name\s*of\s*school/i, fallback: [3] },
      degree: { re: /degree|course/i, fallback: [6] },
      from: { re: /^from\b/i, fallback: [9] },
      to: { re: /^to\b/i, fallback: [10] },
      graduated: { re: /year\s*graduated/i, fallback: [12] },
      honors: { re: /scholarship|honors/i, fallback: [13] },
    },
    maxRows: 40,
    build: (get, cols) => {
      const school = get(cols.school);
      const degree = get(cols.degree);
      if (isNA(school) && isNA(degree)) return null;
      if (NOISE.test(school + degree)) return null;
      const entry: ExtractionSection = {};
      const level = get(cols.level);
      if (!isNA(level)) entry.educationLevel = cv(EDUCATION_LEVEL_MAP(level), "medium");
      if (!isNA(school)) entry.schoolName = cv(school);
      if (!isNA(degree) && !/^graduated$/i.test(degree)) entry.course = cv(degree, "medium");
      const from = year4(get(cols.from));
      if (from) entry.yearFrom = cv(from, "medium");
      const to = year4(get(cols.to));
      if (to) entry.yearTo = cv(to, "medium");
      const grad = year4(get(cols.graduated));
      if (grad) entry.yearGraduated = cv(grad, "medium");
      const honors = get(cols.honors);
      if (!isNA(honors)) entry.awards = cv(honors, "medium");
      return Object.keys(entry).length > 0 ? entry : null;
    },
  },
  {
    key: "eligibilities",
    headerRe: /career\s*service\/?\s*ra\s*1080|date\s*of\s*examination|conferment/i,
    fallbackHeaderRe: /civil\s*service\s*eligib|\beligib/i,
    fields: {
      title: { fallback: [1, 2] },
      rating: { re: /rating/i, fallback: [5] },
      examDate: { re: /date\s*of\s*exam|conferment/i, fallback: [6] },
      examPlace: { re: /place\s*of\s*exam/i, fallback: [7] },
    },
    maxRows: 40,
    build: (get, cols) => {
      const ratingCell = get(cols.rating);
      const dateCell = get(cols.examDate);
      const placeCell = get(cols.examPlace);
      // A row repeating the column captions (older variants anchor one row
      // higher) is a header, not data: 2+ caption cells give it away.
      const captionHits = [ratingCell, dateCell, placeCell].filter((v) => /rating|exam|conferment|place/i.test(v)).length;
      if (captionHits >= 2) return null;
      // The title cell is the only unlabeled column (older variants place it
      // one column off) — exclude the resolved rating/date/place columns and
      // never accept a purely numeric cell (that is the rating).
      const title = pickCell(
        [cols.title, cols.title - 1, cols.title + 1],
        [cols.rating, cols.examDate, cols.examPlace],
        get,
        (v) => plausible(v, 3) && !/^[\d.,\s]+$/.test(v)
      );
      if (isNA(title) || NOISE.test(title)) return null;
      const entry: ExtractionSection = { title: cv(title.replace(/\s*\(.*?\)\s*$/, "")) };
      if (ratingCell && /^\d/.test(ratingCell)) entry.rating = cv(ratingCell, "medium");
      if (dateCell) entry.examDate = cv(normDate(dateCell) || dateCell, "medium");
      if (placeCell) entry.examPlace = cv(placeCell, "medium");
      return entry;
    },
  },
  {
    key: "workExperiences",
    headerRe: /position\s*title/i,
    fields: {
      from: { re: /^from\b/i, fallback: [0, 1] },
      to: { re: /^to\b/i, fallback: [2, 3] },
      title: { re: /position\s*title/i, fallback: [4, 3] },
      employer: { re: /department|agency|company/i, fallback: [6, 5] },
      salary: { re: /monthly\s*salary/i, fallback: [9, 8] },
    },
    maxRows: 200,
    build: (get, cols) => {
      const position = pickCell([cols.title, cols.title - 1, cols.title + 1], [cols.from, cols.to], get, (v) => plausible(v, 3));
      if (!position || NOISE.test(position)) return null;
      const entry: ExtractionSection = { positionTitle: cv(position) };
      const employer = pickCell([cols.employer, cols.employer - 1], [cols.from, cols.to], get, (v) => !isNA(v) && v.length > 2);
      if (employer) entry.employerName = cv(employer, "medium");
      const dFrom = normDate(get(cols.from));
      if (dFrom) entry.dateFrom = cv(dFrom, "medium");
      const toRaw = get(cols.to);
      const dTo = normDate(toRaw);
      if (dTo) entry.dateTo = cv(dTo, "medium");
      else if (isNA(toRaw) || /present/i.test(toRaw)) entry.isPresentWork = cv("true", "medium");
      const salary = get(cols.salary);
      if (!isNA(salary)) {
        const n = Number(salary.replace(/[^\d.]/g, ""));
        if (!Number.isNaN(n) && n > 0) entry.monthlySalary = cv(n, "medium");
      }
      return entry;
    },
  },
  {
    key: "trainings",
    headerRe: /title\s*of\s*(learning|training)|learning\s*(and|&)\s*development/i,
    fields: {
      title: { fallback: [0, 1] },
      from: { re: /^from\b/i, fallback: [4, 2] },
      to: { re: /^to\b/i, fallback: [5, 3] },
      hours: { re: /number\s*of\s*hours|hours/i, fallback: [6] },
      type: { re: /type\s*of/i, fallback: [7] },
    },
    maxRows: 200,
    build: (get, cols) => {
      const title = pickCell([cols.title, cols.title + 1], [cols.from, cols.to], get, (v) => plausible(v, 4));
      if (isNA(title) || NOISE.test(title) || /^\d+$/.test(title)) return null;
      const entry: ExtractionSection = { title: cv(title) };
      const dFrom = normDate(get(cols.from));
      if (dFrom) entry.dateFrom = cv(dFrom, "medium");
      const dTo = normDate(get(cols.to));
      if (dTo) entry.dateTo = cv(dTo, "medium");
      const hours = get(cols.hours);
      const hNum = Number(String(hours).replace(/[^\d.]/g, ""));
      if (!isNA(hours) && !Number.isNaN(hNum) && hNum > 0) entry.numberHours = cv(hNum, "medium");
      const type = get(cols.type);
      if (!isNA(type) && type.length > 2 && !NOISE.test(type)) entry.typeOfTraining = cv(type, "medium");
      return entry;
    },
  },
  {
    key: "awards",
    headerRe: /non-?academic\s*distinctions/i,
    fields: {
      details: { re: /non-?academic\s*distinctions/i, fallback: [3] },
    },
    maxRows: 60,
    build: (get, cols) => {
      // The distinctions cell is a merge whose anchor often sits one column
      // left of its caption; the Special Skills and Membership columns share
      // the row and must NOT leak in.
      const details = pickCell([cols.details, cols.details - 1, cols.details + 1], [], get, (v) => plausible(v, 7));
      if (!details || NOISE.test(details) || /^\d+$/.test(details) || /membership|special\s*skills|hobbies/i.test(details)) return null;
      return { details: cv(details), recognitionType: cv("Award", "medium") };
    },
  },
];

function detectRevision(wb: XLSX.WorkBook): string | null {
  for (const name of wb.SheetNames) {
    if (/lookup/i.test(name)) continue;
    const ws = wb.Sheets[name];
    const ref = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : null;
    if (!ref) continue;
    for (let r = ref.s.r; r <= Math.min(ref.e.r, 120); r++) {
      for (let c = ref.s.c; c <= Math.min(ref.e.c, ref.s.c + 15); c++) {
        const t = cellText(ws[XLSX.utils.encode_cell({ r, c })]?.v);
        const m = t.match(/revised\s*(20\d{2})/i);
        if (m) return `CS Form 212 (Revised ${m[1]})`;
        if (/cs\s*form\s*no\.?\s*\.?\s*212/i.test(t)) return "CS Form 212";
      }
    }
  }
  return null;
}

export function parsePdsWorkbook(filePath: string): ExtractionResult | null {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.readFile(filePath, { cellDates: false });
  } catch {
    return null;
  }
  const sheetName = wb.SheetNames.find((n) => /C1|Sheet1|personal/i.test(n)) || wb.SheetNames[0];
  if (!sheetName) return null;
  const ws = wb.Sheets[sheetName];
  const a1 = probeText(ws["A1"]?.v ?? ws["A2"]?.v ?? ws["A3"]?.v);
  const looksLikePds =
    /personal\s*data\s*sheet/i.test(a1) ||
    wb.SheetNames.some((n) => /C\d/i.test(n)) ||
    !!findRow(ws, /personal\s*data\s*sheet/i, 12);
  if (!looksLikePds) return null;

  const result: ExtractionResult = { warnings: [] };
  const revision = detectRevision(wb);
  if (revision) result.warnings?.push(`Detected ${revision} layout.`);

  const personal: ExtractionSection = {};
  const put = (key: string, v: string, conf: ConfidentValue["confidence"] = "high") => {
    if (v) personal[key] = cv(v, conf);
  };

  const surname = findRow(ws, /sur\s*name/i) || findRow(ws, /^surname/i);
  if (surname) put("lastName", scanRight(ws, surname.row, surname.col));
  const given = findRow(ws, /given\s*name|first\s*name/i);
  if (given) put("firstName", scanRight(ws, given.row, given.col));
  const middle = findRow(ws, /middle\s*name/i);
  if (middle) put("middleName", scanRight(ws, middle.row, middle.col));
  const ext = findRow(ws, /name\s*extension/i);
  if (ext) put("extensionName", scanRight(ws, ext.row, ext.col));
  const dob = findRow(ws, /date\s*of\s*birth/i);
  if (dob) put("birthDate", normDate(scanRight(ws, dob.row, dob.col)), "high");
  const pob = findRow(ws, /place\s*of\s*birth/i);
  if (pob) put("birthPlace", scanRight(ws, pob.row, pob.col));
  const sex = findRow(ws, /^sex|gender/i);
  if (sex) {
    const raw = scanRight(ws, sex.row, sex.col);
    const m = raw.match(/male|female/i);
    if (m) put("gender", m[0][0].toUpperCase() + m[0].slice(1).toLowerCase());
  }
  const cs = findRow(ws, /civil\s*status/i);
  if (cs) {
    const raw = scanRight(ws, cs.row, cs.col).toLowerCase();
    const hit = ["single", "married", "widowed", "separated", "divorced"].find((s) => raw.includes(s));
    if (hit) put("civilStatus", hit[0].toUpperCase() + hit.slice(1));
  }
  const cit = findRow(ws, /citizenship/i);
  if (cit) put("citizenship", scanRight(ws, cit.row, cit.col));
  const res = findRow(ws, /residential\s*address|house\/?street|house\s*no/i);
  if (res) {
    put("houseNumber", scanRight(ws, res.row, res.col));
    const block = [res.row, res.row + 1, res.row + 2].map((r) => scanRight(ws, r, res.col)).filter(Boolean);
    if (block.length > 0) put("presentAddress", block.join(", "), "medium");
  }
  const zip = findRow(ws, /zip\s*code/i);
  if (zip) put("zipCode", scanRight(ws, zip.row, zip.col));
  const tel = findRow(ws, /tele(phone)?\s*\/?\s*mobile|mobile/i);
  if (tel) {
    const raw = scanRight(ws, tel.row, tel.col).replace(/\s+/g, "");
    if (/^[\d+()-]{7,15}$/.test(raw)) put("mobileNumber", raw);
  }
  const email = findRow(ws, /e-?mail/i);
  if (email) {
    const raw = scanRight(ws, email.row, email.col);
    if (raw.includes("@")) put("emailAddress", raw);
  }

  const fieldsExtracted = Object.keys(personal).length;
  if (fieldsExtracted === 0 && wb.SheetNames.length <= 1) {
    result.warnings?.push("No PDS labels recognized");
    return result;
  }
  if (fieldsExtracted > 0) result.personalInfo = personal;

  // ── Section tables — header-resolved, collected across every sheet ────────
  for (const spec of TABLE_SPECS) {
    const entries = dedupeSectionArray(parseTableAcrossSheets(wb, spec), spec.key);
    if (entries.length > 0) result[spec.key] = entries;
  }

  // ── Legacy/lower-version fallback: simple label:value education rows ──────
  // Older single-sheet PDS exports list educational background as plain
  // "ELEMENTARY: <school>" style rows instead of a headered table.
  if (!result.educations) {
    const legacyEdu: ExtractionSection[] = [];
    for (const name of wb.SheetNames) {
      if (/lookup/i.test(name)) continue;
      const s = wb.Sheets[name];
      const ref = s["!ref"] ? XLSX.utils.decode_range(s["!ref"]) : null;
      if (!ref) continue;
      for (let r = ref.s.r; r <= Math.min(ref.e.r, 120); r++) {
        for (let c = ref.s.c; c <= Math.min(ref.e.c, ref.s.c + 3); c++) {
          const label = probeText(s[XLSX.utils.encode_cell({ r, c })]?.v);
          if (!/^(elementary|secondary|high\s*school|vocational|college|bachelor|graduate|post\s*graduate)/i.test(label)) continue;
          const value = scanRight(s, r, c);
          if (isNA(value) || value.length < 3) continue;
          legacyEdu.push({ educationLevel: cv(EDUCATION_LEVEL_MAP(label), "medium"), schoolName: cv(value, "medium") });
        }
      }
    }
    const deduped = dedupeSectionArray(legacyEdu, "educations");
    if (deduped.length > 0 && deduped.length <= 8) result.educations = deduped;
  }

  return result;
}

// ── AI extraction (z-ai-web-dev-sdk — backend only) ─────────────────────────

const AI_JSON_PROMPT = (category: string, text: string) => `You are a data-extraction engine for Philippine government recruitment (CSC forms).
From the following ${category} document text, extract structured data as STRICT JSON with this exact shape (omit sections you find nothing for):
{
  "personalInfo": { "<field>": {"value": <string|number|null>, "confidence": "high"|"medium"|"low"} },
  "educations": [ { "educationLevel": {...}, "course": {...}, "schoolName": {...}, "yearFrom": {...}, "yearTo": {...}, "yearGraduated": {...}, "awards": {...} } ],
  "workExperiences": [ { "positionTitle": {...}, "employerName": {...}, "dateFrom": {...}, "dateTo": {...}, "monthlySalary": {...}, "isPresentWork": {...} } ],
  "trainings": [ { "title": {...}, "numberHours": {...}, "typeOfTraining": {...}, "dateFrom": {...}, "dateTo": {...} } ],
  "eligibilities": [ { "title": {...}, "rating": {...}, "examDate": {...}, "examPlace": {...}, "licenseNumber": {...}, "licenseValidity": {...} } ],
  "awards": [ { "details": {...}, "recognitionType": {...}, "provider": {...}, "dateGranted": {...} } ]
}
personalInfo fields may include: firstName, middleName, lastName, extensionName, birthDate, birthPlace, gender, civilStatus, citizenship, mobileNumber, emailAddress, houseNumber, street, subdivision, barangay, city, province, zipCode.
Rules: extract ONLY what is clearly present; NEVER fabricate; not found ⇒ value null with confidence "none"; all values in the {value, confidence} shape; dates formatted YYYY-MM-DD; respond with JSON only — no markdown fences, no commentary.

DOCUMENT TEXT (truncated):
"""
${text.slice(0, 12000)}
"""`;

function parseAiJson(raw: string): ExtractionResult | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as ExtractionResult;
  } catch {
    return null;
  }
}

async function aiExtractText(text: string, category: string): Promise<ExtractionResult | null> {
  try {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: "You extract structured data from documents and reply with JSON only." },
        { role: "user", content: AI_JSON_PROMPT(category, text) },
      ],
      thinking: { type: "disabled" },
    });
    const raw = completion.choices[0]?.message?.content || "";
    return parseAiJson(raw);
  } catch (e) {
    console.error("[EXTRACT] AI failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

// ── Text extraction helpers ─────────────────────────────────────────────────

export function extractExcelText(filePath: string): string {
  try {
    const wb = XLSX.readFile(filePath, { cellDates: false });
    const parts: string[] = [];
    for (const name of wb.SheetNames) {
      if (/lookup/i.test(name)) continue;
      const ws = wb.Sheets[name];
      parts.push(`## Sheet: ${name}`);
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });
      for (const row of rows.slice(0, 300)) {
        const cells = (row as unknown[]).map((c) => cellText(c)).filter(Boolean);
        if (cells.length > 0) parts.push(cells.join(" | "));
      }
    }
    return parts.join("\n").slice(0, 16000);
  } catch {
    return "";
  }
}

export async function extractPdfText(filePath: string): Promise<string> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const buffer = fs.readFileSync(filePath);
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return text.slice(0, 16000);
  } catch {
    return "";
  }
}

export async function extractDocxText(filePath: string): Promise<string> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value.slice(0, 12000);
  } catch {
    return "";
  }
}

// ── Entry point ─────────────────────────────────────────────────────────────

export function countExtractedFields(result: ExtractionResult | null): number {
  if (!result) return 0;
  let n = 0;
  const countSection = (s?: ExtractionSection) => { if (s) n += Object.values(s).filter((v) => v && v.value !== null && v.value !== "").length; };
  countSection(result.personalInfo);
  for (const arr of [result.educations, result.workExperiences, result.trainings, result.eligibilities, result.awards]) {
    for (const s of arr ?? []) countSection(s);
  }
  return n;
}

export function mergeExtractions(results: (ExtractionResult | null)[]): ExtractionResult | null {
  const valid = results.filter((r): r is ExtractionResult => !!r);
  if (valid.length === 0) return null;
  const merged: ExtractionResult = { warnings: [] };
  // personal: per-field highest-confidence non-null wins
  const rank: Record<string, number> = { high: 3, medium: 2, low: 1, none: 0 };
  const personal: ExtractionSection = {};
  for (const r of valid) {
    for (const [k, v] of Object.entries(r.personalInfo ?? {})) {
      if (v.value === null || v.value === "") continue;
      const cur = personal[k];
      if (!cur || (rank[v.confidence] ?? 0) > (rank[cur.confidence] ?? 0)) personal[k] = v;
    }
  }
  if (Object.keys(personal).length > 0) merged.personalInfo = personal;
  const mergeArr = (key: keyof ExtractionResult) => {
    const all = valid.flatMap((r) => (r[key] as ExtractionSection[] | undefined) ?? []);
    if (all.length > 0) (merged as Record<string, unknown>)[key as string] = dedupeSectionArray(all, key as string);
  };
  mergeArr("educations");
  mergeArr("workExperiences");
  mergeArr("trainings");
  mergeArr("eligibilities");
  mergeArr("awards");
  merged.warnings = valid.flatMap((r) => r.warnings ?? []);
  return merged;
}

function dedupeSectionArray(arr: ExtractionSection[], key: string): ExtractionSection[] {
  const seen = new Set<string>();
  const out: ExtractionSection[] = [];
  for (const item of arr) {
    const sig =
      key === "trainings" ? `${item.title?.value ?? ""}|${item.dateFrom?.value ?? ""}`
      : key === "awards" ? `${item.details?.value ?? ""}`
      : key === "workExperiences" ? `${item.positionTitle?.value ?? ""}|${item.employerName?.value ?? ""}|${item.dateFrom?.value ?? ""}`
      : key === "eligibilities" ? `${item.title?.value ?? ""}|${item.examDate?.value ?? ""}`
      : `${item.educationLevel?.value ?? ""}|${item.schoolName?.value ?? ""}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(item);
  }
  return out;
}

/**
 * Extract structured data from a stored document (spec §6.4). Deterministic
 * parser first for PDS × Excel; AI fallback otherwise.
 */
export async function extractFromDocument(
  filePath: string,
  category: string,
  mimeType: string
): Promise<{ result: ExtractionResult | null; error?: string }> {
  const ext = path.extname(filePath).toLowerCase();
  if (/\.(xlsx|xls|xlsm)$/.test(ext)) {
    const deterministic = parsePdsWorkbook(filePath);
    if (deterministic && countExtractedFields(deterministic) >= 3) return { result: deterministic };
    const text = extractExcelText(filePath);
    if (text.trim().length > 40) {
      const ai = await aiExtractText(text, category);
      return { result: mergeExtractions([deterministic, ai]) };
    }
    return { result: deterministic };
  }
  if (ext === ".pdf") {
    const text = await extractPdfText(filePath);
    if (!text.trim()) return { result: null, error: "Could not read text from this PDF. Try uploading the Excel version of the PDS." };
    return { result: await aiExtractText(text, category) };
  }
  if (ext === ".docx" || ext === ".doc") {
    const text = await extractDocxText(filePath);
    if (!text.trim()) return { result: null, error: "Could not read this document. Try a DOCX or XLSX file." };
    return { result: await aiExtractText(text, category) };
  }
  if (/\.(png|jpg|jpeg|gif|webp|bmp)$/.test(ext)) {
    return { result: null, error: "Image extraction is not available in this deployment. Please upload the PDS as XLSX, PDF, or DOCX." };
  }
  return { result: null, error: `Unsupported file type for extraction (${mimeType}).` };
}
