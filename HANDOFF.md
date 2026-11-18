# Dealer — överlämning

Startsidan för en ny session: läs den här sidan och sedan EN lägesfil (din banas), så kan du börja. Sidan är ingen
dagbok och inget arkiv: högst 120 rader och 900 ord, och `tools/handoff.test.ts` håller taket. Det som har hänt står i
Git, och en rad som inte längre gäller ersätts.

## Läget

- Målet är en trovärdig utdelning i spelet i studion: två kort till plats 1–7 och två eller tre till dealern, med
  returer till redo och vila. Paow är dealern; Pamela är pausad. Scoutgaming är slutmålet på sikt.
- Labbet är en vy, Bordet. Material kan ställas för hand, och Prov bär Jakobs egna anteckningar.
- Filmstandardens första del (mall 10) är inne, och den tatuerade uppsättningen är hans förstahandsval. Nya ankare
  (2.3, sedan 2.2) tas ur en film som 3D-banans docka styr.
- Kortplanen ritar verkliga kort genom en lins; spelets liggande kort följer den inte än.
- Kopian på nätet är sekundär och publiceras bara på hans ord; senast 2026-11-18 från `2e3967c`, med nytt lösenord.
- GitHubs kontroll nekas än av kontots betalningslås, fast han har betalat ([BRISTER](docs/BRISTER.md)).

## Nästa steg

1. Byt adressraden nedan till din egen, starta vakten på hans kö i Beställ, och läs hans anteckningar
   (`node tools/proof-notes.ts`) och svaren i Beslut före första svaret till honom.
2. Se att fjärren är i kapp med `main` och att inget arbetsträd bär arbete som inte är inne (`git worktree list`).
   Grenen `rak-linje` (beställningen i en rak linje, med `film-standard-register`) granskas och slås ihop av
   huvudagenten. Slaskdiskens inventering väntar på huvudagentens val (`D:/dealer-scratch/tmp/stad-1118/`).
3. Filmerna först: ankare 2.3 (MODEL:s tagning är levererad; kandidaten läggs som Prov för honom), sedan given från
   2.3 på 3 s och filmen med kort ett till alla platser (3D gör dockfilmerna), sedan ankare 2.2
   ([film](docs/lage/film.md)).
4. Läs vad besökarkontrollen av kopian fann (BRISTER), och för förslagen som sänker GitHubs kostnad till honom.
5. Utför de besvarade korten i Beslut och ta ut dem. Låt en oberoende granskare ge sitt omdöme om tagningarna som
   väntar i Prov, eller märk avgjorda prov som avgjorda ([labbet](docs/lage/labbet-och-studion.md)).

Äldre frågor till honom som inte är kort än: `D:/dealer-scratch/tmp/handoff-nytt/forslag-kort.md`; huvudagenten
väljer några åt gången.

## Vem äger vad

- **Huvudagentens adress: `dealer-32`.** Adressen är det andra sessioner skriver till med SendMessage, och den står bara
  på den här raden; rubriken Jakob ser på chatten betyder inget. Byter rollen session, ändras den här raden och inget
  annat. Kontrollera med ListAgents före ett meddelande. Huvudagenten äger commits, taggar och push, studion,
  labbservern, spelet och 3D-scenens filmlager, `src/clip-graph.ts` och styrdokumenten.
- **Jakob talar bara med huvudagenten**, som håller ihop sessionerna. Varje bana får sin kö av huvudagenten och säger
  till när ett steg är grönt, med en fillista. Ingen bana skriver i en annans filer.
- **Huvudagentens banor:** film, kort, labbet och studion, och spelet. Filerna de äger står under Var saker ligger i varje lägesfil.
  Banorna Scen, Tal och Trailer är stängda; deras filer hålls av huvudagenten ([spelet](docs/lage/spelet.md)).
- **3D-banan:** mappen `dealer3d/` på grenen `dealer-3d`, i arbetsträdet `D:/dealer-scratch/tmp/dealer-3d/trad`. Den
  skriver bara där och i sina prov (`assets/proofs/dealer-3d-<namn>/`). Sessionen `3D` gör dockfilmerna för given
  från ankare 2.3; en ny session börjar från [dealer3d/LASMIG.md](dealer3d/LASMIG.md).
- **Mått ur en riktig dealers film och ankare 2.3 (MODEL):** skriver bara i `D:/dealer-scratch/tmp/yt-referens/` och
  `D:/dealer-scratch/tmp/ankare-2-3/`, inget i repot.
- **Jakobs egna:** planen `placements/default.json` och hans domar i `motions/` (`review`), som skrivs från Granska och
  aldrig skrivs över av ett verktyg. En dom som getts åt honom (`node tools/review-put.ts`) är aldrig hans.
- **En ny session** arbetar i ett eget arbetsträd på en kort gren och skriver först till huvudagenten vilka filer den
  tar (skillen `bredvid-andra-sessioner`).

## Väntar på Jakob

Det som väntar på honom är kort i Beslut. Läs dem i studions vy Beslut (`/studio/beslut/`) eller i
registret `data/decisions.json`: fältet `answer` bär hans val och hans anteckning. En fråga till honom ställs bara som
ett kort där (skillen `visa-for-jakob`), och kortet tas ut när svaret är utfört.

## Läs för ditt ämne

- Jakobs gällande besked, per ämne: [docs/BESKED.md](docs/BESKED.md). Slå upp ämnet när ett beslut är i fråga.
- Kända brister, med vad som är prövat: [docs/BRISTER.md](docs/BRISTER.md).
- Lägesfilerna, en per bana, alla i samma form (Läget, Nästa steg, Väntar på Jakob, Var saker ligger, Fällor):
  - [docs/lage/film.md](docs/lage/film.md): filmerna, ankarna, Beställ, banken och saldot.
  - [docs/lage/kort.md](docs/lage/kort.md): det ritade kortet och kortplanens regel.
  - [docs/lage/labbet-och-studion.md](docs/lage/labbet-och-studion.md): Bordet, Material, Prov, Beslut och verktygen.
  - [docs/lage/spelet.md](docs/lage/spelet.md): spelet, kopian på nätet, läpparna och de stängda banornas arbete.
  - [dealer3d/LASMIG.md](dealer3d/LASMIG.md), avsnittet Överlämning: 3D-banan.
- Kontrakt och ordlista: [docs/SYSTEM.md](docs/SYSTEM.md). Rutiner, kopian och slaskdisken:
  [docs/DRIFT.md](docs/DRIFT.md). Talet: [docs/TAL.md](docs/TAL.md).
- Handböckerna: [tools/dealer-line.md](tools/dealer-line.md) (en ny dealer eller en film),
  [tools/film-prompting.md](tools/film-prompting.md) (beställningens text och bilder),
  [tools/film-review.md](tools/film-review.md) (granskningen).
- Ett arbetsmoment som återkommer har en skill i `.claude/skills/` (AGENTS, "Läs först").

## Före avslut

Rutinen står i skillen `avsluta-arbete`. I korthet:

1. Vänta in eller stoppa egna underagenter. Inget ocommittat får ligga kvar utom `placements/default.json`.
2. `npm test`, uttrycklig staging av egna filer, commit, `npm run check`, push, och läs GitHub-kontrollens resultat.
3. Skriv läget där det hör hemma, och ersätt i stället för att lägga till: banans läge i lägesfilen, ett nytt besked
   i BESKED, en ny brist i BRISTER, en fråga till Jakob som kort i Beslut. Den här sidan ändras bara där en rad inte
   längre gäller.
4. Städa `D:/dealer-scratch` med `npm run stada` från huvudträdet, läs rapporten och kör `npm run stada -- --kor`.
