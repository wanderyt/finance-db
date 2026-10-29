import { open, readFile } from 'node:fs/promises';
import { basename, extname, isAbsolute } from 'node:path';

import { mcpConfig } from '../config.js';
import {
  analyzeReceiptSchema,
  buildFinRecordSchema,
  createFinRecordSchema,
  type CreateFinRequestInput,
} from '../schemas.js';
import { type AnyTool } from './types.js';

/**
 * Write / receipt-intake tools.
 *
 * These are the only *mutating* tools on the finance-db MCP surface, but they
 * never touch the read-only SQLite handle — they are thin HTTP clients of the
 * new-finance app, which owns the receipt analysis (Gemini), FX conversion, and
 * the actual writes. Todd (the intake agent) drives them in sequence:
 *
 *   analyze_receipt  →  build_fin_record  →  (user confirms)  →  create_fin_record
 */
export function buildFinWriteTools(): AnyTool[] {
  return [
    {
      name: 'analyze_receipt',
      description:
        'Analyze a receipt image and return the extracted structured data ' +
        '(merchant, city, date, currency, totals, line items, suggested ' +
        'category — all amounts in CENTS). Does NOT write anything. Pass the ' +
        'result to build_fin_record next. Returns a single row.',
      schema: analyzeReceiptSchema,
      inputSchema: {
        type: 'object',
        properties: {
          image_path: {
            type: 'string',
            minLength: 1,
            description: 'Absolute local path to the receipt image file.',
          },
        },
        required: ['image_path'],
        additionalProperties: false,
      },
      handler: async (input) => {
        const analysis = await analyzeReceipt(input.image_path);
        return [analysis];
      },
    },
    {
      name: 'build_fin_record',
      description:
        'Assemble a complete, ready-to-create fin record payload from an ' +
        'analyze_receipt result, applying any user overrides. Returns ' +
        '{ record, summary } where `record` is the exact object create_fin_record ' +
        'will receive and `summary` is a human-readable (dollars) recap to show ' +
        'the user for approval. Does NOT write anything. Returns a single row.',
      schema: buildFinRecordSchema,
      inputSchema: {
        type: 'object',
        properties: {
          analysis: {
            type: 'object',
            description: 'The object returned by analyze_receipt.',
          },
          overrides: {
            type: 'object',
            description:
              'Optional user corrections (merchant, date, category, amount, currency, …).',
          },
        },
        required: ['analysis'],
        additionalProperties: false,
      },
      handler: (input) => {
        const record = buildRecord(input.analysis, input.overrides ?? {});
        return [{ record, summary: summarize(record) }];
      },
    },
    {
      name: 'create_fin_record',
      description:
        'Create a confirmed financial record through the website API. ' +
        'Attach a receipt with image_path and up to six product photos with photo_paths. ' +
        'Call this tool only after the user approves the build_fin_record output. ' +
        'Return the created record as a single row.',
      schema: createFinRecordSchema,
      inputSchema: {
        type: 'object',
        properties: {
          record: {
            type: 'object',
            description:
              'The confirmed fin record payload from build_fin_record. Requires ' +
              'date (ISO-8601 UTC), originalCurrency (CAD/USD/CNY), originalAmountCents.',
          },
          image_path: {
            type: 'string',
            minLength: 1,
            description: 'Optional receipt image path to attach.',
          },
          photo_paths: {
            type: 'array',
            maxItems: 6,
            items: { type: 'string', minLength: 1 },
            description: 'Absolute product photo paths. Use JPEG, PNG, or WebP, with at most 5 MiB per file.',
          },
        },
        required: ['record'],
        additionalProperties: false,
      },
      handler: async (input) => {
        const created = await createFinRecord(input.record, input.image_path, input.photo_paths);
        return [created];
      },
    },
  ];
}

// --- HTTP helpers --------------------------------------------------------

function apiKeyOrThrow(): string {
  if (!mcpConfig.financeApiKey) {
    throw new Error(
      'FINANCE_MCP_KEY is not set — the write tools cannot authenticate to ' +
        'the new-finance API. Set FINANCE_MCP_KEY (and FINANCE_API_URL) in the ' +
        'MCP server env.',
    );
  }
  return mcpConfig.financeApiKey;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${mcpConfig.financeApiUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKeyOrThrow(),
    },
    body: JSON.stringify(body),
  });
  return parseResponse<T>(res, path);
}

async function postForm<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${mcpConfig.financeApiUrl}${path}`, {
    method: 'POST',
    headers: { 'X-Api-Key': apiKeyOrThrow() },
    body: form,
  });
  return parseResponse<T>(res, path);
}

async function parseResponse<T>(res: Response, path: string): Promise<T> {
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg =
      (json as { error?: string })?.error ?? text ?? `HTTP ${res.status}`;
    throw new Error(`new-finance ${path} failed (${res.status}): ${msg}`);
  }
  return json as T;
}

function mimeForPath(p: string): string {
  switch (extname(p).toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.heic':
      return 'image/heic';
    case '.heif':
      return 'image/heif';
    case '.jpg':
    case '.jpeg':
    default:
      return 'image/jpeg';
  }
}

async function fileBlob(imagePath: string): Promise<Blob> {
  const buf = await readFile(imagePath);
  return new Blob([buf], { type: mimeForPath(imagePath) });
}

async function productPhotoBlob(path: string): Promise<Blob> {
  if (!isAbsolute(path)) throw new Error('Product photo paths must be absolute.');
  const types: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  };
  const type = types[extname(path).toLowerCase()];
  if (!type) throw new Error('Product photos must use JPEG, PNG, or WebP.');
  const file = await open(path, 'r');
  try {
    const stat = await file.stat();
    const size = stat.size;
    if (!stat.isFile()) throw new Error('Each product photo path must refer to a regular file.');
    if (size === 0 || size > 5 * 1024 * 1024) {
      throw new Error('Each product photo must contain data and be 5 MiB or smaller.');
    }
    // Bound the read even if the file grows after stat().
    const buffer = Buffer.alloc(size + 1);
    let total = 0;
    while (total < buffer.length) {
      const { bytesRead } = await file.read(buffer, total, buffer.length - total, total);
      if (bytesRead === 0) break;
      total += bytesRead;
    }
    if (total !== size) throw new Error('The product photo changed during the upload. Try again.');
    return new Blob([buffer.subarray(0, total)], { type });
  } finally {
    await file.close();
  }
}

// --- Tool implementations ------------------------------------------------

/** POST the image to new-finance's Gemini analyzer and return its JSON. */
async function analyzeReceipt(imagePath: string): Promise<unknown> {
  const form = new FormData();
  form.append('receipt', await fileBlob(imagePath), basename(imagePath));
  return postForm('/api/receipts/analyze', form);
}

/** POST the confirmed record to new-finance; returns the created FinData. */
async function createFinRecord(
  record: CreateFinRequestInput,
  imagePath?: string,
  photoPaths: string[] = [],
): Promise<unknown> {
  if (photoPaths.length > 6) throw new Error('A record can contain up to six product photos.');
  if (imagePath || photoPaths.length > 0) {
    const form = new FormData();
    form.append('data', JSON.stringify(record));
    if (imagePath) form.append('receipt', await fileBlob(imagePath), basename(imagePath));
    for (const path of photoPaths) {
      form.append('photos', await productPhotoBlob(path), basename(path));
    }
    const res = await postForm<{ data?: unknown }>('/api/fin/create', form);
    return res.data ?? res;
  }
  const res = await postJson<{ data?: unknown }>('/api/fin/create', record);
  return res.data ?? res;
}

// --- Pure assembly (build_fin_record) ------------------------------------

type AnalysisLineItem = {
  name?: string;
  amount?: number;
  quantity?: number;
  unit?: string | null;
  unitPrice?: number | null;
  unitPriceCents?: number | null;
  notes?: string | null;
  brandName?: string | null;
};

type Analysis = {
  merchant?: string;
  city?: string;
  date?: string;
  detectedCurrency?: string;
  totalAmount?: number;
  suggestedCategory?: string;
  suggestedSubcategory?: string;
  lineItems?: AnalysisLineItem[];
};

type Overrides = Partial<CreateFinRequestInput>;

/** Map an analyze_receipt result (+ overrides) into a CreateFinRequest. */
function buildRecord(
  raw: Record<string, unknown>,
  overrides: Overrides,
): CreateFinRequestInput {
  const a = raw as Analysis;

  const currency = (overrides.originalCurrency ??
    a.detectedCurrency ??
    'CAD') as CreateFinRequestInput['originalCurrency'];

  const originalAmountCents =
    overrides.originalAmountCents ?? a.totalAmount ?? 0;

  const lineItems = (a.lineItems ?? []).map((item) => ({
    name: item.name ?? 'Item',
    originalAmountCents: item.amount ?? 0,
    qty: item.quantity ?? undefined,
    unit: item.unit ?? undefined,
    unitPriceCents: item.unitPriceCents ?? item.unitPrice ?? undefined,
    notes: item.notes ?? undefined,
    brandName: item.brandName ?? undefined,
  }));

  const record: CreateFinRequestInput = {
    type: overrides.type ?? 'expense',
    date: normalizeDate(overrides.date ?? a.date),
    merchant: overrides.merchant ?? a.merchant,
    comment: overrides.comment,
    place: overrides.place,
    city: overrides.city ?? a.city,
    category: overrides.category ?? a.suggestedCategory,
    subcategory: overrides.subcategory ?? a.suggestedSubcategory,
    details: overrides.details,
    originalCurrency: currency,
    originalAmountCents,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
  };

  // Drop undefined keys so the payload is clean.
  return JSON.parse(JSON.stringify(record)) as CreateFinRequestInput;
}

/**
 * new-finance requires ISO-8601 *with* a timezone. Gemini returns a naive
 * "YYYY-MM-DDTHH:mm:ss"; treat that as UTC by appending "Z". A bare date gets
 * a midday-UTC time so the app's weekday/meal-time category logic still works.
 */
function normalizeDate(date: string | undefined): string {
  if (!date) {
    return '';
  }
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(date)) {
    return date;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return `${date}T12:00:00Z`;
  }
  return `${date}Z`;
}

function fmtMoney(cents: number | undefined, currency: string): string {
  return `${((cents ?? 0) / 100).toFixed(2)} ${currency}`;
}

/** Human-readable (dollars) recap of the record for user approval. */
function summarize(record: CreateFinRequestInput): string {
  const cur = record.originalCurrency;
  const head = [
    record.merchant ?? 'Unknown merchant',
    record.date || '(no date)',
    fmtMoney(record.originalAmountCents, cur),
  ].join(' — ');
  const cat = record.category
    ? ` [${record.category}${record.subcategory ? '/' + record.subcategory : ''}]`
    : '';
  const lines = (record.lineItems ?? []).map((li) => {
    const qty = li.qty ? ` ×${li.qty}` : '';
    return `  • ${li.name}${qty} — ${fmtMoney(li.originalAmountCents, cur)}`;
  });
  return [head + cat, ...lines].join('\n');
}
