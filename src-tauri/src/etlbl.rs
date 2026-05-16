//! Pacote `.etlbl` — Import/Export de templates (WP-14 / SPEC-11).
//!
//! Formato (§4.4 do PRD reproduzido em SPEC-11):
//!
//! ```text
//! template.etlbl  (ZIP)
//! ├── template.json   — metadata + canvas_json (objeto, não string)
//! ├── assets/         — imagens externalizadas (vazio neste MVP; ver nota abaixo)
//! ├── thumbnail.png   — preview gerado no export
//! └── manifest.json   — { schema_version, app_version, hash, exported_at }
//! ```
//!
//! **Decisão MVP sobre `assets/`:** o `canvas_json` mantém imagens inline como
//! `data:` URLs (campo `src` do `image` object). Isso garante round-trip 100 %
//! fidelidade com a representação interna do editor (`canvas_json` no banco
//! também usa data URLs inline). O diretório `assets/` é criado mas fica vazio
//! — reservado para versão futura que externalize imagens grandes e referencie
//! por caminho relativo. A validação de hash continua válida (cobre o conteúdo
//! do `template.json` + qualquer arquivo em `assets/`).
//!
//! **Sanitização:** todo objeto do tipo `image` tem seu `src` decodificado e
//! revalidado como PNG/JPEG/SVG antes do import ser commitado no banco. Falhas
//! retornam erro claro (`ImageSanitization`) — PRD §6.5.
//!
//! **Schema strict:** o `template.json` é deserializado com
//! `#[serde(deny_unknown_fields)]` em **todos** os structs aninhados. Campos
//! extras = erro de schema — PRD §6.5 / SPEC-11.

use std::io::{Cursor, Read, Write};
use std::path::PathBuf;

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;
use zip::write::FileOptions;
use zip::{ZipArchive, ZipWriter};

/// Versão do schema do `.etlbl` que este app sabe ler/escrever.
pub const ETLBL_SCHEMA_VERSION: u32 = 1;

/// Versão do app que aparece no `manifest.json` (PRD §4.4).
fn current_app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[derive(Debug, Error)]
pub enum EtlblError {
    #[error("Caminho de arquivo vazio.")]
    EmptyPath,
    #[error("Extensão inválida — esperava `.etlbl`, recebeu `{0}`.")]
    InvalidExtension(String),
    #[error("Não foi possível ler o arquivo: {0}")]
    Io(String),
    #[error("Arquivo `.etlbl` corrompido: {0}")]
    Corrupted(String),
    #[error("Schema inválido em `{file}`: {message}")]
    Schema { file: String, message: String },
    #[error("Hash inválido — o pacote pode ter sido modificado ou está corrompido.")]
    HashMismatch,
    #[error("Versão de schema não suportada: {found} (máx suportada: {supported}).")]
    UnsupportedSchemaVersion { found: u32, supported: u32 },
    #[error("Imagem inválida no objeto `image` ({hint}): {message}")]
    ImageSanitization { hint: String, message: String },
    #[error("Falha ao gerar pacote `.etlbl`: {0}")]
    Pack(String),
}

impl serde::Serialize for EtlblError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

// -------- Schema do `template.json` (strict; deny_unknown_fields) --------

/// Metadata do template + `canvas_json` (como objeto JSON, não string).
///
/// O frontend recebe um `TemplateRow` em camelCase; mantemos esse mesmo
/// estilo no JSON para reduzir mapeamentos de nome em ambas as direções.
#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct TemplateJson {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(rename = "widthMm")]
    pub width_mm: f64,
    #[serde(rename = "heightMm")]
    pub height_mm: f64,
    pub dpi: u32,
    pub orientation: String,
    #[serde(rename = "backgroundColor", default, skip_serializing_if = "Option::is_none")]
    pub background_color: Option<String>,
    /// Versão do app que originou o template (apenas informacional aqui;
    /// a regra de compatibilidade é decidida pelo `manifest.schema_version`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub origin_app_version: Option<String>,
    /// Estado serializado do canvas — schema versionado em PRD §4.3.
    #[serde(rename = "canvasJson")]
    pub canvas_json: CanvasJson,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CanvasJson {
    /// `version` é sempre 1 hoje (SPEC-04).
    pub version: u32,
    pub units: String,
    pub canvas: CanvasDef,
    #[serde(default)]
    pub objects: Vec<CanvasObject>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CanvasDef {
    pub width: f64,
    pub height: f64,
    pub dpi: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub background: Option<String>,
}

/// Discriminado por `type`. Aceitamos todos os tipos declarados em
/// `src/lib/canvas/types.ts`. **Não** aceitamos tipos desconhecidos — qualquer
/// `type` fora desta lista gera `Schema` error (defesa em profundidade contra
/// payloads maliciosos: PRD §6.5).
#[derive(Debug, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "lowercase", deny_unknown_fields)]
pub enum CanvasObject {
    Text(TextObj),
    Rectangle(RectObj),
    Line(LineObj),
    Ellipse(EllipseObj),
    Image(ImageObj),
    Barcode(BarcodeObj),
    Qrcode(QrcodeObj),
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct BaseFields {
    pub id: String,
    pub x: f64,
    pub y: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rotation: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub binding: Option<Binding>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Binding {
    pub field: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fallback: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct TextObj {
    #[serde(flatten)]
    pub base: BaseFields,
    #[serde(default)]
    pub content: String,
    #[serde(default, rename = "fontFamily", skip_serializing_if = "Option::is_none")]
    pub font_family: Option<String>,
    #[serde(default, rename = "fontSize", skip_serializing_if = "Option::is_none")]
    pub font_size: Option<f64>,
    #[serde(default, rename = "fontWeight", skip_serializing_if = "Option::is_none")]
    pub font_weight: Option<String>,
    #[serde(default, rename = "fontStyle", skip_serializing_if = "Option::is_none")]
    pub font_style: Option<String>,
    #[serde(default, rename = "textDecoration", skip_serializing_if = "Option::is_none")]
    pub text_decoration: Option<String>,
    #[serde(default, rename = "textAlign", skip_serializing_if = "Option::is_none")]
    pub text_align: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default, rename = "letterSpacing", skip_serializing_if = "Option::is_none")]
    pub letter_spacing: Option<f64>,
    #[serde(default, rename = "lineHeight", skip_serializing_if = "Option::is_none")]
    pub line_height: Option<f64>,
    #[serde(default, rename = "autoShrink", skip_serializing_if = "Option::is_none")]
    pub auto_shrink: Option<bool>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct RectObj {
    #[serde(flatten)]
    pub base: BaseFields,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fill: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stroke: Option<String>,
    #[serde(default, rename = "strokeWidth", skip_serializing_if = "Option::is_none")]
    pub stroke_width: Option<f64>,
    #[serde(default, rename = "cornerRadius", skip_serializing_if = "Option::is_none")]
    pub corner_radius: Option<f64>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct LineObj {
    #[serde(flatten)]
    pub base: BaseFields,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stroke: Option<String>,
    #[serde(default, rename = "strokeWidth", skip_serializing_if = "Option::is_none")]
    pub stroke_width: Option<f64>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct EllipseObj {
    #[serde(flatten)]
    pub base: BaseFields,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fill: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stroke: Option<String>,
    #[serde(default, rename = "strokeWidth", skip_serializing_if = "Option::is_none")]
    pub stroke_width: Option<f64>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ImageObj {
    #[serde(flatten)]
    pub base: BaseFields,
    /// Data URL (`data:image/png;base64,...`) ou referência relativa no ZIP
    /// (forward-compat). MVP só usa data URL inline.
    pub src: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct BarcodeObj {
    #[serde(flatten)]
    pub base: BaseFields,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub symbology: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
    #[serde(default, rename = "showText", skip_serializing_if = "Option::is_none")]
    pub show_text: Option<bool>,
    #[serde(default, rename = "moduleWidth", skip_serializing_if = "Option::is_none")]
    pub module_width: Option<f64>,
    #[serde(default, rename = "errorCorrection", skip_serializing_if = "Option::is_none")]
    pub error_correction: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct QrcodeObj {
    #[serde(flatten)]
    pub base: BaseFields,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
    #[serde(default, rename = "errorCorrection", skip_serializing_if = "Option::is_none")]
    pub error_correction: Option<String>,
}

// -------- Manifest --------

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Manifest {
    pub schema_version: u32,
    pub app_version: String,
    /// Hex lowercase (SHA-256 = 64 chars).
    pub hash: String,
    /// ISO-8601 UTC; informacional.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exported_at: Option<String>,
}

// -------- Resultados públicos para a fronteira Tauri --------

/// Resultado do `etlbl_inspect`: dados sanitizados e prontos para o frontend
/// decidir o conflito de nome antes de inserir no banco.
#[derive(Debug, Serialize)]
pub struct InspectResult {
    /// Metadata + canvas_json validados (campos de domínio em camelCase).
    pub name: String,
    pub description: Option<String>,
    #[serde(rename = "widthMm")]
    pub width_mm: f64,
    #[serde(rename = "heightMm")]
    pub height_mm: f64,
    pub dpi: u32,
    pub orientation: String,
    #[serde(rename = "backgroundColor")]
    pub background_color: Option<String>,
    /// `canvas_json` re-serializado como string (formato do banco).
    #[serde(rename = "canvasJson")]
    pub canvas_json: String,
    /// Thumbnail PNG cru (bytes). Pode ser `None` se ausente no pacote.
    #[serde(rename = "thumbnailPng")]
    pub thumbnail_png: Option<Vec<u8>>,
    /// Versão de schema vista no `.etlbl` (para telemetria/log).
    pub schema_version: u32,
    /// Versão do app que originou o pacote (informacional).
    pub origin_app_version: String,
}

// -------- Sanitização de imagens --------

/// Valida que o `src` de cada `ImageObj` é uma data URL com payload PNG/JPEG/SVG
/// efetivamente decodificável. Falha cedo (antes do commit) com mensagem clara.
fn sanitize_images(canvas: &CanvasJson) -> Result<(), EtlblError> {
    for (idx, obj) in canvas.objects.iter().enumerate() {
        if let CanvasObject::Image(img) = obj {
            let hint = format!("id={}, pos={}", img.base.id, idx);
            sanitize_image_src(&img.src).map_err(|message| EtlblError::ImageSanitization {
                hint: hint.clone(),
                message,
            })?;
        }
    }
    Ok(())
}

fn sanitize_image_src(src: &str) -> Result<(), String> {
    // Aceitamos somente data URLs no MVP. Referências relativas (`assets/...`)
    // ficam reservadas para versão futura — qualquer outra forma é rejeitada.
    if !src.starts_with("data:") {
        return Err(format!("origem da imagem não suportada: `{}` (esperado data URL)",
                           safe_prefix(src)));
    }
    let comma = src
        .find(',')
        .ok_or_else(|| "data URL sem vírgula separadora".to_string())?;
    let header = &src[..comma];
    let payload = &src[comma + 1..];
    let is_base64 = header.ends_with(";base64");
    let mime = header
        .strip_prefix("data:")
        .and_then(|h| h.split(';').next())
        .unwrap_or("");
    let mime_lower = mime.to_ascii_lowercase();
    if !matches!(
        mime_lower.as_str(),
        "image/png" | "image/jpeg" | "image/jpg" | "image/svg+xml"
    ) {
        return Err(format!("MIME `{}` não permitido (use png, jpeg ou svg+xml)", mime));
    }

    let bytes: Vec<u8> = if is_base64 {
        BASE64_STANDARD
            .decode(payload.trim())
            .map_err(|e| format!("base64 inválido: {e}"))?
    } else {
        // Data URL não-base64: o payload está percent-encoded. Decodificar
        // mantendo as bytes brutas para validação de SVG.
        percent_decode(payload)
            .map_err(|e| format!("percent-encoding inválido: {e}"))?
    };

    match mime_lower.as_str() {
        "image/png" => validate_png(&bytes),
        "image/jpeg" | "image/jpg" => validate_jpeg(&bytes),
        "image/svg+xml" => validate_svg(&bytes),
        _ => unreachable!(),
    }
}

fn safe_prefix(src: &str) -> String {
    let mut p: String = src.chars().take(32).collect();
    if src.chars().count() > 32 {
        p.push('…');
    }
    p
}

fn validate_png(bytes: &[u8]) -> Result<(), String> {
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    const SIG: [u8; 8] = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    if bytes.len() < 8 || bytes[..8] != SIG {
        return Err("assinatura PNG inválida".into());
    }
    // Decodificação completa via `image` crate (já é dep do WP-08).
    image::load_from_memory_with_format(bytes, image::ImageFormat::Png)
        .map(|_| ())
        .map_err(|e| format!("PNG corrompido: {e}"))
}

fn validate_jpeg(bytes: &[u8]) -> Result<(), String> {
    // JPEG: começa com FF D8 FF e termina com FF D9.
    if bytes.len() < 4 || bytes[0] != 0xFF || bytes[1] != 0xD8 || bytes[2] != 0xFF {
        return Err("assinatura JPEG inválida".into());
    }
    image::load_from_memory_with_format(bytes, image::ImageFormat::Jpeg)
        .map(|_| ())
        .map_err(|e| format!("JPEG corrompido: {e}"))
}

fn validate_svg(bytes: &[u8]) -> Result<(), String> {
    // Validação superficial: bytes válidos como UTF-8 e contendo `<svg`.
    // Não rodamos parser XML completo no MVP (Konva já lida com SVG inválido
    // no render); o objetivo aqui é bloquear payloads claramente não-SVG
    // (binário arbitrário, scripts puros sem tag `svg`).
    let s = std::str::from_utf8(bytes).map_err(|_| "SVG não é UTF-8 válido".to_string())?;
    let lower = s.to_ascii_lowercase();
    if !lower.contains("<svg") {
        return Err("conteúdo não parece ser SVG (tag `<svg` ausente)".into());
    }
    Ok(())
}

/// Percent-decoding mínimo (suficiente para data URLs textuais como `data:image/svg+xml,...`).
fn percent_decode(input: &str) -> Result<Vec<u8>, String> {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        let b = bytes[i];
        if b == b'%' {
            if i + 2 >= bytes.len() {
                return Err("sequência `%xx` incompleta no final".into());
            }
            let hex = std::str::from_utf8(&bytes[i + 1..=i + 2])
                .map_err(|_| "bytes não-ASCII em sequência `%xx`".to_string())?;
            let v = u8::from_str_radix(hex, 16)
                .map_err(|_| format!("hex inválido em `%{}`", hex))?;
            out.push(v);
            i += 3;
        } else {
            out.push(b);
            i += 1;
        }
    }
    Ok(out)
}

// -------- Hashing --------

/// Calcula sha256 sobre o conteúdo do `template.json` concatenado com cada
/// arquivo em `assets/` em **ordem lexicográfica** do nome (estável). O nome
/// do arquivo NÃO entra no hash — só o conteúdo.
///
/// Ordem fixa garante que `export → import` produza o mesmo hash, e que dois
/// pacotes com mesmos arquivos mas zip-order diferente verifiquem igual.
fn compute_content_hash(template_json_bytes: &[u8], assets: &[(String, Vec<u8>)]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(template_json_bytes);
    let mut sorted: Vec<&(String, Vec<u8>)> = assets.iter().collect();
    sorted.sort_by(|a, b| a.0.cmp(&b.0));
    for (_, data) in sorted {
        hasher.update(data);
    }
    let digest = hasher.finalize();
    hex_lower(&digest)
}

fn hex_lower(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push(HEX[(b >> 4) as usize] as char);
        out.push(HEX[(b & 0x0F) as usize] as char);
    }
    out
}

// -------- Export --------

/// Payload de export recebido do frontend. Em vez de re-ler o banco do lado
/// Rust (que exigiria um handle compartilhado ao SQLite), o frontend coleta os
/// campos do `TemplateRow` + `canvas_json` + thumbnail e envia tudo via IPC.
#[derive(Debug, Deserialize)]
pub struct ExportPayload {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(rename = "widthMm")]
    pub width_mm: f64,
    #[serde(rename = "heightMm")]
    pub height_mm: f64,
    pub dpi: u32,
    pub orientation: String,
    #[serde(rename = "backgroundColor", default)]
    pub background_color: Option<String>,
    /// `canvas_json` cru (string JSON do banco).
    #[serde(rename = "canvasJson")]
    pub canvas_json: String,
    /// Thumbnail PNG cru (opcional).
    #[serde(rename = "thumbnailPng", default)]
    pub thumbnail_png: Option<Vec<u8>>,
    /// Caminho de output escolhido pelo usuário no diálogo nativo.
    #[serde(rename = "outputPath")]
    pub output_path: String,
}

/// Escreve o `.etlbl` no `outputPath`. Retorna o caminho gravado.
pub fn export_inner(payload: ExportPayload) -> Result<String, EtlblError> {
    if payload.output_path.trim().is_empty() {
        return Err(EtlblError::EmptyPath);
    }
    let out_path = PathBuf::from(&payload.output_path);
    let ext_ok = out_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("etlbl"))
        .unwrap_or(false);
    if !ext_ok {
        return Err(EtlblError::InvalidExtension(
            out_path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("(sem extensão)")
                .to_string(),
        ));
    }

    // Validar o canvas_json: serializa de volta em forma canônica para o hash
    // ser estável (sem espaços extras vindos do banco).
    let canvas_json: CanvasJson = serde_json::from_str(&payload.canvas_json).map_err(|e| {
        EtlblError::Schema {
            file: "canvas_json (in DB)".into(),
            message: e.to_string(),
        }
    })?;
    sanitize_images(&canvas_json)?;

    let template_json = TemplateJson {
        name: payload.name,
        description: payload.description,
        width_mm: payload.width_mm,
        height_mm: payload.height_mm,
        dpi: payload.dpi,
        orientation: payload.orientation,
        background_color: payload.background_color,
        origin_app_version: Some(current_app_version().to_string()),
        canvas_json,
    };
    let template_bytes = serde_json::to_vec(&template_json)
        .map_err(|e| EtlblError::Pack(format!("serialização de template.json: {e}")))?;

    // MVP: nenhum asset externalizado. Estrutura preparada para a evolução
    // que externaliza imagens grandes.
    let assets: Vec<(String, Vec<u8>)> = Vec::new();

    let hash = compute_content_hash(&template_bytes, &assets);
    let manifest = Manifest {
        schema_version: ETLBL_SCHEMA_VERSION,
        app_version: current_app_version().to_string(),
        hash,
        exported_at: Some(format_now_utc()),
    };
    let manifest_bytes = serde_json::to_vec(&manifest)
        .map_err(|e| EtlblError::Pack(format!("serialização de manifest.json: {e}")))?;

    // Montar o ZIP.
    let buf = Vec::with_capacity(template_bytes.len() + manifest_bytes.len() + 1024);
    let mut writer = ZipWriter::new(Cursor::new(buf));
    let opts: FileOptions =
        FileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    writer
        .start_file("template.json", opts)
        .map_err(|e| EtlblError::Pack(format!("iniciar template.json: {e}")))?;
    writer
        .write_all(&template_bytes)
        .map_err(|e| EtlblError::Pack(format!("escrever template.json: {e}")))?;

    writer
        .start_file("manifest.json", opts)
        .map_err(|e| EtlblError::Pack(format!("iniciar manifest.json: {e}")))?;
    writer
        .write_all(&manifest_bytes)
        .map_err(|e| EtlblError::Pack(format!("escrever manifest.json: {e}")))?;

    if let Some(thumb) = payload.thumbnail_png.as_ref() {
        if !thumb.is_empty() {
            writer
                .start_file("thumbnail.png", opts)
                .map_err(|e| EtlblError::Pack(format!("iniciar thumbnail.png: {e}")))?;
            writer
                .write_all(thumb)
                .map_err(|e| EtlblError::Pack(format!("escrever thumbnail.png: {e}")))?;
        }
    }

    // `assets/` (diretório vazio reservado).
    writer
        .add_directory("assets/", opts)
        .map_err(|e| EtlblError::Pack(format!("criar assets/: {e}")))?;

    let cursor = writer
        .finish()
        .map_err(|e| EtlblError::Pack(format!("finalizar ZIP: {e}")))?;
    let bytes = cursor.into_inner();

    std::fs::write(&out_path, &bytes).map_err(|e| EtlblError::Io(e.to_string()))?;

    Ok(out_path.to_string_lossy().to_string())
}

fn format_now_utc() -> String {
    // Sem `chrono` no projeto; formatamos manualmente um ISO-8601 simples a
    // partir de `SystemTime`. Precisão segundo é suficiente para auditoria.
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // dias/segundos desde epoch unix → calendário gregoriano.
    let (y, m, d, hh, mm, ss) = epoch_to_civil(secs as i64);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        y, m, d, hh, mm, ss
    )
}

/// Howard Hinnant's date algorithm (public domain). Converte segundos UNIX em
/// (y, m, d, hh, mm, ss) UTC sem dep externa.
fn epoch_to_civil(secs: i64) -> (i32, u32, u32, u32, u32, u32) {
    let days = secs.div_euclid(86_400);
    let time = secs.rem_euclid(86_400) as u32;
    let hh = time / 3600;
    let mm = (time % 3600) / 60;
    let ss = time % 60;
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u32; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365; // [0, 399]
    let y = yoe as i32 + era as i32 * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = doy - (153 * mp + 2) / 5 + 1; // [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 }; // [1, 12]
    let y_adj = if m <= 2 { y + 1 } else { y };
    (y_adj, m, d, hh, mm, ss)
}

// -------- Import (inspect) --------

/// Lê o `.etlbl`, valida hash + schema + sanitiza imagens, e retorna os dados
/// prontos para o frontend resolver conflito de nome e inserir no banco.
pub fn inspect_inner(file_path: &str) -> Result<InspectResult, EtlblError> {
    if file_path.trim().is_empty() {
        return Err(EtlblError::EmptyPath);
    }
    let path = PathBuf::from(file_path);
    let ext_ok = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("etlbl"))
        .unwrap_or(false);
    if !ext_ok {
        return Err(EtlblError::InvalidExtension(
            path.extension()
                .and_then(|e| e.to_str())
                .unwrap_or("(sem extensão)")
                .to_string(),
        ));
    }
    let bytes = std::fs::read(&path).map_err(|e| EtlblError::Io(e.to_string()))?;
    parse_etlbl_bytes(&bytes)
}

/// Path puro (sem I/O) — exposto para teste unitário.
pub fn parse_etlbl_bytes(bytes: &[u8]) -> Result<InspectResult, EtlblError> {
    let mut archive = ZipArchive::new(Cursor::new(bytes))
        .map_err(|e| EtlblError::Corrupted(format!("ZIP inválido: {e}")))?;

    let mut template_bytes: Option<Vec<u8>> = None;
    let mut manifest_bytes: Option<Vec<u8>> = None;
    let mut thumbnail_bytes: Option<Vec<u8>> = None;
    let mut assets: Vec<(String, Vec<u8>)> = Vec::new();

    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| EtlblError::Corrupted(format!("entrada {i}: {e}")))?;
        let name = entry.name().to_string();
        // Bloqueia path traversal: nomes com `..` ou caminhos absolutos.
        if name.contains("..") || name.starts_with('/') || name.starts_with('\\') {
            return Err(EtlblError::Corrupted(format!(
                "entrada `{name}` com caminho suspeito (rejeitado)"
            )));
        }
        if entry.is_dir() {
            continue;
        }
        let mut buf = Vec::with_capacity(entry.size() as usize);
        entry
            .read_to_end(&mut buf)
            .map_err(|e| EtlblError::Corrupted(format!("leitura de `{name}`: {e}")))?;
        match name.as_str() {
            "template.json" => template_bytes = Some(buf),
            "manifest.json" => manifest_bytes = Some(buf),
            "thumbnail.png" => thumbnail_bytes = Some(buf),
            other if other.starts_with("assets/") && !other.ends_with('/') => {
                assets.push((other.to_string(), buf));
            }
            _ => {
                // Arquivos desconhecidos são ignorados (forward-compat); não
                // entram no hash recalculado.
            }
        }
    }

    let template_bytes =
        template_bytes.ok_or_else(|| EtlblError::Corrupted("template.json ausente".into()))?;
    let manifest_bytes =
        manifest_bytes.ok_or_else(|| EtlblError::Corrupted("manifest.json ausente".into()))?;

    let manifest: Manifest = serde_json::from_slice(&manifest_bytes).map_err(|e| {
        EtlblError::Schema {
            file: "manifest.json".into(),
            message: e.to_string(),
        }
    })?;

    if manifest.schema_version > ETLBL_SCHEMA_VERSION {
        return Err(EtlblError::UnsupportedSchemaVersion {
            found: manifest.schema_version,
            supported: ETLBL_SCHEMA_VERSION,
        });
    }

    // Validação de hash: recalcular sobre template.json + assets/* (sorted).
    let recalculated = compute_content_hash(&template_bytes, &assets);
    if !constant_time_eq(recalculated.as_bytes(), manifest.hash.as_bytes()) {
        return Err(EtlblError::HashMismatch);
    }

    let template: TemplateJson =
        serde_json::from_slice(&template_bytes).map_err(|e| EtlblError::Schema {
            file: "template.json".into(),
            message: e.to_string(),
        })?;

    // Validações semânticas extra (limites razoáveis).
    if template.name.trim().is_empty() {
        return Err(EtlblError::Schema {
            file: "template.json".into(),
            message: "campo `name` vazio".into(),
        });
    }
    if !(template.width_mm > 0.0 && template.height_mm > 0.0) {
        return Err(EtlblError::Schema {
            file: "template.json".into(),
            message: "dimensões inválidas (widthMm/heightMm devem ser > 0)".into(),
        });
    }
    if !(template.orientation == "portrait" || template.orientation == "landscape") {
        return Err(EtlblError::Schema {
            file: "template.json".into(),
            message: format!("orientation inválida: `{}`", template.orientation),
        });
    }
    if template.canvas_json.version != 1 {
        return Err(EtlblError::Schema {
            file: "template.json".into(),
            message: format!(
                "canvas_json.version não suportada: {}",
                template.canvas_json.version
            ),
        });
    }
    if template.canvas_json.units != "mm" {
        return Err(EtlblError::Schema {
            file: "template.json".into(),
            message: format!(
                "canvas_json.units não suportada: `{}` (esperado `mm`)",
                template.canvas_json.units
            ),
        });
    }

    sanitize_images(&template.canvas_json)?;

    // Re-serializar canvas_json para a forma que o banco espera (string JSON).
    let canvas_json_str = serde_json::to_string(&template.canvas_json).map_err(|e| {
        EtlblError::Pack(format!("re-serializar canvas_json: {e}"))
    })?;

    let origin = template
        .origin_app_version
        .unwrap_or_else(|| manifest.app_version.clone());

    Ok(InspectResult {
        name: template.name,
        description: template.description,
        width_mm: template.width_mm,
        height_mm: template.height_mm,
        dpi: template.dpi,
        orientation: template.orientation,
        background_color: template.background_color,
        canvas_json: canvas_json_str,
        thumbnail_png: thumbnail_bytes,
        schema_version: manifest.schema_version,
        origin_app_version: origin,
    })
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut acc: u8 = 0;
    for (x, y) in a.iter().zip(b.iter()) {
        acc |= x ^ y;
    }
    acc == 0
}

// -------- Comandos Tauri --------

#[tauri::command]
pub fn etlbl_export(payload: ExportPayload) -> Result<String, EtlblError> {
    export_inner(payload)
}

#[tauri::command]
pub fn etlbl_inspect(file_path: String) -> Result<InspectResult, EtlblError> {
    inspect_inner(&file_path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fake_canvas_json(empty: bool) -> String {
        if empty {
            r#"{"version":1,"units":"mm","canvas":{"width":50,"height":30,"dpi":203,"background":"#FFFFFF"},"objects":[]}"#.into()
        } else {
            r#"{"version":1,"units":"mm","canvas":{"width":50,"height":30,"dpi":203,"background":"#FFFFFF"},"objects":[
                {"type":"text","id":"t1","x":1,"y":2,"content":"hello"}
            ]}"#.into()
        }
    }

    fn make_payload(out_path: &str) -> ExportPayload {
        ExportPayload {
            name: "Etiqueta A".into(),
            description: None,
            width_mm: 50.0,
            height_mm: 30.0,
            dpi: 203,
            orientation: "portrait".into(),
            background_color: Some("#FFFFFF".into()),
            canvas_json: fake_canvas_json(false),
            thumbnail_png: None,
            output_path: out_path.into(),
        }
    }

    #[test]
    fn round_trip_basic() {
        let tmp = std::env::temp_dir().join("etlbl_roundtrip.etlbl");
        let payload = make_payload(tmp.to_str().unwrap());
        let path = export_inner(payload).expect("export deveria suceder");
        assert!(std::path::Path::new(&path).exists());

        let bytes = std::fs::read(&path).unwrap();
        let inspect = parse_etlbl_bytes(&bytes).expect("inspect deveria suceder");
        assert_eq!(inspect.name, "Etiqueta A");
        assert_eq!(inspect.width_mm, 50.0);
        assert_eq!(inspect.orientation, "portrait");
        assert!(inspect.canvas_json.contains("\"hello\""));
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn rejects_extension() {
        let mut p = make_payload("/tmp/wrong.pdf");
        p.output_path = "/tmp/wrong.pdf".into();
        let err = export_inner(p).unwrap_err();
        assert!(matches!(err, EtlblError::InvalidExtension(_)));
    }

    #[test]
    fn rejects_empty_path() {
        let err = inspect_inner("").unwrap_err();
        assert!(matches!(err, EtlblError::EmptyPath));
    }

    #[test]
    fn detects_hash_mismatch() {
        let tmp = std::env::temp_dir().join("etlbl_hash.etlbl");
        let payload = make_payload(tmp.to_str().unwrap());
        export_inner(payload).unwrap();
        let bytes = std::fs::read(&tmp).unwrap();

        // Re-empacotar com um template.json alterado mas manifest velho.
        let mut archive = ZipArchive::new(Cursor::new(bytes)).unwrap();
        let mut out = Vec::new();
        {
            let mut writer = ZipWriter::new(Cursor::new(&mut out));
            let opts = FileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated);
            for i in 0..archive.len() {
                let mut entry = archive.by_index(i).unwrap();
                let name = entry.name().to_string();
                let mut buf = Vec::new();
                if !entry.is_dir() {
                    entry.read_to_end(&mut buf).unwrap();
                }
                writer.start_file(name.clone(), opts).unwrap();
                if name == "template.json" {
                    // Alterar o conteúdo invalida o hash.
                    let s = String::from_utf8(buf).unwrap()
                        .replace("Etiqueta A", "Etiqueta B");
                    writer.write_all(s.as_bytes()).unwrap();
                } else {
                    writer.write_all(&buf).unwrap();
                }
            }
            writer.finish().unwrap();
        }
        let err = parse_etlbl_bytes(&out).unwrap_err();
        assert!(matches!(err, EtlblError::HashMismatch));
        let _ = std::fs::remove_file(&tmp);
    }

    #[test]
    fn rejects_corrupted_zip() {
        let bytes = b"not a zip";
        let err = parse_etlbl_bytes(bytes).unwrap_err();
        assert!(matches!(err, EtlblError::Corrupted(_)));
    }

    #[test]
    fn rejects_schema_unknown_field() {
        // template.json com campo desconhecido → erro de schema mesmo com
        // hash recalculado certinho.
        let bogus_template = serde_json::json!({
            "name": "X",
            "widthMm": 50.0,
            "heightMm": 30.0,
            "dpi": 203,
            "orientation": "portrait",
            "canvasJson": serde_json::from_str::<serde_json::Value>(&fake_canvas_json(true)).unwrap(),
            "EVIL_FIELD": "boom",
        });
        let template_bytes = serde_json::to_vec(&bogus_template).unwrap();
        let hash = compute_content_hash(&template_bytes, &[]);
        let manifest = Manifest {
            schema_version: 1,
            app_version: "x".into(),
            hash,
            exported_at: None,
        };
        let manifest_bytes = serde_json::to_vec(&manifest).unwrap();

        let mut buf = Vec::new();
        {
            let mut writer = ZipWriter::new(Cursor::new(&mut buf));
            let opts = FileOptions::default().compression_method(zip::CompressionMethod::Deflated);
            writer.start_file("template.json", opts).unwrap();
            writer.write_all(&template_bytes).unwrap();
            writer.start_file("manifest.json", opts).unwrap();
            writer.write_all(&manifest_bytes).unwrap();
            writer.finish().unwrap();
        }
        let err = parse_etlbl_bytes(&buf).unwrap_err();
        assert!(matches!(err, EtlblError::Schema { .. }), "got {err:?}");
    }

    #[test]
    fn rejects_unsupported_schema_version() {
        let template = TemplateJson {
            name: "X".into(),
            description: None,
            width_mm: 50.0,
            height_mm: 30.0,
            dpi: 203,
            orientation: "portrait".into(),
            background_color: None,
            origin_app_version: None,
            canvas_json: serde_json::from_str(&fake_canvas_json(true)).unwrap(),
        };
        let template_bytes = serde_json::to_vec(&template).unwrap();
        let hash = compute_content_hash(&template_bytes, &[]);
        let manifest = Manifest {
            schema_version: 999,
            app_version: "x".into(),
            hash,
            exported_at: None,
        };
        let manifest_bytes = serde_json::to_vec(&manifest).unwrap();
        let mut buf = Vec::new();
        {
            let mut writer = ZipWriter::new(Cursor::new(&mut buf));
            let opts = FileOptions::default().compression_method(zip::CompressionMethod::Deflated);
            writer.start_file("template.json", opts).unwrap();
            writer.write_all(&template_bytes).unwrap();
            writer.start_file("manifest.json", opts).unwrap();
            writer.write_all(&manifest_bytes).unwrap();
            writer.finish().unwrap();
        }
        let err = parse_etlbl_bytes(&buf).unwrap_err();
        assert!(matches!(err, EtlblError::UnsupportedSchemaVersion { .. }));
    }

    #[test]
    fn rejects_bad_image_data_url() {
        // PNG com bytes inválidos depois do header → image::load_from_memory falha.
        let canvas_with_bad_image = serde_json::json!({
            "version": 1, "units": "mm",
            "canvas": { "width": 50.0, "height": 30.0, "dpi": 203 },
            "objects": [
                {
                    "type": "image",
                    "id": "i1",
                    "x": 0.0, "y": 0.0,
                    "src": "data:image/png;base64,iVBORw0K"  // truncado
                }
            ]
        });
        let cj_str = canvas_with_bad_image.to_string();
        let payload = ExportPayload {
            name: "X".into(),
            description: None,
            width_mm: 50.0,
            height_mm: 30.0,
            dpi: 203,
            orientation: "portrait".into(),
            background_color: None,
            canvas_json: cj_str,
            thumbnail_png: None,
            output_path: "/tmp/etlbl_bad_img.etlbl".into(),
        };
        let err = export_inner(payload).unwrap_err();
        assert!(matches!(err, EtlblError::ImageSanitization { .. }), "got {err:?}");
    }

    #[test]
    fn accepts_valid_png_data_url() {
        // PNG 1x1 transparente.
        const PNG_1X1: &[u8] = &[
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48,
            0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00,
            0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x44, 0x41, 0x54, 0x78,
            0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
            0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
        ];
        let b64 = BASE64_STANDARD.encode(PNG_1X1);
        let cj = format!(
            r#"{{"version":1,"units":"mm","canvas":{{"width":50,"height":30,"dpi":203}},"objects":[
                {{"type":"image","id":"i1","x":0,"y":0,"src":"data:image/png;base64,{}"}}
            ]}}"#,
            b64
        );
        let tmp = std::env::temp_dir().join("etlbl_png_ok.etlbl");
        let p = ExportPayload {
            name: "X".into(),
            description: None,
            width_mm: 50.0,
            height_mm: 30.0,
            dpi: 203,
            orientation: "portrait".into(),
            background_color: None,
            canvas_json: cj,
            thumbnail_png: None,
            output_path: tmp.to_str().unwrap().into(),
        };
        let path = export_inner(p).expect("export deveria suceder com PNG válido");
        let bytes = std::fs::read(&path).unwrap();
        parse_etlbl_bytes(&bytes).expect("inspect deveria validar PNG inline");
        let _ = std::fs::remove_file(&path);
    }
}
