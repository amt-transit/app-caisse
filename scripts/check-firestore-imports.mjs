#!/usr/bin/env node
// Vérifie qu'aucun fichier .js du site n'utilise une fonction Firestore
// (addDoc, setDoc, getDoc, onSnapshot, etc.) sans l'importer depuis
// « firebase-firestore.js ». À lancer avant chaque push pour éviter les
// erreurs runtime « X is not defined » qui ne sortent qu'au clic utilisateur.
//
// Utilisation :  node scripts/check-firestore-imports.mjs
// Code de sortie : 0 si tout est bon, 1 si au moins un import est manquant.

import { readdir, readFile } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';

const ROOT = process.cwd();
const IGNORE_DIRS = new Set(['node_modules', '.git', 'mobile-parrainage', 'functions', 'scripts']);

// Fonctions Firestore qui sont des appels nommés et que l'on importe
// nominalement. On évite les noms ambigus (doc, collection, query, where…)
// car ils servent aussi de variables locales : trop de faux positifs.
const FIRESTORE_CALLS = [
    'addDoc', 'setDoc', 'getDoc', 'getDocs', 'updateDoc', 'deleteDoc',
    'onSnapshot', 'writeBatch', 'runTransaction',
    'arrayUnion', 'arrayRemove', 'deleteField',
    'serverTimestamp', 'collectionGroup',
    'startAfter', 'startAt', 'endAt', 'endBefore', 'increment'
];

async function walk(dir, files = []) {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return files; }
    for (const e of entries) {
        if (IGNORE_DIRS.has(e.name)) continue;
        if (e.name.startsWith('.')) continue;
        const p = join(dir, e.name);
        if (e.isDirectory()) await walk(p, files);
        else if (extname(e.name) === '.js') files.push(p);
    }
    return files;
}

function extractFirestoreImports(src) {
    // Tous les blocs « import { ... } from "...firebase-firestore.js..." ».
    // Statiques (en haut) ET dynamiques (« const { ... } = await import('...firebase-firestore.js...') »).
    const names = new Set();
    const reStatic = /import\s*\{([\s\S]*?)\}\s*from\s*["'][^"']*firebase-firestore\.js[^"']*["']/g;
    const reDynamic = /(?:const|let|var)\s*\{([\s\S]*?)\}\s*=\s*await\s+import\s*\(\s*["'][^"']*firebase-firestore\.js[^"']*["']\s*\)/g;
    for (const re of [reStatic, reDynamic]) {
        let m;
        while ((m = re.exec(src))) {
            m[1].split(',').forEach(part => {
                const name = part.trim().split(/\s+as\s+/)[0].trim();
                if (name) names.add(name);
            });
        }
    }
    return names;
}

function findMissing(src, imported) {
    const missing = new Set();
    // Supprime commentaires et chaînes pour ne pas matcher dans les textes.
    const stripped = src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
        .replace(/(['"`])(?:\\.|(?!\1)[\s\S])*\1/g, '""');
    for (const name of FIRESTORE_CALLS) {
        if (imported.has(name)) continue;
        const callRe = new RegExp(`\\b${name}\\s*\\(`);
        if (callRe.test(stripped)) missing.add(name);
    }
    return missing;
}

const files = await walk(ROOT);
let issues = 0;
const report = [];
for (const f of files) {
    const src = await readFile(f, 'utf8');
    if (!/firebase-firestore\.js/.test(src)) continue;
    const imp = extractFirestoreImports(src);
    const missing = findMissing(src, imp);
    if (missing.size > 0) {
        report.push({ file: relative(ROOT, f), missing: [...missing] });
        issues++;
    }
}

if (issues === 0) {
    console.log('✅ OK — aucun import Firestore manquant détecté.');
    process.exit(0);
}

console.log(`❌ ${issues} fichier(s) avec un import Firestore manquant :\n`);
report.forEach(r => {
    console.log(`  • ${r.file}`);
    console.log(`      manque : ${r.missing.join(', ')}`);
});
console.log(`\nCorrigez les imports en haut de chaque fichier (depuis 'firebase-firestore.js') puis relancez :`);
console.log(`  node scripts/check-firestore-imports.mjs`);
process.exit(1);
