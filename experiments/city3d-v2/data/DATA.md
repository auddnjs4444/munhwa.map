# city3d 데이터 — 광주 동구 핵심축 (충장로–금남로–5·18민주광장–ACC)

## 출처·라이선스

- **출처: OpenStreetMap** — © OpenStreetMap contributors, **ODbL 1.0**. 이 데이터를 쓰는 화면·배포물에는 "© OpenStreetMap contributors" 표기가 필요합니다 (https://www.openstreetmap.org/copyright).
- **수집일: 2026-10-18** (OSM 데이터 기준 시각 2026-10-18T12:04Z 부근).
- **엔드포인트**
  - 본 bbox 전체: OSM API 0.6 map call — `https://api.openstreetmap.org/api/0.6/map?bbox=126.9080,35.1435,126.9260,35.1555` (HTTP 200, 4.1 MB, 1회로 완료, 50k 노드 제한에 걸리지 않아 타일 분할 불필요).
  - 누락 멤버 보강: `https://api.openstreetmap.org/api/0.6/relation/16243327/full` (landuse=grass 멀티폴리곤의 bbox 밖 멤버 1개).
  - 광역 '나비' 이름 검색: Overpass GET `https://overpass-api.de/api/interpreter?data=…` (HTTP 200, 35초 소요). kumi.systems·private.coffee는 GET에도 HTTP 500, maps.mail.ru 504, overpass.openstreetmap.ru 타임아웃.
  - User-Agent: `sueo-jido-prototype/0.1 (dall9.edu1@gmail.com)`
- **bbox (WGS84)**: lon 126.9080–126.9260, lat 35.1435–35.1555. map call 특성상 bbox 안에 노드가 하나라도 있는 way는 **잘라내지 않고 전체**가 들어 있습니다(도로가 bbox 밖으로 조금 삐져나감).
- 변환 스크립트: `convert_osm.py` (표준 라이브러리만 사용; `python3 -I convert_osm.py OUT_DIR stats.json full.osm rel.osm`).

## 파일별 피처 수

| 파일 | 피처 수 | 지오메트리 | 내용 |
|---|---:|---|---|
| `buildings.geojson` | 1,159 | Polygon | `building=*` (닫힌 way 1,159개; bbox 안 건물 멀티폴리곤 릴레이션은 0개) |
| `roads.geojson` | 408 | LineString | highway: residential 201 · service(이름 있는 것만) 123 · tertiary 37 · pedestrian 12(면 제외) · cycleway 11 · secondary 8 · primary 6 · footway(이름 있는 것만) 5 · tertiary_link 3 · primary_link 1 · path 1 |
| `water.geojson` | 5 | LineString 2 + Polygon 3 | 광주천(waterway=river), 동계천(stream), 광주천 수면(natural=water water=river), ACC 분수대, 이름 없는 natural=water 1 |
| `green.geojson` | 38 | Polygon | leisure=park 11 · garden 10 · pitch 4 · playground 1 · highway=pedestrian 면 8 · landuse=grass 2 · forest 1 · natural=scrub 1 |
| `landmarks.geojson` | 16 | Point | 아래 표 (15개 검증, 1개 미확인 표시) |

공통: 좌표 소수 6자리, 폴리곤 외곽 반시계·내부 시계 방향(RFC 7946), 모든 링 닫힘 검증 완료. `osm_id`는 `way/123`, `relation/123`, `node/123` 형식.

### 속성

- buildings: `name`(없으면 null), `building`, `levels`, `height_m`, `height_source`, `osm_id`
- roads: `highway`, `name`, `osm_id`, `oneway`, `layer`, `tunnel`, `bridge`, `axis`(`chungjang` | `geumnam` | null)
- water / green: `kind`(태그 요약), `name`, `osm_id`
- landmarks: `name`, `name_osm`, `name_en`, `lon`, `lat`, `osm_id`, `geometry_source`, `verified`, `verified_by`

### 축(axis) 하이라이트

- `axis=chungjang`: 이름이 정확히 `충장로`인 way 18개 (lon 126.9092–126.9185). `충장로안길`, `충장로22번길` 같은 골목은 제외. OSM에는 `충장로1가…5가` 이름의 도로 way가 없고(place=quarter 노드만 있음) 모두 `충장로`로 되어 있음.
- `axis=geumnam`: 이름이 정확히 `금남로`인 way 16개 (lon 126.9050–126.9189; bbox 밖까지 이어짐).

## 높이 산출 방식

- `height` 태그가 숫자면 그대로(단위 m 제거) → `height_source="height"`
- 아니면 `building:levels × 3.3 m` → `"levels"`
- 둘 다 없으면 `height_m=null`, `"none"`

| height_source | 건물 수 | 비율 |
|---|---:|---:|
| height (실측값) | 1 | 0.1 % |
| levels (층수×3.3) | 18 | 1.6 % |
| none | 1,140 | **98.4 %** |

즉 **건물의 98 %는 OSM에 높이·층수 정보가 없습니다.** 3D 프로토타입에서는 `building` 값(commercial 646, yes 427, apartments 28, residential 26, roof 14, public 8 …)이나 바닥 면적 기반의 추정 높이를 따로 정해야 합니다. 층수가 있는 건물 예: 전일빌딩245 10층(33 m), 5·18기록관 6층, 광주은행 20층, 아트시티리버파크 26층, 유탑유블레스 27층, 롯데백화점 10층. `building:part`는 bbox 안에 없음.

## 검증된 랜드마크 (OSM 기준, WGS84)

| 이름 | lon | lat | OSM id | 검증 방법 |
|---|---|---|---|---|
| 국립아시아문화전당 (ACC) | 126.920573 | 35.147278 | way/248192696 | OSM way `tourism=attraction area=yes name=국립아시아문화전당 addr 문화전당로 38 wikidata Q12585739` 부지 외곽선의 면적중심. 부지는 lat 35.1450–35.1498, lon 126.9188–126.9220 (약 290 m(동서)×530 m(남북)). **건물 폴리곤이 아님**(ACC 본체는 OSM에 건물로 거의 그려져 있지 않음) |
| 5·18민주광장 | 126.919644 | 35.147475 | relation/19102230 | OSM 멀티폴리곤 `highway=pedestrian name=5.18민주광장 addr 금남로 245`, 면적중심 |
| 옛 전남도청 (구 전라남도청 본관) | 126.920043 | 35.147053 | way/535847782 | OSM 건물 `name=구 전라남도청 alt_name:ko=구 전남도청 tourism=museum`, 중심. OSM에 `민주평화교류원`·`전라남도청 구 청사` 이름의 객체는 없음 |
| 구 전남도청 별관 | 126.919384 | 35.146743 | way/648180665 | OSM 건물 `name=구.전남도청 별관` |
| 국립아시아문화전당 상무관 | 126.920016 | 35.148013 | way/485779127 | OSM 건물 이름 일치 |
| 국립아시아문화전당 방문자센터 | 126.920135 | 35.146921 | way/648180663 | OSM 건물 `tourism=information` 이름 일치 |
| 전일빌딩245 | 126.918716 | 35.148346 | way/471090813 | OSM 건물 `name=전일빌딩245 building:levels=10 historic=yes` |
| 금남로공원 | 126.915492 | 35.149672 | way/452261523 | OSM `leisure=park name=금남로공원`, 면적중심 |
| 5·18민주화운동기록관 | 126.916733 | 35.149546 | way/478278294 | OSM 건물 `tourism=museum name=5.18 광주민주화운동기록관 levels=6`, 중심 |
| 광주YMCA | 126.918341 | 35.147894 | way/452258370 | OSM `building=commercial name=광주YMCA` |
| 광주우체국 (충장로 우체국, "충우") | 126.917219 | 35.147591 | node/368876980 | OSM `amenity=post_office name=광주우체국 name:en=Gwangju Post Office` 노드. 충장로2가, 주변 건물 주소 충장로 91–96. OSM에 `충장로우체국`이라는 이름의 객체는 없음 |
| 문화전당역 (지하철 1호선) | 126.919814 | 35.146678 | node/9252650065 | OSM `railway=station name=문화전당 ref 104` |
| 금남로4가역 | 126.914581 | 35.150706 | node/9252650063 | OSM `railway=station name=금남로4가` |
| 궁전제과 | 126.917573 | 35.147748 | node/4475060012 | OSM `amenity=cafe name=궁전제과` |
| 캔모아 | 126.914174 | 35.148924 | node/11391900255 | OSM `amenity=cafe name=캔모아` |

## 미확인·불일치 항목 (추측하지 않음)

- **'금남로 나비정원' — OSM에 없음.** 광역 bbox(lat 35.12–35.18 / lon 126.88–126.95, 추가로 35.10–35.25 / 126.80–127.05)에서 `name`·`name:ko`·`alt_name`·`official_name`·`description`에 '나비'가 들어가는 객체와 `name`·`name:en`에 'butterfl'가 들어가는 객체를 Overpass로 검색한 결과, 유일한 매치는 **카페 '하나비'(Hanabi, node/10578073999, 북구 호동로 10-1, 35.17478/126.91386)** 뿐이며 정원·공원이 아닙니다. 위치를 추정하지 않았고 landmarks에 넣지 않았습니다. 다른 출처(광주시 공원 데이터, 카카오/네이버 지도)로 확인이 필요합니다.
- `광주우체국 ? (북쪽 건물, 미확인)` way/1388027647 (35.154122, 126.914217): `amenity=post_office building=yes name=광주우체국`으로 태깅돼 있으나 충장로에서 북쪽으로 약 740 m 떨어져 있음. 다른 지점이거나 이름 오기로 보이며 `verified=false`로만 포함.
- `민주평화교류원`, `전라남도청 구 청사`, `충장로우체국`, `5·18민주광장`(가운뎃점 표기) 이름은 OSM에 없음 → 각각 `구 전라남도청`, `광주우체국`, `5.18민주광장`으로 매칭.
- ACC 본체 건물: OSM에는 부지 외곽선(tourism=attraction)과 부속 건물(상무관·방문자센터·구 도청 본관·별관)만 있고, 지하 전시동 등 ACC 주요 건물 폴리곤은 없음. 3D에서는 부지 폴리곤을 별도 처리해야 함.

## 프로젝트 좌표와의 비교 (OSM 대비 거리)

| 항목 | 프로젝트 출처 | 프로젝트 좌표 (lon, lat) | OSM 좌표 | 거리 | 판단 |
|---|---|---|---|---:|---|
| 5·18민주광장 | places.json `518-democracy-square` | 126.9166, 35.1499 | 126.919644, 35.147475 (relation/19102230) | **387 m** | **OSM이 맞음.** 프로젝트 점은 금남로3가 5·18기록관 근처(기록관 건물 외곽선까지 약 18 m, 면적중심까지 약 41 m; 가장 가까운 건물은 NAVER PARTNER SQUARE way/490825977, 약 4 m)에 찍혀 있고, 실제 광장은 옛 전남도청·ACC 앞(금남로 245)에 있음. places.json이 '대략적 중심'이라 해도 광장 자체와 ~390 m 차이이므로 수정 권장 |
| 국립아시아문화전당 | spots.json `acc` (카카오 주소 문화전당로 38) | 126.9200303, 35.1470588 | 126.920573, 35.147278 (부지 중심) | 55 m | 둘 다 타당. 부지가 290×530 m라 주소점(카카오)과 부지 면적중심이 55 m 다른 것뿐. 핀은 카카오 주소점 유지해도 됨 |
| 5·18민주화운동기록관 | spots.json `518-archives` | 126.9167619, 35.1495588 | 126.916733, 35.149546 | 4.6 m | 일치 |
| 금남로공원 | spots.json `geumnam-park` (Nominatim) | 126.915578, 35.149457 | 126.915492, 35.149672 (공원 면적중심) | 26 m | 일치(같은 공원 안) |
| 궁전제과 | spots.json `palace-bakery` | 126.9176286, 35.1477242 | 126.917573, 35.147748 | 5.7 m | 일치 |
| 캔모아 | spots.json hub `canmore` | 126.9142779, 35.1489982 | 126.914174, 35.148924 | 12.5 m | 일치(OSM 노드는 건물 앞 도로 쪽) |
| 충장로 | places.json `chungjang-ro` | 126.9153, 35.1489 | — | 충장로 중심선까지 0.2 m, OSM `place=quarter` 충장로3가 노드(node/415146355)까지 3.8 m | 사실상 OSM 충장로3가 동 중심 노드. 거리 중심으로 적절 |
| 금남로 | places.json `geumnam-ro` | 126.9147, 35.1513 | — | 금남로 중심선까지 21 m, `place=quarter` 금남로4가 노드까지 60 m | 대략적 중심으로 적절 |
| 옛 전남도청 | (프로젝트에 좌표 없음) | — | 126.920043, 35.147053 | places.json 5·18민주광장 점에서 446 m | — |
| 전일빌딩245 | (프로젝트에 좌표 없음) | — | 126.918716, 35.148346 | places.json 5·18민주광장 점에서 259 m | — |

거리는 하버사인(지구 반지름 6,371 km) 기준.

## 알려진 한계

- bbox 안 건물 1,159개 중 1,140개(98.4 %)에 높이·층수 정보 없음.
- 도로는 bbox로 잘라내지 않음(금남로 서쪽 끝은 lon 126.905까지 이어짐).
- OSM 커버리지 기준 2026-10-18; 이후 편집은 반영되지 않음.

---

## 프로토타입 쪽 추가 (city3d.js가 쓰는 것)

- `acc_area.geojson` — OSM way/248192696 (국립아시아문화전당, `tourism=attraction`, `area=yes`) 윤곽 1개. `https://api.openstreetmap.org/api/0.6/way/248192696/full` (2026-10-18). 전당 대부분이 지하라 지상 매스 대신 낮은 녹지 평면 + 빛 상자로 표현한다.
- `spots3d.json` — 스팟 좌표와 카메라. 좌표 출처는 각 항목의 `coord_source`에 적었고, 나비정원은 `coords: null` / `unverified`.
- 지도 위 **연출용 생성물**(실제 시설 위치가 아님, 실행 시 계산): 금남로 본선 32 m 간격 양쪽 13 m 가로등 점, 충장로 본선 17 m 간격 양쪽 7.5 m 간판 상자(높이 2.4–5 m), ACC 구역 안 24 m 격자 빛 상자.
- 건물 높이: `height_m`이 없으면 `building` 값별 단순화 높이(`city3d.js`의 `DEFAULT_H`; `yes` 9 m, `commercial` 16 m, `apartments` 28 m …). 이름으로 맞춘 랜드마크는 옛 전남도청 12 m, 전당 지상 건물 9 m로 둔다. 전일빌딩245는 OSM `building:levels=10` → 33 m.
- 분수대: OSM way/860571290 (`natural=water` + `amenity=fountain`, 국립아시아문화전당 분수대)을 지도의 유일한 차가운 색 포인트로 칠한다.
- 본 사이트 `data/places.json`의 5·18민주광장 좌표(126.9166, 35.1499)는 실제 광장(OSM relation/19102230, 126.919644, 35.147475)에서 약 387 m 떨어진 금남로3가를 가리킨다. 프로토타입은 OSM 값을 쓰고 본 사이트 데이터는 수정하지 않았다(수정 제안).

- 2026-10-18 보정: 변환기의 면적중심 계산이 경위도 원값으로 신발끈 공식을 돌려 작은 다각형에서 최대 122 m 어긋나던 문제를 고쳤고(지역 원점 이동 + 구멍 반영), landmarks.geojson의 면적중심 10개와 spots3d.json의 5·18민주광장·전일빌딩 좌표를 다시 계산했다. 광장 좌표는 구멍(분수대)을 뺀 면적중심이다.
