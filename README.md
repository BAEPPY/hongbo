# 제주 초등학교 홍보 도우미 (hongbo)

**교육청 학교소식 훑기(제주 모든 초등학교) → 사진 폴더로 홍보글 초안 → 확인·승인 → 교육청 게시판에 올리기**를 한 흐름으로 묶은 도구입니다.
글 엔진(규칙·예시 176편·연구학교 참고자료)은 [한라초 홍보글 작성 앱](https://github.com/BAEPPY/hallahongbo)과 같고, 설정의 학교 이름·교장만 바꾸면 **제주의 다른 초등학교에서도** 그대로 쓸 수 있습니다.
오픈클로(OpenClaw)를 붙이면 텔레그램으로 시키고 승인할 수 있고, 붙이지 않아도 명령줄과 확인 창만으로 쓸 수 있습니다.

## 어떻게 돌아가나
```
[아침 8시]  hongbo scan ──► 제주 모든 초등학교의 새 글을 보관함에 저장(본문 포함)
                          ──► "어제 어느 학교가 무엇을 올렸나 · 우리 학교 게시 현황 · 새 사진 폴더" 요약 → 텔레그램
[활동 뒤]   사진 + 메모.txt 를 폴더에 넣음 ──► hongbo draft ──► 초안 + 사진 후보 → 확인 창 / 텔레그램
[확인]      제목·본문 고치고 사진 고르고 [승인]
[게시]      hongbo plan ──► 오픈클로가 로그인된 크롬에서 글쓰기 폼을 채움 ──► 캡처 확인 "등록해" ──► 등록 ──► hongbo posted
```
사람이 계속 하는 일은 셋입니다. **인증서 로그인**, **등록 전 최종 확인**(학생 사진이 공개되는 일이므로), **사실 확인**.

## 설치 (요약)
```
git clone https://github.com/BAEPPY/hongbo.git && cd hongbo && npm install && npm link
hongbo config set-key anthropic sk-ant-…        # hallahongbo 앱과 같은 키
hongbo config set-photo-root "C:\Users\<이름>\홍보사진"
```
오픈클로·텔레그램·크롬 연결은 [docs/오픈클로_설치.md](docs/오픈클로_설치.md) 를 보세요.

## 사진 폴더 규칙
```
홍보사진/
  2026-09-17 2학년 안전체험관 현장체험학습/     ← "날짜 대상 활동명"
    메모.txt                                   ← docs/메모_예시.txt 참고. "내용:" 한 줄만 있어도 됨
    IMG_0001.jpg …                             ← 원본 (그대로 둠)
    upload/01.jpg …                            ← 프로그램이 만든 게시용 사본 (긴 쪽 1600px, 위치 정보 제거)
    .hongbo/                                   ← 초안·사진 선별·승인·게시 기록
```

## 명령
| 명령 | 하는 일 |
|---|---|
| `hongbo scan` | 교육청 학교소식의 새 글을 제주 모든 초등학교 대상으로 모아 보관 + 우리 학교 게시 현황(교육청 vs 학교 홈페이지) + 새 사진 폴더 요약 |
| `hongbo archive list/show/stats/schools/export` | 보관함 조회. 학교별·주제별·기간별로 찾고, 글 엔진 예시 형식으로 내보내기 |
| `hongbo list` / `hongbo status <폴더>` | 활동 폴더 목록과 상태 (새 활동 → 초안 → 승인 → 게시) |
| `hongbo draft <폴더> [--note "…"] [--rank]` | 초안 만들기. `--rank` 면 사진마다 AI 가 얼굴 크게 나옴·흐림을 판정해 추천 |
| `hongbo review <폴더>` | 브라우저 확인 창: 고치고, 사진 고르고, 승인 |
| `hongbo approve <폴더> [--photos 1,3,4]` | 채팅으로 승인받았을 때 기록 |
| `hongbo plan <폴더>` | 게시 계획(제목·문단·사진 경로·게시판 정보). 오픈클로가 폼을 채울 때 씀 |
| `hongbo posted <폴더> --url …` | 게시 완료 기록 |
| `hongbo prompt files` | 규칙·예시·연구학교 자료를 고칠 파일 만들기 |

`--json` 을 붙이면 기계가 읽는 형식으로 답합니다(오픈클로 스킬이 이렇게 씁니다).

## 보관함 (제주 모든 초등학교의 학교소식)
`hongbo scan` 은 교육청 학교소식 게시판에서 **아직 보관하지 않은 글이 있는 페이지만** 넘기며 새 글을 전부 저장합니다(하루 10~20건, 최대 6쪽).
글마다 제목·학교·전화·날짜·본문·첨부 파일 이름·주소가 `~/.hongbo/archive/jje/YYYY-MM/<글번호>.json` 에 남고, `archive/index.json` 이 목록입니다.
- `hongbo archive list --school 한림초 --since 2026-09-01` 처럼 찾아볼 수 있고, `hongbo archive stats` 로 학교별·주제별 흐름을 봅니다.
- 초안을 만들 때 보관함의 최근 글 12편이 **참고 예시**로 자동으로 붙습니다(설정 `draft.recentExamples`, 0이면 끔). 주제·표현 참고용이며, 다른 학교의 사실이 우리 글에 들어오지 않도록 프롬프트에 명시합니다.
- 유치원 글은 같은 게시판에 섞여 있어 기록만 하고 요약·예시에서는 뺍니다(`scan.includeKindergarten: true` 로 포함 가능).

## 다른 학교에서 쓰기
```
hongbo config set school.name 한림초등학교
hongbo config set school.short 한림초
hongbo config set school.principal 홍길동
hongbo config set school.phone 064-000-0000
hongbo config set schoolSite.newsUrl ""        # 학교 홈페이지 학교소식 주소 (없으면 비움 → 홈페이지 대조 생략)
```
규칙·예시 속 "한라초등학교(교장 오상남)"가 우리 학교로 바뀌어 적용됩니다. 연구학교 참고자료는 한라초 전용이라, 다른 학교는 `hongbo prompt files` 로 만든 `research.txt` 를 직접 채웠을 때만 쓰입니다.

## 오픈클로 스킬
`skills/` 에 세 개가 있습니다. 오픈클로 설정 `skills.load.extraDirs` 에 이 폴더를 넣으면 바로 보입니다.
- **hongbo-scan** — 아침 훑기(모든 학교 새 글 보관 + 요약). 보관함 질문("한림초 최근 글 보여 줘")도 처리. 다른 학교 글은 참고만 하도록 규칙을 둠
- **hongbo-draft** — 초안 만들기 → 사진과 함께 보내기 → 수정 → 승인 기록. 메모에 없는 사실은 묻고, 지어내지 않음
- **hongbo-post** — 로그인된 크롬에서 글쓰기 폼 채우기 → 등록 전 캡처 확인 → 등록 → 기록. 인증서·비밀번호는 절대 대신 입력하지 않음

## 지켜야 할 것
- 교육청 누리집의 robots.txt 는 검색엔진 외 자동 수집을 막고 있습니다. 이 도구는 **하루 몇 번, 새 글이 있는 페이지만(최대 6쪽) + 새 글 본문**을 읽고 첨부파일은 내려받지 않습니다. 요청 사이에 1.5초를 쉽니다. 과거 글을 한꺼번에 긁는 용도로 바꾸지 마세요.
- 다른 학교 글은 **주제·문체 참고**용입니다. 그 내용을 우리 글에 옮기지 않습니다. 우리 글의 사실은 메모에서만 옵니다.
- 학생 이름은 글에 넣지 않습니다. 얼굴이 크게 나온 사진은 확인 창에서 빼 주세요.
- API 키는 `~/.hongbo/config.json` 에 평문으로 저장됩니다. 공용 컴퓨터라면 환경 변수(`ANTHROPIC_API_KEY` 등)로 주세요.

## 개발자용
```
npm test                    # 단위·명령줄 시험 (가짜 AI 서버 사용, 실제 사이트에 접속하지 않음)
npm run sync-engine         # 옆 폴더의 hallahongbo 에서 글 엔진 최신본 복사
```
- `lib/engine/` 은 hallahongbo 의 `src/` 일부를 그대로 복사한 것입니다. 규칙·예시가 바뀌면 `npm run sync-engine` 으로 맞추세요.
- 시험용 가짜 서버 주소: `ANTHROPIC_BASE_URL`, `OPENAI_BASE_URL`, `HALLA_GEMINI_BASE_URL`. 설정 폴더는 `HONGBO_HOME` 으로 바꿀 수 있습니다.
