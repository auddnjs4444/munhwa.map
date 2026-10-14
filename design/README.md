# 디자인 시안 — GWANGJU SIGN LANGUAGE INTERACTIVE ART MAP

본 사이트 코드(`index.html`, `app.js`)를 건드리지 않고, 같은 데이터로 지도·경계·패널을 다시 그려 본 **시안 페이지**입니다.
로컬 서버(`python3 -m http.server 8010`)를 띄운 뒤 아래 주소로 엽니다. 두 시안 모두 계림동이 선택된 상태로 시작합니다.

| 시안 | 주소 | 요지 |
|---|---|---|
| C-1 CINEMATIC | `http://localhost:8010/design/c1-cinematic.html` | 어두운 영화 톤 지도 + 선택 지역 밖 어둡게(스포트라이트) + 지도 위 큰 사진 카드·큰 지명 + 지도가 비치는 반투명 패널 |
| C-2 EDITORIAL | `http://localhost:8010/design/c2-editorial.html` | 밝은 종이 톤 지도 + 16개 경계·번호 레이블 상시 표시 + 선택 지역 빗금 + 작은 도판 카드 + 도록식 종이 패널(영상 왼쪽·메타 오른쪽) |

- `?dong=궁동` 으로 다른 동을 선택한 상태로 열 수 있고, `?noanim=1` 은 전환 애니메이션을 끕니다(스크린샷용).
- 공용 로직은 `concept.js` 하나이며, 시안별 차이는 각 HTML 안의 `window.CONCEPT` 설정과 CSS입니다.
- 사진은 아직 실제 자료가 없어 **"시안용 이미지 영역"** 자리표시만 넣었습니다. `places.json`의 장소에 `photo` 경로를 추가하면 그 자리에 표시되고, 로딩 실패 시 자리표시로 돌아갑니다.
- 본 사이트에 통합할 때는 `app.js`의 `openRegionPanel()`/`selectRegion()`/`ensureItemVisible()`을 그대로 쓰고, 여기 CSS와 `updateShade()`·`updateArt()`·카메라 패딩 로직만 옮기면 됩니다.
