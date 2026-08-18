/**
 * Versionamento do PrintFlow ERP.
 *
 * Fonte da verdade do número de versão: arquivo `VERSION` na raiz do projeto.
 * O script `scripts/check-version.mjs` valida em CI/install/update que
 * este arquivo e o `VERSION` estão sincronizados.
 *
 * Regra de versionamento (semver):
 *   MAJOR — mudança de estrutura de dados incompatível (migração obrigatória)
 *   MINOR — nova funcionalidade de módulo (atualização com `scripts/update.sh`)
 *   PATCH — correção de bug (atualização com `scripts/update.sh`)
 */
export const APP_VERSION = "3.45.1";
export const APP_RELEASE = "Quadro Confiável";
export const APP_CHANNEL = "stable";
export const APP_REPO = "atiagorsouza/erp-grafica";
export const APP_LABEL = `v${APP_VERSION} · ${APP_RELEASE}`;
