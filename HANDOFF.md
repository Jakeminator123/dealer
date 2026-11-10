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

Nio klipp, 680 credits. Alla sju givar har verklig enhandsvändning med kantpassage enligt rutgranskning. Beslut ägs av `motions/<id>.json`; inget är godkänt av Jakob.

| Klipp | Läge |
| --- | --- |
| `pamela-p4-c1-plan-deal-02` | Ren kandidat: kant f52–54, enfärgad blå, planens plats, släpp f114–117 |
| `pamela-p1-c1-plan-deal-02` | Kandidat: vänds lågt vid bordet, ren blå, planens plats |
| `pamela-p7-c1-plan-deal-01` | Kandidat med brist: vänder direkt vid skon, liten röd markering, platt hand |
| `pamela-p4-c1-deal-calm-01` + två returer | Bra rörelse och låga returer, men gamla P4-platsen. Returerna rör kortet igen f6–18 |
| `pamela-p4-c1-plan-deal-01`, `pamela-p7-c1-plan-deal-02` | Underkända: tryckt framsida respektive mellanlandning |
| `pamela-p1-c1-plan-deal-01` | Sekundär: prickig framsida |

Jakobs betyg på äldre material samma dag: P4.C1 rått original 4,5/5 (saknar retur), V6 4/5 (byter hand), vita banken 3/5 (ingen vändning), gul/blå sekvens 2,5/5, READY2-proven "konstiga".

## Arbetsyta och publicering

- Branch `claude/deal-clips`, utgår från `bfd43fc`. `jakob/test` på GitHub står kvar på `a5821f1`.
- `placements/default.json` är Jakobs utkast (SHA `406acb69…`): återställ eller stage:a det inte. Ankare använder frysta kopior.
- Publika sajten visar fortfarande 22 filmer från `b65fd9b`. De nya klippen ligger bara lokalt under `assets/motions/` och är inte i filmbiblioteket eller Blob.
- Granskningssidor utanför Git: `D:/dealer-scratch/review/claude-browser/` (`kandidater.html`, `batch-1.html`, `batch-3.html`).
- Kredittak i jobbfilen 1 000; Jakobs ram högst 5 000 med avsikten att stanna långt under.

## Nästa steg

1. Jakob tittar på batch 1-kedjorna och batch 3 och säger om tempo, vändning och returer är rätt.
2. Returer till REDO och VILA från `pamela-p4-c1-plan-deal-02` och `pamela-p1-c1-plan-deal-02`, med startruta där fingret vilar på kortet så att släppet hamnar i returen.
3. Ny P7-tagning med slutbild av riktiga kortpixlar och gärna fingertopp i stället för platt hand.
4. Övriga platser, C2 (med C1 inbakat i båda bilderna) och dealerkorten; D.C2 stannar gult.
5. Beslut om täckt start. `kling_4` med mellanbilder är oprövat och kan låsa själva utdraget.
6. Inför valda klipp i `data/library.json` och manifest först när de är godkända.

## Verifiering

Node 24.21.0. `npm test` 31/31 inklusive kontraktstester för klippjobb. Inga underagenter eller betalda jobb kör.
