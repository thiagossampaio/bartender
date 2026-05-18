//! Exportação PDF vetorial (WP-08 / SPEC-08).
//!
//! Recebe um ou mais `canvas_json` (strings JSON) e produz um PDF vetorial
//! multipágina via crate **`printpdf`** (escolhida em PRD §3.3). Cada
//! `canvas_json` vira uma página com as mesmas dimensões em milímetros do
//! template, garantindo proporção fiel (RF-P-01/03/04/05).
//!
//! ## Estratégia
//!
//! - **Texto** → `use_text` com fonte embarcada (Helvetica builtin do PDF).
//!   Mantém o PDF leve e o texto selecionável. Fontes do bundle do app são
//!   um item futuro (WP-08 entrega vetorial; a substituição por `.ttf`
//!   embarcado fica para [WP-17] de polimento).
//! - **Retângulos / Linhas / Elipses** → `Line` (path fechado) com fill/stroke
//!   nativos do PDF (vetorial 100 %).
//! - **Imagens** (PNG/JPEG embarcados como data URL) → decodificadas via
//!   `image` crate e embarcadas como `ImageXObject` (raster — é a única opção
//!   sensata para fotos do usuário; ficam nítidas no DPI configurado).
//! - **Barcodes / QR Code** → o frontend pré-renderiza via `bwip-js` em SVG
//!   (composto apenas de `<rect>`s) e envia o SVG já posicionado no JSON.
//!   Aqui apenas parseamos os `<rect>` e emitimos retângulos pretos no PDF,
//!   preservando a fidelidade vetorial em qualquer zoom (RF-P-05).
//!
//! ## Performance (RF-P performance ≤ 15 s para 500 etiquetas)
//!
//! - `printpdf` mantém o documento todo em memória; isso é OK para até
//!   ~10 k páginas de etiqueta simples. Para 500 etiquetas, o gargalo é a
//!   serialização de imagens — sem imagens, o pipeline é trivialmente rápido.
//! - Não fazemos pretty-print do JSON nem clonagens supérfluas. O `image`
//!   crate é chamado uma única vez por objeto imagem.

use std::fs::File;
use std::io::BufWriter;
use std::path::PathBuf;

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use printpdf::path::{PaintMode, WindingOrder};
use printpdf::{
    BuiltinFont, Image, ImageTransform, IndirectFontRef, Mm, PdfDocument, PdfDocumentReference,
    PdfLayerReference, Point, Polygon, Rgb,
};

/// Centraliza o cast `f64 → f32` exigido por `printpdf` 0.7 para `Mm`/`Pt`/
/// escalas. Toda a geometria do módulo trabalha em `f64` (mais natural para
/// coordenadas em mm com decimais) e converte só na fronteira da crate.
#[inline]
fn mm(v: f64) -> Mm {
    Mm(v as f32)
}
use serde::Deserialize;
use thiserror::Error;

/// Conversão mm → pt (1 in = 25.4 mm = 72 pt → 1 mm ≈ 2.8346 pt). `printpdf`
/// já oferece `Mm`/`Pt`, então usamos os tipos diretamente; esta constante
/// fica apenas para conversão de tamanho de fonte (pt) ↔ outras unidades.
const MM_PER_INCH: f64 = 25.4;

/// Origem do PDF é no canto **inferior** esquerdo, mas o `canvas_json` usa o
/// canto **superior** esquerdo. `pdf_y(page_height_mm, y_top_mm, h_mm)`
/// devolve o `y` correspondente para `printpdf`.
fn pdf_y(page_h: f64, y_top: f64, h: f64) -> f64 {
    page_h - y_top - h
}

/// Erros do módulo. Convertidos para string ao cruzar a fronteira Tauri.
#[derive(Debug, Error)]
pub enum PdfError {
    #[error("payload sem páginas (canvas_jsons vazio)")]
    EmptyPayload,
    #[error("canvas_json inválido na página {page}: {message}")]
    InvalidCanvasJson { page: usize, message: String },
    #[error("falha ao gerar PDF: {0}")]
    Generate(String),
    #[error("falha ao gravar PDF em {path}: {source}")]
    Io {
        path: String,
        #[source]
        source: std::io::Error,
    },
}

impl serde::Serialize for PdfError {
    fn serialize<S: serde::Serializer>(&self, ser: S) -> Result<S::Ok, S::Error> {
        ser.serialize_str(&self.to_string())
    }
}

// --- Schema do canvas_json (espelho parcial de `src/lib/canvas/types.ts`) ---
//
// O `serde` é tolerante a campos ausentes/extras; objetos com `type` desconhecido
// são ignorados graciosamente.

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
    #[serde(default)]
    background: Option<String>,
}

fn default_dpi() -> f64 {
    203.0
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
    Qrcode(BarcodeObj),
    /// Catch-all: tipos futuros não derrubam a exportação.
    #[serde(other)]
    Unknown,
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
struct TextObj {
    #[serde(flatten)]
    base: BaseFields,
    #[serde(default)]
    content: Option<String>,
    #[serde(default, rename = "fontFamily")]
    _font_family: Option<String>,
    #[serde(default, rename = "fontSize")]
    font_size: Option<f64>,
    #[serde(default, rename = "fontWeight")]
    font_weight: Option<String>,
    #[serde(default, rename = "fontStyle")]
    font_style: Option<String>,
    #[serde(default)]
    color: Option<String>,
    #[serde(default, rename = "textAlign")]
    text_align: Option<String>,
    #[serde(default, rename = "verticalAlign")]
    vertical_align: Option<String>,
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
    #[serde(default, rename = "cornerRadius")]
    _corner_radius: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct LineObj {
    #[serde(flatten)]
    base: BaseFields,
    #[serde(default)]
    stroke: Option<String>,
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
    /// SVG pré-renderizado pelo frontend (bwip-js). Quando ausente, o objeto é
    /// pulado — o editor garante que sempre passa SVG quando exporta.
    #[serde(default, rename = "renderedSvg")]
    rendered_svg: Option<String>,
}

/// Constrói o `PdfDocumentReference` a partir dos `canvas_jsons` brutos.
/// Reaproveitado por `pdf_export` (salva em disco) e `pdf_export_bytes`
/// (devolve `Vec<u8>` — caminho usado pelo wizard de impressão WP-09 para
/// alimentar o spooler do SO sem etapa de save intermediária).
fn build_document(canvas_jsons: &[String]) -> Result<PdfDocumentReference, PdfError> {
    if canvas_jsons.is_empty() {
        return Err(PdfError::EmptyPayload);
    }

    let pages: Vec<CanvasJson> = canvas_jsons
        .iter()
        .enumerate()
        .map(|(i, raw)| {
            serde_json::from_str::<CanvasJson>(raw).map_err(|e| PdfError::InvalidCanvasJson {
                page: i + 1,
                message: e.to_string(),
            })
        })
        .collect::<Result<Vec<_>, _>>()?;

    // Primeira página define o título do documento; o resto é adicionado via
    // `add_page` com dimensões próprias (templates mistos são raros mas
    // suportados — WP-13 pode passar 500 cópias de um único template).
    let first = &pages[0];
    let (doc, page_index, layer_index) = PdfDocument::new(
        "Etiquetador",
        mm(first.canvas.width),
        mm(first.canvas.height),
        "Layer 1",
    );

    let font = doc
        .add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| PdfError::Generate(e.to_string()))?;
    let font_bold = doc
        .add_builtin_font(BuiltinFont::HelveticaBold)
        .map_err(|e| PdfError::Generate(e.to_string()))?;
    let font_italic = doc
        .add_builtin_font(BuiltinFont::HelveticaOblique)
        .map_err(|e| PdfError::Generate(e.to_string()))?;
    let font_bold_italic = doc
        .add_builtin_font(BuiltinFont::HelveticaBoldOblique)
        .map_err(|e| PdfError::Generate(e.to_string()))?;
    let fonts = Fonts {
        regular: font,
        bold: font_bold,
        italic: font_italic,
        bold_italic: font_bold_italic,
    };

    // Renderiza a primeira página no layer já criado.
    let first_layer = doc.get_page(page_index).get_layer(layer_index);
    render_page(&doc, &first_layer, first, &fonts).map_err(PdfError::Generate)?;

    // Páginas seguintes.
    for page in pages.iter().skip(1) {
        let (pg, ly) = doc.add_page(
            mm(page.canvas.width),
            mm(page.canvas.height),
            "Layer 1",
        );
        let layer = doc.get_page(pg).get_layer(ly);
        render_page(&doc, &layer, page, &fonts).map_err(PdfError::Generate)?;
    }

    Ok(doc)
}

/// Comando Tauri exposto ao frontend.
///
/// `canvas_jsons` aceita 1..N entradas (etiqueta única ou lote do wizard
/// futuro [WP-13]). Cada item vira uma página independente respeitando suas
/// próprias dimensões em mm.
#[tauri::command]
pub fn pdf_export(canvas_jsons: Vec<String>, output_path: String) -> Result<String, PdfError> {
    let doc = build_document(&canvas_jsons)?;

    // Salva o arquivo. `printpdf` exige um `BufWriter`.
    let path = PathBuf::from(&output_path);
    let file = File::create(&path).map_err(|source| PdfError::Io {
        path: output_path.clone(),
        source,
    })?;
    let mut writer = BufWriter::new(file);
    doc.save(&mut writer)
        .map_err(|e| PdfError::Generate(e.to_string()))?;

    Ok(output_path)
}

/// Variante do `pdf_export` que devolve os bytes do PDF (in-memory) — usada
/// pelo wizard de impressão (WP-09) para alimentar o spooler do SO sem
/// gravar em disco e sem precisar pedir um local de save ao usuário.
///
/// Trade-off: para 500 etiquetas o PDF fica < 5 MB em vetorial e cabe
/// confortavelmente em `Vec<u8>`; o IPC do Tauri 2.x serializa `Vec<u8>` de
/// forma eficiente.
#[tauri::command]
pub fn pdf_export_bytes(canvas_jsons: Vec<String>) -> Result<Vec<u8>, PdfError> {
    let doc = build_document(&canvas_jsons)?;
    let mut buffer: Vec<u8> = Vec::with_capacity(64 * 1024);
    {
        let mut writer = BufWriter::new(&mut buffer);
        doc.save(&mut writer)
            .map_err(|e| PdfError::Generate(e.to_string()))?;
    }
    Ok(buffer)
}

/// Conjunto de variantes Helvetica para escolha por `fontWeight`/`fontStyle`.
struct Fonts {
    regular: IndirectFontRef,
    bold: IndirectFontRef,
    italic: IndirectFontRef,
    bold_italic: IndirectFontRef,
}

impl Fonts {
    fn pick(&self, weight: Option<&str>, style: Option<&str>) -> &IndirectFontRef {
        let bold = weight == Some("bold");
        let italic = style == Some("italic");
        match (bold, italic) {
            (true, true) => &self.bold_italic,
            (true, false) => &self.bold,
            (false, true) => &self.italic,
            (false, false) => &self.regular,
        }
    }
}

/// Renderiza uma página inteira na ordem dos objetos do JSON (z-order natural).
fn render_page(
    doc: &PdfDocumentReference,
    layer: &PdfLayerReference,
    page: &CanvasJson,
    fonts: &Fonts,
) -> Result<(), String> {
    let page_h = page.canvas.height;

    // Background (se for diferente de branco).
    if let Some(bg) = page.canvas.background.as_deref() {
        if !is_white(bg) {
            let color = parse_color(bg).unwrap_or(rgb_white());
            layer.set_fill_color(printpdf::Color::Rgb(color));
            if let Some(poly) = rect_path(
                0.0,
                0.0,
                page.canvas.width,
                page.canvas.height,
                true,
                false,
            ) {
                layer.add_polygon(poly);
            }
        }
    }

    for obj in &page.objects {
        match obj {
            CanvasObject::Text(t) => draw_text(layer, t, page_h, fonts)?,
            CanvasObject::Rectangle(r) => draw_rect(layer, r, page_h),
            CanvasObject::Line(l) => draw_line(layer, l, page_h),
            CanvasObject::Ellipse(e) => draw_ellipse(layer, e, page_h),
            CanvasObject::Image(i) => {
                if let Err(err) = draw_image(doc, layer, i, page_h) {
                    eprintln!("[pdf] imagem ignorada: {err}");
                }
            }
            CanvasObject::Barcode(b) | CanvasObject::Qrcode(b) => {
                draw_barcode(layer, b, page_h);
            }
            CanvasObject::Unknown => {
                // Tipo desconhecido — preserva contrato de tolerância.
            }
        }
    }

    Ok(())
}

fn draw_text(
    layer: &PdfLayerReference,
    obj: &TextObj,
    page_h: f64,
    fonts: &Fonts,
) -> Result<(), String> {
    let content = obj.content.clone().unwrap_or_default();
    if content.is_empty() {
        return Ok(());
    }
    let font_size_pt = obj.font_size.unwrap_or(12.0);
    // Posição: o `y` do canvas é o topo do texto; o PDF posiciona pela baseline.
    // Aproximamos descida da baseline como `font_size * 0.8 / 72 * 25.4` mm.
    let baseline_offset_mm = font_size_pt * 0.8 * MM_PER_INCH / 72.0;
    let line_height_mm = font_size_pt * 1.2 * MM_PER_INCH / 72.0;
    let line_count = content.split('\n').count().max(1) as f64;
    let block_height_mm = line_height_mm * line_count;
    // Offset vertical dentro da caixa do objeto: `top` (default), `middle` ou
    // `bottom`. Quando a caixa não tem altura definida, mantemos comportamento
    // anterior (top). RF-F-09 / WP-06.
    let box_height_mm = obj.base.height.unwrap_or(0.0);
    let v_offset_mm = if box_height_mm > 0.0 {
        match obj.vertical_align.as_deref() {
            Some("middle") => ((box_height_mm - block_height_mm) / 2.0).max(0.0),
            Some("bottom") => (box_height_mm - block_height_mm).max(0.0),
            _ => 0.0,
        }
    } else {
        0.0
    };
    let x_mm = obj.base.x;
    let y_top_mm = obj.base.y + v_offset_mm;
    let pdf_y_mm = page_h - y_top_mm - baseline_offset_mm;

    let color = obj
        .color
        .as_deref()
        .and_then(parse_color)
        .unwrap_or(rgb_black());
    layer.set_fill_color(printpdf::Color::Rgb(color));

    let font = fonts.pick(obj.font_weight.as_deref(), obj.font_style.as_deref());

    // Texto multi-linha: o canvas pode quebrar em `\n`; emitimos cada linha
    // por baseline subsequente. Wrap por largura fica para um polimento
    // futuro — para PDF de etiqueta, quase todo texto é uma linha.
    for (i, line) in content.split('\n').enumerate() {
        let line_y = pdf_y_mm - (i as f64) * line_height_mm;
        // Alinhamento horizontal aproximado (sem width measurement preciso —
        // o builtin Helvetica não expõe metrics no printpdf 0.7 sem a feature
        // `embedded_images`; assumimos `left` por padrão e respeitamos
        // apenas o `x` quando `textAlign` for center/right via shift simples).
        let x = match obj.text_align.as_deref() {
            Some("center") => x_mm + obj.base.width.unwrap_or(0.0) / 2.0
                - estimate_text_width_mm(line, font_size_pt) / 2.0,
            Some("right") => x_mm + obj.base.width.unwrap_or(0.0)
                - estimate_text_width_mm(line, font_size_pt),
            _ => x_mm,
        };
        layer.use_text(line, font_size_pt as f32, mm(x), mm(line_y), font);
    }
    Ok(())
}

/// Estimativa rápida da largura do texto em mm. Para Helvetica builtin, uma
/// aproximação razoável é `0.5 * font_size_pt * len`. Suficiente para
/// alinhamento de etiquetas comuns; medições precisas exigiriam embeddar a
/// fonte (.afm/.ttf) — backlog WP-17.
fn estimate_text_width_mm(text: &str, font_size_pt: f64) -> f64 {
    let chars = text.chars().count() as f64;
    chars * font_size_pt * 0.5 * MM_PER_INCH / 72.0
}

fn draw_rect(layer: &PdfLayerReference, obj: &RectObj, page_h: f64) {
    let w = obj.base.width.unwrap_or(0.0);
    let h = obj.base.height.unwrap_or(0.0);
    if w <= 0.0 || h <= 0.0 {
        return;
    }
    let x = obj.base.x;
    let y = pdf_y(page_h, obj.base.y, h);

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
        let color = obj
            .fill
            .as_deref()
            .and_then(parse_color)
            .unwrap_or(rgb_black());
        layer.set_fill_color(printpdf::Color::Rgb(color));
    }
    if has_stroke {
        let color = obj
            .stroke
            .as_deref()
            .and_then(parse_color)
            .unwrap_or(rgb_black());
        layer.set_outline_color(printpdf::Color::Rgb(color));
        layer.set_outline_thickness(mm_to_pt(obj.stroke_width.unwrap_or(0.3)) as f32);
    }
    if let Some(poly) = rect_path(x, y, w, h, has_fill, has_stroke) {
        layer.add_polygon(poly);
    }
}

fn draw_line(layer: &PdfLayerReference, obj: &LineObj, page_h: f64) {
    let w = obj.base.width.unwrap_or(0.0);
    if w <= 0.0 {
        return;
    }
    let thickness_mm = obj.stroke_width.unwrap_or(0.4);
    // O canvas modela "linha" como um retângulo fino — mantemos isso para
    // garantir rotação consistente com o editor.
    let h = obj.base.height.filter(|h| *h > 0.0).unwrap_or(thickness_mm);
    let x = obj.base.x;
    let y = pdf_y(page_h, obj.base.y, h);
    let color = obj
        .stroke
        .as_deref()
        .and_then(parse_color)
        .unwrap_or(rgb_black());
    layer.set_fill_color(printpdf::Color::Rgb(color));
    if let Some(poly) = rect_path(x, y, w, h, true, false) {
        layer.add_polygon(poly);
    }
}

fn draw_ellipse(layer: &PdfLayerReference, obj: &EllipseObj, page_h: f64) {
    let w = obj.base.width.unwrap_or(0.0);
    let h = obj.base.height.unwrap_or(0.0);
    if w <= 0.0 || h <= 0.0 {
        return;
    }
    let cx = obj.base.x + w / 2.0;
    let cy_top = obj.base.y + h / 2.0;
    let cy = page_h - cy_top;
    let rx = w / 2.0;
    let ry = h / 2.0;

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
        let color = obj
            .fill
            .as_deref()
            .and_then(parse_color)
            .unwrap_or(rgb_black());
        layer.set_fill_color(printpdf::Color::Rgb(color));
    }
    if has_stroke {
        let color = obj
            .stroke
            .as_deref()
            .and_then(parse_color)
            .unwrap_or(rgb_black());
        layer.set_outline_color(printpdf::Color::Rgb(color));
        layer.set_outline_thickness(mm_to_pt(obj.stroke_width.unwrap_or(0.3)) as f32);
    }

    if let Some(poly) = ellipse_path(cx, cy, rx, ry, has_fill, has_stroke) {
        layer.add_polygon(poly);
    }
}

fn draw_image(
    _doc: &PdfDocumentReference,
    layer: &PdfLayerReference,
    obj: &ImageObj,
    page_h: f64,
) -> Result<(), String> {
    let Some(src) = obj.src.as_deref() else {
        return Ok(());
    };
    if src.is_empty() {
        return Ok(());
    }
    let w_mm = obj.base.width.unwrap_or(0.0);
    let h_mm = obj.base.height.unwrap_or(0.0);
    if w_mm <= 0.0 || h_mm <= 0.0 {
        return Ok(());
    }

    let bytes = decode_data_url(src)?;
    let mime = detect_mime(&bytes);

    // Lê as dimensões PRIMEIRO via um decoder descartável — `Image::try_from`
    // consome o decoder, e o layout interno de `printpdf::Image` varia entre
    // versões 0.7.x. Decodificar duas vezes é barato (PNGs/JPEGs de etiqueta
    // raramente passam de algumas centenas de KB).
    let (px_w, px_h) = read_dimensions(&bytes, &mime)?;
    if px_w <= 0.0 || px_h <= 0.0 {
        return Ok(());
    }

    let image_xobject = match mime {
        ImageMime::Png => {
            let decoder = image::codecs::png::PngDecoder::new(std::io::Cursor::new(&bytes))
                .map_err(|e| format!("PNG inválido: {e}"))?;
            Image::try_from(decoder).map_err(|e| format!("PNG: {e}"))?
        }
        ImageMime::Jpeg => {
            let decoder = image::codecs::jpeg::JpegDecoder::new(std::io::Cursor::new(&bytes))
                .map_err(|e| format!("JPEG inválido: {e}"))?;
            Image::try_from(decoder).map_err(|e| format!("JPEG: {e}"))?
        }
        ImageMime::Unknown => {
            return Err("formato de imagem não suportado (use PNG ou JPEG)".to_string());
        }
    };
    // `printpdf` interpreta a imagem em pontos via dpi do `ImageTransform`.
    // Usamos um dpi escolhido para que (px_w / dpi) in × 25.4 = w_mm.
    // → dpi_x = px_w / (w_mm / 25.4) = px_w * 25.4 / w_mm.
    let dpi_x = px_w * MM_PER_INCH / w_mm;
    let dpi_y = px_h * MM_PER_INCH / h_mm;
    let dpi = (dpi_x + dpi_y) / 2.0;

    // Escala não-uniforme via x/y separados (mantém aspect ratio só quando
    // o usuário não distorceu o objeto no editor).
    let scale_x = dpi_x / dpi;
    let scale_y = dpi_y / dpi;

    let translate_x_mm = obj.base.x;
    let translate_y_mm = pdf_y(page_h, obj.base.y, h_mm);

    image_xobject.add_to_layer(
        layer.clone(),
        ImageTransform {
            translate_x: Some(mm(translate_x_mm)),
            translate_y: Some(mm(translate_y_mm)),
            scale_x: Some(scale_x as f32),
            scale_y: Some(scale_y as f32),
            dpi: Some(dpi as f32),
            ..ImageTransform::default()
        },
    );
    Ok(())
}

fn draw_barcode(layer: &PdfLayerReference, obj: &BarcodeObj, page_h: f64) {
    let Some(svg) = obj.rendered_svg.as_deref() else {
        return;
    };
    let w_mm = obj.base.width.unwrap_or(0.0);
    let h_mm = obj.base.height.unwrap_or(0.0);
    if w_mm <= 0.0 || h_mm <= 0.0 || svg.is_empty() {
        return;
    }
    // bwip-js gera SVGs com viewBox; precisamos extrair os retângulos pretos
    // e mapeá-los para mm dentro da caixa do objeto.
    let parsed = parse_bwipjs_svg(svg);
    let Some(parsed) = parsed else {
        return;
    };
    if parsed.rects.is_empty() {
        return;
    }
    let sx = w_mm / parsed.view_w;
    let sy = h_mm / parsed.view_h;

    layer.set_fill_color(printpdf::Color::Rgb(rgb_black()));
    for r in parsed.rects {
        let x_mm = obj.base.x + r.x * sx;
        let y_top_mm = obj.base.y + r.y * sy;
        let rw_mm = r.w * sx;
        let rh_mm = r.h * sy;
        if rw_mm <= 0.0 || rh_mm <= 0.0 {
            continue;
        }
        let y_pdf = page_h - y_top_mm - rh_mm;
        if let Some(poly) = rect_path(x_mm, y_pdf, rw_mm, rh_mm, true, false) {
            layer.add_polygon(poly);
        }
    }
}

// --- Helpers de geometria ---

/// Traduz `(has_fill, has_stroke)` para o `PaintMode` do `printpdf::Polygon`.
/// Sem fill nem stroke, devolvemos `None` — nada deve ser desenhado.
fn paint_mode(has_fill: bool, has_stroke: bool) -> Option<PaintMode> {
    match (has_fill, has_stroke) {
        (true, true) => Some(PaintMode::FillStroke),
        (true, false) => Some(PaintMode::Fill),
        (false, true) => Some(PaintMode::Stroke),
        (false, false) => None,
    }
}

fn rect_path(
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    has_fill: bool,
    has_stroke: bool,
) -> Option<Polygon> {
    let mode = paint_mode(has_fill, has_stroke)?;
    let ring = vec![
        (Point::new(mm(x), mm(y)), false),
        (Point::new(mm(x + w), mm(y)), false),
        (Point::new(mm(x + w), mm(y + h)), false),
        (Point::new(mm(x), mm(y + h)), false),
    ];
    Some(Polygon {
        rings: vec![ring],
        mode,
        winding_order: WindingOrder::NonZero,
    })
}

/// Aproxima uma elipse por 4 curvas Bezier cúbicas usando a constante mágica
/// `k = 0.5522847498`. O ring do `Polygon` aceita `true` no segundo elemento
/// de cada `(Point, bool)` para indicar pontos de controle de Bezier — a
/// crate gera `cubicTo` entre pares consecutivos.
fn ellipse_path(
    cx: f64,
    cy: f64,
    rx: f64,
    ry: f64,
    has_fill: bool,
    has_stroke: bool,
) -> Option<Polygon> {
    let mode = paint_mode(has_fill, has_stroke)?;
    let k = 0.5522847498_f64;
    let ox = rx * k;
    let oy = ry * k;
    let ring = vec![
        // East
        (Point::new(mm(cx + rx), mm(cy)), false),
        // -> North
        (Point::new(mm(cx + rx), mm(cy + oy)), true),
        (Point::new(mm(cx + ox), mm(cy + ry)), true),
        (Point::new(mm(cx), mm(cy + ry)), false),
        // -> West
        (Point::new(mm(cx - ox), mm(cy + ry)), true),
        (Point::new(mm(cx - rx), mm(cy + oy)), true),
        (Point::new(mm(cx - rx), mm(cy)), false),
        // -> South
        (Point::new(mm(cx - rx), mm(cy - oy)), true),
        (Point::new(mm(cx - ox), mm(cy - ry)), true),
        (Point::new(mm(cx), mm(cy - ry)), false),
        // -> East (close)
        (Point::new(mm(cx + ox), mm(cy - ry)), true),
        (Point::new(mm(cx + rx), mm(cy - oy)), true),
        (Point::new(mm(cx + rx), mm(cy)), false),
    ];
    Some(Polygon {
        rings: vec![ring],
        mode,
        winding_order: WindingOrder::NonZero,
    })
}

// --- Helpers de cor ---

/// Constrói um `Rgb` a partir de canais `[0.0..1.0]`. Centraliza o cast
/// para `f32` (printpdf 0.7 espera `f32` em `Rgb::new`); manter num helper
/// permite ajustar caso a crate mude a assinatura.
fn rgb(r: f64, g: f64, b: f64) -> Rgb {
    Rgb::new(r as f32, g as f32, b as f32, None)
}

fn rgb_black() -> Rgb {
    rgb(0.0, 0.0, 0.0)
}

fn rgb_white() -> Rgb {
    rgb(1.0, 1.0, 1.0)
}

/// Aceita `#RRGGBB`, `#RGB` ou nomes simples (`white`, `black`, `transparent`).
fn parse_color(input: &str) -> Option<Rgb> {
    let trimmed = input.trim();
    if trimmed.eq_ignore_ascii_case("transparent") || trimmed.eq_ignore_ascii_case("none") {
        return None;
    }
    if trimmed.eq_ignore_ascii_case("black") {
        return Some(rgb_black());
    }
    if trimmed.eq_ignore_ascii_case("white") {
        return Some(rgb_white());
    }
    let hex = trimmed.strip_prefix('#')?;
    let (r, g, b) = match hex.len() {
        3 => {
            let r = u8::from_str_radix(&hex[0..1].repeat(2), 16).ok()?;
            let g = u8::from_str_radix(&hex[1..2].repeat(2), 16).ok()?;
            let b = u8::from_str_radix(&hex[2..3].repeat(2), 16).ok()?;
            (r, g, b)
        }
        6 => {
            let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
            let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
            let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
            (r, g, b)
        }
        _ => return None,
    };
    Some(rgb(
        f64::from(r) / 255.0,
        f64::from(g) / 255.0,
        f64::from(b) / 255.0,
    ))
}

fn is_transparent(input: &str) -> bool {
    let t = input.trim();
    t.is_empty() || t.eq_ignore_ascii_case("transparent") || t.eq_ignore_ascii_case("none")
}

fn is_white(input: &str) -> bool {
    matches!(input.trim().to_ascii_lowercase().as_str(), "#fff" | "#ffffff" | "white")
}

fn mm_to_pt(mm: f64) -> f64 {
    mm * 72.0 / MM_PER_INCH
}

// --- Data URL / imagem ---

enum ImageMime {
    Png,
    Jpeg,
    Unknown,
}

fn detect_mime(bytes: &[u8]) -> ImageMime {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        ImageMime::Png
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        ImageMime::Jpeg
    } else {
        ImageMime::Unknown
    }
}

/// Lê `(width_px, height_px)` da imagem usando um decoder descartável do
/// crate `image`. Mantém o módulo independente do layout interno do
/// `printpdf::Image` (que muda entre minor versions).
fn read_dimensions(bytes: &[u8], mime: &ImageMime) -> Result<(f64, f64), String> {
    use image::ImageDecoder;
    match mime {
        ImageMime::Png => {
            let dec = image::codecs::png::PngDecoder::new(std::io::Cursor::new(bytes))
                .map_err(|e| format!("PNG dimensões: {e}"))?;
            let (w, h) = dec.dimensions();
            Ok((w as f64, h as f64))
        }
        ImageMime::Jpeg => {
            let dec = image::codecs::jpeg::JpegDecoder::new(std::io::Cursor::new(bytes))
                .map_err(|e| format!("JPEG dimensões: {e}"))?;
            let (w, h) = dec.dimensions();
            Ok((w as f64, h as f64))
        }
        ImageMime::Unknown => Err("formato não suportado".to_string()),
    }
}

/// Decodifica `data:image/...;base64,...` para bytes. Falha em URLs http(s)
/// (esperado: o app é offline-first — imagens vivem embarcadas no JSON).
fn decode_data_url(url: &str) -> Result<Vec<u8>, String> {
    let rest = url
        .strip_prefix("data:")
        .ok_or_else(|| format!("URL não-data: {}", &url[..url.len().min(40)]))?;
    let comma = rest
        .find(',')
        .ok_or_else(|| "data URL sem vírgula".to_string())?;
    let header = &rest[..comma];
    let payload = &rest[comma + 1..];
    if header.contains(";base64") {
        BASE64_STANDARD
            .decode(payload.trim())
            .map_err(|e| format!("base64 inválido: {e}"))
    } else {
        // Data URL não-base64 (URL-encoded). Improvável para imagens, mas
        // mantemos o fallback.
        urlencoding_decode(payload)
    }
}

fn urlencoding_decode(input: &str) -> Result<Vec<u8>, String> {
    let mut out = Vec::with_capacity(input.len());
    let mut bytes = input.bytes();
    while let Some(b) = bytes.next() {
        if b == b'%' {
            let hi = bytes.next().ok_or_else(|| "url-encode truncado".to_string())?;
            let lo = bytes.next().ok_or_else(|| "url-encode truncado".to_string())?;
            let s = String::from_utf8(vec![hi, lo]).map_err(|e| e.to_string())?;
            let v = u8::from_str_radix(&s, 16).map_err(|e| e.to_string())?;
            out.push(v);
        } else if b == b'+' {
            out.push(b' ');
        } else {
            out.push(b);
        }
    }
    Ok(out)
}

// --- SVG do bwip-js → retângulos ---

#[derive(Debug)]
struct SvgRect {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

#[derive(Debug)]
struct ParsedSvg {
    view_w: f64,
    view_h: f64,
    rects: Vec<SvgRect>,
}

/// Parser minimalista do SVG emitido pelo `bwip-js`. A lib gera **apenas**
/// `<rect>`s e (para alguns símbolos) `<path>` com bezier — para o MVP do PDF
/// vetorial focamos nos rects, suficiente para CODE128/CODE39/EAN/UPC/ITF/
/// Codabar/QR/Data Matrix/PDF417 (cobertura ≥ 95% das simbologias).
fn parse_bwipjs_svg(svg: &str) -> Option<ParsedSvg> {
    let (view_w, view_h) = parse_viewbox(svg).or_else(|| parse_width_height(svg))?;
    let mut rects = Vec::new();

    // Itera caracteres de forma simplificada. Cada `<rect` abre um nó até `/>`
    // ou `>`. Atributos no formato `name="value"`.
    let mut cursor = 0usize;
    let bytes = svg.as_bytes();
    while let Some(pos) = find_subslice(bytes, b"<rect", cursor) {
        cursor = pos + 5;
        let end = match find_byte(bytes, b'>', cursor) {
            Some(e) => e,
            None => break,
        };
        let chunk = &svg[cursor..end];
        cursor = end + 1;

        let x = parse_attr(chunk, "x").unwrap_or(0.0);
        let y = parse_attr(chunk, "y").unwrap_or(0.0);
        let w = parse_attr(chunk, "width").unwrap_or(0.0);
        let h = parse_attr(chunk, "height").unwrap_or(0.0);
        if w > 0.0 && h > 0.0 {
            rects.push(SvgRect { x, y, w, h });
        }
    }

    Some(ParsedSvg {
        view_w,
        view_h,
        rects,
    })
}

fn find_subslice(haystack: &[u8], needle: &[u8], from: usize) -> Option<usize> {
    if needle.is_empty() || from >= haystack.len() {
        return None;
    }
    haystack[from..]
        .windows(needle.len())
        .position(|w| w.eq_ignore_ascii_case(needle))
        .map(|p| p + from)
}

fn find_byte(haystack: &[u8], needle: u8, from: usize) -> Option<usize> {
    haystack[from..].iter().position(|b| *b == needle).map(|p| p + from)
}

fn parse_viewbox(svg: &str) -> Option<(f64, f64)> {
    let lower = svg.to_ascii_lowercase();
    let idx = lower.find("viewbox")?;
    let after = &svg[idx..];
    let quote = after.find('"').or_else(|| after.find('\''))?;
    let q_char = after.as_bytes()[quote] as char;
    let rest = &after[quote + 1..];
    let close = rest.find(q_char)?;
    let value = &rest[..close];
    let parts: Vec<f64> = value
        .split(|c: char| c.is_whitespace() || c == ',')
        .filter_map(|s| s.parse::<f64>().ok())
        .collect();
    if parts.len() >= 4 {
        Some((parts[2], parts[3]))
    } else {
        None
    }
}

fn parse_width_height(svg: &str) -> Option<(f64, f64)> {
    let w = parse_attr(svg, "width")?;
    let h = parse_attr(svg, "height")?;
    Some((w, h))
}

fn parse_attr(chunk: &str, name: &str) -> Option<f64> {
    // procura `name=` precedido por whitespace ou início; case-sensitive
    // (bwip-js sempre emite lowercase).
    let pat_eq = format!("{}=", name);
    let mut search_start = 0usize;
    while let Some(rel) = chunk[search_start..].find(&pat_eq) {
        let pos = search_start + rel;
        // Garante delimitador antes (evita matchar "width" dentro de "stroke-width").
        if pos > 0 {
            let prev = chunk.as_bytes()[pos - 1];
            if !(prev.is_ascii_whitespace() || prev == b';') {
                search_start = pos + 1;
                continue;
            }
        }
        let after = &chunk[pos + pat_eq.len()..];
        let trimmed = after.trim_start();
        let bytes = trimmed.as_bytes();
        if bytes.is_empty() {
            return None;
        }
        let quote = bytes[0];
        if quote != b'"' && quote != b'\'' {
            // valor sem aspas
            let end = trimmed
                .find(|c: char| c.is_whitespace() || c == '/' || c == '>')
                .unwrap_or(trimmed.len());
            return trimmed[..end].parse::<f64>().ok();
        }
        let value_str = &trimmed[1..];
        let end = value_str.find(quote as char)?;
        return value_str[..end].parse::<f64>().ok();
    }
    None
}

// --- Testes unitários ---

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_color_handles_hex_and_names() {
        let c = parse_color("#FF0000").unwrap();
        assert!((c.r as f64 - 1.0).abs() < 1e-3);
        assert!((c.g as f64).abs() < 1e-3);
        let short = parse_color("#000").unwrap();
        assert!((short.r as f64).abs() < 1e-3);
        let white = parse_color("white").unwrap();
        assert!((white.r as f64 - 1.0).abs() < 1e-3);
        assert!(parse_color("transparent").is_none());
    }

    #[test]
    fn pdf_y_flips_correctly() {
        assert!((pdf_y(30.0, 5.0, 10.0) - 15.0).abs() < 1e-9);
    }

    #[test]
    fn parse_attr_skips_substring_matches() {
        let chunk = r#"x="1.5" stroke-width="3" width="20.5""#;
        assert!((parse_attr(chunk, "width").unwrap() - 20.5).abs() < 1e-9);
        assert!((parse_attr(chunk, "x").unwrap() - 1.5).abs() < 1e-9);
    }

    #[test]
    fn parse_bwipjs_svg_extracts_rects() {
        let svg = r##"<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg">
            <rect x="0" y="0" width="2" height="50" fill="#000"/>
            <rect x="4" y="0" width="2" height="50" fill="#000"/>
        </svg>"##;
        let parsed = parse_bwipjs_svg(svg).unwrap();
        assert_eq!(parsed.view_w, 100.0);
        assert_eq!(parsed.view_h, 50.0);
        assert_eq!(parsed.rects.len(), 2);
        assert_eq!(parsed.rects[0].w, 2.0);
        assert_eq!(parsed.rects[1].x, 4.0);
    }

    #[test]
    fn decode_data_url_handles_base64_png() {
        let url = "data:image/png;base64,iVBORw0KGgo=";
        let bytes = decode_data_url(url).unwrap();
        assert_eq!(&bytes[..4], &[0x89, b'P', b'N', b'G']);
    }

    #[test]
    fn empty_payload_is_rejected() {
        let err = pdf_export(vec![], "/tmp/x.pdf".into()).unwrap_err();
        assert!(matches!(err, PdfError::EmptyPayload));
    }
}
