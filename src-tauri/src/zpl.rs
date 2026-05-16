//! Tradutor `canvas_json` → ZPL (Zebra) — WP-11 / SPEC-10.
//!
//! Gera código ZPL II / Link-OS a partir de um `canvas_json` aderente ao
//! schema definido em [SPEC-04]. A saída é uma string ASCII pronta para envio
//! raw via spooler do SO (Windows `RawPrintJob` / macOS `lp -o raw`),
//! compartilhando o mesmo transporte do gerador PPLB
//! ([`crate::printers::printers_print_raw`]).
//!
//! ## Mapeamento `canvas_json` → ZPL
//!
//! | Objeto         | Comando ZPL                                     | Observações |
//! |----------------|-------------------------------------------------|-------------|
//! | `text`         | `^FO x,y ^A0<rot>,h,w ^FD<data>^FS`              | Fonte interna `A0` (escalável); fontes custom caem em raster futuro |
//! | `rectangle` (fill) | `^FO x,y ^GB w,h,h,B^FS`                     | Espessura igual à altura ⇒ retângulo sólido preto |
//! | `rectangle` (stroke) | `^FO x,y ^GB w,h,t,B^FS`                   | `t` = thickness em dots |
//! | `line`         | `^FO x,y ^GB w,h,thickness,B^FS`                 | Linha = retângulo achatado |
//! | `ellipse`      | `^FO x,y ^GC d,t,B^FS` (apenas círculos)         | Circle quando width==height; senão placeholder raster |
//! | `image`        | `; comentário`                                   | `^GF` raster fica para [WP-17] |
//! | `barcode` (1D) | `^FO x,y ^B<cmd><rot>,h,...^FD<data>^FS`         | CODE128/39/EAN/UPC/ITF/CODABAR nativos |
//! | `barcode` QR   | `^FO x,y ^BQ<rot>,2,<scale>,<ecl>^FD<ecl>A,<d>^FS` | Padrão Zebra ZPL II |
//! | `barcode` DM   | `^FO x,y ^BX<rot>,<size>,200^FD<data>^FS`        | Data Matrix nativa Zebra |
//! | `barcode` PDF417 | `^FO x,y ^B7<rot>,<h>,<sec>,,,N^FD<data>^FS`   | PDF417 nativa Zebra |
//! | `qrcode`       | (idem QR)                                        | Round-trip de templates antigos |
//!
//! ## Sistema de coordenadas
//!
//! - `canvas_json` usa mm a partir do canto superior esquerdo.
//! - ZPL usa dots a partir do canto superior esquerdo (a 203 dpi = 8 dots/mm;
//!   a 300 dpi ≈ 11,81 dots/mm).
//! - Conversão: `mm * (dpi / 25.4)`. O DPI vem do próprio canvas — para Zebra
//!   ZD220 a 203 dpi `1 mm ≈ 8 dots`, para ZD420 a 300 dpi `1 mm ≈ 11,81 dots`.
//!
//! ## Rotação
//!
//! ZPL aceita 4 rotações por letra:
//! - `N` = 0° (normal)
//! - `R` = 90° (rotated)
//! - `I` = 180° (inverted)
//! - `B` = 270° (bottom-up)
//!
//! Rotações arbitrárias caem no quadrante mais próximo. Pipeline raster
//! (`^GF`) cobrirá ângulos livres no WP-17.
//!
//! ## Quoting / escape
//!
//! ZPL não usa aspas — o conteúdo de `^FD` segue até o `^FS` (Field Separator).
//! Para evitar quebra de parser:
//! - `^` no payload é substituído por `_` (não há escape oficial; alternativa
//!   robusta seria `^FH^_HH` hex encoding — fica para WP-17 quando o raster
//!   também ganhar UTF-8 nativo).
//! - `~` (tilde) idem (caractere de comando alternativo).
//! - Não-ASCII é substituído por `?` (codificação CP850/UTF-8 depende do
//!   modelo; ZPL pode usar `^CI28` para UTF-8 mas firmwares antigos ignoram).
//!   Acentos pesados ficam para o pipeline raster.
//!
//! ## Caminho de envio
//!
//! O envio raw é feito por [`crate::printers::printers_print_raw`] — usa
//! `Printer::print` da crate `printers` 2.x que internamente despacha via
//! `RawPrintJob` (Windows Win32 Spooler) ou `lp -o raw -d <printer>`
//! (macOS/Linux CUPS). Mesmo caminho do PPLB ([WP-10]) — atende RF-I-04 e
//! SPEC-10 §"Comportamento esperado" item 6.
//!
//! ## Cópias
//!
//! ZPL embarca a quantidade de cópias via `^PQ<n>` no rodapé. Igual ao PPLB
//! (`P<n>`), o envio raw **não** replica o buffer: o firmware da Zebra cuida
//! da reimpressão. Veja [`crate::printers::printers_print_raw`] (`copies`
//! validado mas não replicado para payloads raw).

use serde::Deserialize;
use thiserror::Error;

/// Conversão mm → dots respeitando o DPI do template. Zebra ZD220 opera a
/// 203 dpi (8 dots/mm); ZD420 e modelos industriais opcionalmente a 300 dpi.
/// `25.4` mm/in.
#[inline]
pub fn mm_to_dots(mm: f64, dpi: f64) -> i32 {
    (mm * dpi / 25.4).round() as i32
}

/// Erros do gerador. Convertidos para `String` ao cruzar a fronteira Tauri.
#[derive(Debug, Error)]
pub enum ZplError {
    #[error("canvas_json inválido: {0}")]
    InvalidCanvasJson(String),
    #[error("quantidade de cópias inválida ({0}) — esperado 1..=9999")]
    InvalidCopies(u32),
}

impl serde::Serialize for ZplError {
    fn serialize<S: serde::Serializer>(&self, ser: S) -> Result<S::Ok, S::Error> {
        ser.serialize_str(&self.to_string())
    }
}

// --- Schema do canvas_json (espelho parcial de `src/lib/canvas/types.ts`) ---

#[derive(Debug, Deserialize)]
struct CanvasJson {
    canvas: CanvasDef,
    #[serde(default)]
    objects: Vec<CanvasObject>,
}

#[derive(Debug, Deserialize)]
struct CanvasDef {
    width: f64,
    height: f64,
    #[serde(default = "default_dpi")]
    dpi: f64,
}

fn default_dpi() -> f64 {
    // Zebra ZD220 (modelo de referência do PRD §12.4) é 203 dpi.
    203.0
}

#[derive(Debug, Deserialize)]
struct BaseFields {
    #[serde(default)]
    x: f64,
    #[serde(default)]
    y: f64,
    #[serde(default)]
    width: Option<f64>,
    #[serde(default)]
    height: Option<f64>,
    #[serde(default)]
    rotation: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum CanvasObject {
    #[serde(rename = "text")]
    Text(TextObj),
    #[serde(rename = "rectangle")]
    Rectangle(RectObj),
    #[serde(rename = "line")]
    Line(LineObj),
    #[serde(rename = "ellipse")]
    Ellipse(EllipseObj),
    #[serde(rename = "image")]
    Image(ImageObj),
    #[serde(rename = "barcode")]
    Barcode(BarcodeObj),
    #[serde(rename = "qrcode")]
    Qrcode(QrcodeObj),
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Deserialize)]
struct TextObj {
    #[serde(flatten)]
    base: BaseFields,
    #[serde(default)]
    content: Option<String>,
    #[serde(default, rename = "fontFamily")]
    font_family: Option<String>,
    #[serde(default, rename = "fontSize")]
    font_size: Option<f64>,
    #[serde(default, rename = "fontWeight")]
    font_weight: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RectObj {
    #[serde(flatten)]
    base: BaseFields,
    #[serde(default)]
    fill: Option<String>,
    #[serde(default)]
    stroke: Option<String>,
    #[serde(default, rename = "strokeWidth")]
    stroke_width: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct LineObj {
    #[serde(flatten)]
    base: BaseFields,
    #[serde(default, rename = "strokeWidth")]
    stroke_width: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct EllipseObj {
    #[serde(flatten)]
    base: BaseFields,
    #[serde(default)]
    fill: Option<String>,
    #[serde(default)]
    stroke: Option<String>,
    #[serde(default, rename = "strokeWidth")]
    stroke_width: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct ImageObj {
    #[serde(flatten)]
    base: BaseFields,
    #[serde(default)]
    src: Option<String>,
}

#[derive(Debug, Deserialize)]
struct BarcodeObj {
    #[serde(flatten)]
    base: BaseFields,
    #[serde(default)]
    symbology: Option<String>,
    #[serde(default)]
    value: Option<String>,
    #[serde(default, rename = "showText")]
    show_text: Option<bool>,
    #[serde(default, rename = "moduleWidth")]
    module_width: Option<f64>,
    #[serde(default, rename = "errorCorrection")]
    error_correction: Option<String>,
}

#[derive(Debug, Deserialize)]
struct QrcodeObj {
    #[serde(flatten)]
    base: BaseFields,
    #[serde(default)]
    value: Option<String>,
    #[serde(default, rename = "errorCorrection")]
    error_correction: Option<String>,
}

/// Mapeamento `rotation` (graus) → letra de rotação ZPL.
/// ZPL aceita apenas múltiplos de 90; arredondamos para o mais próximo.
/// `N`=0° (normal), `R`=90° (rotated), `I`=180° (inverted), `B`=270° (bottom).
fn zpl_rotation_letter(deg: f64) -> char {
    // Normaliza para [0, 360).
    let mut d = deg % 360.0;
    if d < 0.0 {
        d += 360.0;
    }
    let snapped = ((d + 45.0) / 90.0).floor() as i32 % 4;
    match snapped {
        0 => 'N',
        1 => 'R',
        2 => 'I',
        3 => 'B',
        // Impossível por `% 4`, mas mantém o compilador feliz sem panic.
        _ => 'N',
    }
}

/// Sanitiza o texto para uso dentro de `^FD ... ^FS`.
///
/// - `^` (caret) e `~` (tilde) são os caracteres de controle do parser ZPL —
///   substituídos por `_` para não quebrar o stream. (Alternativa robusta:
///   `^FH^_` + hex; mais complexo, fica para WP-17 quando o raster também
///   carregar UTF-8 nativo via `^CI28`.)
/// - `\` é mantido (ZPL não escapa nada via `\`).
/// - Caracteres não-ASCII são substituídos por `?` no MVP. Embora `^CI28`
///   habilite UTF-8 em firmwares modernos, o PRD §12.4 fala apenas em
///   "qualquer Link-OS" — ser conservador evita corrupção em ZD220 antigas.
fn escape_zpl(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for c in input.chars() {
        match c {
            '^' | '~' => out.push('_'),
            c if (c as u32) < 0x80 => out.push(c),
            _ => out.push('?'),
        }
    }
    out
}

/// Devolve a altura recomendada em dots para a fonte interna `^A0` da Zebra,
/// dado um `fontSize` em pt e o DPI do template.
///
/// ZPL ZD220 com `^A0` aceita altura mínima de 10 dots; a fonte é escalável,
/// então mapeamos `pt → dots` com a fórmula `pt * dpi / 72` (1 pt = 1/72 in).
/// Clamp 10..2000 dots por segurança.
fn font_height_dots(font_size_pt: f64, dpi: f64) -> u32 {
    let dots = (font_size_pt * dpi / 72.0).round();
    dots.clamp(10.0, 2000.0) as u32
}

/// Mapeia simbologia 1D → comando ZPL correspondente (`^B<letra>`).
///
/// Referência: ZPL II Programming Guide §F.
fn map_zpl_1d_cmd(sym: &str) -> Option<&'static str> {
    match sym.to_ascii_uppercase().as_str() {
        "CODE128" => Some("BC"),
        "CODE39" => Some("B3"),
        "EAN13" => Some("BE"),
        "EAN8" => Some("B8"),
        "UPCA" => Some("BU"),
        "UPCE" => Some("B9"),
        "ITF" => Some("BI"),     // Interleaved 2 of 5
        "CODABAR" => Some("BK"), // Codabar
        _ => None,
    }
}

/// Nível de correção QR → letra ZPL (`L`/`M`/`Q`/`H`). Default `M`.
fn qr_eclevel(input: Option<&str>) -> char {
    match input {
        Some("L") => 'L',
        Some("Q") => 'Q',
        Some("H") => 'H',
        _ => 'M',
    }
}

/// Magnificação QR: o `^BQ` da Zebra aceita `scale` 1..10. Usamos a mesma
/// heurística do PPLB: `scale = round(moduleWidth_mm * dpi / 25.4)`, clampado
/// em 1..10. Default mantém compatibilidade com o catálogo (`moduleWidth`
/// default ≈ 0.33 mm a 203 dpi ⇒ scale 3).
fn qr_scale(module_width_mm: Option<f64>, dpi: f64) -> u8 {
    let mm = module_width_mm.unwrap_or(0.33);
    let dots = (mm * dpi / 25.4).round();
    dots.clamp(1.0, 10.0) as u8
}

/// Resultado da geração: o código ZPL pronto para envio raw.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ZplProgram {
    pub code: String,
}

impl ZplProgram {
    pub fn into_bytes(self) -> Vec<u8> {
        self.code.into_bytes()
    }
}

/// Gera o programa ZPL a partir de uma string `canvas_json` e do número de
/// cópias (1..=9999). O DPI é lido do próprio canvas (campo `dpi`) — para
/// Zebra ZD220 é 203, ZD420 pode ser 300.
pub fn generate_zpl(canvas_json: &str, copies: u32) -> Result<ZplProgram, ZplError> {
    if !(1..=9999).contains(&copies) {
        return Err(ZplError::InvalidCopies(copies));
    }
    let parsed: CanvasJson = serde_json::from_str(canvas_json)
        .map_err(|e| ZplError::InvalidCanvasJson(e.to_string()))?;

    let dpi = parsed.canvas.dpi;
    let width_dots = mm_to_dots(parsed.canvas.width, dpi);
    let height_dots = mm_to_dots(parsed.canvas.height, dpi);

    // ZPL usa LF como separador entre comandos (alguns firmwares aceitam CRLF;
    // o padrão Zebra Link-OS Programming Guide §1.3 usa LF puro).
    let mut out = String::with_capacity(256);
    // ^XA = Start Format. Sempre o primeiro token de um stream ZPL.
    out.push_str("^XA\n");
    // ^CI28 = code page UTF-8 (firmware moderno; em legacy é ignorado).
    out.push_str("^CI28\n");
    // ^LH0,0 = label home no canto superior esquerdo (origem coerente com mm
    // do canvas_json).
    out.push_str("^LH0,0\n");
    // Largura de impressão e comprimento da etiqueta em dots.
    out.push_str(&format!("^PW{}\n", width_dots));
    out.push_str(&format!("^LL{}\n", height_dots));

    for obj in &parsed.objects {
        match obj {
            CanvasObject::Text(t) => emit_text(&mut out, t, dpi),
            CanvasObject::Rectangle(r) => emit_rect(&mut out, r, dpi),
            CanvasObject::Line(l) => emit_line(&mut out, l, dpi),
            CanvasObject::Ellipse(e) => emit_ellipse(&mut out, e, dpi),
            CanvasObject::Image(i) => emit_image_placeholder(&mut out, i, dpi),
            CanvasObject::Barcode(b) => emit_barcode(&mut out, b, dpi),
            CanvasObject::Qrcode(q) => emit_qrcode(&mut out, q, dpi),
            CanvasObject::Unknown => {
                // Tipo desconhecido — preserva contrato de tolerância
                // (paridade com PPLB / WP-10).
            }
        }
    }

    // ^PQ<n> = quantidade de cópias. ^XZ = End Format.
    out.push_str(&format!("^PQ{}\n", copies));
    out.push_str("^XZ\n");
    Ok(ZplProgram { code: out })
}

fn emit_text(out: &mut String, obj: &TextObj, dpi: f64) {
    let content = obj.content.clone().unwrap_or_default();
    if content.is_empty() {
        return;
    }
    let x = mm_to_dots(obj.base.x, dpi);
    let y = mm_to_dots(obj.base.y, dpi);
    let rot = zpl_rotation_letter(obj.base.rotation.unwrap_or(0.0));
    let font_size = obj.font_size.unwrap_or(12.0);
    let bold = obj.font_weight.as_deref() == Some("bold");
    let h = font_height_dots(font_size, dpi);
    // Largura proporcional (heurística aproximada). Bold ⇒ aumenta levemente
    // para destacar; pipeline raster (WP-17) cobrirá a tipografia real.
    let w = if bold {
        ((h as f64) * 0.7).round() as u32
    } else {
        ((h as f64) * 0.6).round() as u32
    };
    // Família custom: documentado que cai para `A0` (fonte escalável padrão).
    // Pipeline raster real fica para WP-17 — paridade com PPLB.
    let _ = obj.font_family.as_deref();
    let escaped = escape_zpl(&content);
    // Forma canônica do PRD §7.2:
    //   ^FOx,y^A0N,h,w^FD<data>^FS
    out.push_str(&format!(
        "^FO{},{}^A0{},{},{}^FD{}^FS\n",
        x, y, rot, h, w, escaped
    ));
}

fn emit_rect(out: &mut String, obj: &RectObj, dpi: f64) {
    let w = obj.base.width.unwrap_or(0.0);
    let h = obj.base.height.unwrap_or(0.0);
    if w <= 0.0 || h <= 0.0 {
        return;
    }
    let x = mm_to_dots(obj.base.x, dpi);
    let y = mm_to_dots(obj.base.y, dpi);
    let w_d = mm_to_dots(w, dpi);
    let h_d = mm_to_dots(h, dpi);

    let has_fill = obj
        .fill
        .as_deref()
        .map(|f| !is_transparent(f))
        .unwrap_or(false);
    let has_stroke = obj
        .stroke
        .as_deref()
        .map(|s| !is_transparent(s))
        .unwrap_or(false);

    if has_fill {
        // Caixa sólida: thickness igual à menor dimensão garante preenchimento
        // total (ZPL ^GB com t = min(w,h) = retângulo cheio). Cor `B` (black).
        let t = w_d.min(h_d).max(1);
        out.push_str(&format!(
            "^FO{},{}^GB{},{},{},B,0^FS\n",
            x, y, w_d, h_d, t
        ));
    } else if has_stroke {
        let thickness_mm = obj.stroke_width.unwrap_or(0.3);
        let t = mm_to_dots(thickness_mm, dpi).max(1);
        out.push_str(&format!(
            "^FO{},{}^GB{},{},{},B,0^FS\n",
            x, y, w_d, h_d, t
        ));
    }
}

fn emit_line(out: &mut String, obj: &LineObj, dpi: f64) {
    let w = obj.base.width.unwrap_or(0.0);
    if w <= 0.0 {
        return;
    }
    let thickness_mm = obj.stroke_width.unwrap_or(0.4);
    let h = obj
        .base
        .height
        .filter(|h| *h > 0.0)
        .unwrap_or(thickness_mm);
    let x = mm_to_dots(obj.base.x, dpi);
    let y = mm_to_dots(obj.base.y, dpi);
    let w_d = mm_to_dots(w, dpi);
    let h_d = mm_to_dots(h, dpi).max(1);
    let t = w_d.min(h_d).max(1);
    // Linha = retângulo achatado, mesma forma do PPLB `LO`. ZPL não tem
    // primitiva de linha em ângulo (raster fica para WP-17).
    out.push_str(&format!(
        "^FO{},{}^GB{},{},{},B,0^FS\n",
        x, y, w_d, h_d, t
    ));
}

/// Ellipse: ZPL tem `^GC` (Circle) e `^GE` (Ellipse). Quando width≈height
/// usamos `^GC`; senão usamos `^GE` quando disponível, com fallback para
/// `^GE` na maioria dos firmwares modernos.
fn emit_ellipse(out: &mut String, obj: &EllipseObj, dpi: f64) {
    let w = obj.base.width.unwrap_or(0.0);
    let h = obj.base.height.unwrap_or(0.0);
    if w <= 0.0 || h <= 0.0 {
        return;
    }
    let x = mm_to_dots(obj.base.x, dpi);
    let y = mm_to_dots(obj.base.y, dpi);
    let w_d = mm_to_dots(w, dpi);
    let h_d = mm_to_dots(h, dpi);

    let has_fill = obj
        .fill
        .as_deref()
        .map(|f| !is_transparent(f))
        .unwrap_or(false);
    let thickness_mm = obj.stroke_width.unwrap_or(0.3);
    let stroke_dots = mm_to_dots(thickness_mm, dpi).max(1);
    // Preenchimento sólido = thickness igual ao raio menor.
    let t = if has_fill { w_d.min(h_d).max(1) } else { stroke_dots };

    if (w_d - h_d).abs() <= 1 {
        // Círculo: ^GC<diameter>,<thickness>,<color>^FS
        out.push_str(&format!("^FO{},{}^GC{},{},B^FS\n", x, y, w_d, t));
    } else {
        // Elipse: ^GE<width>,<height>,<thickness>,<color>^FS
        out.push_str(&format!(
            "^FO{},{}^GE{},{},{},B^FS\n",
            x, y, w_d, h_d, t
        ));
    }
}

/// Image: sem pipeline raster ainda. Marcador comentário (ZPL trata `~`/`^`
/// como comandos; usamos um comentário ZPL `^FX ... ^FS` que é a forma
/// oficial de comentário no Programming Guide §C).
fn emit_image_placeholder(out: &mut String, obj: &ImageObj, dpi: f64) {
    if obj.src.as_deref().map(|s| s.is_empty()).unwrap_or(true) {
        return;
    }
    let x = mm_to_dots(obj.base.x, dpi);
    let y = mm_to_dots(obj.base.y, dpi);
    out.push_str(&format!(
        "^FX image @ {},{} (raster fallback pendente)^FS\n",
        x, y
    ));
}

fn emit_barcode(out: &mut String, obj: &BarcodeObj, dpi: f64) {
    let value = obj.value.clone().unwrap_or_default();
    if value.is_empty() {
        return;
    }
    let symbology = obj
        .symbology
        .clone()
        .unwrap_or_else(|| "CODE128".to_string());

    // QR Code (catálogo unificado WP-07).
    if symbology.eq_ignore_ascii_case("QRCODE") {
        emit_qrcode_inner(
            out,
            obj.base.x,
            obj.base.y,
            obj.base.rotation.unwrap_or(0.0),
            &value,
            obj.error_correction.as_deref(),
            obj.module_width,
            dpi,
        );
        return;
    }

    let x = mm_to_dots(obj.base.x, dpi);
    let y = mm_to_dots(obj.base.y, dpi);
    let rot = zpl_rotation_letter(obj.base.rotation.unwrap_or(0.0));

    // Data Matrix: `^BX<rot>,<height_dots_per_module>,<quality>`. Quality 200
    // é o padrão ECC para a maioria das aplicações.
    if symbology.eq_ignore_ascii_case("DATAMATRIX") {
        let module = obj
            .module_width
            .map(|mm| mm_to_dots(mm, dpi).max(2) as u32)
            .unwrap_or(6);
        let escaped = escape_zpl(&value);
        out.push_str(&format!(
            "^FO{},{}^BX{},{},200^FD{}^FS\n",
            x, y, rot, module, escaped
        ));
        return;
    }

    // PDF417: `^B7<rot>,<row_height>,<security>,<cols>,<rows>,<truncate>`.
    // Mapeamos error_correction L/M/Q/H → security 1..8 (ZPL §B7).
    if symbology.eq_ignore_ascii_case("PDF417") {
        let row_height = obj
            .module_width
            .map(|mm| mm_to_dots(mm, dpi).max(2) as u32)
            .unwrap_or(8);
        let security = match obj.error_correction.as_deref() {
            Some("L") => 1,
            Some("Q") => 5,
            Some("H") => 8,
            _ => 3, // default razoável (entre M e Q)
        };
        let escaped = escape_zpl(&value);
        out.push_str(&format!(
            "^FO{},{}^B7{},{},{},,,N^FD{}^FS\n",
            x, y, rot, row_height, security, escaped
        ));
        return;
    }

    let Some(cmd) = map_zpl_1d_cmd(&symbology) else {
        // Simbologia desconhecida — pula sem quebrar.
        return;
    };

    // Altura em dots: padrão 50, ou usa `height` do objeto quando definido.
    let height_dots = obj
        .base
        .height
        .filter(|h| *h > 0.0)
        .map(|mm| mm_to_dots(mm, dpi).max(10) as u32)
        .unwrap_or(50);
    let hrt = if obj.show_text.unwrap_or(true) { 'Y' } else { 'N' };
    let escaped = escape_zpl(&value);

    // Largura do módulo (`^BY`): padrão 2 dots (~0.25 mm a 203 dpi).
    let narrow = obj
        .module_width
        .map(|mm| mm_to_dots(mm, dpi).max(1) as u32)
        .unwrap_or(2);
    out.push_str(&format!("^BY{}\n", narrow));

    // A forma canônica de cada comando varia ligeiramente entre simbologias:
    // - CODE128: ^BC<rot>,<height>,<print_interp>,<above>,<check>
    // - CODE39:  ^B3<rot>,<check>,<height>,<print_interp>,<above>
    // - EAN-13:  ^BE<rot>,<height>,<print_interp>,<above>
    // - EAN-8:   ^B8<rot>,<height>,<print_interp>,<above>
    // - UPC-A:   ^BU<rot>,<height>,<print_interp>,<above>,<check>
    // - UPC-E:   ^B9<rot>,<height>,<print_interp>,<above>,<check>
    // - ITF:     ^BI<rot>,<height>,<print_interp>,<above>,<check>
    // - Codabar: ^BK<rot>,<check>,<height>,<print_interp>,<above>
    // Manter três posicionais cobre o caso comum sem `above`/`check` (que
    // assumem default N e N — coerente com firmware Link-OS).
    let above = 'N';
    let cmd_string = match cmd {
        "B3" | "BK" => format!(
            "^{}{},N,{},{},{}",
            cmd, rot, height_dots, hrt, above
        ),
        _ => format!("^{}{},{},{},{}", cmd, rot, height_dots, hrt, above),
    };
    out.push_str(&format!(
        "^FO{},{}{}^FD{}^FS\n",
        x, y, cmd_string, escaped
    ));
}

fn emit_qrcode(out: &mut String, obj: &QrcodeObj, dpi: f64) {
    let value = obj.value.clone().unwrap_or_default();
    if value.is_empty() {
        return;
    }
    emit_qrcode_inner(
        out,
        obj.base.x,
        obj.base.y,
        obj.base.rotation.unwrap_or(0.0),
        &value,
        obj.error_correction.as_deref(),
        None,
        dpi,
    );
}

fn emit_qrcode_inner(
    out: &mut String,
    x_mm: f64,
    y_mm: f64,
    rotation_deg: f64,
    value: &str,
    error_correction: Option<&str>,
    module_width: Option<f64>,
    dpi: f64,
) {
    let x = mm_to_dots(x_mm, dpi);
    let y = mm_to_dots(y_mm, dpi);
    let rot = zpl_rotation_letter(rotation_deg);
    let ecl = qr_eclevel(error_correction);
    let scale = qr_scale(module_width, dpi);
    let escaped = escape_zpl(value);
    // Forma canônica ZPL II (Programming Guide §BQ):
    //   ^FOx,y^BQ<rot>,2,<scale>,<ecl>,7^FD<ecl>A,<data>^FS
    // O `2` é o modelo (Model 2, padrão moderno). `^FD<ecl>A,<data>` é a forma
    // recomendada pela Zebra: ecl repetido + flag "A" (auto) + payload.
    out.push_str(&format!(
        "^FO{},{}^BQ{},2,{},{},7^FD{}A,{}^FS\n",
        x, y, rot, scale, ecl, ecl, escaped
    ));
}

fn is_transparent(input: &str) -> bool {
    let t = input.trim();
    t.is_empty() || t.eq_ignore_ascii_case("transparent") || t.eq_ignore_ascii_case("none")
}

/// Comando Tauri: gera o código ZPL a partir do `canvas_json`. Devolve a
/// string ZPL ASCII — o frontend pode exibir/salvar para diagnóstico ou
/// passar adiante para envio raw.
#[tauri::command]
pub fn zpl_generate(canvas_json: String, copies: u32) -> Result<String, ZplError> {
    let prog = generate_zpl(&canvas_json, copies)?;
    Ok(prog.code)
}

// --- Testes unitários ---

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper: monta um `canvas_json` mínimo para os testes.
    fn build_canvas(width_mm: f64, height_mm: f64, dpi: f64, objects: &str) -> String {
        format!(
            r#"{{"version":1,"units":"mm","canvas":{{"width":{},"height":{},"dpi":{}}},"objects":[{}]}}"#,
            width_mm, height_mm, dpi, objects
        )
    }

    #[test]
    fn mm_to_dots_at_203_dpi() {
        // 50 mm × 8 dots/mm = 400 dots (mesmo exemplo do PRD §7.2 ZPL).
        assert_eq!(mm_to_dots(50.0, 203.0), 400);
        assert_eq!(mm_to_dots(30.0, 203.0), 240);
    }

    #[test]
    fn mm_to_dots_at_300_dpi_zebra_industrial() {
        // 50 mm a 300 dpi = 50 * 300 / 25.4 ≈ 590.55 → 591.
        assert_eq!(mm_to_dots(50.0, 300.0), 591);
    }

    #[test]
    fn rotation_letter_snaps_to_quadrants() {
        assert_eq!(zpl_rotation_letter(0.0), 'N');
        assert_eq!(zpl_rotation_letter(90.0), 'R');
        assert_eq!(zpl_rotation_letter(180.0), 'I');
        assert_eq!(zpl_rotation_letter(270.0), 'B');
        // Negativos normalizam.
        assert_eq!(zpl_rotation_letter(-90.0), 'B');
        // Múltiplos de 360 voltam a N.
        assert_eq!(zpl_rotation_letter(360.0), 'N');
        // Snap por proximidade.
        assert_eq!(zpl_rotation_letter(44.0), 'N');
        assert_eq!(zpl_rotation_letter(46.0), 'R');
    }

    #[test]
    fn escape_zpl_replaces_caret_and_tilde() {
        // `^` e `~` são caracteres de comando do parser ZPL — devem ser
        // sanitizados antes de entrar no `^FD`.
        assert_eq!(escape_zpl("texto ^XA grande"), "texto _XA grande");
        assert_eq!(escape_zpl("preço ~JS"), "pre?o _JS");
    }

    #[test]
    fn escape_zpl_replaces_non_ascii_with_question_mark() {
        // Acentos pesados são corrompidos em firmware Zebra antigo sem `^CI28`
        // habilitado — MVP troca por `?` graceful e documenta o pipeline raster
        // (WP-17). Paridade com PPLB.
        assert_eq!(escape_zpl("Camões"), "Cam?es");
    }

    #[test]
    fn envelope_matches_prd_example_50x30mm_203dpi() {
        // PRD §7.2: ^XA / ^PW400 / ^LL240 / ... / ^XZ.
        let json = build_canvas(50.0, 30.0, 203.0, "");
        let prog = generate_zpl(&json, 1).unwrap();
        assert!(prog.code.starts_with("^XA\n"), "deve começar com ^XA, recebido:\n{}", prog.code);
        assert!(prog.code.contains("^PW400\n"), "esperado ^PW400, recebido:\n{}", prog.code);
        assert!(prog.code.contains("^LL240\n"), "esperado ^LL240, recebido:\n{}", prog.code);
        assert!(prog.code.contains("^PQ1\n"), "esperado ^PQ1, recebido:\n{}", prog.code);
        assert!(prog.code.trim_end().ends_with("^XZ"), "deve terminar com ^XZ");
    }

    #[test]
    fn envelope_includes_ci28_and_label_home() {
        let json = build_canvas(50.0, 30.0, 203.0, "");
        let prog = generate_zpl(&json, 1).unwrap();
        // ^CI28 habilita UTF-8 em firmwares modernos.
        assert!(prog.code.contains("^CI28\n"));
        // ^LH0,0 alinha origem com o canvas_json.
        assert!(prog.code.contains("^LH0,0\n"));
    }

    #[test]
    fn text_object_emits_a0_command_with_correct_position() {
        // PRD §7.2: x=20, y=10, fontSize 24 pt → A0N,68,40 a 203 dpi
        // (24 * 203 / 72 ≈ 67.67 → 68; bold off, width = 60% = 41).
        let obj = r#"{"type":"text","id":"t1","x":2.5,"y":1.25,"content":"Camiseta Polo","fontSize":24}"#;
        let json = build_canvas(50.0, 30.0, 203.0, obj);
        let prog = generate_zpl(&json, 1).unwrap();
        // Posição: 2.5 mm * 8 = 20 dots; 1.25 mm * 8 = 10 dots.
        assert!(
            prog.code.contains("^FO20,10"),
            "posição ^FO20,10 esperada, recebido:\n{}",
            prog.code
        );
        assert!(
            prog.code.contains("^A0N,"),
            "esperado ^A0N (rotação N), recebido:\n{}",
            prog.code
        );
        assert!(
            prog.code.contains("^FDCamiseta Polo^FS"),
            "esperado conteúdo entre ^FD..^FS, recebido:\n{}",
            prog.code
        );
    }

    #[test]
    fn text_rotation_90_uses_letter_r() {
        let obj = r#"{"type":"text","id":"t1","x":2.5,"y":1.25,"rotation":90,"content":"X","fontSize":8}"#;
        let json = build_canvas(50.0, 30.0, 203.0, obj);
        let prog = generate_zpl(&json, 1).unwrap();
        assert!(
            prog.code.contains("^A0R,"),
            "esperado rotação R (90°), recebido:\n{}",
            prog.code
        );
    }

    #[test]
    fn text_rotation_180_uses_letter_i() {
        let obj = r#"{"type":"text","id":"t1","x":0,"y":0,"rotation":180,"content":"X","fontSize":12}"#;
        let json = build_canvas(50.0, 30.0, 203.0, obj);
        let prog = generate_zpl(&json, 1).unwrap();
        assert!(prog.code.contains("^A0I,"), "esperado rotação I (180°)");
    }

    #[test]
    fn text_rotation_270_uses_letter_b() {
        let obj = r#"{"type":"text","id":"t1","x":0,"y":0,"rotation":270,"content":"X","fontSize":12}"#;
        let json = build_canvas(50.0, 30.0, 203.0, obj);
        let prog = generate_zpl(&json, 1).unwrap();
        assert!(prog.code.contains("^A0B,"), "esperado rotação B (270°)");
    }

    #[test]
    fn code128_barcode_uses_bc_command() {
        let obj = r#"{"type":"barcode","id":"b1","x":1.25,"y":5,"width":30,"height":10,"symbology":"CODE128","value":"ABC123"}"#;
        let json = build_canvas(50.0, 30.0, 203.0, obj);
        let prog = generate_zpl(&json, 1).unwrap();
        // ^FO10,40 + ^BCN,... + ^FDABC123^FS
        assert!(
            prog.code.contains("^FO10,40"),
            "posição esperada ^FO10,40, recebido:\n{}",
            prog.code
        );
        assert!(
            prog.code.contains("^BCN,"),
            "esperado comando ^BCN, recebido:\n{}",
            prog.code
        );
        assert!(prog.code.contains("^FDABC123^FS"));
    }

    #[test]
    fn ean13_barcode_uses_be_command() {
        let obj = r#"{"type":"barcode","id":"b1","x":2.5,"y":15,"width":40,"height":10,"symbology":"EAN13","value":"7891234567890"}"#;
        let json = build_canvas(50.0, 30.0, 203.0, obj);
        let prog = generate_zpl(&json, 1).unwrap();
        // ^FO20,120^BEN,80,Y,N^FD7891234567890^FS (PRD §7.2 ZPL).
        assert!(
            prog.code.contains("^FO20,120"),
            "esperado ^FO20,120, recebido:\n{}",
            prog.code
        );
        assert!(
            prog.code.contains("^BEN,"),
            "esperado ^BEN (EAN-13), recebido:\n{}",
            prog.code
        );
        assert!(
            prog.code.contains("^FD7891234567890^FS"),
            "valor EAN-13 esperado, recebido:\n{}",
            prog.code
        );
    }

    #[test]
    fn ean13_includes_height_80_dots_when_10mm_at_203dpi() {
        // PRD §7.2 ZPL: ^BEN,80,Y,N — altura 80 dots = 10 mm * 8 dots/mm.
        let obj = r#"{"type":"barcode","id":"b1","x":2.5,"y":15,"width":40,"height":10,"symbology":"EAN13","value":"7891234567890"}"#;
        let json = build_canvas(50.0, 30.0, 203.0, obj);
        let prog = generate_zpl(&json, 1).unwrap();
        assert!(
            prog.code.contains("^BEN,80,Y,N"),
            "esperado ^BEN,80,Y,N (espelho do PRD), recebido:\n{}",
            prog.code
        );
    }

    #[test]
    fn code39_uses_b3_with_swapped_args() {
        // CODE39 (^B3) tem ordem N,check,height,interp,above — diferente das
        // outras 1D. Validamos que o check digit fica na posição correta.
        let obj = r#"{"type":"barcode","id":"b1","x":1.25,"y":5,"width":30,"height":10,"symbology":"CODE39","value":"ABC"}"#;
        let json = build_canvas(50.0, 30.0, 203.0, obj);
        let prog = generate_zpl(&json, 1).unwrap();
        assert!(prog.code.contains("^B3N,N,"), "esperado ^B3N,N,..., recebido:\n{}", prog.code);
    }

    #[test]
    fn qrcode_object_emits_bq_command() {
        let obj = r#"{"type":"qrcode","id":"q1","x":10,"y":5,"width":15,"height":15,"value":"https://etiquetador","errorCorrection":"H"}"#;
        let json = build_canvas(50.0, 30.0, 203.0, obj);
        let prog = generate_zpl(&json, 1).unwrap();
        // 10 mm * 8 = 80; 5 mm * 8 = 40.
        assert!(
            prog.code.contains("^FO80,40"),
            "posição QR ^FO80,40 esperada, recebido:\n{}",
            prog.code
        );
        assert!(
            prog.code.contains("^BQN,2,"),
            "esperado comando ^BQN,2,..., recebido:\n{}",
            prog.code
        );
        assert!(
            prog.code.contains(",H,7^FDHA,https://etiquetador^FS"),
            "esperado payload HA,<data> com eclevel H, recebido:\n{}",
            prog.code
        );
    }

    #[test]
    fn qrcode_via_barcode_object_routes_to_bq() {
        // O usuário pode criar QR via PropertiesPanel "barcode" com
        // symbology=QRCODE — também roteia para ^BQ.
        let obj = r#"{"type":"barcode","id":"b1","x":10,"y":5,"width":15,"height":15,"symbology":"QRCODE","value":"abc","errorCorrection":"L"}"#;
        let json = build_canvas(50.0, 30.0, 203.0, obj);
        let prog = generate_zpl(&json, 1).unwrap();
        assert!(prog.code.contains("^BQN,2,"));
        assert!(prog.code.contains(",L,7^FDLA,abc^FS"));
    }

    #[test]
    fn datamatrix_uses_bx_command() {
        let obj = r#"{"type":"barcode","id":"b1","x":1.25,"y":5,"width":15,"height":15,"symbology":"DATAMATRIX","value":"SN-12345"}"#;
        let json = build_canvas(50.0, 30.0, 203.0, obj);
        let prog = generate_zpl(&json, 1).unwrap();
        assert!(prog.code.contains("^BXN,"), "esperado ^BXN, recebido:\n{}", prog.code);
        assert!(prog.code.contains("^FDSN-12345^FS"));
    }

    #[test]
    fn pdf417_uses_b7_command() {
        let obj = r#"{"type":"barcode","id":"b1","x":1.25,"y":5,"width":30,"height":15,"symbology":"PDF417","value":"PAYLOAD","errorCorrection":"Q"}"#;
        let json = build_canvas(50.0, 30.0, 203.0, obj);
        let prog = generate_zpl(&json, 1).unwrap();
        assert!(prog.code.contains("^B7N,"), "esperado ^B7N, recebido:\n{}", prog.code);
        // Security 5 = "Q".
        assert!(prog.code.contains(",5,,,N"), "esperado security 5, recebido:\n{}", prog.code);
    }

    #[test]
    fn rectangle_filled_uses_gb() {
        let obj = r#"{"type":"rectangle","id":"r1","x":1.25,"y":1.25,"width":5,"height":2.5,"fill":"#000"}"#;
        let json = build_canvas(50.0, 30.0, 203.0, obj);
        let prog = generate_zpl(&json, 1).unwrap();
        // x=10, y=10, w=40, h=20, t=min(40,20)=20 → ^GB40,20,20,B,0
        assert!(
            prog.code.contains("^FO10,10^GB40,20,20,B,0^FS"),
            "esperado retângulo preenchido, recebido:\n{}",
            prog.code
        );
    }

    #[test]
    fn rectangle_stroke_only_uses_gb_with_thin_thickness() {
        let obj = r#"{"type":"rectangle","id":"r1","x":1.25,"y":1.25,"width":5,"height":2.5,"stroke":"#000","strokeWidth":0.5}"#;
        let json = build_canvas(50.0, 30.0, 203.0, obj);
        let prog = generate_zpl(&json, 1).unwrap();
        // x=10,y=10,w=40,h=20,t=4 (0.5mm * 8).
        assert!(
            prog.code.contains("^FO10,10^GB40,20,4,B,0^FS"),
            "esperado box stroke, recebido:\n{}",
            prog.code
        );
    }

    #[test]
    fn line_emits_gb_strip() {
        let obj = r#"{"type":"line","id":"l1","x":2.5,"y":2.5,"width":10,"strokeWidth":0.5}"#;
        let json = build_canvas(50.0, 30.0, 203.0, obj);
        let prog = generate_zpl(&json, 1).unwrap();
        // x=20,y=20,w=80,h=4 (0.5mm*8). Esperado linha horizontal grossa.
        assert!(
            prog.code.contains("^FO20,20^GB80,4,"),
            "esperado linha como GB, recebido:\n{}",
            prog.code
        );
    }

    #[test]
    fn ellipse_circle_uses_gc() {
        let obj = r#"{"type":"ellipse","id":"e1","x":1.25,"y":1.25,"width":5,"height":5,"stroke":"#000","strokeWidth":0.3}"#;
        let json = build_canvas(50.0, 30.0, 203.0, obj);
        let prog = generate_zpl(&json, 1).unwrap();
        // w=h ⇒ ^GC<diameter>,<t>,B.
        assert!(
            prog.code.contains("^GC40,"),
            "esperado ^GC (círculo), recebido:\n{}",
            prog.code
        );
    }

    #[test]
    fn ellipse_non_circle_uses_ge() {
        let obj = r#"{"type":"ellipse","id":"e1","x":1.25,"y":1.25,"width":10,"height":5,"stroke":"#000","strokeWidth":0.3}"#;
        let json = build_canvas(50.0, 30.0, 203.0, obj);
        let prog = generate_zpl(&json, 1).unwrap();
        // w≠h ⇒ ^GE.
        assert!(
            prog.code.contains("^GE80,40,"),
            "esperado ^GE (elipse), recebido:\n{}",
            prog.code
        );
    }

    #[test]
    fn image_emits_placeholder_comment() {
        let obj = r#"{"type":"image","id":"i1","x":2.5,"y":2.5,"width":5,"height":5,"src":"data:image/png;base64,iVBOR"}"#;
        let json = build_canvas(50.0, 30.0, 203.0, obj);
        let prog = generate_zpl(&json, 1).unwrap();
        assert!(
            prog.code.contains("^FX image"),
            "esperado placeholder ^FX, recebido:\n{}",
            prog.code
        );
    }

    #[test]
    fn copies_count_lands_in_pq_command() {
        let json = build_canvas(50.0, 30.0, 203.0, "");
        let prog = generate_zpl(&json, 5).unwrap();
        assert!(prog.code.contains("^PQ5\n"));
    }

    #[test]
    fn invalid_copies_rejected() {
        let json = build_canvas(50.0, 30.0, 203.0, "");
        let err = generate_zpl(&json, 0).unwrap_err();
        assert!(matches!(err, ZplError::InvalidCopies(0)));
        let err = generate_zpl(&json, 10_000).unwrap_err();
        assert!(matches!(err, ZplError::InvalidCopies(10_000)));
    }

    #[test]
    fn invalid_json_returns_error() {
        let err = generate_zpl("not-json", 1).unwrap_err();
        assert!(matches!(err, ZplError::InvalidCanvasJson(_)));
    }

    #[test]
    fn unknown_object_type_is_skipped_gracefully() {
        let obj = r#"{"type":"future-type-xyz","id":"x","x":0,"y":0}"#;
        let json = build_canvas(50.0, 30.0, 203.0, obj);
        let prog = generate_zpl(&json, 1).unwrap();
        // Envelope mínimo ainda presente.
        assert!(prog.code.contains("^PQ1\n"));
        assert!(prog.code.trim_end().ends_with("^XZ"));
        // Objeto ignorado — nenhum ^FO emitido por ele.
        assert!(!prog.code.contains("future-type"));
    }

    #[test]
    fn show_text_false_emits_hrt_n() {
        let obj = r#"{"type":"barcode","id":"b1","x":1.25,"y":5,"width":30,"height":10,"symbology":"CODE128","value":"X","showText":false}"#;
        let json = build_canvas(50.0, 30.0, 203.0, obj);
        let prog = generate_zpl(&json, 1).unwrap();
        // ^BCN,<h>,N,... (sem HRT).
        assert!(
            prog.code.contains("^BCN,80,N,N"),
            "esperado HRT N, recebido:\n{}",
            prog.code
        );
    }

    #[test]
    fn empty_objects_array_still_prints_envelope() {
        let json = build_canvas(40.0, 20.0, 203.0, "");
        let prog = generate_zpl(&json, 3).unwrap();
        // ^PW320 (40*8), ^LL160 (20*8), ^PQ3.
        assert!(prog.code.contains("^PW320\n"));
        assert!(prog.code.contains("^LL160\n"));
        assert!(prog.code.contains("^PQ3\n"));
    }

    #[test]
    fn end_to_end_clothing_label_matches_prd_zpl_example_shape() {
        // PRD §7.2 — etiqueta 50×30 mm com 3 textos + 1 EAN-13 (versão ZPL).
        let objects = r#"
            {"type":"text","id":"t1","x":2.5,"y":1.25,"content":"Camiseta Polo","fontSize":18},
            {"type":"text","id":"t2","x":2.5,"y":6.25,"content":"Tam: M","fontSize":12},
            {"type":"text","id":"t3","x":2.5,"y":10,"content":"R$ 89,90","fontSize":14},
            {"type":"barcode","id":"b1","x":2.5,"y":15,"width":40,"height":10,"symbology":"EAN13","value":"7891234567890"}
        "#;
        let json = build_canvas(50.0, 30.0, 203.0, objects);
        let prog = generate_zpl(&json, 1).unwrap();
        // Cada elemento aparece, na ordem.
        let idx_polo = prog.code.find("Camiseta Polo").unwrap();
        let idx_tam = prog.code.find("Tam: M").unwrap();
        let idx_preco = prog.code.find("R$ 89,90").unwrap();
        let idx_ean = prog.code.find("7891234567890").unwrap();
        assert!(idx_polo < idx_tam);
        assert!(idx_tam < idx_preco);
        assert!(idx_preco < idx_ean);
        // Header / footer canônicos do PRD.
        assert!(prog.code.starts_with("^XA\n"));
        assert!(prog.code.contains("^PW400\n"));
        assert!(prog.code.contains("^LL240\n"));
        assert!(prog.code.contains("^PQ1\n"));
        assert!(prog.code.trim_end().ends_with("^XZ"));
    }

    #[test]
    fn font_height_dots_scales_with_dpi() {
        // 12 pt a 203 dpi ≈ 33.83 → 34.
        assert_eq!(font_height_dots(12.0, 203.0), 34);
        // 12 pt a 300 dpi = 50.
        assert_eq!(font_height_dots(12.0, 300.0), 50);
        // Clamp em 10 dots mínimo (RF prático Zebra).
        assert_eq!(font_height_dots(0.1, 203.0), 10);
    }

    #[test]
    fn qr_scale_is_clamped() {
        assert_eq!(qr_scale(Some(0.0), 203.0), 1);
        assert_eq!(qr_scale(Some(100.0), 203.0), 10);
    }

    #[test]
    fn map_zpl_1d_cmd_covers_all_native_symbologies() {
        // Sanity: cada simbologia 1D do catálogo WP-07 tem comando ZPL.
        assert_eq!(map_zpl_1d_cmd("CODE128"), Some("BC"));
        assert_eq!(map_zpl_1d_cmd("CODE39"), Some("B3"));
        assert_eq!(map_zpl_1d_cmd("EAN13"), Some("BE"));
        assert_eq!(map_zpl_1d_cmd("EAN8"), Some("B8"));
        assert_eq!(map_zpl_1d_cmd("UPCA"), Some("BU"));
        assert_eq!(map_zpl_1d_cmd("UPCE"), Some("B9"));
        assert_eq!(map_zpl_1d_cmd("ITF"), Some("BI"));
        assert_eq!(map_zpl_1d_cmd("CODABAR"), Some("BK"));
        assert_eq!(map_zpl_1d_cmd("UNKNOWN_SYMBOLOGY"), None);
    }

    #[test]
    fn text_with_caret_in_content_is_escaped() {
        // Caret no conteúdo seria interpretado como início de comando ZPL.
        let obj = r#"{"type":"text","id":"t1","x":0,"y":0,"content":"foo^XA","fontSize":12}"#;
        let json = build_canvas(50.0, 30.0, 203.0, obj);
        let prog = generate_zpl(&json, 1).unwrap();
        assert!(
            prog.code.contains("^FDfoo_XA^FS"),
            "caret deve virar _, recebido:\n{}",
            prog.code
        );
    }
}
