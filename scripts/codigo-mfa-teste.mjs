// Mostra o código de 6 dígitos (válido por ~30 s) da conta de teste "[Teste] Equipe OUZ".
// Uso: node scripts/codigo-mfa-teste.mjs   — somente desenvolvimento; lê contas-teste.local.txt.
import { readFileSync } from "node:fs";
import { totp } from "./lib/totp.mjs";

const secret = readFileSync("contas-teste.local.txt", "utf8").match(/Equipe OUZ[\s\S]*?mfa:\s*(\S+)/)?.[1];
if (!secret) throw new Error("Segredo MFA da conta de equipe não encontrado. Rode scripts/criar-contas-teste.mjs.");
const left = 30 - (Math.floor(Date.now() / 1000) % 30);
console.log(`Código: ${totp(secret)}  (vale por mais ${left} s)`);
