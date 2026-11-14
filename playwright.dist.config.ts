import { defineConfig } from '@playwright/test';
// 묶은 앱(release/) 확인. `npm run test:dist`가 먼저 묶는다. 실제 창을 띄우므로 직렬로 돈다.
export default defineConfig({ testDir: 'tests/dist', workers: 1, timeout: 120_000, reporter: 'list' });
