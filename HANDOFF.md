# Dealer — överlämning

Läs AGENTS.md, den här sidan och EN lägesfil för din bana. Ersätt inaktuell status; historiken finns i Git.
`tools/handoff.test.ts` håller taket: 120 rader och 900 ord.

## Läget

- Målet är en trovärdig utdelning i spelet i studion: två kort till plats 1–7 och två eller tre till dealern, med
  returer till redo och vila. Paow är dealern; Pamela är pausad (namnet bär också dockans rörelser `giv-pamela-*` och en scenfilm: skriv
  vilken du menar). Scoutgaming är slutmålet på sikt.
- Labbet är en vy, Bordet, där en film beställs längs en rak linje: kortets plats och steget, receptet ger resten.
  Kommandot `node tools/order-new.ts` gör samma utkast; Karta visar varje dealers träd och vad som saknas.
- Den tatuerade uppsättningen är hans förstahandsval, och A2.3 gäller. Trädet Tatuerad fylls från A2.3 med en giv per
  kort och spelare (plats 4 har hans ja; läget per steg i [film](docs/lage/film.md)). Spelet kan inte välja träd än.
- Kortplan och order följer B-linsen. **Använd i Casino** sparar visningen, även Bred lins, för Casino och `/casino`.
- Kopian på nätet är publicerad på `c9d006d` den 2026-11-20 på Jakobs ord, utan nya filmer; kontrollen utifrån
  20/20 och åtkomsten oförändrad. Telefonmått, fysisk telefon och ljud återstår ([spelet](docs/lage/spelet.md)).
- Kontrollen före en push körs bara på datorn. Kontots tokengräns delas av alla sessioner: få underagenter.

## Nästa steg

Sammanhängande lokal väg från underlag till spelbar Blackjack (Jakob 2026-11-18), med EN trovärdig giv först ([film](docs/lage/film.md)).

1. Jakobs plan, domar och orderutkast checkas in vid avslut och skrivs aldrig över; läs hans anteckningar med
   `node tools/proof-notes.ts`. Arbeta i mappen `dealer` på `main`; [lokal rutin](tools/local-work.md): äldre träd och mediestädning.
2. P4.C2 Cykel01 är vald. Ordinarie spel återbrukar spelarnas C1 för C2/C3; egna filmer är nästa steg, inte krav nu.
   Rundans 22 filmbehov täcks. Rundbyggarens P6 går via A2.2; D.C3 är redigerbart och valfritt ([kort](docs/lage/kort.md)).
3. Använd automatiska testkvitton och det återbyggbara SQLite-indexet ([evidens](tools/evidence.md)); inga medieblobs.
4. Den neutrala munnen gäller alla Paows repliker utom blackjack, som väntar på hans ja; ingen har hört ljudet ([spelet](docs/lage/spelet.md)).
5. Hålkort, native split och READY-C:s tvåkortsprov är kontrollerade inom sina avgränsade prov. Grepp, tempo,
   mask och hela rörelsen återstår ([film](docs/lage/film.md)).

## Vem äger vad

- **Huvudagentens adress: `dealer-b0`.** Claude-sessionen `dealer-b0` äger commits, push, taggar, studion,
  labbservern, spelet, 3D-scenens filmlager, `src/clip-graph.ts`, registren och styrdokumenten. Allt arbete görs på
  `main` i mappen `dealer`; en gren bara när ett arbete uttryckligen behöver isoleras (AGENTS, "Git och samarbete").
- **Avgränsade uppdrag** anger sina filer före skrivning och lämnar över till huvudagenten med en fillista.
- **Jakob talar bara med huvudagenten**, som håller ihop sessionerna. Varje bana får sin kö av huvudagenten och säger
  till när ett steg är grönt, med en fillista. Ingen bana skriver i en annans filer.
- **Huvudagentens banor:** film, kort, labbet och studion, och spelet. Filerna de äger står under Var saker ligger i varje lägesfil.
  Banorna Scen, Tal och Trailer är stängda; deras filer hålls av huvudagenten ([spelet](docs/lage/spelet.md)).
- **3D-banan** (`dealer3d/`, dockan som styr filmerna) är sedan 2026-11-18 en underagent till huvudagenten (hans
  ord) och börjar från [dealer3d/LASMIG.md](dealer3d/LASMIG.md). Mätningen är stängd; givarna från A2.3 är filmbanans.
- **Jakobs egna:** planen `placements/default.json` och hans domar i `motions/` (`review`), som skrivs från Granska och
  aldrig skrivs över av ett verktyg. En dom som getts åt honom (`node tools/review-put.ts`) är aldrig hans.
- **En ny session** arbetar i mappen `dealer` och avgränsar sina filer först. Extra arbetsträd bara vid
  isoleringsbehov (skillen `bredvid-andra-sessioner`). Kortets vita kant i filmerna och `tools/film-after.ts` skrivs
  sedan 2026-11-23 av huvudagentens underagent: fråga `dealer-b0` först.

## Väntar på Jakob

Prov han ska döma är kort i Beslut. Läs dem i studions vy Beslut (`/studio/beslut/`) eller i
registret `data/decisions.json`: fältet `answer` bär hans val och hans anteckning. Bara filmer och bilder blir kort
(skillen `visa-for-jakob`); teknik och arbetssätt frågas i chatten. Kortet tas ut när svaret är utfört.

## Läs för ditt ämne

- Jakobs gällande besked, per ämne: [docs/BESKED.md](docs/BESKED.md). Slå upp ämnet när ett beslut är i fråga.
- Kända brister, med vad som är prövat: [docs/BRISTER.md](docs/BRISTER.md).
- Lägesfilerna, en per bana, alla i samma form (Läget, Nästa steg, Väntar på Jakob, Var saker ligger, Fällor):
  - [docs/lage/film.md](docs/lage/film.md): filmerna, ankarna, Beställ, banken och saldot.
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
4. Läs `npm run stada` som rapport. Utför bara ett kontrollerat eget mål åt gången enligt DRIFT; inga andra sessioners rester.
