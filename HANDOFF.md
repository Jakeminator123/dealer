# Dealer – TILLBAKA-3 huvudägare

Uppdaterad 2026-11-10. Fortsätt i denna checkout. Läs aktuell handoff och relevanta register, inte hela tidigare chatthistoriken. En skribent per fil; root samordnar index/publicering. TILLBAKA-2 och MAINTAIN har lämnat över.

## Jakobs senaste beslut

- **V6 är rätt visuellt mål**, åter bekräftat med bild: 1762×1174, 30,867 s. Bevara original och referenshashar.
- Nyare gul/blå 119,933-sekundersfilmen är **inte** det äldre prov Jakob menade. Behåll 16/17-kortsversionerna som historiska alternativ med deras koordinater/format.
- Äldre materialsekvenser på 182,867 och 146,8 s har återställts byteidentiskt. Samma bildmått som V6, 14 spelarkort, inga dealerkort. Jämförelsekandidater; exakt ihågkommet prov är inte identifierat genom ålder/filnamn.
- Fortsätt klippa sammanhängande rörelser: två kort P1–P7, två eller tre till dealer, IDLE/SHOE_READY och korrekt bordstillstånd. Inget nytt sparsystem. Rosa kvar som separat material-/maskhjälp; vit yta är också tillåten.
- Jakob har beställt generering, granskning, GitHub/Vercel vid större granskningssteg och underagenter med bara relevant kontext. Ett WAN3-kontrollprov och ett efterföljande Kling 3.0 Pro-jämförelseprov är beställda; ingen automatisk batch. Scout/databas ändras först vid konkret integrationsuppdrag.

## Arbetsyta och länkar

- `C:/Users/jakem/dev/super-feature-sg/dealer`, branch `jakob/test`, origin `git@github.com:Jakeminator123/dealer.git`.
- Lokal preview **http://127.0.0.1:4319/lab.html**, behåll för Jakob. Codex WebView; bevara användarflikars arbete. `node tools/preview.ts --status`, stopp via kontrollkanal, aldrig processnamn/port.
- Publikt **https://dealer-delta-eosin.vercel.app/**. Aktuell verifierad deployment, kod-SHA och uppspelningsbevis: `evidence/public-release.json`. Lokala ändringar är inte publika förrän detta kvitto uppdaterats.
- Publicerat från `b65fd9b`: 22 filmer och 25/25 anonymt hashverifierade webbfiler. Nya P4.C1-provet och placeringsprovet02 har full uppspelning utan videofel. Det nya WAN-provet är SECONDARY eftersom underhandsnedläggningen missas; publicering ändrar inte rörelseacceptans. Senare kvittocommit ändrar bara dokumentation/publiceringsstatus.
- Vercel `scoutgaming/dealer`, projekt `prj_7zd112w6MIX9YnpcR7Nj64Ke50yk`, team `team_Scxorb9qtZHjNae1YEQnFCaT`. Bindning `.runtime/public-deploy/.vercel/project.json`. Skyddade `dealer-scoutgaming.vercel.app` är inte publik granskningslänk.
- Blob `dealer-media`, `store_qeojzIHuA5ewT4uO`. Lokal katalog `data/library.json`; publika motsvarigheter `data/public-media.json`. Aktuellt filantal/byte/hashkontroll i `evidence/public-media-verification.json`. Media/hemligheter aldrig i Git eller webbpaket.
- **`placements/default.json` är Jakobs aktiva utkast. Återställ eller stage:a det inte.** Lokal sparning skriver dit; publik sparning är webbläsarlokal. Befintliga webbutkast skrivs inte över av deploy. Bygget fryser lokal fil/hash; generering kräver egen uttrycklig planbindning.
- Två tidigare P7-jobb använde `.runtime/public-qa/saved-flat-plan.json`, inte aktuellt lokalt utkast. P4-kontrollerna använder historiska ankare. Dessa jobb följer inte automatiskt editorns senaste koordinater.

## Material och rättad färgförklaring

| Material | Status / användning |
| --- | --- |
| V6 dator/mobil | Vald referens; hash `412a2fa01f9e852e8894002076b5771181bd6afd4ddeef1be76c0640d5853a2d`, 926 rutor/30 fps. Tidigare full reproduktion och 18 senare pixelidentiska kontrollrutor bevarade. |
| `pamela-older-14-mask-refined` | Befintlig 182,867s fullfilm med riktade P7-skokants/P6-pappersspetsrättningar. Byteidentiskt återställd efter Astra-granskning; PENDING, samma rörelser/geometri. |
| `pamela-older-14-material-full` / `compact` | Äldre 182,867/146,8 s, 1762×1174. Två kort per spelare, inga dealerkort. PENDING; historisk geometri och tilldelade sidmaterial. |
| `pamela-sequence-{16,17}-{native,portrait}-r2` | Historiska alternativ, PENDING. 16-kortsprefix `[0,3296)` slutar i IDLE med D.C2 dolt. 17-kort `[0,3598)` inkluderar reveal och D.C3. Native 1764×1174, porträtt 1080×1920. Inte kalibrerade till aktuell plan. |
| `pamela-p4-c1-source-turn`, `pamela-p4-c2-source-turn` | Oförändrade gul/blå fyrasekundersoriginal. Källrutor/arkiv-QA stödjer BACK→EDGE→FRONT; aktuell användaracceptans PENDING. Nyare än vita 12s-banken. |
| `pamela-p4-c2-closed-review-v04` | **SEKUNDÄRT färgexperiment.** `closed-card-review.ts` målade den öppnade blå motsidan gul. Tidigare rapporterad CLOSED→CLOSED rättad och bevarad som historik, inte fysisk sanning. Media oförändrade. |
| `pamela-p4-c1-color-control-01` | Ny WAN3-tagning med exakt historiska P4.C1-bilder/prompt. SUCCEEDED men REJECTED: bred gul→bred blå f63→64 utan verifierad kantpassage; sent släpp f116→117 fungerar. |
| `pamela-p4-c1-kling-control-01` | SUCCEEDED men REJECTED: bred gul→blå f52–54 utan verifierad kantpassage. Samma bilder/prompt, 48 credits. Original 1764×1172, 24 fps/97 rutor; ingen ombeställning. |
| P7 direktprov | CLOSED→CLOSED enligt Jakob, sekundärt alternativ; REJECTED för vändningskravet. |
| P7 försök1/2/3 och P6 försök1 | Bevarade REJECTED: fel mål/sida, extra vändning, spontan kortyta respektive handbyte. Rosa P7 är separat PENDING mask-/rörelseprov. |

`motions/` äger besluten. `published:true` betyder inte godkänd rörelse eller Scout-integration. UI gul=BACK/stängt och blå=FRONT/öppet avser **slutsidan**. Editorfärg ändrar varken befintlig film eller skickar API-jobb. Rosa är inte en tredje fysisk sida. Bedöm grepp, kant och sammanhängande rörelse före materialbyte.

Biblioteket har kapitel, ±1 källruta, 0,25/0,5/1× och `?clip=...&frame=...`. “Visa grön film” öppnar oförändrat P4.C2-original, inte gula överlägget. Filmvisning får inte ändra placeringsutkastet.

## Exakta instruktioner och återbruk

- `generation.html` visar faktiskt skickade bilder/prompt, båda nya filmerna och äldre promptar. JSON i `data/p4-generation-review.json`. Uppdatera med `node tools/build-generation-review.ts`; denna läsning gör inga API-anrop. Sidan länkas från filmbiblioteket.
- `evidence/swarm-review-request.md` är Jakobs beställda granskningsprompt: tre avgränsade spår för API/indata, fysisk rörelse och koordinater/mask/sekvens. Läsgranskning med exakta bevis och ett föreslaget nästa experiment; inga nya betalda jobb startade av granskningen.
- Astra 6 hög har slutfört `evidence/astra-archive-mask-audit.json`: V6-skuggor/fingermasker redan importerade (14/14 kontrollerade hashmatchningar), bankens riktade maskrättningar återfunna. V7 edge take-02 var uttryckligen REJECTED och ska inte importeras som förbättring.

- Samma Runway developer-API och ignorerade `.env.local`-nyckelkälla; connectorns konto är inte bevisat samma. **V6-filmen skickades inte till kontrolljobben:** de fick två PNG-ankare och historisk textprompt. `tools/generate-p4-control.ts` visar exakt body; Kling utelämnar `ratio`, WAN3 använder `auto_1080p`.
- Varje `assets/motions/<id>/generation.json` har prompt, inputhashar, task-ID och outputhash. `evidence/p4-control-production.json`, `p4-control-visual-review.json` och `runway-production-contract.json` ger offentligt underlag utan hemligheter. `request.lock` ligger kvar även vid osäkert nätutfall.
- `evidence/anchor-color-audit.json` skiljer fysisk källsida, UI-avsikt, övermålning och äldre sidetiketter. 11/11 tidigare start/end-PNG matchade registrerade hashvärden. P4.C2-felet kom i senare överlägg.
- `evidence/historical-p4-generation-inputs.json` har exakta äldre P4.C1/C2-promptar och requestbilder. Äldre 183s = 14×12s plus 446 vila/bryggrutor; 146,8s klipper hela källrutor utan retime. Vita original har UNKNOWN fysisk semantisk sida; det är inte skäl att kasta en synligt användbar rörelse.
- `evidence/sequence-reuse-audit.json` har exakta källor, äldre kandidater/tidsbevis och nyare tidslinje. Materialfilmernas exakta skapandetid saknas; mtime bevisar inte “20 timmar”. Nyare P7 `p7-c1-outer-01` har arkiv-QA: gul f60–67, kant68, blå69+, släpp88. Återgranska användbar råtagning före nytt jobb.
- `tools/restore-sequence-review.ts` importerar 17-kortsfilmer byteidentiskt och gör 16-kortsprefix med två encoders×två trådar. Kör inte om så senare reviewkvitton ersätts. Registrera arkivläsningar; inga gamla node_modules/junctions/runtime-beroenden.

## Aktuellt P4-prov och mellanreferenser

- READY2: `assets/motions/pamela-p4-c1-shoe-contact-01/ready-02.png`, 1764×1174, gul BACK. Jakob valde naturlig låg handled och pek-/långfinger mot kortytan vid skons nedre utlopp. Gammalt nypankare och två avvisade bildalternativ är bevarade. Exakt bildprompt, original och granskning finns i samma mapp. Aleph2:s stöd för upp till fem tidsatta bildankare är verifierat i `evidence/runway-production-contract.json`, inte en bevisad kvalitetsförbättring.
- **Två uttryckligen beställda READY2-prov är inskickade:** `pamela-p4-c1-ready2-01` (task `f3bed7bd-7557-439b-aa6d-166840f6ef3d`) och `pamela-p1-c1-ready2-01` (task `6b60f198-3f20-4889-8abd-26d23e2ccbe5`). WAN3, 12 s vardera, totalt beräknat 480 credits. Samma READY2-start, gul BACK→fysisk kantpassage→blå FRONT med samma LH, släpp och tom retur. Egen slutbild per mål följer fryst plan `406acb69…` med x-mappning 1762→1764. `tools/generate-ready2.ts` har separata exklusiva lås. **Beställ inte igen:** `collect-pilot.ts ready2-p4` respektive `ready2-p1` hämtar enbart befintliga jobb. Exakt prompt, PNG och planhash visas på `generation.html`; resultatacceptans kräver bildgranskning.
- Båda READY2-jobben är **SUCCEEDED**, 1764×1174, 30 fps/360 rutor, utan efterbearbetning. Två oberoende källgranskningar stödjer samma LH och verklig kantpassage till blå sida. P4 är SECONDARY: bordet blir vitt. P1 är PENDING: nästa kort i skon blir tillfälligt vitt. Båda missar promptens deltidpunkter men släpper och återgår före slutet; slutcentrum cirka 0,77/0,69 px från målet. `evidence/ready2-production.json` och respektive `ready2-p*-visual-review.json`. Lokal fulluppspelning 0–12 s verifierad för båda.
- **Jakobs korrigering:** skilj returankare från landningsankare. READY2-provens sista bild är efter tom retur, inte nedläggningsögonblicket; endast text styrde mellanfasen. För nästa kontrollerade utdelning ska hand/kort vid landning eller släpp bindas i en egen bild, med separat retur från samma pose. WAN3-jobben skickade inte någon tredje styrbild. Nya AI-bildförslag för nypgrepp/öppen handflata är avvisade: tvetydigt grepp, poserad kortvisning och fel kortproportioner. `evidence/pinch-turn-anchor-study.json`; ingen används eller har skickats till Runway. Utgå från faktisk rörelse och fysisk kontakt, inte fler påhittade presenterande poser.
- Senast uttryckligen beställt: `pamela-p4-c1-palm-up-01`, WAN3,6s,beräknat120credits, task `ee8c4cbb-bf95-4f2e-8b1d-d928550e7dcd`. Ny slutbild med synlig öppen vänsterhandflata och exakt fryst P4-målmarkör; samma historiska startbild. Inga video-/mellanreferenser. SUCCEEDED och sparad som SECONDARY: synlig kant94–112/blå113–116, men kontakt ovanifrån132–155 och palm upp förstefter släpp156. Underhandskravet ej uppfyllt. `evidence/p4-palm-visual-review.json`; exakt material på `generation.html`. Ingen automatisk ombeställning. `tools/generate-p4-palm.ts` är exklusivt låst, `collect-pilot.ts p4-palm` hämtar endast detta jobb.
- Jakob vill samla plan, kortstorlek, hand/sida, ankare och faser till ett JSON-uppdrag som sammanställs till prompt+bilder+Runway-body. Det är nästa systemsteg; nuvarande editor skickar fortfarande inte automatiskt jobb. Lokal4319 är produktionsarbetsytan, Vercel är publicerad granskning. Scout/Neon ändras inte. Kortstorlek ska bedömas mot hand och perspektiv innan fler platser beställs; ändra inte användarutkastet automatiskt.

- `pamela-p4-c1-plan-retarget-02`: nytt lokalt prov från den verifierade separata P4.C1-källan4153a…, inte V6/3:03. Samma LH, synlig kantf58–63, släppf78. Fryst plan406acb69…; slutcentrum0,624px från mål, blå kärna92,96% IoU. Originalets vändning bevarad genomf63 före kodning; hand/kort korrigeras tillsammans därefter. Grönt bevaras för att inte maska bort kanten. PENDING; retur/C2/fullsekvens/slutmaterial saknas. `evidence/p4-placement-production.json` och `p4-placement-review.json`.
- Första lokala provet01 underkändes: vilande hand påverkades och generisk keying dolde kortkanten. Endast02 registreras för granskning; inga nya API-jobb.
- WAN3 har endast dokumenterade first/last-ankare; de kan inte kombineras med referensbild/video. Fysisk mellanpose kräver två separata anrop med gemensam PNG och skarvkontroll. `evidence/wan-motion-constraints.json` har officiella kontrakt och möjliga felorsaker.
- V6 har handbyte och är visuellt mål, inte godkänd LH-rörelse. Äldre3:03 är sammanhängande montage men inte verifierad BACK→FRONT genom alla utdelningar.

## Nästa steg och gränser

1. Jämför äldre materialsekvenser mot V6 och oförändrade råtagningar. Klipp fungerande sammanhängande rörelser på dokumenterade rutor och bevara lagda kort över bryggorna.
2. Frys vald aktuell placeringsplan innan ny rörelse binds. Skilj 1762/1764, native/mobil och uppmätt kortkontakt. Anpassa inte metadata/färg för att dölja saknad rörelse.
3. IDLE/SHOE_READY är poseankare **med bordstillstånd**. Landning/release är händelser/målquad, inte global vilopose. Fullt bord får inte loopas till tomt. Scout äger reveal, tredje kort, regler, slump och kortvärden.
4. Materialpanelen/Three.js och nodkartan är separata förhandsvisningar. Generell plan→Runway→mask→material→Scout är inte färdig. Slutmaterial, fingermasker, skarvar och integration återstår; V6 ändras inte för att få prov att se godkända ut.
5. Leverera lokalt spelbara filmer, GitHub, Vercel och faktisk anonym uppspelning med klipp-/rutelänkar. Inga externa samordningsmeddelanden utan särskilt uppdrag.

## Drift och lagring

- Node 24.21.0 via Volta, engines `>=24.21.0 <25`, högst fyra arbetare. `npm test` → explicit egna filer → commit → `npm run check` → vanlig push → fjärr-SHA/CI. Ingen kringgång av pre-push; placeringsutkastet ska lämnas kvar.
- `node tools/verify.ts` kontrollerar registrerade filer. Full V6-render behövs inte när inputs/kod är oförändrade. Känd experimentell `stripTypeScriptTypes`-varning är dokumenterad och bevaras synlig.
- Publicera via granskad `node tools/sync-public-media.ts --upload`; torr plan utan flaggan. `--single-request` använder CLI:ns befintliga Blob-SDK när multipart stannar länge på värden. Kontrollera anonym hash, ingen overwrite. `node tools/build-public.ts`, Vercel från `.runtime/public-deploy`.
- Behåll JSON nu; ingen SQLite/lokal Postgres/ny Neon. `evidence/storage-choice-review.json` beskriver senare Scout-adapter vid flera skrivare/atomisk historik. Inga DB-ändringar.
- Gamla labbet finns på `D:/dealer-archive/snyggare-dealer`; C:-originalet och 4318 avvecklade enligt `evidence/archive-move.json`. Rör inte `D:/dealerlab-archive`. Preview 4319 lämnas till Jakob.
- Två verifierat dubbla inventeringsfiler rensade: 81 609 952 logiska byte; fysisk frigörelse ej mätt. D:-original kvar. `evidence/coach-production-triage.json` har rensningskvitto och coachfilernas behandling. Bevara original/review/aktiva jobb, undvik PNG-banker.
