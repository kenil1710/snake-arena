/**
 * Extracts ABIs from the Foundry build output into typed `as const` modules.
 * Run `forge build --root contracts` first, then `pnpm generate:abis`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const forgeOut = path.resolve(webRoot, '../../contracts/out');
const abiDir = path.join(webRoot, 'lib/abis');

const contracts = [
  { artifact: 'SnakeArena.sol/SnakeArena.json', exportName: 'snakeArenaAbi', file: 'snakeArena.ts' },
  { artifact: 'PowerUpStore.sol/PowerUpStore.json', exportName: 'powerUpStoreAbi', file: 'powerUpStore.ts' },
];

mkdirSync(abiDir, { recursive: true });

for (const contract of contracts) {
  const artifactPath = path.join(forgeOut, contract.artifact);
  const { abi } = JSON.parse(readFileSync(artifactPath, 'utf8'));
  const source = [
    `// Auto-generated from contracts/out/${contract.artifact}.`,
    '// Do not edit by hand — regenerate with `pnpm generate:abis`.',
    '',
    `export const ${contract.exportName} = ${JSON.stringify(abi, null, 2)} as const;`,
    '',
  ].join('\n');
  writeFileSync(path.join(abiDir, contract.file), source);
  console.log(`wrote lib/abis/${contract.file} (${abi.length} ABI entries)`);
}
