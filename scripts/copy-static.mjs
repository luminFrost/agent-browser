// 렌더러의 정적 파일(html, css)을 dist로 복사한다. tsc는 .ts만 옮긴다.
import { cpSync, existsSync } from 'node:fs';
const from = 'src/browser/renderer';
if (existsSync(from)) cpSync(from, 'dist/browser/renderer', { recursive: true, filter: (p) => !p.endsWith('.ts') });
