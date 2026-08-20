# Figma AI Design Guidelines 리팩터링 프롬프트

현재 작성되어 있는 Design Guidelines를 전면 재검토하고 수정하세요.

이 가이드는 특정한 하나의 UI 스타일을 반복 생산하기 위한 템플릿이 아니라, **서비스의 브랜드 정체성과 UX 품질을 유지하면서도 각 화면을 목적에 맞게 자유롭고 창의적으로 설계할 수 있게 하는 Design System**이어야 합니다.

현재 가이드에 포함된 브랜드 색상, semantic color, typography, accessibility, 상태 표현, 제품 고유 UX 원칙은 최대한 유지하세요.

반면 특정 화면의 레이아웃이나 시각적 형태를 지나치게 강제하는 규칙은 제거하거나 원칙 중심으로 다시 작성하세요.

## 1. 가장 중요한 수정 방향

현재 Guidelines가 다음과 같은 형태라면 수정하세요.

* Hero는 반드시 중앙 정렬
* Hero는 특정 gradient 사용
* 섹션은 항상 card 형태
* How it works는 3개의 card
* CTA는 특정 rounded container
* 모든 card는 rounded-2xl
* 모든 input은 rounded-xl
* 특정 decorative blob 사용
* 특정 grid 구조를 반복
* 특정 페이지 예시를 다른 화면에서도 그대로 재사용

이런 규칙은 Design System이 아니라 **UI Recipe**에 가깝습니다.

이를 다음과 같은 형태의 원칙으로 변경하세요.

예:

기존:
“Hero는 중앙 정렬된 pink gradient section으로 구성한다.”

수정:
“Hero의 composition은 화면의 핵심 사용자 행동과 콘텐츠 성격에 따라 결정한다. 브랜드 컬러를 사용할 수 있지만 특정 정렬이나 gradient를 기본값으로 강제하지 않는다.”

기존:
“일반 콘텐츠는 rounded-2xl card를 사용한다.”

수정:
“Card는 독립적인 정보 단위 또는 interaction boundary가 필요한 경우에 사용한다. 단순한 시각적 분리를 위해 모든 콘텐츠를 card 안에 넣지 않는다.”

---

## 2. Guidelines를 네 단계로 구분

Design Guidelines 전체를 다음 네 종류의 규칙으로 명확하게 구분하세요.

### A. Foundation

반드시 유지되어야 하는 서비스의 정체성입니다.

예:

* Brand colors
* Semantic colors
* Typography
* Accessibility
* Iconography philosophy
* Spacing rhythm
* Interaction feedback
* Safe / Caution / Danger 의미
* 서비스 고유 UX 원칙

이 영역은 일관성을 강하게 유지하세요.

### B. Principles

화면을 설계할 때 지켜야 하는 UX 및 visual 원칙입니다.

예:

* 중요한 정보는 명확한 hierarchy를 가져야 한다.
* 사용자의 primary action은 빠르게 식별할 수 있어야 한다.
* 위험 정보는 놓치기 어렵게 표현해야 한다.
* whitespace는 정보 그룹을 표현하기 위해 사용한다.
* visual elements에는 명확한 역할이 있어야 한다.

구체적인 CSS 형태나 layout 값을 강제하지 마세요.

### C. Flexible Patterns

상황에 따라 사용할 수 있는 디자인 패턴입니다.

예:

* Card
* Split layout
* Editorial layout
* Grid
* Table
* Timeline
* Tabs
* Stepper
* Accordion
* Inline information
* Progressive disclosure

특정 패턴을 default로 지정하지 마세요.

화면의 목적과 정보 구조에 따라 가장 적절한 패턴을 선택하도록 하세요.

### D. Anti-patterns

AI-generated UI에서 반복적으로 나타나는 습관을 경고합니다.

하지만 특정 미학을 금지하는 새로운 스타일 가이드로 만들지 마세요.

---

## 3. AI-generated UI 패턴 방지

다음 요소를 자동으로 기본 선택하지 않도록 Guidelines에 Anti-pattern 섹션을 추가하세요.

* 중앙 정렬된 generic SaaS Hero
* gradient headline
* 3개의 동일한 feature card
* 모든 콘텐츠를 rounded rectangle 안에 넣는 구조
* 과도한 pill UI
* 지나치게 큰 border radius
* 의미 없는 glassmorphism
* decorative blob
* 정보와 관계없는 gradient
* icon + title + paragraph 반복
* 지나치게 대칭적인 section 구성
* 모든 section이 비슷한 높이와 spacing을 가지는 구성
* 의미 없이 넓은 whitespace
* generic dashboard card grid
* 모든 요소에 그림자를 넣는 패턴
* 동일한 component rhythm을 페이지 끝까지 반복하는 구조

단, 이것들을 절대 금지하지 마세요.

콘텐츠, 브랜드, interaction 또는 정보 구조상 합리적인 이유가 있다면 사용할 수 있습니다.

Anti-pattern의 목적은 **특정 디자인을 금지하는 것이 아니라 무의식적으로 반복되는 생성형 UI 습관을 방지하는 것**입니다.

---

## 4. Card 사용 규칙 수정

Card를 기본 container로 사용하지 않도록 Guidelines를 수정하세요.

다음 기준 중 하나 이상을 만족할 때만 card 사용을 고려하세요.

* 독립된 정보 단위
* interaction boundary
* 반복적으로 스캔해야 하는 항목
* 다른 콘텐츠와 명확하게 분리되어야 하는 상태
* 사용자가 선택하거나 조작할 수 있는 object

Typography, spacing, divider, background 변화만으로 충분한 경우에는 card를 사용하지 마세요.

Nested card는 특별한 이유가 없는 한 피하세요.

---

## 5. Border Radius 규칙 완화

각 component마다 특정 radius를 강제하지 마세요.

예를 들어 다음과 같은 규칙은 피하세요.

* Card = rounded-2xl
* CTA = rounded-3xl
* Input = rounded-xl
* Badge = rounded-lg

대신 radius scale만 정의하세요.

예:

* Small
* Medium
* Large
* Full

그리고 component의 역할과 visual hierarchy에 따라 선택하도록 하세요.

Pill shape는 다음과 같은 상황에 우선 사용하세요.

* status
* filter
* compact toggle
* short semantic tag

일반 container에 pill 형태를 남용하지 마세요.

---

## 6. Gradient와 Decorative Elements

Brand gradient를 mandatory visual language로 사용하지 마세요.

Brand color는 유지하되 gradient는 선택적으로 사용하도록 수정하세요.

Gradient를 사용할 경우 다음 중 하나 이상의 목적이 있어야 합니다.

* 브랜드 인지
* 정보 hierarchy
* interaction state
* visual focus

단순히 “modern해 보이기 위해” gradient를 추가하지 마세요.

Blob, floating shape, glow, abstract decoration 등의 요소도 기본값으로 사용하지 마세요.

Decoration은 브랜드 identity 또는 페이지의 명확한 visual concept과 연결될 때만 사용하세요.

---

## 7. Creative Direction 원칙 추가

새로운 섹션으로 **Creative Direction**을 추가하세요.

각 화면은 동일한 layout을 반복하는 대신 하나의 명확한 visual idea를 가질 수 있어야 합니다.

Visual idea는 다음에서 도출되어야 합니다.

* 사용자가 수행하려는 task
* 콘텐츠의 구조
* 정보의 중요도
* 사용자의 감정 상태
* 서비스의 브랜드 identity
* interaction model

화면에 따라 다음과 같은 다양한 composition을 자유롭게 사용할 수 있습니다.

* asymmetric composition
* editorial layout
* tool-first interface
* document-oriented interface
* dense information layout
* split layout
* linear workflow
* data-first interface
* content-first layout

특정 방식을 기본 스타일로 지정하지 마세요.

---

## 8. 일관성의 정의 수정

Guidelines에서 일관성을 다음과 같이 정의하세요.

일관성은 모든 페이지가 같은 layout, card, radius, grid를 사용하는 것이 아닙니다.

서비스의 일관성은 주로 다음 요소에서 만들어져야 합니다.

* typography
* color semantics
* spacing rhythm
* interaction behavior
* status representation
* motion behavior
* tone
* accessibility
* brand personality

각 화면은 서로 다른 composition을 사용할 수 있지만 동일한 제품으로 느껴져야 합니다.

---

## 9. Design Decision 원칙 추가

다음 문장을 중요한 원칙으로 포함하세요.

“Modern”, “clean”, “premium”, “professional”이라는 이유만으로 디자인 결정을 하지 마세요.

각 주요 visual decision은 이 서비스와 해당 화면에 구체적인 이유가 있어야 합니다.

새로운 Card, Badge, Pill, Icon container, Gradient, Divider 또는 Decoration을 추가하기 전에 다음을 판단하세요.

이 요소가 무엇을 개선하는가?

* comprehension
* hierarchy
* interaction
* scanability
* semantic meaning
* brand identity

아무것도 개선하지 않는다면 추가하지 마세요.

---

## 10. 기존 서비스 정체성 유지

이번 수정은 현재 디자인을 완전히 다른 브랜드로 바꾸기 위한 것이 아닙니다.

현재 Guidelines에서 잘 정의된 다음 요소들은 유지하거나 발전시키세요.

* 기존 Primary brand color
* Safe / Caution / Danger 체계
* 기존 Korean typography 방향
* 접근성 기준
* 서비스가 제공하는 신뢰감
* 계약 및 위험 정보에 적합한 명확한 UX
* 사용자에게 불필요한 불안감을 주지 않으면서 위험도를 전달하는 방식

즉, **브랜드 정체성은 유지하면서 layout과 composition의 자유도만 높이세요.**

---

## 최종 결과

수정된 Guidelines는 다음 조건을 만족해야 합니다.

1. 브랜드와 UX에는 강한 일관성이 있다.
2. 특정 layout이나 visual style을 강요하지 않는다.
3. 새로운 페이지를 만들 때마다 서로 다른 composition을 시도할 수 있다.
4. AI-generated SaaS template 느낌으로 자동 수렴하지 않는다.
5. 개발자가 실제 React UI로 구현할 수 있을 만큼 명확하다.
6. 지나치게 추상적이지 않되 특정 화면의 디자인 답안을 미리 정하지 않는다.
7. Guidelines 자체가 또 하나의 고정적인 AI 디자인 스타일이 되지 않는다.

현재 Design Guidelines를 기준으로 위 원칙에 맞게 **기존 문서를 직접 수정하고 재구성하세요.**

새로운 디자인 화면을 제작하지 말고, 이번 작업에서는 **Design Guidelines 문서 자체만 개선하세요.**
