# Dealer

Självständig arbetsyta för en filmad dealer till Jakobs blackjackspel, frikopplad från Scoutgaming i nuläget (Jakob
2026-11-23): två kort till sju spelare och en dealer, med trovärdig
utdelning. Rörelserna är korta filmklipp mellan fasta ankare (vila, redo, kortets plats) i en klippbank; en runda är en
väg genom klippen, och samma rundor spelas i labbet, i 3D-scenen och i spelet. V6, Pamelas referensfilm, är arkiverad på
Jakobs ord (2026-11-20); filmen och 18 rutor står kvar. Scoutgaming äger regler, slump och kortvärden.

Mapparna:

```
START.cmd STOPP.cmd STATUS.cmd   starta, stoppa och fråga labbservern på 127.0.0.1:4319
README.md AGENTS.md HANDOFF.md   läs först
studio/       studion: Jakobs arbetsyta i webbläsaren (Next.js)
pages/        sidorna bredvid studion: 3D-sidan (scene3d.html), Ljud (sound.html) och Modeller (props.html)
.claude/skills/  agenternas skills: ett arbetsmoment per mapp, med reglerna som oftast bryts och pekaren till rutinen
dealer3d/     3D-banans arbetsmapp: bordets lins, en giv som geometri och sidan som visar den från valfri stol
game/         spelet: den fristående spelmotorn med Scouts regler oförändrade i sak; spelsidan i game/page/
src/          den delade motorn och sidornas kod: 3D-scen, klippgraf, kort, placering, beställningar
tools/        kommandon, labbservern (preview.ts), instruktionerna (*.md) och testerna (*.test.ts)
cloud/        studions onlinekopia: lås och bot
materials/    kort- och markerprov
data/         register: manifest.json (filernas SHA-256), klippjobb, scenkontrakt, filmkatalog
motions/      en post per film med Jakobs dom
placements/   Jakobs kortplan
evidence/     verifieringskvitton
docs/         SYSTEM, DRIFT, TAL, FILMMODELLER, BESKED, BRISTER och läget per bana (lage/)
assets/ output/ .runtime/        lokal media och lokala byggen, inte i Git
```

Arkivet är det tidigare projektet på D: (snyggare-dealer). Sidorna har kvar sina adresser (`/scene3d.html`,
`/game.html` …); bara filerna ligger i mappar.

| Läsning | Innehåll |
| --- | --- |
| [AGENTS](AGENTS.md) | Arbetsregler för agenter. |
| [HANDOFF](HANDOFF.md) | Startsidan, en sida (högst 120 rader och 900 ord, `tools/handoff.test.ts`): läget i korthet, nästa steg, vem som äger vad och pekarna vidare. Läs den först. |
| [Läget per bana](docs/lage/) | En lägesfil per bana i fast form (Läget, Nästa steg, Väntar på Jakob, Var saker ligger, Fällor), högst 60 rader och 800 ord: [film](docs/lage/film.md), [kort](docs/lage/kort.md), [labbet och studion](docs/lage/labbet-och-studion.md), [spelet](docs/lage/spelet.md) och den stängda [mätningen](docs/lage/matning.md); 3D-banans är [dealer3d/LASMIG.md](dealer3d/LASMIG.md). |
| [Jakobs besked](docs/BESKED.md) | Hans gällande besked per ämne, högst två rader per besked; äldre och ersatta besked finns i Git. Slås upp när ett besked är i fråga. |
| [Kända brister](docs/BRISTER.md) | Varje känd brist: var den syns, vad som är prövat och vad som stänger den. |
| [SYSTEM](docs/SYSTEM.md) | Kontrakt: koordinater, register, 3D-scenen, spelet, klippbanken och ordlistan. |
| [DRIFT](docs/DRIFT.md) | Rutiner och anslutningar: Git och kontroller, labbservern, Runway och publicering. |
| [Lokal arbetsplats och medier](tools/local-work.md) | Arbete i mappen `dealer` på C:, äldre träd och grenar, andra IDE:ers ändringar och `npm run media:status` för lagringsöversikten. |
| [Löpande bandet](tools/dealer-line.md) | Den enda vägen från en bild av en person till en dealer som spelar en runda: femton rader först, sedan stationer, format, namn och kommandon. |
| [Tal](docs/TAL.md) | Dealerns repliker med talfilm och ljud: hur en talfilm görs, hur spelet spelar den och vad som går i ett spel i rörelse. |
| [Filmmodellerna](docs/FILMMODELLER.md) | Vad varje filmmodell används till och kostar, hur dess filmer ser ut i banken, vad som håller och faller, och kontrollen för en film från en ny modell. Läs den före ett modellval. |
| [Filmhandbokens omgångar](tools/film-prov.md) | Protokollet bakom filmhandboken: omgångar, mallar och domar per metod. Slås upp med sökning, läses inte hel. |
| [Lokal evidens](tools/evidence.md) | Automatiska testkvitton och återbyggbart SQLite-index över körningar och materialets ursprung. |

## Register

- `motions/<clip-id>.json` är ensam källa för en films klassning och Jakobs beslut.
- `data/clip-jobs.json` är klippbankens register: ankare, jobb (filmerna som gjordes genom Runways API; inga nya läggs
  där), härledda tagningar (bland dem allt från Beställ) och API-tidens kredittak. `data/orders/<id>.json` är studions beställningar;
  `data/dealers.json` och `data/media-roles.json` säger vilka dealers som finns och vilka bilder som gäller;
  `data/order-methods.json` är metoden som beställs per steg, och `data/order-policy.json` taken för betald generering.
- `placements/default.json` är Jakobs kortplan (16 kortplatser) och sparas från studions Bordet, del Kortplan.
- `data/decisions.json` är det som väntar på Jakobs svar, ett kort per sak i studions Beslut. Agenter lägger till och tar
  bort poster; bara sidan skriver hans svar (`tools/decision-store.ts`, läsaren och reglerna i
  `tools/decision-register.ts`).
- `data/proof-notes.json` är Jakobs egna ord om proven (Granska, del Prov): Bra, Inte bra och en kommentar per film, bild
  eller prov, och huvudagentens svar. Bara sidan skriver hans ord, på hans klick (`tools/proof-notes-store.ts`, reglerna
  i `tools/proof-notes-register.ts`). Det han har sagt läses före ett svar till honom: `node tools/proof-notes.ts` visar
  det olästa, nyast först; `--answer <nr> "<text>"` svarar (visas under hans ord som Huvudagenten), `--read <nr>`
  markerar läst.
- `data/lipsync.json` är fakta om läppsynken (hur munnen görs och hur ett jobb kommer dit, vad som gäller per dealer, vad en
  ny film eller dealer kräver, grundbilder, kedjan med format och skalor, inställningar, prov, licenser och det som är
  öppet), visad i studions Lipsync och som text i `docs/TAL.md`; läsaren och reglerna i
  `tools/lipsync-register.ts`, labbserverns svar i `tools/lipsync-store.ts`.
- `data/manifest.json` registrerar filproveniens och SHA-256 (sökvägarna i den räknas från repots rot); `evidence/`
  innehåller verifieringskvitton.

Dokumenten länkar till dessa i stället för att föra egna statusregister. Media (`assets/`, `output/`), `.runtime/`,
`.env*` och `private/` är lokala och Git-ignorerade.

## Kör lokalt

- Arbeta här. `node -p process.version` ska visa `v24.22.3` via Volta; `package.json` kräver `>=24.22.3 <25`. `npm ci`
  behövs om beroenden saknas. Roten och `studio/` binder nu samma Node 24.22.3 (Jakob 2026-11-20); bara `studio/`
  binder dessutom npm 11.19.1. Studiobygget med `tools/studio-from-commit.ts` startas från roten och går på rotens
  Node, liksom testerna och pushkontrollen.
- `START.cmd` startar labbservern på `http://127.0.0.1:4319` utan fönster och visar studion i en enda flik; `STATUS.cmd`
  och `STOPP.cmd` frågar och stoppar. `node tools/preview.ts --open "<sida>"` visar en sida i den öppna fliken i stället
  för i en ny, och `--restart` byter server utan att fliken stängs. Öppnas en labbflik till stänger den äldre sig själv,
  eller blir tom där webbläsaren inte låter en sida stänga sin flik. Rutinen:
  [DRIFT](docs/DRIFT.md#labbservern-och-fliken). Servern står kvar tills `STOPP.cmd` körs.
- [Studion](http://127.0.0.1:4319/studio/) är skalet (`/` och `lab.html` leder dit): en Next.js-app i `studio/` som
  byggs med `npm --prefix studio run build` och lämnas ut av samma server. Den öppnar på Bordet. Menyn
  (`studio/components/shell/Rail.tsx`) har vyerna:
  - **Bordet**: bordet i en ram, med delarna **Kortplan** (kortplanen på bilden: var kortet landar och hur det kommer dit;
    Spara skriver bara `placements/default.json`), **Beställ** (filmerna att beställa, med det som skickas till Runway för
    var och en, och Kön: Det här skickas, godkännandet och Protokoll), **Scen** (en runda i 3D-scenen och scenens
    reglage), **Råfilm** (filmerna som de är, på sin gröna) och **Efterarbete** (det som läggs över filmen: korten och
    markerna). De gamla adresserna `/studio/` med runda och look, `/studio/scen/`, `/studio/placering/` och
    `/studio/bestall/` leder dit.
  - **Karta**: nodträdet, varje stegs Primär och dess sekundära filmer, med hur spelet använder var och en
    (`/studio/primara/` leder hit).
  - **Docka**: en del av Scen & bord (`/studio/bordet/?lage=docka`): Ställ dockan (Docklabbet i en ram, med reglage och
    Spara som standard) och Dockans filmer bredvid de beställda tagningarna (`dealer3d/page/`, [dealer3d/LASMIG.md](dealer3d/LASMIG.md)).
    Knappen Beställ given gör dockans film ur den sparade rörelsen och ett utkast i Kön (`node tools/doll-order.ts paow P6.C1`).
  - **Granska**: Filmer, med Jakobs domar som skrivs i `motions/`, och Prov, provmapparna under `assets/proofs/`
    (`/studio/granska/?prov=<mapp>`; `/studio/prov/` leder dit).
  - **Material** (vilka bilder som gäller), **Lipsync** (var munnen görs och vad som är inställt, skrivskyddad) och
    **Casino** (spelet med vald look).
  - I foten **Beslut** (det som väntar på Jakobs svar) och **Ordlista**, och sidorna bredvid studion: **Ljud**,
    **Modeller** och Scens knapp **3D-sidan** (utvecklarens 3D-sida med samma look, [SYSTEM](docs/SYSTEM.md)).

  **Jämför** (två tagningar av samma steg sida vid sida) nås från en tagning i Granska och Karta. Kopian på nätet har
  samma meny utan Lipsync och Docka, Bordet utan Beställ och utan sparning, och i stället för Beslut **Önskemål** och boten (Fråga).
- Filmgranskningen har steg ±1 bildruta, kapitel och hastighet 0,25×/0,5×/1×. URL-parametrarna `clip` och `frame` pekar
  ut klipp och granskningsruta.
- `npm test` kör kärnan offline: publiceringsskyddet, spelets regler, hans domar och val, beställningarna, kortplanen
  och dokumentens tak.
  `npm run hooks:install` aktiverar lokal pre-push; `npm run check` kontrollerar commitintervallet före push/PR. Se
  [rutinen](docs/DRIFT.md#git-och-kontroller).
- `npm run verify` kontrollerar de registrerade lokala filerna mot sin hash i `data/manifest.json`; det som är
  arkiverat (V6:s råmaterial och renderare) hoppas över.

## Verifierad bas och gräns

Enligt reproduktionskvittot återrenderades hela V6 lokalt: 926 rutor, 30 fps, 1762×1174 och 1080×1920. Båda
MP4-filerna var byteidentiska med originalen; 18 kontrollrutor var pixelidentiska enligt bildrutekvittot, också efter
renderinläsningsrättningarna (kvittona ligger i V6-arkivet under `evidence/` sedan 2026-11-23). Det verifierade V6,
inte utdelning till alla åtta platser. På Jakobs
ja (Beslut `v6-arkiv`, 2026-11-20) ligger råmaterialet, renderaren och återskapningen sedan 2026-11-23 i
`D:/dealer-archive/v6-2026-11-23`, med hashlista och en README om hur V6 återskapas därifrån; filmen och 18
rutor i `assets/reference/`, duken och plåten står kvar. Kända begränsningar för fingermask, rörelsekanter och källskarvar kvarstår.

`src/` och `tools/` kör utan det förra projektet (snyggare-dealer, arkivet på D:). `materials/` är separata kort- och
markerprov; TS-materialkällorna har inte återbyggts till de frysta JS-bundlarna. Labbet och 3D-scenen läser
kortmaterialets TS-källa direkt; det ändrar inte V6-filmen eller de historiska bundlarna.

Publikt källrepo: [Jakeminator123/dealer](https://github.com/Jakeminator123/dealer), utan media och hemligheter. Vad som
kräver Jakobs uttryckliga ord står i [AGENTS](AGENTS.md), "Det som skyddar Jakob". Den äldre publika sidan
(gamla labbet på nätet) togs ned 2026-11-23 på Jakobs ord; studions kopia är den enda sidan på nätet:
[DRIFT](docs/DRIFT.md#den-låsta-kopian-på-nätet).

## Historiskt underlag

Kvittona som gäller i dag ligger i `evidence/`, ett per fråga, och det som följer av dem står i SYSTEM, "Återbruk och
införande"; beslut per film står i `motions/`. Kvittona om Pamelas bank och V6 togs ur projektet med henne 2026-11-23
(Git-historiken har dem, V6:s i V6-arkivet). Runway-underlaget från 10 november (promptar, start- och slutbilder,
resultat) är Prov-mappen `runway-underlaget-10-nov`. Kvitton som inget annat dokument pekar på: placeringslabbets
grundkontroller ([placement-lab](evidence/placement-lab.json)), vy- och nodkontroller
([plane-and-nodemap](evidence/plane-and-nodemap.json)), den externa granskningen
([external-review-triage](evidence/external-review-triage.json)) och städkvittot från arkivflytten
([coach-production-triage](evidence/coach-production-triage.json)).
