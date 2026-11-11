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
- **Skarvregeln.** En retur som startar på en ruta ur en giv kräver att given klipps på just den rutan; en retur som startar på en ankarbild passar alla givar som slutar där. `resolveRound` i `src/clip-graph.ts` räknar ut intervallen. Hela klipp efter varandra ger ett hack: handen lyfter och hoppar tillbaka ner på kortet (fokusprovet 2026-11-11, uppmätt hopp vid ruta 120; rättat så att 3D-scenen läser rundan ur banken).
- Gamla bankens returer gick i hög båge för att prompten beställde det, och dess kort låg på en rak linje medan planen är en båge. Bakgrund: [evidence/generation-method-audit.json](evidence/generation-method-audit.json).

## Läget i klippbanken

Beslut ägs av `motions/<id>.json`; uppdraget av `data/clip-jobs.json`. 44 beställda klipp och ett återfört ur arkivet, 3 156 credits använda, 2 138 kvar (kontrollerat mot Runway 2026-11-11). Tak i jobbfilen 3 400; Jakobs ram högst 5 000.

**Jakobs beslut 2026-11-11: börja med en film per plats.** Platsens tre filmer är första kortets (giv, retur till REDO, retur till VILA); andra kortet spelar samma filmer med det renderade kortet flyttat till sin plats. Dealern behöver två uppsättningar, eftersom D.C2 stannar stängt. Då behövs 30 filmer i stället för 51. Av dem finns 17 med ett klipp som inte är underkänt: 9 kandidater (ingången, P4 × 3, P1 och P2 returer, P7 giv) och 8 med kända brister (givarna P1, P2, P5, P6 och returerna P5, P6). 13 saknas: P3 × 3, P7 returer, dealern × 6, vilo-loop och REDO>VILA. Avståndet kort 1 till kort 2 i planen är 23–48 px utom P3 (54 px); provet på P4 höll till cirka 45–50 px, och P7 flyttas bort från skon, vilket är oprövat. Egen film per kort finns kvar som utväg där flytten inte håller. Gränsen 50 px är ingen spärr utan en varning: P3 behandlas som övriga platser.

**Omgång 6, beställd 2026-11-11 (360 credits, tak höjt till 3 800):** `pamela-p7-c1-plan-return-ready-01` och `-idle-01` (startar på ruta 105 ur P7-given), `pamela-idle-loop-01` (första och sista bild är ruta 0 ur ingångsklippet), samt omtagningar `pamela-p3-c1-plan-deal-02` och `pamela-p5-c1-plan-deal-02` vars slutbild är en hel verklig ruta ur respektive första giv (ruta 112 och 108) i stället för ett hopklippt ankare. Ska rutgranskas oberoende innan P6 och returerna för P3 och P5 beställs. Parallellt inventeras gamla labbets klipp från 10 november (dealerkort, P3, P5, P6) som möjliga gratis kandidater.

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
| Ingång VILA>REDO, variant A | `pamela-idle-ready-entry-01`: återfört ur gamla labbet (2 s, betalt där). Slutbilden är dagens REDO-ankare byte för byte, så klippet går över i varje giv i variant A. Tomt bord, snabb rörelse. Väntar på Jakobs dom |
| Saknas helt | Dealerkort, vändning av täckt kort, insamling, träffkort, REDO>VILA utan kort och vilo-loop. Gamla labbets viloklipp passar inte som de är: vitt kort i skon och 1 762 px bredd. En ny vilo-loop beställs från en verklig viloruta när huvudvarianten är vald |

Jakobs betyg på äldre material: P4.C1 rått original 4,5/5, V6 4/5 (byter hand), vita banken 3/5, gul/blå sekvens 2,5/5, READY2-proven "konstiga".

## Renderade kort ovanpå filmen

Riktning från Jakob, prövad i `tools/track-card.ts` och `tools/render-card-proof.ts` på P4: filmen ger dealer, hand och rörelse; korten renderas ovanpå filmens enfärgade yta. Spårningen ger hörn och sida per ruta (cirka 19 kB per klipp, 0,1–0,5 px skakning i vila). Fingerordning, färgflimmer och tryckt framsida rättas i lagret; handens form gör det inte. En givfilm kan tjäna båda korten på en plats om förskjutningen är högst cirka 45–50 px och går mot handen; dubbel förskjutning eller motsatt håll faller. Bedömt på stillbilder från en plats, inte av Jakob i rörelse. Provfilmer: `assets/proofs/card-overlay/`.

## Blackjack-studion och kortkomponenterna (läst 2026-11-11, inget ändrat där)

`local-studio/blackjack-studio` är Jakobs fristående studio ("Göran"): TypeScript direkt i Node, egen server, three r180, ingen React eller Fiber. Den har redan spelmotor (7 boxar, 8 lekar, dolt kort), klipptidslinje, ett mätt kortankare per klipp (`creator-card-anchor/v1`), bord, sko och rum i meter, och 3D-kort ovanpå film. `new-front2` är en landningssida i Next/React/Fiber; dess kortmesh är källan till labbets Material-panel. Slutsats: dags att enas om kontrakt, inte att slå ihop kod. **Jakobs besked 2026-11-11:** hänger något på Göran struntar vi i det materialet; Pamela är dealern. Görans grundbild är framställd ur ett uppladdat foto (`goran.png`) utan noterat tillstånd, så hans projekt, 19 klipp, tio kortlägen och ankare används inte, och inte heller trä-casinobilden `c7ef9e9c` (uppladdad, ursprung okänt). Fritt från honom och återbrukbart: `blackjack/` (regelmotor), `money/`, `players/`, `scene/furniture.ts` (bord, sko, salong), `panorama-room.ts`, `atmosphere.ts`, miljöerna Las Vegas och Los Angeles, och texturerna från Poly Haven (CC0, `material-sources.json`).

**Tidigare 3D-utkast med Pamela** ligger i gamla labbet: `runs/20261109-pamela-stage/` ("En scen med djup": 3D-bord med kant, eget rum, ljusval; kod `src/pamela-stage-client.tsx`) och `runs/20261110-pamela-studio-integration/take-02/` (panoramasfär, markerbräde, insatsringar och renderade 3D-kort; kod `src/pamela-modular-stage-client.tsx`). I båda är hon en platt stillbild. Skärmbilder visas i labbets Prov under `pamela-3d-utkast`. Kvar att stämma av med Jakob: platsnumrering (studion räknar vänster till höger från kameran och delar ut till plats 7 först), giv-ordning, kortmått 63×88 mm i meter, ankarschema och mätt filmkamera kontra fri 3D-kamera.

## Arbetsyta

- Branch `claude/deal-clips`. `jakob/test` på GitHub står kvar på `a5821f1`.
- `placements/default.json` är Jakobs utkast (SHA `406acb69…`): återställ eller stage:a det inte.
- **Labbet är granskningsytan:** `http://127.0.0.1:4319/lab.html?tab=klippbank` visar nodträd, tagningar, rundbyggare, renderade kort med Jakobs kortmaterial (reglage för kortskala) och knapparna Godkänn, Variant, Underkänn. Fliken Prov visar provfilmer, och "3D-scen ↗" öppnar `scene3d.html`. Lösa sidor under `D:/dealer-scratch` används inte längre mot Jakob. Beställning från labbet är inte byggd.
- **Etapper:** ett stabilt läge som Jakob har sett taggas `jakob-N` och pushas, så att allt kan backas etapp för etapp (rutin i `docs/DRIFT.md`). `jakob-3` = 3D-scenen i labbet med fokus, fläktskugga och rätt klippunkter, plus ingångsklippet.
- Publika sajten visar fortfarande 22 filmer från `b65fd9b`. Jakob vill ha nya läget dit; kräver mediauppladdning och ombyggnad.
- Mätningen av bordsplan, kamera, ljus och mobilbeskärning är klar (`data/scene-contract.json`). Ljuset kommer uppifrån, svagt från bildvänster; skuggmatten går att lägga på nytt bord. Dagens mobilvy klipper P1.C1 helt och delar av P1.C2, P7.C1 och P7.C2.
- **Bakgrundsagenten** (Jakobs egen session, `dealer-89`) äger `scene3d.html` och `src/scene3d-*.ts`: rum, bord, ljus, styrbart fokus och fläktskugga, med rundor lästa ur klippbanken. Den säger till när ett steg är stabilt, och klippagenten committar. Prov under `assets/proofs/bakgrund-3d*/`. Panoramabilden `assets/scene/panorama-vegas.jpg` har klarlagt ursprung (kontrollerat 2026-11-11): skapad i Jakobs egen Codex-session 2026-11-07 med OpenAIs bildmodell, ingen tredjepartslicens. Originalet (PNG 1774×887 med C2PA-signatur) ligger i `C:/Users/jakem/.codex/generated_images/01a1b3e8-dd54-7201-bb99-f0fc6e46fb59/`, prompten i `Desktop/wow/rumsstudie-3d-2026-11-07/.cache/room-study/las-vegas/provenance.json`, och samma bild finns redan i `Jakeminator123/scoutgaming` (commit `929868053`). Vår kopia är en omkodad JPEG av originalet. Dess fynd 2026-11-11: (1) kontraktets kamera passar planens kort men tänjer dealern när vyn vrids, medan en lins skattad ur dealern (cirka 1 270 px, skattad) lutar korten fel — samma tvålinsproblem som skalan; (2) nyckling mot varje rutas egen gröna nivå räcker och behåller skuggorna, cirka 1,4 px grönt spill i hud och hår; (3) sko och lyft arm korsar bordskantsraden 831,5, så skon bör stå helt på filten och vara oförändrad mellan klipp; (4) med 3D-bord och 3D-rum är mobilvyn bara en annan kameravinkel.
- Jakobs smak om 3D-labbet (2026-11-11): "fantastiskt"; gillar att oskärpan har djup, att vyn lutar lite åt sidan och att bordet har markeringar.
- Kortspårningen (`src/card-track.ts`) är inställd på P4 och går fel på flera andra klipp (tappat kort, fel sida, ingen kantfas); det renderade kortet stämmer därför bara säkert på P4 och på returerna.
- Scoutgamings huvudagent har fått besked: inget härifrån är infört där, och insatsrutor bör vara data per bord och filmbank.

## Nästa steg

0. **Valideringsprovet 2026-11-11 är gjort och oberoende granskat (356 credits).** Hela verkliga rutor som ankare fungerar: `pamela-p4-c1-drawn-deal-02` är användbar och utan rester; kvar är att startankarets kort är cirka 30 % större än landningens och att grönt mörknar för varje generation. Tre spår är prövade och förkastade: ultrarapid som snabbas upp (inte bättre, dubbla priset), uttaget ur skon baklänges (lyfter 1,1 kortlängd, sämre), och `aleph2`-redigering (felet kvar, vändningen förstörd, synliga skarvar; API:t kräver dessutom minst 2 s fönster). **Uttaget ur skon är olöst**; otestat förslag: ankare där kortet redan är halvvägs ute på filten. Nästa beställning: normal fart 4 s, verkliga rutor som ankare, ett ankarpar per plats med samma kortstorlek och grönnivå, en plats i taget.

1. Kvar för Jakob att bestämma: huvudvariant A eller B (banken är längst kommen i A; B är den han beskrev och har P4 och P5), och kortens storlek, som med renderade kort är ett reglage och inte hindrar beställning. Nodkartan byggs om för en film per plats.
2. Beställ därefter en plats i taget enligt punkt 0; P1 och P7 behöver rena huvudklipp, P6 och P7 saknar variant B (skobyte bakom arm).
3. Vilo-loop och dealerkorten; D.C2 stannar gult.
4. Beställning från labbet; rätta kortspårningen för andra platser än P4.
5. Renderade kort inne i 3D-scenen (bakgrundsagentens nästa steg); publicera nya läget till Vercel när Jakob säger till.

## Verifiering

Node 24.21.0. `npm test` 116 av 116 (2026-11-11). 3D-bilden kontrolleras av bakgrundsagenten i headless Chrome mot 4319; klippagentens testwebbläsare ritar den inte.
