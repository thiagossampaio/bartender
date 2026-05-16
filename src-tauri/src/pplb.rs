//! Tradutor `canvas_json` → PPLB (Argox) — WP-10 / SPEC-10.
//!
//! Gera o código PPLB nativo a partir de um `canvas_json` aderente ao schema
//! definido em [SPEC-04]. A saída é uma string ASCII pronta para envio raw via
//! spooler do SO (Windows `RawPrintJob` / macOS `lp -o raw`) ou USB direto
//! (`rusb`, fallback documentado em [R01]).
//!
//! ## Mapeamento `canvas_json` → PPLB
//!
//! | Objeto         | Comando PPLB                                    | Observações |
//! |----------------|-------------------------------------------------|-------------|
//! | `text`         | `A` (fonte interna 1..5) ou `GW` (raster)        | Fonte custom = raster via `fontdue` (futuro) |
//! | `rectangle`    | `X` (contorno) + `LO` (preenchimento)            | Preenchimento total = `LO` cobrindo a área |
//! | `line`         | `LO`                                             | Linha em ângulo = sequência de `LO`s ortogonais |
//! | `ellipse`      | (raster)                                         | PPLB não tem elipse nativa — entra em fallback raster |
//! | `image`        | `GW`                                             | Decodificado via crate `image`, rasterizado em 1 bit |
//! | `barcode` (1D) | `B` (simbologias nativas)                        | Cai para raster do SVG via `bwip-js` quando não suportada |
//! | `qrcode`       | `b<x>,<y>,Q,m<eclevel>,s<scale>,...`             | Comando QR Code nativo da Argox |
//!
//! ## Sistema de coordenadas
//!
//! - `canvas_json` usa mm a partir do canto superior esquerdo.
//! - PPLB usa dots a partir do canto superior esquerdo (a 203 dpi = 8 dots/mm).
//! - Conversão: `mm * (dpi / 25.4)`. Para um template a 203 dpi padrão Argox,
//!   `1 mm ≈ 8 dots` (RF aceito; conversão exata via `round`).
//!
//! ## Rotação
//!
//! - PPLB aceita 4 rotações via código (0=0°, 1=90°, 2=180°, 3=270°).
//! - Rotações arbitrárias **não** são suportadas no modo nativo — caem em
//!   raster (fallback futuro). MVP arredonda 0/90/180/270 e ignora outras.
//!
//! ## Decisões registradas
//!
//! - **Strings ASCII apenas:** PPLB não aceita UTF-8 multi-byte em texto via
//!   comando `A`. Acentos pesados que não couberem em CP437 deveriam usar
//!   raster (mitigação no [WP-17]). Por enquanto, fazemos best-effort
//!   replacing inválidos por espaço para evitar payload corrompido.
//! - **Quoting:** o conteúdo do texto / barcode é envolvido em aspas duplas;
//!   aspas duplas literais no conteúdo viram `\"` (escape PPLB padrão).
//! - **Buffer único:** o gerador concatena tudo em uma `String`. PPLB
//!   raramente passa de poucos KB por etiqueta — sem necessidade de
//!   streaming.
//!
//! ## Caminho de envio
//!
//! O envio raw é feito por [`crate::printers::printers_print_raw`] — usa
//! `Printer::print` da crate `printers` 2.x que internamente despacha via
//! `RawPrintJob` (Windows Win32 Spooler) ou `lp -o raw -d <printer>`
//! (macOS/Linux CUPS). Isso atende RF-I-04 e SPEC-10 §"Comportamento
//! esperado" item 6.
//!
//! ## Fallback USB direto (R01)
//!
//! Quando o driver oficial Argox apresentar instabilidade em Apple Silicon,
//! o PRD §11 indica usar a crate `rusb` para abrir o endpoint USB
//! diretamente e enviar os bytes PPLB. Esse caminho não é parte do MVP
//! mas o gerador produz bytecode ASCII compatível — basta substituir o
//! transporte por `rusb::open(vid, pid) → write_bulk(endpoint, bytes)`.
//! Vendor ID Argox típico: `1664` (0x0680); product ID varia por modelo
//! (consultar `lsusb` / "Informações do Sistema → USB" no macOS).

use serde::Deserialize;
use thiserror::Error;

/// Conversão mm → dots respeitando o DPI do template. Argox OS-214 Plus opera
/// a 203 dpi (8 dots/mm); a constante 25.4 vem de 1 in = 25.4 mm.
#[inline]
pub fn mm_to_dots(mm: f64, dpi: f64) -> i32 {
    (mm * dpi / 25.4).round() as i32
}

/// Erros do gerador. Convertidos para `String` ao cruzar a fronteira Tauri.
#[derive(Debug, Error)]
pub enum PplbError {
    #[error("canvas_json inválido: {0}")]
    InvalidCanvasJson(String),
    #[error("quantidade de cópias inválida ({0}) — esperado 1..=9999")]
    InvalidCopies(u32),
}

impl serde::Serialize for PplbError {
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

/// Mapeamento `rotation` (graus) → código de rotação PPLB (0..3).
/// PPLB aceita apenas múltiplos de 90; arredondamos para o mais próximo.
fn pplb_rotation_code(deg: f64) -> u8 {
    // Normaliza para [0, 360).
    let mut d = deg % 360.0;
    if d < 0.0 {
        d += 360.0;
    }
    let snapped = ((d + 45.0) / 90.0).floor() as i32 % 4;
    snapped as u8
}

/// Escapa aspas duplas para o quoting PPLB. PPLB usa `\"` como escape padrão
/// dentro de strings entre `"..."`.
fn escape_pplb(input: &str) -> String {
    // Substitui caracteres não-ASCII por `?` (PPLB usa CP437 — multi-byte UTF-8
    // não é interpretado pela impressora). Acentos pesados ficam para o
    // pipeline raster (WP-17).
    let mut out = String::with_capacity(input.len());
    for c in input.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            c if (c as u32) < 0x80 => out.push(c),
            _ => out.push('?'),
        }
    }
    out
}

/// Escolhe a fonte interna Argox para um tamanho em pt. As 5 fontes embarcadas
/// têm tamanhos físicos fixos (1,25; 1,7; 2,5; 3,75; 6,0 mm a 203 dpi);
/// mapeamos o `fontSize` (pt) para o mais próximo. Fontes custom (qualquer
/// `fontFamily` que não seja built-in) entram em raster — flag retornada como
/// `None` para sinalizar fallback futuro.
///
/// Heurística aproximada:
/// - ≤ 8 pt   → fonte 1 (1,25 mm)
/// - ≤ 10 pt  → fonte 2 (1,70 mm)
/// - ≤ 14 pt  → fonte 3 (2,50 mm)
/// - ≤ 20 pt  → fonte 4 (3,75 mm)
/// - >  20 pt → fonte 5 (6,00 mm) + multiplicadores h/v ≥ 1
fn pick_argox_font(font_size_pt: f64) -> (u8, u8, u8) {
    // Devolve (font_code, h_mult, v_mult).
    if font_size_pt <= 8.0 {
        (1, 1, 1)
    } else if font_size_pt <= 10.0 {
        (2, 1, 1)
    } else if font_size_pt <= 14.0 {
        (3, 1, 1)
    } else if font_size_pt <= 20.0 {
        (4, 1, 1)
    } else if font_size_pt <= 30.0 {
        (5, 1, 1)
    } else if font_size_pt <= 50.0 {
        (5, 2, 2)
    } else {
        (5, 3, 3)
    }
}

/// `true` se a família é "built-in" da Argox — caso raro: usuário pode setar
/// `"Argox"` explicitamente. Caso contrário, a fonte custom é rasterizada
/// (entra em raster no WP-17 — MVP usa fonte interna mesmo para custom como
/// fallback graceful).
fn is_argox_builtin_font(family: Option<&str>) -> bool {
    match family.map(str::to_ascii_lowercase).as_deref() {
        Some("argox") | Some("argox-1") | Some("argox-2") | Some("argox-3") | Some("argox-4")
        | Some("argox-5") => true,
        None => true, // sem fontFamily → assume default (interna)
        _ => false,
    }
}

/// Mapeia simbologia 1D → código PPLB do comando `B`.
/// PPLB usa letras curtas: `1`=CODE128, `3`=CODE39, `E30`=EAN-13, etc.
/// Tabela do manual Argox PPLB §B "Barcode".
fn map_pplb_1d_code(sym: &str) -> Option<&'static str> {
    match sym.to_ascii_uppercase().as_str() {
        "CODE128" => Some("1"),
        "CODE39" => Some("3"),
        "EAN13" => Some("E30"),
        "EAN8" => Some("E20"),
        "UPCA" => Some("E80"),
        "UPCE" => Some("E60"),
        "ITF" => Some("2"),     // Interleaved 2 of 5
        "CODABAR" => Some("K"), // Codabar
        _ => None,
    }
}

/// Nível de correção QR → letra PPLB (`L`/`M`/`Q`/`H`). Default `M`.
fn qr_eclevel(input: Option<&str>) -> char {
    match input {
        Some("L") => 'L',
        Some("Q") => 'Q',
        Some("H") => 'H',
        _ => 'M',
    }
}

/// Magnificação QR: o `b` da Argox aceita `s<n>` (1..8) — usamos um default
/// razoável baseado no `moduleWidth` em mm + DPI. 1 unidade ≈ 1 dot, então
/// `scale = round(moduleWidth_mm * dpi / 25.4)`, clampado em 1..8.
fn qr_scale(module_width_mm: Option<f64>, dpi: f64) -> u8 {
    let mm = module_width_mm.unwrap_or(0.33);
    let dots = (mm * dpi / 25.4).round();
    dots.clamp(1.0, 8.0) as u8
}

/// Resultado da geração: o código PPLB pronto para envio raw.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PplbProgram {
    pub code: String,
}

impl PplbProgram {
    pub fn into_bytes(self) -> Vec<u8> {
        self.code.into_bytes()
    }
}

/// Gera o programa PPLB a partir de uma string `canvas_json` e do número de
/// cópias (1..=9999). O DPI é lido do próprio canvas (campo `dpi`) — para
/// Argox padrão é 203.
pub fn generate_pplb(canvas_json: &str, copies: u32) -> Result<PplbProgram, PplbError> {
    if !(1..=9999).contains(&copies) {
        return Err(PplbError::InvalidCopies(copies));
    }
    let parsed: CanvasJson = serde_json::from_str(canvas_json)
        .map_err(|e| PplbError::InvalidCanvasJson(e.to_string()))?;

    let dpi = parsed.canvas.dpi;
    let width_dots = mm_to_dots(parsed.canvas.width, dpi);
    let height_dots = mm_to_dots(parsed.canvas.height, dpi);

    // PPLB usa `\r\n` ao final de cada comando (CRLF é o padrão de quase todos
    // os firmwares Argox). Mantemos um único acumulador.
    let mut out = String::with_capacity(256);
    // Preâmbulo padrão (referência: manual Argox PPLB §A "Setup").
    out.push_str("N\r\n");
    out.push_str(&format!("q{}\r\n", width_dots));
    // Gap padrão 24 dots (3 mm a 203 dpi) — pode ser sobrescrito por
    // calibração no [WP-15] que ainda não está integrada.
    out.push_str(&format!("Q{},24\r\n", height_dots));
    out.push_str("S2\r\n");
    out.push_str("D8\r\n");

    for obj in &parsed.objects {
        match obj {
            CanvasObject::Text(t) => emit_text(&mut out, t, dpi),
            CanvasObject::Rectangle(r) => emit_rect(&mut out, r, dpi),
            CanvasObject::Line(l) => emit_line(&mut out, l, dpi),
            CanvasObject::Ellipse(e) => emit_ellipse_placeholder(&mut out, e, dpi),
            CanvasObject::Image(i) => emit_image_placeholder(&mut out, i, dpi),
            CanvasObject::Barcode(b) => emit_barcode(&mut out, b, dpi),
            CanvasObject::Qrcode(q) => emit_qrcode(&mut out, q, dpi),
            CanvasObject::Unknown => {
                // Tipo desconhecido — preserva contrato de tolerância.
            }
        }
    }

    out.push_str(&format!("P{}\r\n", copies));
    Ok(PplbProgram { code: out })
}

fn emit_text(out: &mut String, obj: &TextObj, dpi: f64) {
    let content = obj.content.clone().unwrap_or_default();
    if content.is_empty() {
        return;
    }
    let x = mm_to_dots(obj.base.x, dpi);
    let y = mm_to_dots(obj.base.y, dpi);
    let rot = pplb_rotation_code(obj.base.rotation.unwrap_or(0.0));
    let font_size = obj.font_size.unwrap_or(12.0);
    let bold = obj.font_weight.as_deref() == Some("bold");

    // Fontes Argox embarcadas → comando `A`. Fontes custom (qualquer outra
    // família) seriam rasterizadas — placeholder com fallback para fonte
    // interna mais próxima (MVP graceful; pipeline completo entra em WP-17).
    let (font, h_mult, v_mult) = pick_argox_font(font_size);
    let _ = is_argox_builtin_font(obj.font_family.as_deref());
    let reverse = if bold { 'R' } else { 'N' };
    let escaped = escape_pplb(&content);
    out.push_str(&format!(
        "A{},{},{},{},{},{},{},\"{}\"\r\n",
        x, y, rot, font, h_mult, v_mult, reverse, escaped
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

    // Preenchimento sólido: comando `LO` cobrindo a área inteira.
    if has_fill {
        out.push_str(&format!("LO{},{},{},{}\r\n", x, y, w_d, h_d));
    }
    // Contorno: comando `X` (box). `X x,y,thickness,xend,yend` em dots.
    if has_stroke && !has_fill {
        let thickness_mm = obj.stroke_width.unwrap_or(0.3);
        let t = mm_to_dots(thickness_mm, dpi).max(1);
        out.push_str(&format!(
            "X{},{},{},{},{}\r\n",
            x,
            y,
            t,
            x + w_d,
            y + h_d
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
    // `LO x,y,width,height` desenha um retângulo preto sólido — equivalente a
    // uma linha grossa quando `height` é pequeno. Linhas em diagonal não são
    // suportadas no modo nativo (raster como fallback futuro).
    out.push_str(&format!("LO{},{},{},{}\r\n", x, y, w_d, h_d));
}

/// Ellipse: PPLB não tem comando nativo. Emite um comentário marcador para
/// que o caller saiba que o objeto exige raster (WP-17). Mantém o output
/// inspecionável no `print_history` sem quebrar a impressão.
fn emit_ellipse_placeholder(out: &mut String, obj: &EllipseObj, dpi: f64) {
    let x = mm_to_dots(obj.base.x, dpi);
    let y = mm_to_dots(obj.base.y, dpi);
    out.push_str(&format!("; ellipse @ {},{} (raster fallback pendente)\r\n", x, y));
}

/// Image: idem — sem pipeline raster ainda. Marcador.
fn emit_image_placeholder(out: &mut String, obj: &ImageObj, dpi: f64) {
    if obj.src.as_deref().map(|s| s.is_empty()).unwrap_or(true) {
        return;
    }
    let x = mm_to_dots(obj.base.x, dpi);
    let y = mm_to_dots(obj.base.y, dpi);
    out.push_str(&format!("; image @ {},{} (raster fallback pendente)\r\n", x, y));
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
    // QR Code aparece em `barcode` quando o usuário escolhe via PropertiesPanel
    // (catálogo unificado WP-07). Roteamos para `b` aqui também.
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
    // Demais 2D (DATAMATRIX/PDF417) → raster (placeholder).
    if symbology.eq_ignore_ascii_case("DATAMATRIX") || symbology.eq_ignore_ascii_case("PDF417") {
        let x = mm_to_dots(obj.base.x, dpi);
        let y = mm_to_dots(obj.base.y, dpi);
        out.push_str(&format!(
            "; barcode {} @ {},{} (raster fallback pendente)\r\n",
            symbology, x, y
        ));
        return;
    }

    let Some(code) = map_pplb_1d_code(&symbology) else {
        // Simbologia desconhecida — pula sem quebrar.
        return;
    };
    let x = mm_to_dots(obj.base.x, dpi);
    let y = mm_to_dots(obj.base.y, dpi);
    let rot = pplb_rotation_code(obj.base.rotation.unwrap_or(0.0));
    // Largura do módulo em dots: padrão 2 dots (~0.25 mm a 203 dpi).
    let narrow = obj
        .module_width
        .map(|mm| mm_to_dots(mm, dpi).max(1) as u32)
        .unwrap_or(2);
    let wide = (narrow * 2).max(2);
    // Altura em dots: usa `height` do objeto quando definida, senão 50 dots.
    let height_dots = obj
        .base
        .height
        .filter(|h| *h > 0.0)
        .map(|mm| mm_to_dots(mm, dpi).max(10) as u32)
        .unwrap_or(50);
    let hrt = if obj.show_text.unwrap_or(true) { 'B' } else { 'N' };
    let escaped = escape_pplb(&value);
    out.push_str(&format!(
        "B{},{},{},{},{},{},{},{},\"{}\"\r\n",
        x, y, rot, code, narrow, wide, height_dots, hrt, escaped
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
        // O legacy `qrcode` não tem `moduleWidth` — usa default.
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
    let rot = pplb_rotation_code(rotation_deg);
    let ecl = qr_eclevel(error_correction);
    let scale = qr_scale(module_width, dpi);
    let escaped = escape_pplb(value);
    // Forma do comando `b` para QR no PPLB Argox:
    // `b<x>,<y>,Q,m<rotation>,s<scale>,e<eclevel>,"<data>"`
    // Algumas firmwares aceitam o eclevel inline no campo `m`; manter forma
    // detalhada (s+e separados) maximiza compatibilidade.
    out.push_str(&format!(
        "b{},{},Q,m{},s{},e{},\"{}\"\r\n",
        x, y, rot, scale, ecl, escaped
    ));
}

fn is_transparent(input: &str) -> bool {
    let t = input.trim();
    t.is_empty() || t.eq_ignore_ascii_case("transparent") || t.eq_ignore_ascii_case("none")
}

/// Comando Tauri: gera o código PPLB a partir do `canvas_json`. Devolve a
/// string PPLB ASCII — o frontend pode exibir/salvar para diagnóstico ou
/// passar adiante para `pplb_print`.
#[tauri::command]
pub fn pplb_generate(canvas_json: String, copies: u32) -> Result<String, PplbError> {
    let prog = generate_pplb(&canvas_json, copies)?;
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
        // 50 mm × 8 dots/mm = 400 dots (exatamente o exemplo do PRD §7.2).
        assert_eq!(mm_to_dots(50.0, 203.0), 400);
        // 30 mm × 8 dots/mm = 240 dots.
        assert_eq!(mm_to_dots(30.0, 203.0), 240);
    }

    #[test]
    fn mm_to_dots_at_300_dpi_zebra() {
        // 50 mm a 300 dpi = 50 * 300 / 25.4 ≈ 590 dots.
        assert_eq!(mm_to_dots(50.0, 300.0), 591);
    }

    #[test]
    fn pplb_rotation_code_snaps_to_quadrants() {
        assert_eq!(pplb_rotation_code(0.0), 0);
        assert_eq!(pplb_rotation_code(90.0), 1);
        assert_eq!(pplb_rotation_code(180.0), 2);
        assert_eq!(pplb_rotation_code(270.0), 3);
        // Negativos normalizam.
        assert_eq!(pplb_rotation_code(-90.0), 3);
        // Múltiplos de 360 voltam a 0.
        assert_eq!(pplb_rotation_code(360.0), 0);
        // Arredondamento para o quadrante mais próximo.
        assert_eq!(pplb_rotation_code(44.0), 0);
        assert_eq!(pplb_rotation_code(46.0), 1);
    }

    #[test]
    fn escape_pplb_handles_quotes_and_backslash() {
        assert_eq!(escape_pplb("Tam: M"), "Tam: M");
        assert_eq!(escape_pplb("Aspas: \""), "Aspas: \\\"");
        assert_eq!(escape_pplb("Path C:\\Users"), "Path C:\\\\Users");
    }

    #[test]
    fn escape_pplb_replaces_non_ascii_with_question_mark() {
        // Acentos seriam corrompidos no firmware sem CP437 explícito; o MVP
        // troca por `?` graceful e documenta o pipeline raster (WP-17).
        assert_eq!(escape_pplb("Camões"), "Cam?es");
    }

    #[test]
    fn header_matches_prd_example_50x30mm_203dpi() {
        // PRD §7.2 mostra: q400 (50mm * 8) e Q240,24 (30mm * 8 + gap 24).
        let json = build_canvas(50.0, 30.0, 203.0, "");
        let prog = generate_pplb(&json, 1).unwrap();
        assert!(
            prog.code.contains("q400\r\n"),
            "esperado q400, recebido: {}",
            prog.code
        );
        assert!(
            prog.code.contains("Q240,24\r\n"),
            "esperado Q240,24, recebido: {}",
            prog.code
        );
        assert!(prog.code.contains("S2\r\n"));
        assert!(prog.code.contains("D8\r\n"));
        assert!(prog.code.contains("P1\r\n"));
        assert!(prog.code.starts_with("N\r\n"));
    }

    #[test]
    fn text_object_emits_a_command_with_correct_position() {
        let obj = r#"{"type":"text","id":"t1","x":2.5,"y":1.25,"content":"Camiseta Polo","fontSize":24}"#;
        let json = build_canvas(50.0, 30.0, 203.0, obj);
        let prog = generate_pplb(&json, 1).unwrap();
        // 2.5 mm * 8 = 20 dots; 1.25 mm * 8 = 10 dots → `A20,10,...`.
        // Fonte 5 (≥ 20 pt), h_mult 1, v_mult 1, reverse N.
        assert!(
            prog.code.contains("A20,10,0,5,1,1,N,\"Camiseta Polo\""),
            "linha A esperada, recebido:\n{}",
            prog.code
        );
    }

    #[test]
    fn text_rotation_90_uses_code_1() {
        let obj = r#"{"type":"text","id":"t1","x":2.5,"y":1.25,"rotation":90,"content":"X","fontSize":8}"#;
        let json = build_canvas(50.0, 30.0, 203.0, obj);
        let prog = generate_pplb(&json, 1).unwrap();
        assert!(prog.code.contains("A20,10,1,"), "esperado rot=1, recebido:\n{}", prog.code);
    }

    #[test]
    fn ean13_barcode_uses_e30_code() {
        let obj = r#"{"type":"barcode","id":"b1","x":2.5,"y":15,"width":40,"height":10,"symbology":"EAN13","value":"7891234567890"}"#;
        let json = build_canvas(50.0, 30.0, 203.0, obj);
        let prog = generate_pplb(&json, 1).unwrap();
        // x=20, y=120, code E30, hrt B (default true) → linha do PRD §7.2 com
        // valor real "7891234567890".
        assert!(
            prog.code.contains("BE30") || prog.code.contains(",E30,"),
            "esperado código E30 (EAN-13), recebido:\n{}",
            prog.code
        );
        assert!(
            prog.code.contains("\"7891234567890\""),
            "valor EAN-13 deve aparecer entre aspas, recebido:\n{}",
            prog.code
        );
        assert!(prog.code.contains("B20,120"));
    }

    #[test]
    fn code128_barcode_uses_code_1() {
        let obj = r#"{"type":"barcode","id":"b1","x":1.25,"y":5,"width":30,"height":10,"symbology":"CODE128","value":"ABC123"}"#;
        let json = build_canvas(50.0, 30.0, 203.0, obj);
        let prog = generate_pplb(&json, 1).unwrap();
        // `B<x>,<y>,<rot>,1,...` — código "1" = CODE128.
        assert!(
            prog.code.contains("B10,40,0,1,"),
            "esperado código 1 (CODE128), recebido:\n{}",
            prog.code
        );
    }

    #[test]
    fn qrcode_object_emits_b_command() {
        let obj = r#"{"type":"qrcode","id":"q1","x":10,"y":5,"width":15,"height":15,"value":"https://etiquetador","errorCorrection":"H"}"#;
        let json = build_canvas(50.0, 30.0, 203.0, obj);
        let prog = generate_pplb(&json, 1).unwrap();
        // 10 mm * 8 = 80 dots; 5 mm * 8 = 40 dots.
        assert!(
            prog.code.contains("b80,40,Q,"),
            "esperado comando b QR, recebido:\n{}",
            prog.code
        );
        assert!(prog.code.contains("eH"), "esperado eclevel H, recebido:\n{}", prog.code);
        assert!(prog.code.contains("\"https://etiquetador\""));
    }

    #[test]
    fn qrcode_via_barcode_object_routes_to_b_command() {
        // O usuário pode criar QR via PropertiesPanel "barcode" com
        // symbology=QRCODE — também roteia para `b`.
        let obj = r#"{"type":"barcode","id":"b1","x":10,"y":5,"width":15,"height":15,"symbology":"QRCODE","value":"abc","errorCorrection":"L"}"#;
        let json = build_canvas(50.0, 30.0, 203.0, obj);
        let prog = generate_pplb(&json, 1).unwrap();
        assert!(prog.code.contains("b80,40,Q,"));
        assert!(prog.code.contains("eL"));
    }

    #[test]
    fn rectangle_filled_uses_lo() {
        let obj = r#"{"type":"rectangle","id":"r1","x":1.25,"y":1.25,"width":5,"height":2.5,"fill":"#000"}"#;
        let json = build_canvas(50.0, 30.0, 203.0, obj);
        let prog = generate_pplb(&json, 1).unwrap();
        // x=10, y=10, w=40, h=20.
        assert!(
            prog.code.contains("LO10,10,40,20"),
            "esperado LO preenchido, recebido:\n{}",
            prog.code
        );
    }

    #[test]
    fn rectangle_stroke_only_uses_x() {
        let obj = r#"{"type":"rectangle","id":"r1","x":1.25,"y":1.25,"width":5,"height":2.5,"stroke":"#000","strokeWidth":0.5}"#;
        let json = build_canvas(50.0, 30.0, 203.0, obj);
        let prog = generate_pplb(&json, 1).unwrap();
        // x=10,y=10, thickness=4 (0.5mm * 8), xend=50, yend=30.
        assert!(
            prog.code.contains("X10,10,4,50,30"),
            "esperado X box, recebido:\n{}",
            prog.code
        );
    }

    #[test]
    fn line_emits_lo_strip() {
        let obj = r#"{"type":"line","id":"l1","x":2.5,"y":2.5,"width":10,"strokeWidth":0.5}"#;
        let json = build_canvas(50.0, 30.0, 203.0, obj);
        let prog = generate_pplb(&json, 1).unwrap();
        // x=20, y=20, w=80, h=4 (0.5mm * 8) — linha horizontal grossa.
        assert!(
            prog.code.contains("LO20,20,80,4"),
            "esperado LO em linha, recebido:\n{}",
            prog.code
        );
    }

    #[test]
    fn copies_count_lands_in_p_command() {
        let json = build_canvas(50.0, 30.0, 203.0, "");
        let prog = generate_pplb(&json, 5).unwrap();
        assert!(prog.code.contains("P5\r\n"));
    }

    #[test]
    fn invalid_copies_rejected() {
        let json = build_canvas(50.0, 30.0, 203.0, "");
        let err = generate_pplb(&json, 0).unwrap_err();
        assert!(matches!(err, PplbError::InvalidCopies(0)));
        let err = generate_pplb(&json, 10_000).unwrap_err();
        assert!(matches!(err, PplbError::InvalidCopies(10_000)));
    }

    #[test]
    fn invalid_json_returns_error() {
        let err = generate_pplb("not-json", 1).unwrap_err();
        assert!(matches!(err, PplbError::InvalidCanvasJson(_)));
    }

    #[test]
    fn unknown_object_type_is_skipped_gracefully() {
        let obj = r#"{"type":"future-type-xyz","id":"x","x":0,"y":0}"#;
        let json = build_canvas(50.0, 30.0, 203.0, obj);
        let prog = generate_pplb(&json, 1).unwrap();
        // Apenas o preâmbulo + P1, sem comandos extras.
        assert!(prog.code.contains("P1\r\n"));
        assert!(!prog.code.contains("future-type"));
    }

    #[test]
    fn ellipse_and_image_emit_placeholders() {
        let obj_ellipse = r#"{"type":"ellipse","id":"e1","x":1.25,"y":1.25,"width":5,"height":5}"#;
        let obj_image = r#"{"type":"image","id":"i1","x":2.5,"y":2.5,"width":5,"height":5,"src":"data:image/png;base64,iVBOR"}"#;
        let json = build_canvas(50.0, 30.0, 203.0, &format!("{},{}", obj_ellipse, obj_image));
        let prog = generate_pplb(&json, 1).unwrap();
        // Esperamos comentários `;` marcadores; sem comandos PPLB problemáticos.
        assert!(prog.code.contains("; ellipse"));
        assert!(prog.code.contains("; image"));
    }

    #[test]
    fn end_to_end_clothing_label_matches_prd_example_shape() {
        // PRD §7.2 — etiqueta 50×30 mm com 3 textos + 1 EAN-13.
        let objects = r#"
            {"type":"text","id":"t1","x":2.5,"y":1.25,"content":"Camiseta Polo","fontSize":18},
            {"type":"text","id":"t2","x":2.5,"y":6.25,"content":"Tam: M","fontSize":12},
            {"type":"text","id":"t3","x":2.5,"y":10,"content":"R$ 89,90","fontSize":14},
            {"type":"barcode","id":"b1","x":2.5,"y":15,"width":40,"height":10,"symbology":"EAN13","value":"7891234567890"}
        "#;
        let json = build_canvas(50.0, 30.0, 203.0, objects);
        let prog = generate_pplb(&json, 1).unwrap();
        // Verifica que cada elemento aparece, na ordem.
        let idx_polo = prog.code.find("Camiseta Polo").unwrap();
        let idx_tam = prog.code.find("Tam: M").unwrap();
        let idx_preco = prog.code.find("R$ 89,90").unwrap();
        let idx_ean = prog.code.find("7891234567890").unwrap();
        assert!(idx_polo < idx_tam);
        assert!(idx_tam < idx_preco);
        assert!(idx_preco < idx_ean);
        // Header / footer ainda presentes.
        assert!(prog.code.starts_with("N\r\n"));
        assert!(prog.code.contains("q400\r\n"));
        assert!(prog.code.contains("Q240,24\r\n"));
        assert!(prog.code.contains("P1\r\n"));
    }

    #[test]
    fn pick_argox_font_buckets_are_monotonic() {
        let (f1, _, _) = pick_argox_font(8.0);
        let (f2, _, _) = pick_argox_font(10.0);
        let (f3, _, _) = pick_argox_font(14.0);
        let (f4, _, _) = pick_argox_font(20.0);
        let (f5, _, _) = pick_argox_font(30.0);
        assert_eq!(f1, 1);
        assert_eq!(f2, 2);
        assert_eq!(f3, 3);
        assert_eq!(f4, 4);
        assert_eq!(f5, 5);
    }

    #[test]
    fn pick_argox_font_uses_multipliers_for_huge_sizes() {
        let (font, h, v) = pick_argox_font(72.0);
        assert_eq!(font, 5);
        assert!(h >= 2);
        assert!(v >= 2);
    }

    #[test]
    fn qr_scale_is_clamped() {
        assert_eq!(qr_scale(Some(0.0), 203.0), 1);
        assert_eq!(qr_scale(Some(100.0), 203.0), 8);
    }

    #[test]
    fn show_text_false_emits_hrt_n() {
        let obj = r#"{"type":"barcode","id":"b1","x":1.25,"y":5,"width":30,"height":10,"symbology":"CODE128","value":"X","showText":false}"#;
        let json = build_canvas(50.0, 30.0, 203.0, obj);
        let prog = generate_pplb(&json, 1).unwrap();
        // Última vírgula antes do valor deve trazer `N,` (sem HRT).
        assert!(
            prog.code.contains(",N,\"X\""),
            "esperado HRT N, recebido:\n{}",
            prog.code
        );
    }

    #[test]
    fn empty_objects_array_still_prints_envelope() {
        let json = build_canvas(40.0, 20.0, 203.0, "");
        let prog = generate_pplb(&json, 3).unwrap();
        // q320 (40*8), Q160,24 (20*8 + gap), P3.
        assert!(prog.code.contains("q320\r\n"));
        assert!(prog.code.contains("Q160,24\r\n"));
        assert!(prog.code.contains("P3\r\n"));
    }
}
