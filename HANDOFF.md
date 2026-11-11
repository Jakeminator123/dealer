# Dealer — kort överlämning

Uppdaterad 2026-11-11. Läs denna fil först, inte chatthistoriken. Detaljer finns i Git, `motions/` och länkad evidens.

## Målet

Trovärdig utdelning: två kort till P1–P7, två eller tre till dealern, med separata returer från varje kort till REDO och VILA. Scoutgaming är slutmålet och äger regler, slump och kortvärden.

Gul = stängd baksida/BACK. Blå = öppen framsida/FRONT. Samma anatomiska vänsterhand tar kortet, vänder det fysiskt och lägger det på planens plats. Färgbyte ensamt bevisar inte vändning. Framsidan måste vara en ren, nyckelbar yta eftersom Scout bestämmer kortvärdet.

## Ankarmodellen (bekräftad av Jakob)

| Ankare | Innehåll |
| --- | --- |
| Keystone 1 · VILA | Båda händerna vilar. Allt börjar och slutar här |
| Keystone 2 · REDO | Variant A: nyp i kortet i skons fönster. Variant B: fingrarna platt på kortet i skons låga öppning |
| DRAWN (variant B) | Kortet nedtryckt, plant på filten under fingrarna framför skon |
| Ankare 3 · landning per kort | Kortet på planens plats med fingertoppen kvar. Samma landningar för A och B |

Varje klipp är en handling mellan två ankare och skrivs `READY>P4.C1`, `P4.C1>IDLE`, `READY-B>DRAWN`, `DRAWN>P4.C1`. En runda är en väg genom kanterna.

## Lärdomar som styr arbetet

- **Bilderna styr, inte texten.** Modellen gör det ankarna visar. Med kortet på filten i startbilden gled det längs filten; med kortet i skon lyfte hon, oavsett ordalydelse. En önskad rörelse låses med ett ankare.
- **Verkliga rutor som ankare.** Bara kortpixlar och rekvisita byts (`tools/build-anchor.ts`). Platt målad kortyta fick modellen att hitta på tryckt framsida; riktiga kortpixlar gav ren blå.
- **Givar slutar på sitt ankare.** Sista rutan ligger 17–47 px (vid kvartsstorlek) från landningsankaret oavsett tagning. Returer som startar från ankarbilden passar därför alla tagningar och varianter, och giv och returer kan beställas samtidigt.
- **Granska i full upplösning, ruta för ruta.** Grov granskning missade ett finger genom kortet, en vändning Jakob inte kunde se och ett lyft som lästes som glid. Använd oberoende granskare och mjuka inte upp domen.
- **Ankaren var den svaga länken.** Hopklippta ankare gav för litet kort (modellen ritar det cirka dubbelt så stort och krymper det i de två sista rutorna), fingertopp bredvid kortet och rester som syns i klippens första och sista rutor. Ta ankare som hela, verkliga rutor ur modellens egna klipp, till exempel givens landningsruta före slutet. Pröva en plats, granska, och beställ först därefter parallellt.
- **Skalan.** Planens kortrutor passar ett plan (1,1 px), men händer, sko och modellens egna kort är cirka dubbelt så stora (k ≈ 2). Mätning och kortstorlek per mål: [data/scene-contract.json](data/scene-contract.json). Jakob lutar åt renderade kort i större skala; beslutet är inte fattat.
- Gamla bankens returer gick i hög båge för att prompten beställde det, och dess kort låg på en rak linje medan planen är en båge. Bakgrund: [evidence/generation-method-audit.json](evidence/generation-method-audit.json).

## Läget i klippbanken

Beslut ägs av `motions/<id>.json`; uppdraget av `data/clip-jobs.json`. 2 800 credits använda, 2 494 kvar (kontrollerat mot Runway 2026-11-11). Tak i jobbfilen 3 400; Jakobs ram högst 5 000.

| Del | Läge |
| --- | --- |
| P4.C1 variant A | Hel kedja: `…-plan-deal-02` + returer. Returen till VILA lägger handen platt över kortet f24–36 |
| P4.C2 | `pamela-p4-c2-plan-deal-01`: egen film för kort 2 (alternativ A), kort 1 orört |
| P1.C1 | Inget rent huvudklipp. `…-deal-02`: Jakob ser ingen vändning. `…-deal-03`: finger genom kortet f72–78. Returer `…-return-{ready,idle}-02` hör till deal-03 |
| P7.C1 | `…-plan-deal-01` kandidat; `…-plan-deal-02` godkänd av Jakob som variant. Inga returer |
| P2, P3, P5, P6 variant A | Ingen huvudtagning (oberoende rutgranskning). P2 tryckt framsida, P3 ingen vändning, P5 och P6 glid på bordet; alla krymper kortet i f118–119. Returerna hänger på ankare som ska göras om |
| Variant B, P4 | `pamela-p4-c1-drawn-deal-01` godkänd av Jakob ("svinbra"); har ankarrester f0–14 och hopp vid f117. Retur till VILA ren, till REDO B användbar. Båda uttagen (`pamela-readyb-draw-01`, `-02`) underkända: kortet lyfts |
| Variant B, P1, P2, P3, P5 | P5 användbar och av samma sort som P4. P1 användbar men vänds i luften. P2 krymper i slutet, P3 tryckt framsida |
| Variant B, P6, P7 | Ej byggt: armen korsar skon, skobytet i ankaret klarar inte det |
| Saknas helt | Dealerkort, vändning av täckt kort, insamling, VILA>REDO för variant A (finns i arkivet), träffkort |

Jakobs betyg på äldre material: P4.C1 rått original 4,5/5, V6 4/5 (byter hand), vita banken 3/5, gul/blå sekvens 2,5/5, READY2-proven "konstiga".

## Renderade kort ovanpå filmen

Riktning från Jakob, prövad i `tools/track-card.ts` och `tools/render-card-proof.ts` på P4: filmen ger dealer, hand och rörelse; korten renderas ovanpå filmens enfärgade yta. Spårningen ger hörn och sida per ruta (cirka 19 kB per klipp, 0,1–0,5 px skakning i vila). Fingerordning, färgflimmer och tryckt framsida rättas i lagret; handens form gör det inte. En givfilm kan tjäna båda korten på en plats om förskjutningen är högst cirka 45–50 px och går mot handen; dubbel förskjutning eller motsatt håll faller. Bedömt på stillbilder från en plats, inte av Jakob i rörelse. Provfilmer: `assets/proofs/card-overlay/`.

## Arbetsyta

- Branch `claude/deal-clips`. `jakob/test` på GitHub står kvar på `a5821f1`.
- `placements/default.json` är Jakobs utkast (SHA `406acb69…`): återställ eller stage:a det inte.
- **Labbet är granskningsytan:** `http://127.0.0.1:4319/lab.html?tab=klippbank` visar nodträd, tagningar och rundbyggare. Lösa sidor under `D:/dealer-scratch` används inte längre mot Jakob. Beställning och granskningsbeslut i labbet är inte byggda.
- Publika sajten visar fortfarande 22 filmer från `b65fd9b`. Jakob vill ha nya läget dit; kräver mediauppladdning och ombyggnad.
- Mätningen av bordsplan, kamera, ljus och mobilbeskärning är klar (`data/scene-contract.json`). Ljuset kommer uppifrån, svagt från bildvänster; skuggmatten går att lägga på nytt bord. Dagens mobilvy klipper P1.C1 helt och delar av P1.C2, P7.C1 och P7.C2.
- **Bakgrundsagenten** (Jakobs egen session, `dealer-89`) bygger rum och bord som läsande prov under `assets/proofs/bakgrund-3d/` och ändrar inga repofiler. Dess fynd 2026-11-11: (1) kontraktets kamera passar planens kort men tänjer dealern när vyn vrids, medan en lins skattad ur dealern (cirka 1 270 px, skattad) lutar korten fel — samma tvålinsproblem som skalan; (2) nyckling mot varje rutas egen gröna nivå räcker och behåller skuggorna, cirka 1,4 px grönt spill i hud och hår; (3) sko och lyft arm korsar bordskantsraden 831,5, så skon bör stå helt på filten och vara oförändrad mellan klipp; (4) med 3D-bord och 3D-rum är mobilvyn bara en annan kameravinkel.
- Jakobs smak om 3D-labbet (2026-11-11): "fantastiskt"; gillar att oskärpan har djup, att vyn lutar lite åt sidan och att bordet har markeringar.
- Labbagenten bygger renderade kort live i labbet med Jakobs kortmaterial och ett reglage för kortskala, samt granskningsknappar. Redigeringsverktyg för `aleph2` ("exakt så, men rätta") byggs; inget är beställt.
- Scoutgamings huvudagent har fått besked: inget härifrån är infört där, och insatsrutor bör vara data per bord och filmbank.

## Nästa steg

0. **Valideringsprov på en plats innan något beställs brett:** ankare som hela verkliga rutor (DRAWN ur `pamela-p4-c1-drawn-deal-01` cirka f18–22, landning ur en givs egna rutor före slutsnäppet). Pröva samtidigt Jakobs iakttagelse 2026-11-11 att klipp gjorda i ultrarapid fungerade bäst: samma ankare en gång i normal fart (4 s) och en gång i halv fart (8 s) som sedan snabbas upp 2×. Pröva även uttaget ur skon baklänges (hon skjuter in kortet; spelas omvänt).

1. Ta emot rutgranskningen av de 19 nya klippen och uppdatera `motions/`.
2. Ta emot labbagentens klippbank; lägg till beställning och granskningsbeslut i labbet; publicera till Vercel.
3. Jakob väljer mellan egen film per kort och en film per plats med renderat kort, efter att ha sett provet i rörelse.
4. P1 och P7: rena huvudklipp. P6 och P7 i variant B: skobyte bakom arm.
5. Dealerkorten; D.C2 stannar gult.
6. Bord, bakgrund och ljus enligt mätningen.

## Verifiering

Node 24.21.0. Kontraktstester för klippjobb 5/5. Hela `npm test` ska köras efter att labbagentens pågående ändringar är klara; arbetsytan innehåller ocommittat arbete från tre underagenter.
