/** 사람 창과 에이전트 창이 함께 쓰는 세션 파티션. 로그인(쿠키·스토리지)을 공유한다(spec 범위). */
export const SHARED_PARTITION = 'persist:shared';

/** 런처가 브라우저에 프로필 경로를 넘기는 인자. 묶은 앱은 이 인자로 브라우저 역할을 알아본다(src/app/entry.ts). */
export const USER_DATA_FLAG = '--ab-user-data=';
