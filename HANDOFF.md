# Dealer — överlämning

Läs AGENTS.md, den här sidan och EN lägesfil för din bana. Ersätt inaktuell status; historiken finns i Git.
`tools/handoff.test.ts` håller taket: 120 rader och 900 ord.

## Läget

- Målet är en trovärdig utdelning i spelet i studion: två kort till plats 1–7 och två eller tre till dealern, med
  returer till redo och vila. Paow är dealern; Pamela är arkiverad (BESKED).
- Labbet är en vy, Bordet, där en film beställs längs en rak linje: kortets plats och steget, receptet ger resten.
  Kommandot `node tools/order-new.ts` gör samma utkast; Karta visar varje dealers träd.
  Dockan är Kortplans steg 2 (`?lage=docka`); steg 3 sparar given ur den.
- Spelet spelar trädet Tatuerad (Jakob 2026-11-24: bara hennes tatuerade händer), skjutet från A2.3; nypet från A2.1
  är trädet Tatuerad nyp, som byggs. Karta binder dem till en viktad komposition; Casinot spelar `?trad=<id>` eller
  `?komposition=<id>` ([karta](docs/lage/karta.md)). Dealerns första kort (D.C1) ligger stängt.
- Beställ släpper bara sätt som håller, och ett oprövat sätt får en pilot som Jakob dömer först (2026-11-24;
  `node tools/verdicts-per-method.ts paow`, [film](docs/lage/film.md)).
- Kopian på nätet är publicerad på `c9d006d` den 2026-11-20 på Jakobs ord, utan nya filmer. Telefonmått, fysisk
  telefon och ljud återstår ([spelet](docs/lage/spelet.md)).
- Kontrollen före en push körs bara på datorn. Kontots tokengräns delas av alla sessioner: få underagenter.

## Nästa steg

Sammanhängande lokal väg från underlag till spelbar Blackjack (Jakob 2026-11-18), med EN trovärdig giv först ([film](docs/lage/film.md)).

1. Giv och återgång i en film är sättet (Jakob 2026-11-23): plats 1–6, kort 1, ligger i banken; plats 7 görs om,
   och en film som vänder upp D.C1 saknas ([film](docs/lage/film.md)).
2. Dockan: givarna från A2.1 byggs om, ETT sätt att göra dockans film, och Kortplanens val följer vad dockan kan
   (Jakob 2026-11-24; [LASMIG](dealer3d/LASMIG.md), "Överlämning"). Sedan en pilot från A2.1 som han ser först.
3. Jakobs plan, domar och orderutkast skrivs aldrig över; läs hans anteckningar med `node tools/proof-notes.ts`.
4. Den neutrala munnen gäller alla Paows repliker utom blackjack, som väntar på hans ja; ljudet hörs ([spelet](docs/lage/spelet.md)).

## Vem äger vad

- **Huvudagentens adress: `dealer-5b`.** Claude-sessionen `dealer-5b` äger commits, push, taggar, studion,
  labbservern, spelet, 3D-scenens filmlager, `src/clip-graph.ts`, registren och styrdokumenten.
  En i taget kör kontrollen och pushar: den som ska pusha säger det till den andre och väntar på "kör".
- **Jakob talar helst med huvudagenten, som delegerar** (hans ord 2026-11-17), men öppnar andra chattar när han
  vill. Den som gör något på hans ord säger det till huvudagenten och lämnar en fillista. Ingen skriver i en annans filer.
- **Huvudagentens banor:** film, kort, labbet och studion, och spelet. Filerna de äger står under Var saker ligger i varje lägesfil.
  Banorna Scen, Tal och Trailer är stängda; deras filer hålls av huvudagenten ([spelet](docs/lage/spelet.md)).
- **3D-banan** (`dealer3d/`, dockan som styr filmerna) är sedan 2026-11-18 en underagent till huvudagenten (hans
  ord) och börjar från [dealer3d/LASMIG.md](dealer3d/LASMIG.md). Mätningen är stängd; givarna från A2.3 är filmbanans.
- **Kartabanan** (vyn Karta och dealerns träd) är huvudagentens sedan 2026-11-24 och börjar från
  [docs/lage/karta.md](docs/lage/karta.md).
- **Andra sessioner:** `dealer-ac`, `dealer-a4`, `dealer-e7`, `dealer-19` och `dealer-d1` är stängda (2026-11-24). Bordets filer, `src/order-*.ts`,
  `tools/doll-order.ts`, `data/order-methods.json` och `dealer3d/` är huvudagentens tills en ny session tar över från
  [LASMIG](dealer3d/LASMIG.md), "Överlämning", och säger till. Filmregistret är `data/motions.jsonl`, läst genom en SQLite-databas under
  `.runtime/register/` (`node tools/register.ts`; BESKED, "Registren i en databas").
- **Jakobs egna:** planen `placements/default.json` och hans domar i `data/motions.jsonl` (`review`), som skrivs från Granska och
  aldrig skrivs över av ett verktyg. En dom som getts åt honom (`node tools/review-put.ts`) är aldrig hans.
- **En ny session** arbetar i mappen `dealer` och avgränsar sina filer först. Extra arbetsträd bara vid
  isoleringsbehov (skillen `bredvid-andra-sessioner`).

## Väntar på Jakob

Prov han ska döma är kort i Beslut. Läs dem i studions vy Beslut (`/studio/beslut/`) eller i
registret `data/decisions.json`: fältet `answer` bär hans val och hans anteckning. Bara filmer och bilder blir kort
(skillen `visa-for-jakob`); teknik och arbetssätt frågas i chatten. Kortet tas ut när svaret är utfört.

## Läs för ditt ämne

- Jakobs gällande besked, per ämne: [docs/BESKED.md](docs/BESKED.md). Slå upp ämnet när ett beslut är i fråga.
- Kända brister, med vad som är prövat: [docs/BRISTER.md](docs/BRISTER.md).
- Lägesfilerna, en per bana, alla i samma form (Läget, Nästa steg, Väntar på Jakob, Var saker ligger, Fällor):
  - [docs/lage/film.md](docs/lage/film.md): filmerna, ankarna, Beställ, banken och saldot.
  - [docs/lage/karta.md](docs/lage/karta.md): Karta, träden och hur vyerna hänger ihop.
  - [docs/lage/kort.md](docs/lage/kort.md): det ritade kortet och kortplanens regel.
  - [docs/lage/labbet-och-studion.md](docs/lage/labbet-och-studion.md): Bordet, Material, Prov, Beslut och verktygen.
  - [docs/lage/spelet.md](docs/lage/spelet.md): spelet, kopian på nätet, läpparna och de stängda banornas arbete.
  - [docs/lage/matning.md](docs/lage/matning.md): mätningen av en riktig dealer och receptet från ankare 2.3.
- Kontrakt och ordlista: [docs/SYSTEM.md](docs/SYSTEM.md). Rutiner, kopian och slaskdisken:
  [docs/DRIFT.md](docs/DRIFT.md). Talet: [docs/TAL.md](docs/TAL.md).
- Handböckerna: [tools/dealer-line.md](tools/dealer-line.md) (en ny dealer eller en film),
  [tools/film-prompting.md](tools/film-prompting.md) (beställningens text och bilder),
  [tools/film-review.md](tools/film-review.md) (granskningen).
- Ett arbetsmoment som återkommer har en skill i `.claude/skills/` (AGENTS, "Läs först").

## Före avslut

Rutinen står i skillen `avsluta-arbete`. I korthet:

1. Vänta in eller stoppa egna underagenter. Checka in färdigt eget arbete; bevara Jakobs plan och befintliga orderutkast.
2. Uttrycklig staging av egna filer, commit, `npm run check`, push, och kontrollera fjärrens SHA.
3. Skriv läget där det hör hemma, och ersätt i stället för att lägga till: banans läge i lägesfilen, ett nytt besked
   i BESKED, en ny brist i BRISTER, en fråga till Jakob som kort i Beslut. Den här sidan ändras bara där en rad inte
   längre gäller.
4. Läs `npm run stada` som rapport; rör inga andra sessioners rester.
