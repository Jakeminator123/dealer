# Dealer — kort överlämning

Uppdaterad 2026-11-10 (sen kväll). Läs denna fil först, inte chatthistoriken. Detaljer finns i Git och länkad evidens.

## Målet

Trovärdig utdelning: två kort till P1–P7, två eller tre till dealern, med separata returer från varje kort till REDO och VILA. Scoutgaming är slutmålet och äger regler, slump och kortvärden.

Gul = stängd baksida/BACK. Blå = öppen framsida/FRONT. Samma anatomiska vänsterhand tar kortet, vänder det fysiskt och lägger det på planens plats. Färgbyte ensamt bevisar inte vändning. Framsidan måste vara en ren, nyckelbar yta eftersom Scout bestämmer kortvärdet.

## Diagnosen

Runway, nyckel, modell (`wan3`) och parametrar var desamma i gamla labbet och här. Metoden skilde. Gamla labbet beställde **en handling per klipp mellan två riktiga videorutor**; detta repo beställde hela giv + retur i ett 12 s-klipp vars slutbild var startposen med målad ruta. Fullständig jämförelse, mätningar och 27 hashade arkivläsningar: [evidence/generation-method-audit.json](evidence/generation-method-audit.json).

- Gamla bankens returer går i hög båge för att prompten beställde det.
- Gamla banken lägger alla spelarkort på en rak linje. Sparad plan är en båge; ingen gammal giv ligger närmare än 14 px, P7 130–143 px. Nya givar krävs.
- Täckt start (kortet helt inne i skon) har aldrig funnits som verklig ruta. READY2 var ett AI-ritat försök och är inte godkänt av Jakob.

## Recept som gav resultat

| Del | Val |
| --- | --- |
| Start | Nyp-ankaret `a2fc6d35…` (riktig ruta), samma för alla platser |
| Giv | `wan3`, 4 s, slutbild vid landning/släpp med handen kvar vid kortet |
| Slutbildens kort | **Riktiga kortpixlar** flyttade till planens ruta. Platt målad ruta fick modellen att hitta på tryckt framsida |
| Retur | 3 s från givens verkliga ruta till REDO eller VILA med kortet kvar; låg, rak väg |
| Verktyg | `tools/build-anchor.ts`, `tools/clip-job.ts`, uppdrag i `data/clip-jobs.json`. Rutin i [DRIFT](docs/DRIFT.md#anslutningar-och-miljö) |

## Resultat 2026-11-10

Tretton klipp, 920 credits. Alla sju givar har verklig enhandsvändning med kantpassage enligt rutgranskning. Beslut ägs av `motions/<id>.json`.

| Klipp | Läge |
| --- | --- |
| `pamela-p4-c1-plan-deal-02` + returer `…-plan-return-{ready,idle}-01` | Hel kedja på planens plats. Giv klipps vid landningsrutan f105, returerna startar på samma ruta (0 avvikande pixlar). VILA-returen lägger handen platt över kortet f24–36 |
| `pamela-p1-c1-plan-deal-02` + returer `…-plan-return-{ready,idle}-01` | Hel kedja på planens plats, landningsruta f112, rena returer |
| `pamela-p7-c1-plan-deal-01` | Kandidat som huvudklipp: vänder direkt vid skon, liten röd markering, platt hand |
| `pamela-p7-c1-plan-deal-02` | **Godkänd av Jakob som variant**: rörelsen in mot mitten är naturlig men ska bara förekomma ibland |
| `pamela-p4-c1-deal-calm-01` + två returer | Bra rörelse, men gamla P4-platsen och skarv med hack. Ersatt av kedjan ovan |
| `pamela-p4-c1-plan-deal-01` | Underkänd: tryckt framsida |
| `pamela-p1-c1-plan-deal-01` | Sekundär: prickig framsida |

Jakob efter granskning: "allt ser lovande ut". Han bekräftar tre ankare — VILA, REDO och ett landningsankare per kort — och påpekade hacket vid släppet i batch 1, som landningsankaret nu tar bort.

## Riktning: renderade kort ovanpå filmen

Jakobs idé, som bedöms rimlig: filmen levererar dealer, hand och rörelse; korten blir ett renderat lager (React Three Fiber) som följer filmens enfärgade kortyta. I handen följer kortet spårningen och klipps mot fingrarna; i kantläget kan sida, material och position justeras osynligt; efter släppet är kortet ett fritt objekt (fysik, glans, dra, vika). Kort 1 och 2 på samma plats skiljer 35–42 px i planen, så en givfilm per plats kan räcka om kortet flyttas i kantläget. Inget av detta är byggt. Det kräver spårningsdata per klipp (hörn per ruta, sida, fingermatt), som kan tas ur den blå/gula masken.

Jakobs betyg på äldre material samma dag: P4.C1 rått original 4,5/5 (saknar retur), V6 4/5 (byter hand), vita banken 3/5 (ingen vändning), gul/blå sekvens 2,5/5, READY2-proven "konstiga".

## Arbetsyta och publicering

- Branch `claude/deal-clips`, utgår från `bfd43fc`. `jakob/test` på GitHub står kvar på `a5821f1`.
- `placements/default.json` är Jakobs utkast (SHA `406acb69…`): återställ eller stage:a det inte. Ankare använder frysta kopior.
- Publika sajten visar fortfarande 22 filmer från `b65fd9b`. De nya klippen ligger bara lokalt under `assets/motions/` och är inte i filmbiblioteket eller Blob.
- Granskningssidor utanför Git: `D:/dealer-scratch/review/claude-browser/` (`kandidater.html`, `oversikt.html`, `batch-4.html`).
- Kredittak i jobbfilen 1 000; Jakobs ram högst 5 000 med avsikten att stanna långt under.

## Nästa steg

1. Jakob bedömer kedjorna för P4 och P1 (`batch-4.html`) och väljer väg för kort 2: egen film per kort eller en film per plats med renderat kort.
2. Prov utan Runway-kostnad: ta fram spårning ur P4-kedjan och lägg ett renderat kort i labbet.
3. P7: returer från `pamela-p7-c1-plan-deal-01` och från varianten; eventuellt ny huvudtagning med fingertopp i stället för platt hand.
4. Övriga platser P2, P3, P5, P6 och dealerkorten; D.C2 stannar gult.
5. Beslut om täckt start. `kling_4` med mellanbilder är oprövat och kan låsa själva utdraget.
6. Inför valda klipp i `data/library.json` och manifest först när de är godkända.

## Verifiering

Node 24.21.0. `npm test` 31/31 inklusive kontraktstester för klippjobb. Inga underagenter eller betalda jobb kör.
