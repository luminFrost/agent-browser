/** 사람 창과 에이전트 창이 함께 쓰는 세션 파티션. 로그인(쿠키·스토리지)을 공유한다(spec 범위). */
export const SHARED_PARTITION = 'persist:shared';

/** 런처가 브라우저에 프로필 경로를 넘기는 인자. 묶은 앱은 이 인자로 브라우저 역할을 알아본다(src/app/entry.ts). */
export const USER_DATA_FLAG = '--ab-user-data=';
/** 런처가 브라우저에 넘기는 인자: 창을 숨김(테스트), 다운로드 폴더 */
export const HIDDEN_FLAG = '--ab-hidden';
export const DOWNLOADS_FLAG = '--ab-downloads=';

/** 런처 자물쇠 파일(프로필 안)과, 시작 프로세스가 잡은 자물쇠 경로를 런처에 넘기는 환경 변수(ADR-0008) */
export const LAUNCHER_LOCK_NAME = 'launcher.lock';
export const LAUNCHER_LOCK_ENV = 'AGENT_BROWSER_LAUNCHER_LOCK';
/** 묶은 앱에서 런처 출력을 남기는 파일(프로필 안) */
export const LAUNCHER_LOG_NAME = 'launcher.log';
/** 제어 정보(포트·토큰) 파일(프로필 안). 붙이기 명령도 읽는다(spec-claude-attach) */
export const CONTROL_FILE_NAME = 'control.json';
