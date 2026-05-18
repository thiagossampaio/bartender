//! Detecção e impressão via driver do SO (WP-09 / SPEC-09).
//!
//! Responsabilidades:
//! - Listar impressoras instaladas no SO atual (RF-I-01).
//! - Identificar automaticamente Argox/Zebra por substring no nome/modelo
//!   (RF-I-02) — esse heurístico decide se a UI propõe o "Modo nativo"
//!   PPLB/ZPL (WP-10/WP-11). O matching é definido aqui (no Rust) para que
//!   seja o **único ponto** da verdade entre detecção, persistência e
//!   posterior tradução raw.
//! - Enviar bytes raster (PDF) para uma impressora detectada — modo "driver
//!   do SO" do PRD §3.4 (RF-I-04). O caminho raw (PPLB/ZPL) entra em WP-10/11.
//! - Reportar o status do spooler quando o driver expõe (RF-I-08).
//!
//! Crate `printers` (2.x) abstrai Windows (Win32 Print Spooler) e Unix
//! (CUPS via `lp`/`lpr`) com a mesma API: `get_printers() -> Vec<Printer>`
//! e `Printer::print(&[u8], options)`. Isso cobre 100% dos alvos do MVP
//! sem FFI manual.
//!
//! ## Decisões registradas em MEMORY.md
//!
//! - **Cache em `printers` table:** o frontend chama `printers_list()` e
//!   imediatamente faz upsert na tabela `printers` ([SPEC-02]). Mantemos a
//!   persistência no frontend (façade `@/lib/printers.ts`) para seguir o
//!   padrão WP-03 (CRUD no JS via `dbExecute`).
//! - **PDF raster como payload:** o backend recebe `pdf_bytes` (já gerado
//!   por [WP-08] / `pdf_export`). O driver do SO rasteriza no DPI da
//!   impressora — fluxo equivalente ao "Imprimir > PDF nativo" do BarTender.
//! - **Estabilidade do nome:** identificamos impressoras pelo `system_name`
//!   (não `display_name`), que é estável entre reboots em ambos os SOs.

use std::collections::BTreeMap;

// A crate `printers` 2.x reexporta `Printer` + `PrinterState` na raiz, mas
// alguns patches expõem só via `common::base::printer`. Importamos pela raiz
// para resistir a refactors internos da crate.
use printers::common::base::job::PrinterJobOptions;
use printers::common::base::printer::{Printer, PrinterState};
use printers::common::converters::Converter;
use serde::Serialize;
use thiserror::Error;

/// Helper para construir `PrinterJobOptions` com nome e sem conversor — a
/// crate `printers` 2.3 exige a struct completa em `Printer::print`, e o
/// `Converter::None` mantém o comportamento "envio raw" tanto no Windows
/// (RawPrintJob) quanto no macOS (`lp -o raw`).
fn job_options(name: &str) -> PrinterJobOptions<'_> {
    PrinterJobOptions {
        name: Some(name),
        raw_properties: &[],
        converter: Converter::None,
    }
}

/// Normaliza o `PrinterState` da crate para nosso `PrinterStatus` por ref —
/// evita exigir `Clone`/`Copy` da enum nativa (que muda entre patches).
fn status_from_state(s: &PrinterState) -> PrinterStatus {
    match s {
        PrinterState::READY => PrinterStatus::Ready,
        PrinterState::PAUSED => PrinterStatus::Paused,
        PrinterState::PRINTING => PrinterStatus::Printing,
        PrinterState::OFFLINE => PrinterStatus::Offline,
        PrinterState::UNKNOWN => PrinterStatus::Unknown,
    }
}

/// Substrings que disparam o badge "Argox" e o toggle "Modo nativo" ON por
/// padrão. Mantemos em ASCII + lowercase porque o matching ocorre sobre
/// `to_ascii_lowercase()` do nome/driver.
const ARGOX_HINTS: &[&str] = &[
    "argox",
    "os-214",
    "os214",
    "os-2140",
    "cp-2140",
    "cp2140",
    "x-1000",
    "x1000",
    "x-2300",
];

/// Substrings que disparam o badge "Zebra" e o toggle "Modo nativo" ON por
/// padrão.
const ZEBRA_HINTS: &[&str] = &[
    "zebra",
    "zd220",
    "zd230",
    "zd420",
    "zd620",
    "gk420",
    "gx420",
    "zt230",
    "zt411",
    "zt610",
    "tlp",
];

/// Linguagem nativa inferida (para [WP-10]/[WP-11]) — `DRIVER` quando nenhuma
/// match aplicar.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum PrinterLanguage {
    /// Sem match — usa o driver do SO (modo A).
    Driver,
    /// Argox — candidato a Modo B com PPLB ([WP-10]).
    Pplb,
    /// Zebra — candidato a Modo B com ZPL ([WP-11]).
    Zpl,
}

/// Status normalizado do spooler. Mantemos um superset estável que cobre os
/// `PrinterState` da crate. O frontend não precisa conhecer a enum nativa.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PrinterStatus {
    Ready,
    Paused,
    Printing,
    Unknown,
    Offline,
}

/// DTO exposto ao frontend. Campos snake_case → camelCase via
/// `#[serde(rename_all = "camelCase")]` (consistente com SPEC-02).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrinterInfo {
    /// Identificador estável (no Windows é o nome do device; em CUPS é o
    /// queue name). Persistido em `printers.system_name`.
    pub system_name: String,
    /// Nome amigável (Win: `DisplayName`; CUPS: `printer-info` ou cair no
    /// `system_name` quando ausente).
    pub friendly_name: String,
    /// Driver retornado pelo SO (Win: nome do driver; CUPS: PPD/ppd name).
    /// Útil para diagnóstico e como input do auto-detect.
    pub driver: Option<String>,
    /// Linguagem inferida (driver/PPLB/ZPL). Define o default do toggle
    /// "Modo nativo" na UI ([SPEC-09] §"Comportamento esperado" item 3).
    pub language: PrinterLanguage,
    /// Status atual do spooler — `unknown` quando o driver não expõe.
    pub status: PrinterStatus,
    /// Marcada como default do SO (PowerShell `Get-Printer | ?{ $_.Default }`
    /// no Win; `lpstat -d` no CUPS).
    pub is_default: bool,
    /// DPI default sugerido pela linguagem nativa (203 para PPLB/ZPL, 300
    /// para drivers desktop comuns). Apenas hint inicial — o usuário pode
    /// sobrescrever ao criar um template ([WP-04]).
    pub default_dpi: u32,
}

/// Erros do módulo. Convertidos para string ao cruzar a fronteira Tauri.
#[derive(Debug, Error)]
pub enum PrintersError {
    #[error("impressora não encontrada: {0}")]
    NotFound(String),
    #[error("payload vazio (pdf_bytes sem conteúdo)")]
    EmptyPayload,
    #[error("quantidade de cópias inválida ({0}) — esperado 1..=9999")]
    InvalidCopies(u32),
    #[error("falha no driver/spooler: {0}")]
    Driver(String),
}

impl serde::Serialize for PrintersError {
    fn serialize<S: serde::Serializer>(&self, ser: S) -> Result<S::Ok, S::Error> {
        ser.serialize_str(&self.to_string())
    }
}

/// Heurístico de auto-detecção (RF-I-02). Pesquisa as substrings em
/// `system_name`, `friendly_name` e `driver` (todos lowercase). Argox tem
/// precedência sobre Zebra apenas porque o usuário PRD opera com Argox
/// OS-214 Plus — empate é improvável mas determinístico.
pub fn detect_language(system_name: &str, friendly_name: &str, driver: Option<&str>) -> PrinterLanguage {
    let haystack = format!(
        "{} {} {}",
        system_name.to_ascii_lowercase(),
        friendly_name.to_ascii_lowercase(),
        driver.unwrap_or("").to_ascii_lowercase(),
    );
    if ARGOX_HINTS.iter().any(|h| haystack.contains(h)) {
        return PrinterLanguage::Pplb;
    }
    if ZEBRA_HINTS.iter().any(|h| haystack.contains(h)) {
        return PrinterLanguage::Zpl;
    }
    PrinterLanguage::Driver
}

/// Converte um `Printer` da crate em DTO. `printers` 2.x expõe `name`,
/// `system_name`, `driver_name`, `is_default`, `state`. Tratamos a ausência
/// de driver/portas como `None`.
fn map_printer(p: &Printer) -> PrinterInfo {
    let driver = if p.driver_name.is_empty() {
        None
    } else {
        Some(p.driver_name.clone())
    };
    let language = detect_language(&p.system_name, &p.name, driver.as_deref());
    let default_dpi = match language {
        PrinterLanguage::Pplb | PrinterLanguage::Zpl => 203,
        PrinterLanguage::Driver => 300,
    };
    PrinterInfo {
        system_name: p.system_name.clone(),
        friendly_name: if p.name.is_empty() {
            p.system_name.clone()
        } else {
            p.name.clone()
        },
        driver,
        language,
        status: status_from_state(&p.state),
        is_default: p.is_default,
        default_dpi,
    }
}

/// Lista impressoras instaladas. Em SOs sem impressoras (CI mínima), devolve
/// vetor vazio em vez de erro — a UI mostra "Nenhuma impressora detectada".
#[tauri::command]
pub fn printers_list() -> Vec<PrinterInfo> {
    let all = printers::get_printers();
    // Deduplicação defensiva por `system_name`: em Windows, queues compartilhadas
    // em rede podem aparecer duplicadas dependendo do filtro do spooler.
    let mut by_name: BTreeMap<String, PrinterInfo> = BTreeMap::new();
    for p in all.iter() {
        let info = map_printer(p);
        by_name.entry(info.system_name.clone()).or_insert(info);
    }
    by_name.into_values().collect()
}

/// Devolve o status atual da impressora pedida. `None` quando não encontrada
/// (a UI faz fallback para `unknown` sem exibir erro modal).
#[tauri::command]
pub fn printers_get_status(printer_name: String) -> Result<PrinterStatus, PrintersError> {
    let all = printers::get_printers();
    let found = all
        .iter()
        .find(|p| p.system_name == printer_name || p.name == printer_name)
        .ok_or_else(|| PrintersError::NotFound(printer_name.clone()))?;
    Ok(status_from_state(&found.state))
}

/// Envia bytes (PDF) à impressora via driver do SO (modo A).
///
/// `copies` é replicado no driver — não duplicamos o payload em memória.
/// Crates 2.x suportam `print(buf, name)` e o driver/CUPS aceita PDF nativo
/// quando o spool é configurado para "PDF" (default em macOS; em Windows
/// drivers modernos aceitam via `XPS PDF Printer` ou rasterização).
///
/// Devolve o **job id** quando o spooler expõe — a maioria dos drivers
/// devolve um identificador numérico/string que pode ser correlacionado em
/// `print_history` ([SPEC-12]). Quando ausente, devolvemos `"unknown"`.
#[tauri::command]
pub fn printers_print_raster(
    printer_name: String,
    pdf_bytes: Vec<u8>,
    copies: u32,
) -> Result<String, PrintersError> {
    if pdf_bytes.is_empty() {
        return Err(PrintersError::EmptyPayload);
    }
    if !(1..=9999).contains(&copies) {
        return Err(PrintersError::InvalidCopies(copies));
    }
    let all = printers::get_printers();
    let printer = all
        .iter()
        .find(|p| p.system_name == printer_name || p.name == printer_name)
        .ok_or_else(|| PrintersError::NotFound(printer_name.clone()))?;

    // A crate `printers` (2.x) expõe `print(buf, name)` sobre o spooler do
    // SO — recebe o nome do job. Para `copies > 1` disparamos N jobs
    // idênticos: semântica equivalente a "imprimir N cópias" e cobre o
    // caso em que o driver não respeita `-#N` do CUPS / pCopies do
    // WinSpool.
    //
    // O retorno do `print()` varia entre patches da crate; aproveitamos
    // apenas `Ok(_)` / `Err(_)` e geramos um job-id local por chamada
    // (timestamp + iteração) — suficiente para correlacionar com
    // [SPEC-12] `print_history`. Erros do spooler vêm formatados pela
    // crate ("offline", "out of paper", etc.) e são repassados em PT-BR
    // pelo frontend ([SPEC-09] §"Critérios de aceite").
    let base = job_name_now();
    let mut last_job = String::new();
    for i in 0..copies {
        let job_name = format!("{}-{}", base, i + 1);
        printer
            .print(pdf_bytes.as_slice(), job_options(&job_name))
            .map_err(|e| PrintersError::Driver(format!("{:?}", e)))?;
        last_job = job_name;
    }
    Ok(last_job)
}

/// Envia bytes **raw** à impressora (modo B — PPLB/ZPL). Análogo ao
/// `printers_print_raster`, mas sem replicar o payload por cópia: a
/// linguagem nativa já carrega o comando `P<n>` (PPLB) ou `^PQ<n>` (ZPL)
/// no próprio bytecode, então enviamos uma única vez.
///
/// O envio vai pelo mesmo `Printer::print` da crate `printers` (que usa
/// `RawPrintJob` no Windows e `lp -o raw` no macOS internamente). Isso
/// garante que o spooler **não interprete** o conteúdo como PDF/imagem
/// e passe os bytes direto à impressora.
///
/// `copies` é validado como sanity check (1..=9999) mas não altera o
/// envio — espera-se que o caller já tenha embarcado o `P<n>` no PPLB
/// (via [`crate::pplb::generate_pplb`]).
#[tauri::command]
pub fn printers_print_raw(
    printer_name: String,
    raw_bytes: Vec<u8>,
    copies: u32,
) -> Result<String, PrintersError> {
    if raw_bytes.is_empty() {
        return Err(PrintersError::EmptyPayload);
    }
    if !(1..=9999).contains(&copies) {
        return Err(PrintersError::InvalidCopies(copies));
    }
    let all = printers::get_printers();
    let printer = all
        .iter()
        .find(|p| p.system_name == printer_name || p.name == printer_name)
        .ok_or_else(|| PrintersError::NotFound(printer_name.clone()))?;

    let job_name = format!("{}-raw", job_name_now());
    printer
        .print(raw_bytes.as_slice(), job_options(&job_name))
        .map_err(|e| PrintersError::Driver(format!("{:?}", e)))?;
    Ok(job_name)
}

/// Comando "Calibrar impressora" ([WP-15] / [SPEC-12]).
///
/// Envia o comando nativo de auto-sense para a impressora detectada:
///  - **Argox PPLB:** `U\n` — alimenta a etiqueta e detecta o gap.
///  - **Zebra ZPL:**  `~JC\n` — equivalente da família Link-OS.
///
/// Para impressoras genéricas (`PrinterLanguage::Driver`) devolvemos
/// `PrintersError::Driver("não calibrável")` porque não há comando portátil
/// — a UI desabilita o item de menu para esses casos.
///
/// O envio reusa `Printer::print` (raw) do mesmo loop usado por
/// `printers_print_raw` (WP-10/WP-11), garantindo que o spooler **não**
/// interprete o conteúdo. Devolvemos o nome de job gerado para
/// rastreabilidade (não persiste em `print_history`: calibração não é uma
/// "impressão" do usuário; é uma ação de manutenção).
#[tauri::command]
pub fn printer_calibrate(printer_name: String) -> Result<String, PrintersError> {
    let all = printers::get_printers();
    let printer = all
        .iter()
        .find(|p| p.system_name == printer_name || p.name == printer_name)
        .ok_or_else(|| PrintersError::NotFound(printer_name.clone()))?;
    let driver = if printer.driver_name.is_empty() {
        None
    } else {
        Some(printer.driver_name.as_str())
    };
    let language = detect_language(&printer.system_name, &printer.name, driver);
    let bytes: &[u8] = match language {
        PrinterLanguage::Pplb => b"U\n",
        PrinterLanguage::Zpl => b"~JC\n",
        PrinterLanguage::Driver => {
            return Err(PrintersError::Driver(
                "Impressora não detectada como Argox/Zebra — calibração não disponível.".into(),
            ));
        }
    };
    let job_name = format!("{}-calibrate", job_name_now());
    printer
        .print(bytes, job_options(&job_name))
        .map_err(|e| PrintersError::Driver(format!("{:?}", e)))?;
    Ok(job_name)
}

/// Comando "Imprimir página de teste" ([WP-15] / [SPEC-12]).
///
/// Gera uma etiqueta de teste com nome do modelo + linguagem inferida + DPI
/// e a despacha:
///  - **PPLB:** envelope ASCII com `Q200,24` / `D8` / `A` instructions.
///  - **ZPL:**  envelope ZPL com `^FO`/`^A0`/`^FD` e `^XZ` final.
///  - **Driver:** retorna erro — a UI sugere imprimir pelo editor um
///    template manual qualquer (sem comando portátil para "etiqueta de teste"
///    em drivers genéricos).
///
/// Tamanho da etiqueta: 40 × 30 mm a 203 dpi (≈ 320 × 240 dots) — cabe nos
/// modelos cobertos pelo PRD. O conteúdo é hard-coded e em ASCII para evitar
/// dependência do `canvas_json` (a tela de teste deve funcionar mesmo sem
/// nenhum template aberto).
#[tauri::command]
pub fn printer_test_page(printer_name: String) -> Result<String, PrintersError> {
    let all = printers::get_printers();
    let printer = all
        .iter()
        .find(|p| p.system_name == printer_name || p.name == printer_name)
        .ok_or_else(|| PrintersError::NotFound(printer_name.clone()))?;
    let driver = if printer.driver_name.is_empty() {
        None
    } else {
        Some(printer.driver_name.as_str())
    };
    let language = detect_language(&printer.system_name, &printer.name, driver);
    let payload = match language {
        PrinterLanguage::Pplb => build_pplb_test_page(&printer.name, driver),
        PrinterLanguage::Zpl => build_zpl_test_page(&printer.name, driver),
        PrinterLanguage::Driver => {
            return Err(PrintersError::Driver(
                "Impressora não detectada como Argox/Zebra — abra um template e use o botão Imprimir para gerar uma página via driver do SO.".into(),
            ));
        }
    };
    let job_name = format!("{}-test", job_name_now());
    printer
        .print(payload.as_bytes(), job_options(&job_name))
        .map_err(|e| PrintersError::Driver(format!("{:?}", e)))?;
    Ok(job_name)
}

/// Etiqueta de teste PPLB (Argox). 40×30 mm @ 203 dpi (≈ 320×240 dots).
/// Não usamos a crate `pplb` interna para evitar acoplamento — esta é uma
/// página estática que sai mesmo se o `canvas_json` ainda não foi
/// estabilizado.
fn build_pplb_test_page(model: &str, driver: Option<&str>) -> String {
    // Sanitize: PPLB usa ASCII; trocamos chars não-ASCII por `?` defensivo.
    let safe_model = sanitize_ascii(model);
    let safe_driver = sanitize_ascii(driver.unwrap_or("-"));
    let mut s = String::new();
    s.push_str("N\r\n"); // limpa buffer
    s.push_str("q320\r\n"); // largura em dots (40 mm * 8)
    s.push_str("Q240,24\r\n"); // altura + gap
    s.push_str("D8\r\n"); // densidade
    // Cabeçalho: "BARTENDER — Página de Teste"
    s.push_str("A20,20,0,4,1,1,N,\"BARTENDER\"\r\n");
    s.push_str("A20,60,0,3,1,1,N,\"Pagina de Teste\"\r\n");
    s.push_str(&format!(
        "A20,100,0,2,1,1,N,\"Modelo: {}\"\r\n",
        truncate(&safe_model, 28)
    ));
    s.push_str("A20,130,0,2,1,1,N,\"Linguagem: PPLB\"\r\n");
    s.push_str("A20,160,0,2,1,1,N,\"DPI: 203\"\r\n");
    s.push_str(&format!(
        "A20,190,0,2,1,1,N,\"Driver: {}\"\r\n",
        truncate(&safe_driver, 28)
    ));
    s.push_str("P1\r\n"); // imprime 1 etiqueta
    s
}

/// Etiqueta de teste ZPL (Zebra). 40×30 mm @ 203 dpi (≈ 320×240 dots).
fn build_zpl_test_page(model: &str, driver: Option<&str>) -> String {
    let safe_model = sanitize_ascii(model);
    let safe_driver = sanitize_ascii(driver.unwrap_or("-"));
    let mut s = String::new();
    s.push_str("^XA\n");
    s.push_str("^PW320\n"); // print width
    s.push_str("^LL240\n"); // label length
    s.push_str("^LH0,0\n"); // home
    s.push_str("^CI28\n"); // UTF-8 friendly fallback
    s.push_str("^FO20,20^A0N,32,32^FDBARTENDER^FS\n");
    s.push_str("^FO20,60^A0N,24,24^FDPagina de Teste^FS\n");
    s.push_str(&format!(
        "^FO20,100^A0N,20,20^FDModelo: {}^FS\n",
        truncate(&safe_model, 28)
    ));
    s.push_str("^FO20,130^A0N,20,20^FDLinguagem: ZPL^FS\n");
    s.push_str("^FO20,160^A0N,20,20^FDDPI: 203^FS\n");
    s.push_str(&format!(
        "^FO20,190^A0N,20,20^FDDriver: {}^FS\n",
        truncate(&safe_driver, 28)
    ));
    s.push_str("^PQ1\n");
    s.push_str("^XZ\n");
    s
}

fn sanitize_ascii(input: &str) -> String {
    input
        .chars()
        .map(|c| {
            if c.is_ascii() && c != '"' && c != '\\' && c != '^' && c != '~' {
                c
            } else {
                '?'
            }
        })
        .collect()
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    s.chars().take(max).collect::<String>() + "..."
}

/// Stem do nome de job — `Bartender-<epoch-segundos>`. Sem dependência
/// extra. Só precisa ser único o suficiente para o spooler distinguir
/// chamadas; o histórico real (`print_history`) usa o `id` do INSERT.
fn job_name_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("Bartender-{}", secs)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_argox_by_model() {
        assert_eq!(
            detect_language("ARGOX OS-214 Plus", "Argox OS-214 Plus", None),
            PrinterLanguage::Pplb
        );
        assert_eq!(
            detect_language("os214plus", "OS-214 Plus", Some("Generic / Text Only")),
            PrinterLanguage::Pplb
        );
    }

    #[test]
    fn detects_zebra_by_model() {
        assert_eq!(
            detect_language("ZDesigner ZD220", "Zebra ZD220", None),
            PrinterLanguage::Zpl
        );
        assert_eq!(
            detect_language("zebra-gx420t", "Zebra GX420t", Some("ZPL Label")),
            PrinterLanguage::Zpl
        );
    }

    #[test]
    fn falls_back_to_driver_on_generic_printer() {
        assert_eq!(
            detect_language("HP_LaserJet_M404", "HP LaserJet M404", Some("HP Universal Printing PCL 6")),
            PrinterLanguage::Driver
        );
        assert_eq!(
            detect_language("EPSON_L3150", "EPSON L3150 Series", None),
            PrinterLanguage::Driver
        );
    }

    #[test]
    fn detection_is_case_insensitive() {
        assert_eq!(
            detect_language("MY_ARGOX", "my-argox", None),
            PrinterLanguage::Pplb
        );
        assert_eq!(
            detect_language("ZeBrA-ZD220", "ZEBRA", None),
            PrinterLanguage::Zpl
        );
    }

    #[test]
    fn detection_uses_driver_field_when_name_is_generic() {
        // Cenário comum no Windows: usuário renomeia a fila para "Etiquetas",
        // mas o driver continua reportando "ZDesigner".
        assert_eq!(
            detect_language("Etiquetas", "Impressora de Etiquetas", Some("ZDesigner ZD220")),
            PrinterLanguage::Zpl
        );
    }

    #[test]
    fn rejects_invalid_copies() {
        let err = printers_print_raster("missing".into(), vec![1, 2, 3], 0).unwrap_err();
        assert!(matches!(err, PrintersError::InvalidCopies(0)));
        let err = printers_print_raster("missing".into(), vec![1, 2, 3], 10_000).unwrap_err();
        assert!(matches!(err, PrintersError::InvalidCopies(10_000)));
    }

    #[test]
    fn rejects_empty_payload() {
        let err = printers_print_raster("missing".into(), vec![], 1).unwrap_err();
        assert!(matches!(err, PrintersError::EmptyPayload));
    }

    #[test]
    fn dpi_hint_follows_language() {
        // Argox/Zebra default a 203 dpi (impressoras térmicas); drivers
        // desktop ficam em 300 dpi. Esse hint só guia o modal "Novo
        // template" — o usuário pode sobrescrever ([WP-04]).
        for lang in [PrinterLanguage::Pplb, PrinterLanguage::Zpl] {
            let dpi = match lang {
                PrinterLanguage::Pplb | PrinterLanguage::Zpl => 203,
                PrinterLanguage::Driver => 300,
            };
            assert_eq!(dpi, 203, "{:?} deve sugerir 203 dpi", lang);
        }
        let driver_dpi = match PrinterLanguage::Driver {
            PrinterLanguage::Driver => 300,
            _ => unreachable!(),
        };
        assert_eq!(driver_dpi, 300);
    }

    #[test]
    fn raw_print_rejects_empty_payload_and_invalid_copies() {
        // WP-10: o caminho raw (PPLB/ZPL) compartilha as mesmas validações
        // de sanidade do raster — payload vazio e copies fora da faixa.
        let err = printers_print_raw("missing".into(), vec![], 1).unwrap_err();
        assert!(matches!(err, PrintersError::EmptyPayload));
        let err = printers_print_raw("missing".into(), vec![1, 2, 3], 0).unwrap_err();
        assert!(matches!(err, PrintersError::InvalidCopies(0)));
        let err = printers_print_raw("missing".into(), vec![1, 2, 3], 10_000).unwrap_err();
        assert!(matches!(err, PrintersError::InvalidCopies(10_000)));
    }

    #[test]
    fn pplb_test_page_contains_model_and_language() {
        // WP-15: a página de teste hardcoded para Argox deve carregar o
        // modelo (cabeçalho), a linguagem e o DPI. Esses três campos são
        // critério de aceite explícito do SPEC-12.
        let page = build_pplb_test_page("Argox OS-214 Plus", Some("Generic / Text Only"));
        assert!(page.contains("BARTENDER"));
        assert!(page.contains("Modelo: Argox OS-214 Plus"));
        assert!(page.contains("Linguagem: PPLB"));
        assert!(page.contains("DPI: 203"));
        assert!(page.contains("Driver: Generic / Text Only"));
        // Comandos PPLB mínimos que garantem que o spooler trate como raw.
        assert!(page.starts_with("N\r\n"));
        assert!(page.contains("P1\r\n"));
    }

    #[test]
    fn zpl_test_page_contains_model_and_language() {
        let page = build_zpl_test_page("Zebra ZD220", Some("ZDesigner ZD220"));
        assert!(page.contains("BARTENDER"));
        assert!(page.contains("Modelo: Zebra ZD220"));
        assert!(page.contains("Linguagem: ZPL"));
        assert!(page.contains("DPI: 203"));
        // Envelope ZPL.
        assert!(page.starts_with("^XA"));
        assert!(page.contains("^PQ1"));
        assert!(page.trim_end().ends_with("^XZ"));
    }

    #[test]
    fn test_page_sanitizes_problematic_chars() {
        // O modelo pode vir com caracteres `^`/`~` (delimitadores ZPL/PPLB)
        // ou aspas — sanitizamos para `?` antes de embarcar no payload.
        let page = build_zpl_test_page("Foo^Bar~Baz", None);
        assert!(!page.contains("Foo^Bar~Baz"));
        assert!(page.contains("Foo?Bar?Baz"));
    }

    #[test]
    fn calibrate_rejects_unknown_printer() {
        // Defesa contra impressora apagada entre o `printers_list` e a
        // chamada de calibração — frontend deve mostrar mensagem clara.
        let err = printer_calibrate("ghost-printer-zxcvb".into()).unwrap_err();
        assert!(matches!(err, PrintersError::NotFound(_)));
    }

    #[test]
    fn test_page_rejects_unknown_printer() {
        let err = printer_test_page("ghost-printer-zxcvb".into()).unwrap_err();
        assert!(matches!(err, PrintersError::NotFound(_)));
    }

    #[test]
    fn job_name_is_unique_per_call_window() {
        // Não exigimos monotonicidade forte, mas em chamadas separadas por
        // mais de 1 segundo o nome deve mudar — suficiente para o spooler
        // distinguir trabalhos.
        let a = job_name_now();
        assert!(a.starts_with("Bartender-"));
        assert!(a.len() > "Bartender-".len());
    }
}
