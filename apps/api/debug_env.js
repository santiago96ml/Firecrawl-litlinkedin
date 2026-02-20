
const dotenv = require('dotenv');
const path = require('path');

console.log('CWD:', process.cwd());
dotenv.config();
console.log('LLM_PROVIDER (cwd):', process.env.LLM_PROVIDER);

// Try loading from root
const rootPath = path.resolve(process.cwd(), '../../.env');
console.log('Attempting to load from:', rootPath);
dotenv.config({ path: rootPath });
console.log('LLM_PROVIDER (root):', process.env.LLM_PROVIDER);
