# Handbok: så komponeras en filmbeställning

Den tredje i familjen: [order-clerk.md](order-clerk.md) säger hur en beställning läggs, [film-review.md](film-review.md) hur filmen granskas, och den här hur beställningen sätts ihop: bilder, referensfilm, text, modell, längd och tagningar. Skriven 2026-11-13 ur tillverkarnas guider, våra liggare (25 omgångar, `D:/dealer-scratch/tmp/paow/`), nattens kvitton och Jakobs domar. Underlaget i längre form: `D:/dealer-scratch/tmp/huvudagent11/recept/RAPPORT.md`.

**Märkning.** (V) = verifierat: läst i källan, i liggaren eller sett i rutor. (S) = skattat: egen slutsats, inte prövad. Källtyp: *Tillverkare* (officiell dokumentation), *Praktiker* (namngiven, utan prov), *Hörsägen* (osignerat). Två tagningar bevisar lite; där belägget är två tagningar står det så.

## Slutsats

1. **Bilderna säger vem och var, texten bara rörelsen.** Inget om hennes utseende, inget om var kortet hamnar utöver "to its place".
2. **En handling per film, ett kort, få led.** Vändningen sägs med en mening, en gång.
3. **Positivt formulerat, inga förbud.** Ingen lista "Nothing of this happens", inga "not/never/without".
4. **En rörelse låses med en bild eller en referensfilm, inte med ord.** Det texten inte kan låsa löses med ett ankare eller en film av rörelsen.
5. **Allt som syns i en bild eller film följer med.** Fel sko, en annan dealers hand, ett föremål: modellen kopierar det.
6. **Två tagningar sållar, de avgör inget.** En metod blir regel först efter fler tagningar (§5).

## 1. Reglerna med belägg

| Regel | Starkaste källa | Vårt eget belägg |
|---|---|---|
| 1 Bilderna bär vem och var | Runway Gen-4: "Focus on describing the motion, rather than the input image … can lead to reduced motion" (Tillverkare, V). Alibaba: "Prompt = Motion + Camera movement" (V). Kling: "Keyframes show the important moments. The prompt explains how the video moves between them" (V) | b6 nyp till P4 (Kling 4, 127 ord, utseendet nämns inte): användbar, händer och kort 5/5 (V). Nattens `paow-giv-p4` (414 ord, 34 om utseendet): granskaren 2/5 och 2,5/5 (V) |
| 2 En handling, få led | Alibaba: "Keep actions simple and short", "One clip = one continuous shot" (V). Runway Gen-4: "Avoid overly complex prompts" (V) | Hela rundan i en tagning: 0 användbara av 7 filmer, cirka 3 500 krediter (V). Nattens giv: cirka åtta led på 7 s, vändningen i tre; tagning 1 vände kortet två gånger (ruta 61–63 och 90–93) (V) |
| 3 Inga förbud | Runway Gen-4: "Negative phrasing is not supported and may produce unpredictable or even opposite results" (V). Kling 4: "Negative prompts can increase the likelihood of errors" (V) | Nattens åtta förbud: minst tre hände ändå (V). Inga av liggarnas texter hade förbudslista (enstaka "do not" inne i meningar fanns), varken de som höll eller de som föll (V, sökt i `order/p-*.txt`, `b17/`): sambandet är svagt bevis |
| 4 Bild eller film låser rörelsen | Kling 4: referensfilm för "moves and … timing in @Video1" (V). Alibaba WAN 3: referens "to replicate … action choreography" (V). DRIFT: Kling 4 kopierar referensen "nästan bildpunkt för bildpunkt" (V) | Nyp-giv med Kling 4 och bankens tur och retur till samma plats höll i b6, b17 (P4), b19 (D) och b20 (P1, 2 av 2) (V). Samma referens till fel plats: kortet läggs där referensen lägger det (b19 P7) (V) |
| 5 Bilden följer med | Runway I2V: "Visual artifacts, such as blurry hands or faces, may be intensified" (V) | Ankare 2.2: posebilden visade Pamelas sko med öppen front, båda tagningarna ritade den (0/2) (V). Med Pamelas film som referens tappar Paows givande hand tatueringen i snabb rörelse (Prov `paow-plats-4-som-mall`) (V) |
| 6 Två tagningar sållar | Jakob: två tagningar per klipp, en tredje om båda faller (HANDOFF) | Är två metoder lika bra med 50 % lyckade blir utfallet 2–0 mot 0–2 av slump i ungefär 1 fall av 8 (S) |

**Där källorna säger emot varandra (V):** Klings egna exempel innehåller förbud ("Avoid duplicate limbs …") trots rådet. WAN:s promptomskrivare för första och sista bild säger både "emphasize potential changes … between the two frames" och "reference … clothing, backgrounds" (80–100 ord). Runway Gen-4.5 sägs klara "complex, sequenced instructions", Gen-4 vill ha enkelhet. Google säger för stillbilder "Be Hyper-Specific" och "semantic negative prompts" (beskriv det önskade positivt), så en stillbildstext får vara lång men inte förbjuda. Runways hjälpsida säger att Seedance 2.5 tar nyckelbilder och referenser samtidigt; vårt verktygs schema säger att bara `kling-4` tar första och sista bild tillsammans med referensfilm. Schemat gäller för oss.

## 2. Formeln

En beställning är en ren funktion av valen i Beställ: samma val ger samma bilder, text, modell och kostnad. Texten skrivs aldrig för hand i en order; ändras den, ändras mallen och versionen räknas upp. De exakta orden står i `SAY` i `src/order-prompts.ts` (mall `@4`, under ombyggnad 2026-11-13, stilarna Kort, Minimal och Utförlig = mall `@3`); reglerna och recepten står här. Kort är förvalet för film, Minimal är Jakobs prov, Utförlig bara för jämförelse och äldre ordrar. Skiljer orden sig från reglerna här, rättas orden.

| Del | Kommer från valet | Regel |
|---|---|---|
| Första bild | Steget: ankaret det börjar på (1, 2.1 eller 2.2), dealerns som gäller i Material | Hel verklig ruta i bankens format, samma grönt, sko och ton som sista bilden |
| Sista bild | Steget: ankaret det slutar på; för en giv samma bild plus kortet där planen säger (`flatQuad`), för en enkel giv landningsbilden (förslag; steget finns inte i Beställ än) | Exakt samma kort som första bilden plus det enda som delas ut |
| Mellanbild | Ingen | Kling 4 via Runway placerar den inte i tiden (räknas som referensbild); b1b och b4 läste extra bilder som start, slut eller följd (V). Gör mellanläget till ett eget ankare i stället |
| Referensfilm | (Inte valbar i Beställ än) | Bara `kling-4`; obruten, 3–30 s, samma kortföljd och samma plats som sista bilden, rakt godkänd av Jakob; texten säger då "like the dealer in video 1" |
| Text | Steg, hand, sida, vändning, tillägg | Skelettet nedan |
| Modell, längd, upplösning | Steget har förval; modellen kan väljas | Tabellen nedan |
| Tagningar | 2 | En tredje bara om båda faller |

**Textens skelett, i denna ordning (film):**
1. `Locked camera, one continuous shot.` Alltid.
2. Med referensfilm: `She moves like the dealer in video 1, with the same timing.`
3. Handlingen i en mening, handen pekad ut genom var den är: `Her hand at the shoe …` (Runway: "clear positional language"; undviker spegelförväxling, S). Steg, sida och hand väljer meningen (§3).
4. Vändningen, bara om kortet landar öppet: exakt en av meningarna i §3.3.
5. Vägen tillbaka, bara i tur och retur: `Then her hand glides back low over the felt to the shoe and takes the next card.`
6. Andra handen: `The other hand rests on the felt.` (Vänster hela vägen.)
7. Kortet, bara med kort: `Only one card moves; its back is yellow and its face is blue.`
8. Jakobs tillägg, en positiv mening.

**Står aldrig i en filmtext:** utseende, kläder, hår; förbud eller "not/no/never/without"; bildpunkter (platsen sägs däremot i ord sedan mall 5, "towards its place at the far left of the picture, where the last frame shows it": utan dem gick handen inte ut till ytterplatserna); tidsangivelser (WAN läser dem som scenlista, S); en andra handling; "exactly as in the last frame" mer än en gång. Längd: 30–90 ord.

| Steg | Modell först | s | Pris (`data/order-policy.json`) | Varför |
|---|---|---|---|---|
| Ingång 1 → 2.1, 1 → 2.2 | WAN 3, 1080p | 4 | 80 | Ger bankens 1764 × 1174 direkt; 4K gav ingen skärpa (V) |
| Giv nyp från 2.1, med referens | Kling 4, 1080p | 7 | cirka 149 | Det enda giv-recept som hållit (V) |
| Giv nyp från 2.1, utan referens | Prov: Kling 4 mot WAN 3 | 7 | 124 / 140 | Oavgjort; WAN 3 ensam föll i b6 (V) |
| Släp från 2.2, stängt | WAN 3, 1080p | 6 | 120 | Höll till P1 (V) |
| Vändningen som egen film | Prov: WAN 3 och Kling 4 | 3 | 60 / 53–71 | Oprövat |
| Retur som egen film | WAN 3, 1080p | 3 | 60 | Oprövat; kort väg, kort film (DRIFT) |
| Vila | WAN 3, 1080p | 4–5 | 80–100 | Samma bild först och sist |
| Stillbild (ankare, landning) | Nano Banana Pro, 4K, 4:3 | – | 40 | Redigerar dealerns egen bild med `@anchor` och `@pose` |

Billig sållning: WAN 3 i 480p kostar 5 per s och visar om modellen gör rörelsen (DRIFT, V). Kling 3.0 4K (43 per s, ingen referens) används inte för klipp tills en film visar skärpevinst efter inpassning. Seedance 2.5 i 1080p kostar 68 per s plus 34 per s referensfilm (Runway, V): en 7 s giv går över taket 400.

## 3. Recept per steg

### 3.1 Ingång: ankare 1 → 2.1 och → 2.2
```
Locked camera, one continuous shot. She looks down at the shoe as her hand nearest it rises calmly and reaches to the yellow card in the window; her thumb and forefinger close on the card's top edge and draw it a little way out. The other hand rests on the felt.
```
```
Locked camera, one continuous shot. She looks down at the shoe as her hand nearest it rises calmly and comes to rest over the yellow card in the window, her fingertips flat on the card. The other hand rests on the felt.
```
- WAN 3, 1080p, 4 s, två tagningar. Blicken är med för att Jakob sade om nattens ingång "En bra variant! Men hon rör inte blicken" (V).
- Har hållit: `paow-ingang-2-1-01` (WAN): granskaren 3,5/5, Jakob Variant; `-02` (Kling 3.0 4K, 172 krediter): 3/5, Jakob godkänd, "bra men tråkig" (V, en tagning var). Kavajomgången: 1 → 2.2 gav en huvudtagning av två (V).
- Har fallit: båda ingångarna rörde fönstrets ram före kortet (WAN ruta 44–59, 4K ruta 38–55) (V). Orsaken är troligen geometrin: fingret kommer uppifrån och kortets kant sitter bakom ramen (S). Ordet "rim" är struket; att texten flyttar fingret är oprövat.
- Oprövat: 1 → 2.2 för det yngre utseendet (ankare 2.2 saknas).

### 3.2 Giv med nyp från ankare 2.1
Med referensfilm (receptet som hållit), tur och retur, sista bild = ankare 2.1 plus kortet:
```
Locked camera, one continuous shot. She moves like the dealer in video 1, with the same timing. Her hand at the shoe takes the yellow card from the window, carries it low over the table, turns it over once and lays it flat, blue side up, then returns to the shoe and takes the next card. The other hand rests on the felt. Only one card moves; it keeps one size from the shoe to the table.
```
- Kling 4, 1080p, 7 s, referens = bankens rakt godkända tur och retur **till samma plats**, klippt som labbet klipper. Höll: b6 P4, b17 P4, b19 D, b20 P1 2 av 2 (V). Föll: referens till annan plats (b19 P1, P7) (V).
- Risk: referensen är Pamelas, och hennes hand läcker in (tatueringen försvinner i snabb rörelse) (V). Att en annan dealers film får ligga i Paows order är Jakobs beslut (HANDOFF, öppen punkt 9); studion stoppar i dag bara hela bilder av en annan dealer.
- Bankens givar vänder kortet i luften, inte vid platsen (V). För Jakobs sex steg finns ingen referens i banken: se 3.3.
- Utan referens: nattens `paow-giv-p4` (mall `@3`): Jakob underkände tagning 1 ("omsvängning av kortet sista tredjedelen … förstör") och godkände tagning 2 ("Denna är bra"), som granskaren gav 2,5/5 (V, två tagningar). Metodprovet `paow-giv-2-1-p4-04` (vändningen sagd med en mening): en vändning, men kortet lyfts till brösthöjd och växer 21 % (V, mätt, en tagning).

### 3.3 Vändningen vid platsen (Jakobs sex steg)
Nyp, Dra, För fram, Vrid, Vänd upp, Lägg: kortet ligger gult upp mot filten hela vägen och vänds först vid platsen. Ingen film i våra liggare visar det (V). Två vändningar en vänsterhand kan göra (S, utarbetade här, inte prövade):

**Vändning A, "tummen lyfter, kortet fälls över" (förval, Jakobs skiss).** Kortets långsidor pekar mot spelaren. Vänsterhanden kommer från skon med handflatan ned; tummen ligger då vid kortets inre långsida (mot hennes mitt), pek- och långfinger på baksidan. Tummen glider in under den inre långsidan och lyfter den; underarmen roterar utåt (supination, tummen uppåt); den yttre långsidan (mot skon) ligger kvar mot filten som gångjärn. Kortet står på kant med tummen på den blå sidan; fingrarna lyfts från baksidan, tummen fäller kortet över gångjärnet och följer med ned på framsidan. Kortet ligger plant, blått upp, en kortbredd närmare skon. Greppet är inte fast: fingrarna lämnar kortet en stund medan det står på kant. Samma vändning står i `SAY.turnAtPlace`.
```
There her thumb slides under the long edge nearest it and lifts it as her wrist turns thumb side up; the card rolls over on its opposite long edge, which stays on the felt, and her thumb comes over onto the blue face.
```
**Vändning B, "nyckelvridning lågt vid platsen" (variation, närmast bankens).** Tumme och pekfinger håller kortets närmaste kortsida (som i nypet), lyfter det en handsbredd, handleden rullar en gång så att kortet vänds kring långsidan, och kortet läggs ned med fingertopparna på dess närmaste kant, som Pamelas godkända giv till P4 slutar (V, sett i ruta 76–112).
```
At the place she lifts the card a little by its short end between thumb and forefinger, rolls her wrist once so the card turns over about its long side, and lays it down blue side up under her fingertips.
```
**Vad en bild av varje ögonblick visar (A):**
- *Före:* kortet gult och plant en kortbredd mot hennes mitt från landningsplatsen; handflatan ned över kortet, två fingertoppar på baksidan, tumtoppen vid den inre långsidan.
- *På kant:* kortet står upprätt på sin yttre långsida och syns framifrån som en smal ljus remsa; tummen på den blå sidan, fingrarna lyfta; handryggen vänd mot skon.
- *Efter:* kortet blått och plant på planens plats; tumtoppen på framsidan vid den kant som lyftes, handen på kant med handflatan mot hennes mitt och fingrarna lätt böjda ovanför kortet.
- *Ögonblicket efter släppet:* tummen just ovanför den blå framsidan, handen fortfarande på kant eller på väg att vridas tillbaka med handflatan ned. En platt handrygg över kortet är aldrig slutet på en vändning (Jakob 2026-11-13, om landningsrutan ur tagning 2).

**Metoder som konkurrerar, i den ordning de prövas:**
1. *Text i en enkel giv:* första bild ankare 2.1, sista bild landningsbilden (3.7), texten 3.4:s mening för För fram plus A-meningen. WAN 3 och Kling 4, 7 s, två tagningar var.
2. *Vändningen som egen film* mellan stillbilderna Före och Efter, 3 s, WAN 3 och Kling 4. Kräver en ny nod i banken (huvudagentens).
3. *Referensfilm av Jakobs egen hand* (3.8) med Kling 4, om 1 och 2 ger 0 av 4 tagningar med en vändning vid platsen.
4. *Renderat kort:* om handens rörelse är rätt men kortet byter form eller storlek, målas filmens kort bort och det renderade kortet tar över (förslaget i HANDOFF punkt 11). Är handens rörelse fel hjälper inget renderat kort.
- Avgör: en metod går vidare om minst 1 av 4 tagningar vänder kortet en gång vid platsen så som en hand kan, med kortet inom ±10 % i storlek (film-review §3–4).

### 3.4 Giv med släp från ankare 2.2 (stängt kort)
```
Locked camera, one continuous shot. Her fingertips rest on the yellow card in the shoe's window. She slides the card out and drags it flat along the felt in one smooth sweep to its place, yellow side up under her fingertips, her wrist turning naturally as her arm reaches across. She lifts her fingers, and her hand glides back the same way, low over the felt, to rest on the next card in the shoe. The other hand rests on the felt.
```
- WAN 3, 1080p, 6 s, två tagningar. Höll till P1: cirka 7 verkliga släp av 9 tagningar (b9–b17, V). Föll till P4 (0 av 2, en reserv) och P7 (0 av 2: kortet går först åt vänster) (V). Pröva P1 först.
- Förutsättning: ankare 2.2 för det yngre utseendet (saknas). Skon i b17 hade öppen front; fönsterskon är oprövad för släp (V).
- För Jakobs sex steg från 2.1 (Dra, För fram): `Her hand at the shoe draws the yellow card out of the window and down onto the felt and slides it low along the felt, yellow side up, to its place.` (S)

### 3.5 Retur som egen film
Första bild = landningsbilden (handen vid det blå kortet), sista bild = ankaret den går till.
```
Locked camera, one continuous shot. Her fingertips lift off the blue card, which stays where it lies. Her open hand glides back low over the felt, palm down, to the shoe, where her thumb and forefinger take the top edge of the next yellow card. The other hand rests on the felt.
```
- Till 2.2: slutet blir `… to the shoe and comes to rest over the next yellow card, fingertips flat on it.` Till vila (1): `… glides back low over the felt and comes to rest flat on the felt.`
- WAN 3, 1080p, 3 s, två tagningar. Oprövat. Varför: i tur och retur lyfte alla tre returerna handen till en knytnäve i brösthöjd (granskaren 1/5 och 1,5/5 för `paow-giv-p4`; mätt i `p4-04`) (V); ändå godkände Jakob returen i `paow-giv-p4` tagning 1 ("godkänd i labbet") (V). b17:s retur gick i bordshöjd samma väg tillbaka (V).
- Risk: en film som startar på en annan films ruta skiftar cirka 5 nivåer i ton (Paows videoprov, V); därför en stillbild som första bild.

### 3.6 Vila
```
Locked camera, one continuous shot. She sits calmly at her table, breathes, blinks and looks up across the table towards the players, then back down. Her hands rest on the felt.
```
- WAN 3, 1080p, 4–5 s, första och sista bild = ankare 1. En liten handling per film; byt mittledet mot en av: `takes one slow, deep breath`, `smiles briefly`, `nods once`, `straightens her back`, `taps her fingers once on the felt`.
- Pamelas vilofilmer är dömda av Jakob (V). Paows `paow-vila-01`–`06` är skrivna med mall `@3` (med utseende och förbud); 01 och 02 ligger i inkorgen, mätta men inte dömda: 01 andas och blinkar, händerna stilla; 02 har munnen öppen i ruta 23–33 "som om hon säger något" (V, kvitton).

### 3.7 Stillbilder: ankare 2.1, 2.2, landningsbild
Nano Banana Pro, 4K, 4:3, `referenceImages` `@anchor` (dealerns egen bild) och `@pose` (bara en utklippt underarm och hand, `tools/order-images.ts`). För stillbilder gäller Googles råd: detaljerat får det vara, men det oönskade sägs positivt ("one card", inte "no second card").
```
This is an edit of the picture @anchor. Keep everything in @anchor exactly as it is: the framing and camera, the flat chroma-green background and table, the black card shoe at the right with the yellow card in its window, and the woman's face, hair, clothes, build and her hand at the left of the picture. Change only her hand nearest the shoe: it rests at the blue card lying flat on the felt in front of her, the tips of her forefinger and middle finger on the card's edge nearest her, the wrist raised above the knuckles and the thumb free beside the card, placed and shaped as the hand in @pose. @pose is a cut-out on plain green that shows only a forearm and hand; take from it only where the hand is and how the fingers touch the card. [dealerns standard: STANDARD_STILL] There is one card on the felt and one in the shoe, each the size and shape of the card in the window.
```
- Exemplet är **landningsbilden** (S, oprövad): `@anchor` = ankare 1 med kortet ritat där planen säger; `@pose` = armen ur Pamelas godkända giv till samma plats, rutan där fingertopparna vilar på kortet. Efteråt ritas kortet om ur planen och skon tas från ankare 1 (`skolagning.py`).
- **Ankare 2.1** (samma skelett, handen nyper kortets övre kant): `paow-ankare-2-1` gav 4/5 och 2/5 (dubbla kort); tagning 1 godkänd av Jakob (V).
- **Ankare 2.2:** båda tagningarna föll på posebildens öppna sko (V). Ny posebild lagd på Paows egen sko (`paow-ankare-2-2-01`) väntar på Jakobs klick; oprövad.
- **Före vändningen** (3.3): ingen pose finns i banken; en ruta ur Jakobs egen film (3.8), utklippt till handen, är förslaget (S).

### 3.8 Referensfilm, Motion Control och Jakobs egen hand
**Kling 3.0 Motion Control** (Runways hjälpsida, V): en karaktärsbild och en rörelsefilm, text valfri; för över "full-body movement, hand gestures, and facial expressions"; 3–30 s (orientering video) eller högst 10 s (bild); 720p eller 1080p; filmen ska visa "clear upper body … including all limbs and head", en person, en obruten tagning, inte snabb rörelse. Vårt verktyg: `characterOrientation` `image` följer bildens utsnitt, `video` rörelsefilmens; **ingen sista bild** (`kling-3-motion-control` står inte bland modellerna som tar `endFrame`). Ingen tillverkare säger något om ett föremål i handen; en osignerad guide säger "contact points are difficult" (Hörsägen). Runways API-prislista anger inget pris för den.
- **Vårt prov** (b1a, 2026-11-11, V): Paows äldre redo-bild och Pamelas godkända giv till P4 (4 s) som rörelsefilm, orientering video, 1080p. 44 av 100, inte rutgranskad: kroppen följer (8,5 px från Pamelas), den givande handen 34 px i snitt; kortet är genomskinligt grönt i ruta 30–84 och skons fönster tomt från ruta 48 (sett); kortet landar 73 px fel med 0,39 av planens yta; 1760 × 1184 (inte bankens ruta).
- **Svar: Pamelas film driver inte Paows ankare via Motion Control.** Filmen slutar inte på ankaret, kortet följer inte med, och en hel film av en annan dealer ligger i ordern. Pamelas film **kan** driva Paows rörelse som referensfilm i Kling 4 med första och sista bild (3.2), med Jakobs ja och med läckrisken.
- **Act-Two** (V): prestationsfångst för ansikte och överkropp, högst 1280 × 720, 24 bilder/s, lägger till "a subtle handheld shake" på en karaktärsbild; finns inte i vårt verktygs modellista. Används inte.
- **Jakobs egen hand med telefonen** är bättre när ingen godkänd bankfilm visar rörelsen (vändningen vid platsen, höger hand, handbyte) och när ingen annan dealer ska in i ordern. Så filmas den (S, ur tillverkarnas råd och DRIFT):
  - Telefonen på stativ, låst, liggande, där bankens kamera står: rakt framför, något över bordet, bordskanten vågrät; en låda som sko till höger i bilden; ett kort med gul baksida och blå framsida (tejp duger).
  - Matt slät duk (grön om möjligt), jämnt ljus framifrån utan hårda skuggor, lång svart ärm, inga ringar eller klocka.
  - Sitt som dealern, andra handen platt på bordet. Lugnt, verkligt tempo, det tempo filmen ska ha: Kling 4 kopierar referensens takt, och ultrarapid som snabbats upp föll (DRIFT, V).
  - Börja och sluta i ankarets pose, en obruten tagning på 4–8 s (Kling 4 kräver 3–30 s), kortet till samma plats som orderns kort, flera tagningar; välj en där kortet syns på kant i minst en ruta.
  - Risk: Jakobs hand läcker in som Pamelas gjorde (S). Motion Control kräver huvudet i bild, så en film av bara handen passar Kling 4-referens, inte Motion Control.

## 4. Felsökning

| Fel | Sett i (V) | Trolig orsak (S) | Ändring |
|---|---|---|---|
| Kortet vänds två gånger | `paow-giv-p4` t1, ruta 61–63 och 90–93 | Vändningen i tre led, "the roll goes on" | En mening, "once"; lås med bild eller referens (3.3) |
| Kortet kastas, släpps före platsen | t2: vänds i luften 255 px före, faller 105 px kort (66–68), skjuts dit med platt hand | Vändning i luften utan referens | Kortet lågt längs filten till platsen; referens till samma plats |
| Kortet växer | t2 +25 % (38–56); `p4-04` +21 % i brösthöjd; b17 1,5×; WAN 3 ensam 2× i luften | Kortet lyfts mot kameran | Lågt längs filten; mät ±10 %; inte lagbart |
| Handen till knytnäve i brösthöjd | Alla tre returer i tur och retur: `paow-giv-p4` t1 (y 466, ruta 121), t2; `paow-giv-2-1-p4-04` (ruta 120–128) | Retur i samma film som given | Retur som egen film (3.5), "glides back low … palm down" |
| Fingertopp på fönstrets ram | Ingång WAN 44–59, 4K 38–55; Paows första nyp | Geometrin; ordet "rim" i texten | Stryk ordet; kontakten positivt; annars Variant |
| Fel sko ur posebilden | Ankare 2.2, båda tagningarna | Posebilden visade öppen sko | Posebild på dealerns egen sko; bara arm och hand |
| Tummen eller fingret genom kortet | t1 | Kontakt som modellen inte förstår | Inte text; omtagning, referens |
| Ett andra kort, kort ur fingertopparna | Hel runda (b2, b9c), ankare 2.1 t2 | Flera kort i en film, bilderna stämmer inte | Ett kort per film; samma kort i första och sista bild |
| Ansiktet mjuknar, tatueringar suddas | Kling 4 (mjukare hud); 4K-ingången | Modellen; 4K skalas ner | WAN 3 för vila och ingång; ingen text hjälper |
| Grönt glider eller pulserar | WAN cirka 11 nivåer på 6 s, steg vid 13 s i 30 s; Kling 4 G 206–234 i 30 s | Långa filmer, olika grönt i bilderna | Kort film; samma grönt i bilderna; `level` i efterarbetet |
| Kortet går till referensens plats | b19 P7 | Referens till annan plats | Referens till samma plats |
| Hopp eller scenbyte | Kling 4 i 30 s (b2: 16,3 och 20,2 s) | Klings automatiska scenindelning | Kort film, "one continuous shot" |

## 5. Prov och protokoll

- **En ändring per order** mot en namngiven jämförelse (en order eller en rad i tabellen nedan); ordens titel säger vad som ändrades. Samma bilder, samma längd.
- **Antal tagningar:** två per text sållar bort det som aldrig fungerar. En metod blir regel i mallen först efter ytterligare fyra tagningar med minst hälften användbara (S; att skilja 25 % från 75 % kräver 6–8 tagningar).
- **En ytterplats före alla platser:** en metod som håller på plats 4 säger inget om plats 1 och 7. Omgång 3 och 3b gick till alla platser på två tagningar från plats 4: 12 av 14 föll, cirka 1 700 krediter. Pröva alltid P1 och P7 innan en metod beställs till alla.
- **Billigt först:** WAN 3 i 480p för att se om rörelsen kommer; full upplösning därefter (DRIFT).
- **Granskning:** oberoende granskare enligt [film-review.md](film-review.md); poäng 0–5 per del (giv, retur) och domordet. För en giv alltid samma fem frågor: ett kort? vänds det en gång, och var? lämnar kortet filten eller fingrarna före platsen? håller storleken ±10 %? går handen tillbaka lågt och öppen?
- **Jakobs dom** skrivs bara av honom i Granska (`motions/<id>.json`, `review`); citera hans ord, skriv inte om dem. Granskarens poäng och hans dom står bredvid varandra i tabellen; de kan skilja (retur t1).
- **Tabellen nedan förlängs** av den som provar: en rad per metod, status håller / faller / oprövat, belägget med order och tagning. Ingen dagbok; en ersatt rad skrivs om.

**Vad vi vet (2026-11-13)**

| Metod | Belägg (V) | Status |
|---|---|---|
| Text utan förbudslista och nästan utan utseende | b6 (127 ord), b17, b19, b20 (212–216 ord) höll; nattens 414 ord med 34 om utseendet och åtta förbud: 2/5 och 2,5/5 | håller (samband) |
| Nyp-giv, Kling 4, referens till samma plats, 7 s | b6 P4, b17 P4, b19 D, b20 P1 2/2; kort text `p4-11` med Pamelas giv: given 3/5 (lägst hand, lagt utan skjut, vänd i luften som referensen), returen 1/5 (sveper över andra handen) | håller för given, inte för returen |
| Nyp-giv, referens till annan plats | b19 P1 med anmärkningar, P7 föll | faller |
| Nyp-giv öppet, WAN 3 från två bilder | b6: kortet 2× i luften; omgång 2 kort text `p4-08`: färgbyte utan kantruta 1,5/5; minimal text `p4-09`: mönstrat spelkort 1/5 | faller (3 filmer) |
| Nyp-giv öppet, Kling 4 utan referens | mall `@3` `paow-giv-p4`: 2/5 och 2,5/5 (Jakob: t2 "ganska bra deal"); kort text `p4-07`: 2,5/5, enda vändningen vid platsen men kortet till bröstet och +13–35 %; minimal `p4-10`: snurr 1/5 | oavgjort (4 tagningar, ingen användbar) |
| Rullas kring långsidan på vägen, Kling 4, mall `@3` | `paow-giv-2-1-p4-04` (1 tagning, mätt, ej granskad): vänds en gång (ruta 43–50), kortet +21 % i brösthöjd, knytnäve på returen | oavgjort (1 tagning) |
| Vändning vid platsen (sex steg) i given | Bara `p4-07` (Kling 4, kort text) vände vid platsen, 43–63 px före, men lyfte kortet och fällde det genom ett halvgenomskinligt kort | faller i given (1 av 7) |
| Släp, WAN 3, stängt, 6 s | P1 cirka 7/9; P4 0/2; P7 0/2 | håller till P1 |
| Ingång 1 → 2.1, WAN 3, 4 s | 3,5/5, Jakob Variant; kavaj 1/2 | håller med anmärkning |
| Ingång, Kling 3.0 4K | 3/5, Jakob Godkänd ("bra men tråkig"), ingen skärpevinst | håller, ingen vinst |
| Retur i tur och retur | `paow-giv-p4` 1/5 och 1,5/5 (knytnäve), Jakob godkände t1; `p4-04` knytnäve (mätt) | faller för granskaren, oavgjort för Jakob |
| Stängd giv (ingen vändning), WAN 3, kort text | `p4-12`: given 3/5, kortet gult, lågt (78 px) och i storlek (−2 %, max +17 %), lagt utan skjut; fel: skons nästa kort blev blått och mönstrat f28–207 | bäst i omgång 2; omgång 3 med meningen "The next card waits plain yellow in the shoe's window" till alla platser |
| Kort text utan platsen i ord ("to its place", mall 4), WAN 3, alla platser | Omgång 3 (stängt, 8 tagningar): bara P4 t2 höll hela vägen (lagt vid kroppen, skjutet 170 px), P3 lagt på platsen men skons kort blått; framsidan syntes i 5 av 8. Omgång 3b (öppet, 6): bara P3 höll. Ytterplatserna P1, P2, P6, P7: 0 av 8, handen går inte ut, kortet läggs framför henne och slutbildens kort dyker upp av sig självt, ofta som mönstrat spelkort | faller utanför P3–P4; mall 5 säger platsen i ord, prövas i omgång 4 på P1 och P7 |
| Stängd giv, Kling 4, kort text | `p4-13`: blått f31–46 fast stängt, handen 176 px upp, kortet +30 % | faller |
| Minimal text (bara färger och mål) | `p4-09` WAN 3 mönstrat kort, `p4-10` Kling 4 snurr | faller (2 filmer, cirka 75 % säkert) |
| Retur som egen film från landningsbild | – | oprövat; landningsrutor ur omgång 3 |
| Hela rundan i en tagning | 7 filmer, 0 användbara | faller |
| Mellanbild i Kling 4 | b1b, b4: läses som start, slut eller följd | faller |
| Kling 3.0 Motion Control, Pamelas film | b1a: 44/100, kortet genomskinligt, 73 px fel | faller (1 film) |
| Aleph, Kling 4 edit, WAN video-till-video | `paow-samma-film`: Pamelas ansikte tillbaka, fönstret töms, fel grönt | faller |
| Ultrarapid som snabbas upp; uttaget baklänges | DRIFT | faller |
| Ankare 2.1, Nano Banana Pro, posearm ur Pamelas ruta | 4/5 (Jakob godkänd) och 2/5 | håller (1 av 2) |
| Ankare 2.2, pose med Pamelas öppna sko | 0/2 | faller |
| Ankare 2.2, pose på egen sko | `paow-ankare-2-2-01`: fingrarna på kortet, men skon ritad 89–129 px för långt åt vänster, 0/2 | faller; nästa ur ankare 2.1 |
| Vila, kort text med tillägg | `vila-07` leende: tänder f52–96, 2,5/5; `vila-08` nick: munnen stängd men bugning med slutna ögon, 2/5; lång text: tänder i 3 av 4, "rätar på ryggen" 3/5 | munnen håller bara delvis; nästa text utan tider: "her lips stay together as the corners of her mouth lift a little" |
| Ansiktsuttryck genom redigerad stillbild i grundrutan | DRIFT | håller |
| Referensfilm av Jakobs hand | – | oprövat |
| Renderat kort i vändningens rutor | – | oprövat |

## 6. Källor

Lästa 2026-11-13 om inget annat sägs.
- Runway, Gen-4 Video Prompting Guide: https://help.runwayml.com/hc/en-us/articles/39789879462419-Gen-4-Video-Prompting-Guide (Tillverkare)
- Runway, Image to Video Prompting Guide: https://help.runwayml.com/hc/en-us/articles/48324313115155-Image-to-Video-Prompting-Guide (Tillverkare)
- Runway Academy, Prompting Guide: https://academy.runwayml.com/prompt-guide (Tillverkare)
- Runway, Creating with Gen-4.5: https://help.runwayml.com/hc/en-us/articles/46974685288467-Creating-with-Gen-4-5 (Tillverkare)
- Runway, Creating with Kling 3.0 Motion Control: https://help.runwayml.com/hc/en-us/articles/50280558448147-Creating-with-Kling-3-0-Motion-Control (Tillverkare)
- Runway, Performance Capture with Act-Two: https://help.runwayml.com/hc/en-us/articles/42311337895827-Performance-Capture-with-Act-Two (Tillverkare)
- Runway, Creating with Seedance 2.5: https://help.runwayml.com/hc/en-us/articles/53542207042323-Creating-with-Seedance-2-5 (Tillverkare)
- Runway, API-prislista: https://docs.dev.runwayml.com/guides/pricing/ (Tillverkare)
- Runways verktyg `generate_video`, schemat i MCP-servern (modelltabell, `endFrame`, `referenceVideos`, `characterOrientation`) (Tillverkare)
- Kling, Kling 4.0 User Guide: https://kling.ai/quickstart/kling-4-model-user-guide (Tillverkare)
- Kling, multiple keyframes guide: https://kling.ai/blog/kling-4-multiple-keyframes-guide (Tillverkare)
- Kling, start and end frames: https://kling.ai/quickstart/ai-video-start-end-frames (Tillverkare)
- Kling, Motion Control User Guide: https://kling.ai/quickstart/motion-control-user-guide (Tillverkare)
- Alibaba, Wan 3.0 video generation guide: https://www.alibabacloud.com/help/en/model-studio/wan3-video-generation-guide (Tillverkare)
- Alibaba, Video generation prompt guide: https://www.alibabacloud.com/help/en/model-studio/text-to-video-prompt (Tillverkare)
- Wan2.1, `prompt_extend.py`: https://raw.githubusercontent.com/Wan-Video/Wan2.1/main/wan/utils/prompt_extend.py (Tillverkare)
- Google, Gemini image generation, Best Practices: https://aistudio.google.com/docs/image-generation (Tillverkare)
- Cliprise, Kling 3 Motion Control guide: https://www.cliprise.app/learn/guides/model-guides/kling-3-motion-control-complete-guide (Hörsägen, osignerad, inga prov)
- Våra: `D:/dealer-scratch/tmp/huvudagent11/recept/RAPPORT.md`; liggare och texter i `D:/dealer-scratch/tmp/paow/` (`order/`, `b17/`, `bestallningar-b*.json`, `matt/film/paow-p4-motion-control.summary.json`); kvitton `assets/orders/*/receipt.json`; Prov `paow-plats-4-som-mall`, `paow-kavaj-filmer`, `paow-samma-film`, `hel-runda-i-en-tagning`; Jakobs domar i `motions/paow-*.json`; DRIFT, "Lärdomar som gäller".
