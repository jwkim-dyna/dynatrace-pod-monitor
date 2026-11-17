import { readFile, mkdir, writeFile } from 'node:fs/promises';

// Keep Strato's compiled English messages as fallback; translate the prototype controls.
const messages = JSON.parse(await readFile('node_modules/@dynatrace/strato-components/lang/en.json', 'utf8'));
Object.assign(messages, {
  'Fr3cNB5JDQGaGwae': '검색',
  'CerADEHqR/6IVmHr': '검색',
  '4PipZ2Z07Q9epib1': '선택 항목 검색',
  'k21q5kyTS9rGFWLF': '{count}개 항목 표시',
  'cycz+bYG+VH7Of4e': '조회 중',
});
await mkdir('ui/lang', { recursive: true });
const serialized = JSON.stringify(messages);
let previous = null;
try { previous = await readFile('ui/lang/ko.json', 'utf8'); }
catch (error) { if (error?.code !== 'ENOENT') throw error; }
// Avoid restarting the live app on every build when translations are unchanged.
if (previous !== serialized) await writeFile('ui/lang/ko.json', serialized);
