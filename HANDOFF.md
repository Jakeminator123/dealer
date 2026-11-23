# Dealer — överlämning

Läs AGENTS.md, den här sidan och EN lägesfil för din bana. Ersätt inaktuell status; historiken finns i Git.
`tools/handoff.test.ts` håller taket: 120 rader och 900 ord.

## Läget

- Målet är en trovärdig utdelning i spelet i studion: två kort till plats 1–7 och två eller tre till dealern, med
  returer till redo och vila. Paow är dealern; Pamela är arkiverad ur main (BESKED; namnet bär kvar dockans rörelser `giv-pamela-*` och en scenfilm: skriv
  vilken du menar). Projektet är tills vidare frikopplat från Scoutgaming (Jakob 2026-11-23).
- Labbet är en vy, Bordet, där en film beställs längs en rak linje: kortets plats och steget, receptet ger resten.
  Kommandot `node tools/order-new.ts` gör samma utkast; Karta visar varje dealers träd.
  Docka är en del av Bordet (`?lage=docka`): Docklabbet med Naturlig som förval, och dockans filmer bredvid tagningarna.
- Den tatuerade uppsättningen är hans förstahandsval, och A2.3 gäller. Trädet Tatuerad fylls från A2.3 med en giv per
  plats ([film](docs/lage/film.md)). Casinot spelar ett träd med `?trad=<id>` (Karta, "Prova i Casino"); kompositionen av
  flera träd byggs.
- Kopian på nätet är publicerad på `c9d006d` den 2026-11-20 på Jakobs ord, utan nya filmer. Telefonmått, fysisk
  telefon och ljud återstår ([spelet](docs/lage/spelet.md)).
- Kontrollen före en push körs bara på datorn. Kontots tokengräns delas av alla sessioner: få underagenter.

## Nästa steg

Sammanhängande lokal väg från underlag till spelbar Blackjack (Jakob 2026-11-18), med EN trovärdig giv först ([film](docs/lage/film.md)).

1. Giv och återgång i en film är sättet (Jakob 2026-11-23): plats 1–6, kort 1, ligger i banken; plats 7 görs om;
   kort 2–7 återbrukar platsens film. Sista given går direkt till vila, en retur per plats. Hans godkända fria givar ligger i banken
   som varianter ([film](docs/lage/film.md)).
2. Dockan: kortet i handen genom vändningen, ingångarna A2.1–A2.3 och handen över skon
   ([LASMIG](dealer3d/LASMIG.md), "Naturlig ställning", Kvar).
3. Jakobs plan, domar och orderutkast skrivs aldrig över; läs hans anteckningar med `node tools/proof-notes.ts`.
4. Rundans 22 filmbehov täcks; P6 går via A2.2 ([kort](docs/lage/kort.md)).
5. Den neutrala munnen gäller alla Paows repliker utom blackjack, som väntar på hans ja; ingen har hört ljudet ([spelet](docs/lage/spelet.md)).

## Vem äger vad

- **Huvudagentens adress: `dealer-ac`.** Claude-sessionen `dealer-ac` äger commits, push, taggar, studion,
  labbservern, spelet, 3D-scenens filmlager, `src/clip-graph.ts`, registren och styrdokumenten.
  En i taget kör kontrollen och pushar: den som ska pusha säger det till den andre och väntar på "kör".
- **Jakob talar helst med huvudagenten, som delegerar** (hans ord 2026-11-17), men öppnar andra chattar när han
  vill. Den som gör något på hans ord säger det till huvudagenten och lämnar en fillista. Ingen skriver i en annans filer.
- **Huvudagentens banor:** film, kort, labbet och studion, och spelet. Filerna de äger står under Var saker ligger i varje lägesfil.
  Banorna Scen, Tal och Trailer är stängda; deras filer hålls av huvudagenten ([spelet](docs/lage/spelet.md)).
- **3D-banan** (`dealer3d/`, dockan som styr filmerna) är sedan 2026-11-18 en underagent till huvudagenten (hans
  ord) och börjar från [dealer3d/LASMIG.md](dealer3d/LASMIG.md). Mätningen är stängd; givarna från A2.3 är filmbanans.
- **Kartabanan** (vyn Karta och dealerns träd) är en egen session sedan 2026-11-23 och börjar från
  [docs/lage/karta.md](docs/lage/karta.md).
- **Andra sessioner 2026-11-23:** `dealer-e7` har grafiken på kortet (kortmodellen, `/kortlandning.html`) och lämnar
  fillistor till huvudagenten. `dealer-a4` arkiverar resten av Pamela (hans ord 2026-11-23) och pushar efter
  huvudagentens "kör". `data/clip-jobs.json` och `data/media-roles.json` skrivs av en i taget, efter fråga.
- **Jakobs egna:** planen `placements/default.json` och hans domar i `motions/` (`review`), som skrivs från Granska och
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
