//! Sistema tipográfico — fontes do sistema (WP-06 / SPEC-05).
//!
//! Responsabilidade: enumerar as famílias de fontes instaladas no SO atual e
//! devolvê-las ao frontend para serem mescladas com o bundle (RF-F-01).
//!
//! Implementação: `font-kit` (crate da Servo Foundation) já cobre os três SOs
//! alvo do app — DirectWrite no Windows, Core Text no macOS e fontconfig no
//! Linux — sem precisar de `unsafe` ou bindings adicionais. Isso é mais
//! sustentável do que `rust-fontconfig` (que só cobre fontconfig nativamente
//! e exige bindings manuais para Win/macOS).
//!
//! Decisão (registrada em MEMORY.md):
//! - Devolvemos **somente os nomes** (PostScript name → família) deduplicados
//!   e ordenados alfabeticamente. O frontend precisa apenas listar; pesos e
//!   estilos são sintetizados pelo navegador em tempo de render (suficiente
//!   para o MVP — variantes nativas viram backlog).
//! - Em caso de erro raro do `font-kit` (sistema sem fontes registradas, o
//!   que ocorre em containers Linux mínimos), devolvemos `Ok(vec![])` ao
//!   invés de propagar — assim o frontend ainda consegue mostrar o bundle.

use std::collections::BTreeSet;

#[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
use font_kit::source::SystemSource;

/// Comando Tauri (RF-F-01). Retorna nomes de famílias instaladas no SO,
/// deduplicados e ordenados.
#[tauri::command]
pub fn fonts_list_system() -> Vec<String> {
    list_system_families().unwrap_or_default()
}

#[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
fn list_system_families() -> Option<Vec<String>> {
    let source = SystemSource::new();
    let families = source.all_families().ok()?;
    // `BTreeSet` deduplica e ordena alfabeticamente em uma passada.
    let unique: BTreeSet<String> = families.into_iter().collect();
    Some(unique.into_iter().collect())
}

// Fallback para alvos não suportados pelo `font-kit` (improvável em desktop
// mas mantém o cargo check verde em qualquer target).
#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
fn list_system_families() -> Option<Vec<String>> {
    Some(Vec::new())
}
