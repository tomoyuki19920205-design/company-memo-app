import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { assertProductionRequiredAncestry } from './required-production-ancestry.mjs';

console.log('--- Vercel Deployment Guard ---');

// 1. Check Git Root directory name
const cwd = process.cwd();
const dirName = path.basename(cwd);
if (dirName !== 'company-memo-app') {
    console.error(`[STOP] Execute this script from 'company-memo-app' directory. Current: ${dirName}`);
    process.exit(1);
}
if (!fs.existsSync(path.join(cwd, '.git'))) {
    console.error(`[STOP] Not a git repository.`);
    process.exit(1);
}
console.log('✅ Git root directory is company-memo-app');

// 2. Check Git Remote
try {
    const remotes = execSync('git remote -v', { encoding: 'utf-8' });
    if (!remotes.includes('company-memo-app.git')) {
        console.error(`[STOP] Git remote does not contain 'company-memo-app.git'.`);
        process.exit(1);
    }
    console.log('✅ Git remote is correct');
} catch (e) {
    console.error(`[STOP] Failed to check git remotes.`, e.message);
    process.exit(1);
}

// 3. Check Vercel project.json
const vercelConfigPath = path.join(cwd, '.vercel', 'project.json');
if (!fs.existsSync(vercelConfigPath)) {
    console.error(`[STOP] .vercel/project.json not found.`);
    process.exit(1);
}

let vercelConfig;
try {
    const raw = fs.readFileSync(vercelConfigPath, 'utf-8');
    
    // Explicit forbidden check for web-psi...
    if (raw.includes('web-psi-six-68') || raw.includes('web-psi') || raw.match(/web-/)) {
         console.error(`[STOP] FORBIDDEN VERCEL PROJECT DETECTED: 'web-psi-six-68', 'web-psi', or 'web-' found in project.json!`);
         process.exit(1);
    }
    
    vercelConfig = JSON.parse(raw);
} catch (e) {
    console.error(`[STOP] Failed to read .vercel/project.json.`, e.message);
    process.exit(1);
}

const REQUIRED_PROJECT_ID = 'prj_GwU7C3maWs9p3OnyAw8MNTscaVbQ';
const REQUIRED_PROJECT_NAME = 'company-memo-app';

if (vercelConfig.projectId !== REQUIRED_PROJECT_ID) {
    console.error(`[STOP] Invalid Vercel projectId: ${vercelConfig.projectId} (Expected: ${REQUIRED_PROJECT_ID})`);
    process.exit(1);
}
console.log('✅ Vercel projectId is correct');

if (vercelConfig.projectName !== REQUIRED_PROJECT_NAME) {
    console.error(`[STOP] Invalid Vercel projectName: ${vercelConfig.projectName} (Expected: ${REQUIRED_PROJECT_NAME})`);
    process.exit(1);
}
console.log('✅ Vercel projectName is correct');

// 4. Refuse production deploys from a tree missing known-good Viewer lineage.
try {
    const { head, requirements } = assertProductionRequiredAncestry();
    console.log(`✅ Required production ancestry is present (${requirements.length} commits, HEAD ${head})`);
} catch (e) {
    console.error(e.message);
    process.exit(1);
}

console.log('--- ALL CHECKS PASSED. DEPLOYMENT ALLOWED ---');
