import { randomBytes, createHash } from "node:crypto";
// Secret de 256 bits : la sécurité repose sur son entropie, pas sur un KDF
// coûteux incompatible avec le budget CPU de Workers Free.
const password = randomBytes(32).toString("base64url");
const hash = createHash("sha256").update(password).digest("hex");
console.log(
  "Mot de passe administrateur (à conserver dans votre gestionnaire) :",
);
console.log(password);
console.log("\nValeurs à copier dans .dev.vars ou les secrets Cloudflare :");
console.log(`ADMIN_PASSWORD_HASH="random256:${hash}"`);
console.log(`RATE_LIMIT_SECRET="${randomBytes(32).toString("hex")}"`);
console.log(
  "\nPour changer seulement le mot de passe, conserver le RATE_LIMIT_SECRET existant.",
);
