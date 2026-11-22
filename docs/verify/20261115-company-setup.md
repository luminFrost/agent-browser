# 검증: 20261115-company-setup (정본 `docs/spec-company-setup.md`)
검증자: reviewer(회차마다 새로 띄움, 수행 과정 모름) · 강도 보통 · 2회차 PASS

## 회차
| 회차 | 판정 커밋 | 결과 | 이유 |
|---|---|---|---|
| 1 | ac588e8 | FAIL | B6(Major): 설치 문서의 Release 받기 명령이 `Agent\ Browser-*-arm64.dmg`였다. GitHub은 자산 이름의 공백을 바꿔 올리므로 받은 파일과 맞지 않는다(`app-builder-lib/out/platformPackager.js:690-700`). 나머지는 PASS |
| 2 | 723bf82 | PASS | dmg 이름을 `Agent-Browser-<버전>-arm64.dmg`로 바꿨다. 받기 전에 폴더를 비우고, 올리기는 이번 버전 파일 하나만 올린다. 시험 `scripts/release-docs.test.ts`. MCP 안내에 승인 창의 한계(fetch·XHR는 묻지 않음, 스스로 판단)를 넣었다 |

## 2회차 판정 (723bf82에서 검증자가 새로 만든 증거)
| 기준 | 판정 | 증거 |
|---|---|---|
| B1 Claude용 설치 문서 | PASS | `docs/setup.md` 사전 확인 → 빌드/Release → `claude mcp list` → 사람에게 남은 일. 단계마다 성공·실패 처리가 있다. `CLAUDE.md:18`이 가리킨다 |
| B2 빌드 경로 | PASS | 깨끗한 clone에서 가짜 claude와 임시 설치 위치로 `scripts/install-mac.sh`를 실행했다. exit 0, npm ci(402 packages), dist(`Agent-Browser-0.1.0-arm64.dmg`), 앱 설치, `mcp remove` → `mcp add --scope user agent-browser -- <tmp>/…/agent-browser-mcp`. 설치된 붙이기 명령의 initialize `instructions`가 안내문으로 시작한다 |
| B3 dmg 경로 | PASS | 실제 dmg로 node 없는 PATH에서 설치했다. exit 0, 남은 마운트 없음. 설치된 붙이기 명령도 안내를 돌려준다 |
| B4 사전 확인 실패 | PASS | 단위 4건(arm64 아님, claude 없음, Node 없음, Node 20). 검사 줄을 지우는 변이마다 시험이 실패했다 |
| B5 MCP 안내 | PASS | `src/attach/attach.ts:63-71`을 spec·README·ADR-0005와 대조했다. 개발 E2E `attach.spec.ts:86`, 묶은 앱 `packaged.spec.ts:349`. 덧붙이기를 빼는 변이에서 실패했다 |
| B6 Release 절차 | PASS | gh `download --pattern/--dir`, `create --title/--notes`, `upload --clobber` 플래그가 있다. dmg 이름이 GitHub 규칙을 적용해도 같다. 비운 폴더에서 glob이 1개로 풀린다. 옛 dmg가 남으면 2개로 풀려 스크립트가 아무것도 설치하지 않고 exit 1로 끝난다(안전한 실패). 변이 4건을 시험이 잡았다 |
| B7 사람용 안내 | PASS | `README.md:9` 첫 절에 다른 PC 설치가 있다. 개인 경로 0건(시험 값 `/Users/me`만 있음) |
| B8 올리면 안 될 것 | PASS | `.gitignore:18` `.aif/tasks/`, `:19` `.DS_Store`. 추적 파일의 이메일·토큰 0건 |
| 공통 | PASS | lint 0, build 0, `npm test` Vitest 206 + Playwright 75 passed, `npm run test:dist` 16 passed |

Critical·Major: 없음.

## 후속 (게이트 아님, 고칠지는 사람이 정함)
| 등급 | 내용 | 위치 |
|---|---|---|
| Minor | setup.md 1단계에 claude 없음·macOS 버전 기준의 실패 처리가 따로 없다(스크립트가 막아 주기는 한다) | `docs/setup.md:15-22` |
| Minor | release-docs 시험이 설치 줄의 폴더 이름이나 `--pattern` 오타는 잡지 못한다(지금 문서는 손으로 확인해 맞다) | `scripts/release-docs.test.ts` |
| Minor | MCP 안내에 "에이전트가 등록한 서비스 워커를 거친 POST는 관문을 지나간다"(ADR-0007)는 예외가 없다 | `src/attach/attach.ts:68` |
| Low | `initIds`를 비우지 않는다(같은 id 재사용 때 안내가 다른 응답에 붙을 수 있다) | `src/attach/cli.ts` |
| Low | 기존 앱 `rm -rf`가 권한으로 실패하면 "설치 실패:" 문구 없이 끝난다 | `scripts/install-mac.sh:61` |
| Low | chrome-devtools-mcp 1.13.0은 instructions를 보내지 않아 "원래 안내 유지"는 단위 시험으로만 확인된다 | `tests/e2e/attach.spec.ts:93` |
| Low | 커밋 작성자 이메일이 git 기록에 있다. 개인 경로가 든 커밋 4ffe25f는 `docs/install-guide` 브랜치에만 있다(push 범위 참고) | git 메타데이터 |

## 후속 처리 (2026-11-22, 카드 20261122-followups-1115)
| 후속 | 처리 |
|---|---|
| setup.md 1단계 실패 처리 | macOS 13 미만이면 멈춘다는 줄을 더했다(claude 없음은 이미 있었다). 설치 스크립트도 `sw_vers`로 같은 확인을 한다(Electron 44부터 macOS 13 이상). 시험 `install-mac.test.ts` "U1"(macOS CI에서 돈다) |
| release-docs가 설치 줄 오타를 못 잡음 | `release-docs.test.ts` "U2": 설치 줄의 폴더가 받은 폴더와 같은지, `--pattern`이 실제 자산 이름에 맞는지 본다. 폴더·패턴·dmg 이름 오타 변이 4건을 잡았다 |
| MCP 안내에 서비스 워커 예외 없음 | 안내의 "묻지 않는다" 줄에 서비스 워커를 거친 요청을 더했다(ADR-0007). 시험 `attach.test.ts` "U3" |
| `initIds`를 비우지 않음 | 안내를 붙인 뒤 그 id를 지운다. 시험 "U4" |
| 기존 앱 `rm -rf` 실패 문구 없음 | `설치 실패: 기존 앱을 지우지 못했다…`로 끝난다 |
| chrome-devtools-mcp가 instructions를 보내지 않음 | 고칠 것 없음. 원래 안내가 없으면 우리 안내만 들어가고(단위 "원래 안내가 없어도…"), 보내게 되면 뒤에 남는다(단위 "…원래 안내는 남긴다") |
| git 작성자 이메일·옛 브랜치 | 원격에 `docs/install-guide` 브랜치와 커밋 4ffe25f가 없다(`gh api` 422). 저장소는 공개(public)라 기존 커밋의 작성자 이메일(저장소 주인 계정)은 누구나 볼 수 있다. 앞으로 숨기려면 git 이메일을 GitHub noreply 주소로 바꾸고, 지난 기록까지 고치려면 강제 push가 필요하다. 둘 다 사람이 정한다. 머지가 끝난 원격 브랜치 정리도 사람이 정한다 |
