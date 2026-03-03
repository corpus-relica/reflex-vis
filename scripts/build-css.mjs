import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'src/styles/index.css'), 'utf8');
const out = `// AUTO-GENERATED from src/styles/index.css — do not edit directly.\nexport default ${JSON.stringify(css)};\n`;
writeFileSync(join(root, 'src/styles/generated.ts'), out, 'utf8');
