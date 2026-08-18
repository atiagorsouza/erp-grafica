import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  // Keep the starter on the flat config export that actually runs under the pinned ESLint/Next toolchain.
  ...nextCoreWebVitals,
  /* services/ são processos Node independentes (o serviço do WhatsApp
     roda fora do Next). As regras do React não se aplicam ali e geram
     falso positivo: `usePostgresAuthState` é uma função comum, mas o
     prefixo "use" faz a regra rules-of-hooks achar que é um Hook. */
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "services/**"]),
]);
