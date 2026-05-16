/**
 * Configuração do i18next (WP-17 / SPEC-14 §"Comportamento esperado" item 2).
 *
 * O MVP entrega UI 100% em **PT-BR**. Mesmo assim, instalamos `i18next` +
 * `react-i18next` para que futuras línguas só precisem adicionar um arquivo
 * `locales/<lang>.json` e registrar no `resources` — nenhum call-site precisa
 * ser reescrito.
 *
 * Decisões:
 *  - **Bundle estático**: o catálogo é um JSON importado diretamente (sem
 *    `i18next-http-backend`). Mantém o app offline-first (auditoria do bundle
 *    do SPEC-01) e elimina a dependência de rede.
 *  - **`returnNull: false`**: chaves ausentes caem para a própria chave (em
 *    vez de retornar `null`), evitando `Cannot read of null` em componentes
 *    durante desenvolvimento de novas telas.
 *  - **`fallbackLng: "pt-BR"`**: única língua suportada por enquanto; serve
 *    de fallback explícito caso o `language` do `navigator` venha como `pt`
 *    ou `pt-PT`.
 *  - **Inicialização síncrona**: chamamos `i18n.init(...)` antes do
 *    `ReactDOM.render`. Como o backend é estático, não há promessa
 *    pendente — UI nunca pisca em texto bruto da chave.
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import ptBR from "./locales/pt-BR.json";

export const DEFAULT_LANGUAGE = "pt-BR";

export const SUPPORTED_LANGUAGES = ["pt-BR"] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/**
 * Inicializa a instância global do i18next. Deve ser chamado **uma única vez**
 * no bootstrap do frontend (`main.tsx`), antes de qualquer render React.
 */
export function initI18n(): typeof i18n {
  if (i18n.isInitialized) return i18n;
  void i18n.use(initReactI18next).init({
    resources: {
      "pt-BR": { translation: ptBR },
    },
    lng: DEFAULT_LANGUAGE,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
    interpolation: {
      // React já escapa por padrão.
      escapeValue: false,
    },
    returnNull: false,
    debug: false,
  });
  return i18n;
}

export default i18n;
