/**
 * Catálogo de simbologias, validação e utilitários de código de barras
 * (WP-07 / SPEC-06).
 *
 * Decisões:
 *  - **Mapeamento de simbologia → bcid (bwip-js):** as constantes do PRD são
 *    em maiúsculas (`CODE128`, `EAN13`, etc.); o `bwip-js` usa nomes em
 *    minúsculas (`code128`, `ean13`). Centralizamos a tradução aqui para que
 *    o resto do app fale apenas a forma do schema.
 *  - **Validação por regex + mínimo/máximo de dígitos** é suficiente para o
 *    MVP. Casos esquisitos (CODE128 com subsets, GS1 com FNC1) ficam para um
 *    polimento futuro — o PRD §5.4 só exige "validação em tempo real" sem
 *    listar nuances. A mensagem de erro é localizada em PT-BR (WP-17 fará a
 *    extração para i18n, mas hoje seguimos o padrão do app: strings inline).
 *  - **Dígito verificador:** EAN-13, EAN-8, UPC-A, UPC-E (mod-10 com padding)
 *    e ITF mod-10. RF-B-07. Quando o usuário digita só os N-1 primeiros
 *    dígitos, calculamos o último para o render — porém o **valor persistido
 *    permanece o do usuário**. Se ele já digitou todos, validamos o checksum.
 *  - **Binding (RF-B-08):** placeholders `{{ campo }}` no `value` são
 *    substituídos via `applyBinding({field → value})`. Fora do wizard de lote
 *    (WP-12/13), passamos um contexto vazio e o renderer mostra o literal —
 *    o que é útil pro usuário ver o "esqueleto" antes de imprimir.
 */

import type {
  Barcode1DSymbology,
  Barcode2DSymbology,
  BarcodeSymbology,
} from "@/lib/canvas/types";

/** Resultado de validação. `effectiveValue` é o valor pronto para o bwip-js. */
export interface BarcodeValidation {
  ok: boolean;
  /** Mensagem amigável quando `ok = false`. Em PT-BR (RF-B-05). */
  message?: string;
  /**
   * Valor final que será codificado — útil quando autocompletamos dígito
   * verificador. Sempre presente; quando `ok = false`, igual ao input.
   */
  effectiveValue: string;
}

export interface SymbologySpec {
  /** Identificador externo (schema PRD §4.3). */
  id: BarcodeSymbology;
  /** Nome amigável para a UI. */
  label: string;
  /** Grupo (1D ou 2D). */
  kind: "1D" | "2D";
  /** `bcid` do bwip-js. */
  bcid: string;
  /**
   * Validador específico. Retorna `{ ok, message, effectiveValue }`.
   * Quando `ok = true`, `effectiveValue` é o valor para passar ao bwip-js
   * (pode incluir o dígito verificador calculado).
   */
  validate: (raw: string) => BarcodeValidation;
  /** Pequena dica usada no painel de propriedades. */
  hint?: string;
}

export const DEFAULT_SYMBOLOGY: Barcode1DSymbology = "CODE128";
export const DEFAULT_QR_ERROR_CORRECTION: "L" | "M" | "Q" | "H" = "M";
/** Largura do módulo padrão (mm). ~2 dots a 203 dpi. */
export const DEFAULT_MODULE_WIDTH_MM = 0.33;

const ONLY_DIGITS = /^\d+$/;
const CODE39_CHARSET = /^[0-9A-Z\-. $/+%*]+$/;
const CODABAR_CHARSET = /^[A-D][0-9\-$:/.+]+[A-D]$/i;
/** CODE 11: dígitos 0-9 e hífen `-` (11 caracteres no alfabeto). O dígito
 *  verificador é calculado pelo bwip-js quando `includecheck=true` (default). */
const CODE11_CHARSET = /^[0-9\-]+$/;

/** Regex que reconhece placeholders `{{ campo }}` no valor. */
const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

/**
 * Substitui placeholders `{{ campo }}` pelo valor do contexto. Quando um
 * placeholder não tem correspondência, mantemos a string original (para o
 * usuário "ver" qual campo está faltando antes do lote). RF-B-08.
 */
export function applyBinding(
  raw: string,
  context: Record<string, string | number | null | undefined>,
): string {
  if (!raw) return raw;
  return raw.replace(PLACEHOLDER_RE, (full, key: string) => {
    const v = context[key];
    if (v === undefined || v === null) return full;
    return String(v);
  });
}

/** True se a string contém ao menos um placeholder. */
export function hasPlaceholder(raw: string): boolean {
  return PLACEHOLDER_RE.test(raw);
}

// ---------------------------------------------------------------------------
// Dígito verificador (RF-B-07)
// ---------------------------------------------------------------------------

/**
 * Dígito verificador EAN/UPC (algoritmo padrão GS1):
 * 1. Soma dígitos das posições ímpares × 1 + pares × 3 (contando da direita
 *    para a esquerda, mas equivalentemente: tamanho-1 - índice).
 * 2. Mod 10, então `(10 - mod) % 10`.
 *
 * O `digits` recebe SEM o dígito verificador (ex: 12 dígitos para EAN-13).
 */
export function computeEanCheckDigit(digits: string): number {
  let sum = 0;
  // Convenção GS1: o dígito mais à direita (antes do check) tem peso 3, o
  // próximo 1, e alterna. Equivalente a (length - i) % 2: 0 → peso 3, 1 → 1.
  for (let i = 0; i < digits.length; i += 1) {
    const d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return NaN;
    const weight = (digits.length - i) % 2 === 0 ? 1 : 3;
    sum += d * weight;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Dígito verificador ITF mod-10 (RF-B-07). Para ITF de tamanho par com check
 * digit (ITF-14 e variações). Mesmo algoritmo do EAN, com pesos invertidos
 * (3 e 1) — vamos reusar `computeEanCheckDigit`, que já cobre o padrão GS1
 * que ITF-14 também usa.
 */
export function computeItfCheckDigit(digits: string): number {
  return computeEanCheckDigit(digits);
}

// ---------------------------------------------------------------------------
// Validadores por simbologia
// ---------------------------------------------------------------------------

/**
 * Constrói um validador fixed-length para EAN/UPC:
 *  - `N` dígitos = valor completo; checa o check digit informado.
 *  - `N - 1` dígitos = calculamos o check digit e devolvemos como
 *    `effectiveValue`.
 *  - Caso contrário: erro.
 */
function makeEanLikeValidator(
  total: number,
  label: string,
): (raw: string) => BarcodeValidation {
  return (raw: string) => {
    const value = (raw ?? "").trim();
    if (value.length === 0) {
      return {
        ok: false,
        message: `${label} exige ${total - 1} ou ${total} dígitos numéricos.`,
        effectiveValue: value,
      };
    }
    if (!ONLY_DIGITS.test(value)) {
      return {
        ok: false,
        message: `${label} aceita apenas dígitos numéricos.`,
        effectiveValue: value,
      };
    }
    if (value.length === total - 1) {
      const check = computeEanCheckDigit(value);
      if (!Number.isFinite(check)) {
        return {
          ok: false,
          message: `${label}: erro ao calcular o dígito verificador.`,
          effectiveValue: value,
        };
      }
      return { ok: true, effectiveValue: `${value}${check}` };
    }
    if (value.length === total) {
      const body = value.slice(0, -1);
      const expected = computeEanCheckDigit(body);
      const informed = Number.parseInt(value.slice(-1), 10);
      if (expected !== informed) {
        return {
          ok: false,
          message: `${label}: dígito verificador esperado ${expected}, recebido ${informed}.`,
          effectiveValue: value,
        };
      }
      return { ok: true, effectiveValue: value };
    }
    return {
      ok: false,
      message: `${label} exige ${total - 1} ou ${total} dígitos numéricos (recebido ${value.length}).`,
      effectiveValue: value,
    };
  };
}

/**
 * UPC-E aceita 6, 7 ou 8 dígitos (RF-B-05):
 *  - 6 dígitos: forma compacta sem `number system` nem check (deixamos o
 *    bwip-js completar conforme padrão; aceitamos como válido).
 *  - 7 dígitos: 6 + number-system **OU** 6 + check; calculamos o restante.
 *  - 8 dígitos: completo.
 * Para o MVP, aceitamos 6-8 dígitos numéricos sem reescrever o algoritmo
 * de expansão (que envolve mapeamento UPC-A↔UPC-E não trivial).
 */
function validateUpcE(raw: string): BarcodeValidation {
  const value = (raw ?? "").trim();
  if (value.length === 0) {
    return {
      ok: false,
      message: "UPC-E exige 6 a 8 dígitos numéricos.",
      effectiveValue: value,
    };
  }
  if (!ONLY_DIGITS.test(value)) {
    return {
      ok: false,
      message: "UPC-E aceita apenas dígitos numéricos.",
      effectiveValue: value,
    };
  }
  if (value.length < 6 || value.length > 8) {
    return {
      ok: false,
      message: `UPC-E exige 6 a 8 dígitos numéricos (recebido ${value.length}).`,
      effectiveValue: value,
    };
  }
  return { ok: true, effectiveValue: value };
}

/**
 * ITF (Interleaved 2 of 5): comprimento par; sem check digit obrigatório
 * (RF-B-07 menciona `ITF mod-10` mas é opcional). Aceitamos:
 *  - Tamanho par sem check.
 *  - Tamanho ímpar: somamos dígito mod-10 e devolvemos como `effectiveValue`.
 */
function validateItf(raw: string): BarcodeValidation {
  const value = (raw ?? "").trim();
  if (value.length === 0) {
    return {
      ok: false,
      message: "ITF exige dígitos numéricos.",
      effectiveValue: value,
    };
  }
  if (!ONLY_DIGITS.test(value)) {
    return {
      ok: false,
      message: "ITF aceita apenas dígitos numéricos.",
      effectiveValue: value,
    };
  }
  if (value.length % 2 === 1) {
    // Completa com check digit mod-10 para chegar a tamanho par.
    const check = computeItfCheckDigit(value);
    if (!Number.isFinite(check)) {
      return {
        ok: false,
        message: "ITF: erro ao calcular o dígito verificador.",
        effectiveValue: value,
      };
    }
    return { ok: true, effectiveValue: `${value}${check}` };
  }
  return { ok: true, effectiveValue: value };
}

function validateCode128(raw: string): BarcodeValidation {
  const value = raw ?? "";
  if (value.length === 0) {
    return {
      ok: false,
      message: "CODE128 exige pelo menos 1 caractere.",
      effectiveValue: value,
    };
  }
  // CODE128 suporta ASCII 0-127. O bwip-js aceita strings; rejeitamos só
  // caracteres não-ASCII para alertar o usuário cedo.
  for (let i = 0; i < value.length; i += 1) {
    if (value.charCodeAt(i) > 127) {
      return {
        ok: false,
        message: "CODE128 aceita apenas caracteres ASCII (0-127).",
        effectiveValue: value,
      };
    }
  }
  return { ok: true, effectiveValue: value };
}

function validateCode39(raw: string): BarcodeValidation {
  const value = (raw ?? "").toUpperCase();
  if (value.length === 0) {
    return {
      ok: false,
      message: "CODE39 exige pelo menos 1 caractere.",
      effectiveValue: value,
    };
  }
  if (!CODE39_CHARSET.test(value)) {
    return {
      ok: false,
      message:
        "CODE39 aceita apenas: 0-9 A-Z e símbolos - . $ / + % espaço (case-insensitive).",
      effectiveValue: value,
    };
  }
  return { ok: true, effectiveValue: value };
}

function validateCode11(raw: string): BarcodeValidation {
  const value = (raw ?? "").trim();
  if (value.length === 0) {
    return {
      ok: false,
      message: "CODE 11 exige pelo menos 1 caractere.",
      effectiveValue: value,
    };
  }
  if (!CODE11_CHARSET.test(value)) {
    return {
      ok: false,
      message: "CODE 11 aceita apenas dígitos (0-9) e hífen (-).",
      effectiveValue: value,
    };
  }
  return { ok: true, effectiveValue: value };
}

function validateCodabar(raw: string): BarcodeValidation {
  const value = (raw ?? "").trim();
  if (value.length < 3) {
    return {
      ok: false,
      message: "Codabar exige caractere inicial e final A-D.",
      effectiveValue: value,
    };
  }
  if (!CODABAR_CHARSET.test(value)) {
    return {
      ok: false,
      message:
        "Codabar: começa/termina com A-D e contém dígitos ou - $ : / . +.",
      effectiveValue: value,
    };
  }
  return { ok: true, effectiveValue: value };
}

function validateQrcode(raw: string): BarcodeValidation {
  const value = raw ?? "";
  if (value.length === 0) {
    return {
      ok: false,
      message: "QR Code exige pelo menos 1 caractere.",
      effectiveValue: value,
    };
  }
  return { ok: true, effectiveValue: value };
}

function validateDataMatrix(raw: string): BarcodeValidation {
  const value = raw ?? "";
  if (value.length === 0) {
    return {
      ok: false,
      message: "Data Matrix exige pelo menos 1 caractere.",
      effectiveValue: value,
    };
  }
  return { ok: true, effectiveValue: value };
}

function validatePdf417(raw: string): BarcodeValidation {
  const value = raw ?? "";
  if (value.length === 0) {
    return {
      ok: false,
      message: "PDF417 exige pelo menos 1 caractere.",
      effectiveValue: value,
    };
  }
  return { ok: true, effectiveValue: value };
}

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

export const SYMBOLOGY_SPECS: Record<BarcodeSymbology, SymbologySpec> = {
  CODE128: {
    id: "CODE128",
    label: "CODE 128",
    kind: "1D",
    bcid: "code128",
    validate: validateCode128,
    hint: "ASCII genérico, comprimento variável.",
  },
  CODE39: {
    id: "CODE39",
    label: "CODE 39",
    kind: "1D",
    bcid: "code39",
    validate: validateCode39,
    hint: "0-9 A-Z e - . $ / + % espaço.",
  },
  CODE11: {
    id: "CODE11",
    label: "CODE 11",
    kind: "1D",
    bcid: "code11",
    validate: validateCode11,
    hint: "Dígitos 0-9 e hífen (-); check digit calculado automaticamente.",
  },
  EAN13: {
    id: "EAN13",
    label: "EAN-13",
    kind: "1D",
    bcid: "ean13",
    validate: makeEanLikeValidator(13, "EAN-13"),
    hint: "12 dígitos (calculamos o 13º) ou 13 com check digit.",
  },
  EAN8: {
    id: "EAN8",
    label: "EAN-8",
    kind: "1D",
    bcid: "ean8",
    validate: makeEanLikeValidator(8, "EAN-8"),
    hint: "7 dígitos (calculamos o 8º) ou 8 com check digit.",
  },
  UPCA: {
    id: "UPCA",
    label: "UPC-A",
    kind: "1D",
    bcid: "upca",
    validate: makeEanLikeValidator(12, "UPC-A"),
    hint: "11 dígitos (calculamos o 12º) ou 12 com check digit.",
  },
  UPCE: {
    id: "UPCE",
    label: "UPC-E",
    kind: "1D",
    bcid: "upce",
    validate: validateUpcE,
    hint: "6 a 8 dígitos numéricos.",
  },
  ITF: {
    id: "ITF",
    label: "ITF (2 of 5)",
    kind: "1D",
    bcid: "interleaved2of5",
    validate: validateItf,
    hint: "Dígitos numéricos; tamanho ímpar recebe check mod-10.",
  },
  CODABAR: {
    id: "CODABAR",
    label: "Codabar",
    kind: "1D",
    bcid: "rationalizedCodabar",
    validate: validateCodabar,
    hint: "Inicia/termina com A-D; conteúdo numérico + - $ : / . +.",
  },
  QRCODE: {
    id: "QRCODE",
    label: "QR Code",
    kind: "2D",
    bcid: "qrcode",
    validate: validateQrcode,
    hint: "Texto livre; níveis L/M/Q/H de correção.",
  },
  DATAMATRIX: {
    id: "DATAMATRIX",
    label: "Data Matrix",
    kind: "2D",
    bcid: "datamatrix",
    validate: validateDataMatrix,
    hint: "Texto livre; ECC 200 (default do bwip-js).",
  },
  PDF417: {
    id: "PDF417",
    label: "PDF417",
    kind: "2D",
    bcid: "pdf417",
    validate: validatePdf417,
    hint: "Texto livre; aspect ratio configurável (default).",
  },
};

/** Lista pronta para popular dropdowns. */
export const ALL_SYMBOLOGIES: readonly SymbologySpec[] = Object.values(
  SYMBOLOGY_SPECS,
);

export const SYMBOLOGIES_1D: readonly SymbologySpec[] = ALL_SYMBOLOGIES.filter(
  (s) => s.kind === "1D",
);

export const SYMBOLOGIES_2D: readonly SymbologySpec[] = ALL_SYMBOLOGIES.filter(
  (s) => s.kind === "2D",
);

/** Validação por simbologia (RF-B-05). */
export function validateBarcode(
  symbology: BarcodeSymbology,
  rawValue: string,
): BarcodeValidation {
  const spec = SYMBOLOGY_SPECS[symbology];
  if (!spec) {
    return {
      ok: false,
      message: `Simbologia desconhecida: ${symbology}.`,
      effectiveValue: rawValue,
    };
  }
  // Quando há placeholder não resolvido, não validamos o conteúdo — só
  // garantimos que existe algo. Render real (em tempo de impressão) revalida
  // com o valor substituído.
  if (hasPlaceholder(rawValue)) {
    return {
      ok: true,
      effectiveValue: rawValue,
    };
  }
  return spec.validate(rawValue);
}

/**
 * Devolve o `bcid` do bwip-js correspondente à simbologia. Útil para o
 * renderer e o gerador de PDF (WP-08).
 */
export function bcidFor(symbology: BarcodeSymbology): string {
  return SYMBOLOGY_SPECS[symbology]?.bcid ?? "code128";
}

/**
 * Identifica se uma simbologia é 2D. QR Code persiste como `type: "qrcode"`
 * no schema legado; demais 2D usam `type: "barcode"` com `symbology` 2D.
 */
export function is2DSymbology(symbology: BarcodeSymbology): boolean {
  return SYMBOLOGY_SPECS[symbology]?.kind === "2D";
}

/** Forma de "preview" para badge da UI quando a fonte de dados ainda não foi resolvida. */
export function effectivePreviewValue(raw: string): string {
  // Substitui placeholders por um marcador visível, útil quando o usuário
  // está no editor sem dados de planilha ainda. Mantém o tamanho aproximado.
  return raw.replace(PLACEHOLDER_RE, "_______");
}

/** Lista simbologias 2D (para uso fora deste módulo). */
export const SYMBOLOGY_2D_IDS: readonly Barcode2DSymbology[] = [
  "QRCODE",
  "DATAMATRIX",
  "PDF417",
];
