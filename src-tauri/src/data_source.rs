// Leitura de arquivos de fonte de dados (CSV/XLSX) para o wizard de
// importação (WP-12 / SPEC-07).
//
// Por que um comando Rust em vez de `@tauri-apps/plugin-fs`?
//
// O `tauri-plugin-fs` 2.x exige scope explícito por path para `readFile` /
// `readTextFile`. Como o caminho vem do diálogo nativo (qualquer pasta que o
// usuário tiver permissão no SO), declarar scope amplo no `capabilities`
// enfraqueceria a defesa em profundidade do app. Em vez disso, este comando
// dedicado:
//
//  1. Aceita apenas extensões `.csv`, `.txt`, `.xlsx`, `.xlsm` — qualquer
//     outra é rejeitada antes de tocar o disco.
//  2. Aplica um teto de tamanho (32 MB) — protege a UI contra carregar um
//     arquivo gigante por engano. Suficiente para >> 100 mil linhas de
//     planilha típica de etiquetas (PRD §6.1 cita 500 SKUs / lote).
//  3. Devolve os bytes crus; o parsing fica no frontend (papaparse / SheetJS).

use std::path::{Path, PathBuf};

const MAX_FILE_BYTES: u64 = 32 * 1024 * 1024;

#[derive(Debug, thiserror::Error)]
pub enum DataSourceError {
    #[error("Caminho de arquivo vazio.")]
    EmptyPath,
    #[error(
        "Formato de arquivo não suportado. Use CSV (.csv, .txt) ou Excel (.xlsx, .xlsm)."
    )]
    UnsupportedExtension,
    #[error("Arquivo muito grande (limite: {0} MB).")]
    TooLarge(u64),
    #[error("Não foi possível ler o arquivo: {0}")]
    Io(String),
}

impl serde::Serialize for DataSourceError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

fn extension_ok(path: &Path) -> bool {
    match path.extension().and_then(|e| e.to_str()) {
        Some(ext) => {
            let lower = ext.to_ascii_lowercase();
            matches!(lower.as_str(), "csv" | "txt" | "xlsx" | "xlsm")
        }
        None => false,
    }
}

/// Lê o arquivo escolhido pelo usuário no diálogo nativo. Devolve bytes para
/// o frontend parsear conforme a extensão.
#[tauri::command]
pub fn data_source_read(path: String) -> Result<Vec<u8>, DataSourceError> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err(DataSourceError::EmptyPath);
    }
    let pb = PathBuf::from(trimmed);
    if !extension_ok(&pb) {
        return Err(DataSourceError::UnsupportedExtension);
    }
    let metadata = std::fs::metadata(&pb).map_err(|e| DataSourceError::Io(e.to_string()))?;
    if metadata.len() > MAX_FILE_BYTES {
        return Err(DataSourceError::TooLarge(MAX_FILE_BYTES / (1024 * 1024)));
    }
    std::fs::read(&pb).map_err(|e| DataSourceError::Io(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty_path() {
        let err = data_source_read(String::new()).unwrap_err();
        assert!(matches!(err, DataSourceError::EmptyPath));
    }

    #[test]
    fn rejects_unsupported_extension() {
        let err = data_source_read("/tmp/file.pdf".into()).unwrap_err();
        assert!(matches!(err, DataSourceError::UnsupportedExtension));
    }

    #[test]
    fn accepts_csv_xlsx_extensions() {
        // Não chamamos o caminho real — apenas verificamos a função
        // `extension_ok` para isolar a checagem de extensão.
        assert!(extension_ok(Path::new("a.csv")));
        assert!(extension_ok(Path::new("a.CSV")));
        assert!(extension_ok(Path::new("a.txt")));
        assert!(extension_ok(Path::new("a.xlsx")));
        assert!(extension_ok(Path::new("a.xlsm")));
        assert!(!extension_ok(Path::new("a.tsv")));
        assert!(!extension_ok(Path::new("a")));
    }
}
