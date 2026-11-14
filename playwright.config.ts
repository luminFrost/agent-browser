import { defineConfig } from '@playwright/test';
// E2E는 테스트 프로세스가 startApp을 직접 불러 런처가 된다(ADR-0002). 브라우저 프로세스를 여럿 띄우므로 직렬로 돈다.
export default defineConfig({ testDir: 'tests/e2e', workers: 1, timeout: 60_000, reporter: 'list' });
