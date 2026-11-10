# System och koordinater

Beslut 2026-11-10, samordnat med TILLBAKA-2: behåll V6:s bildrutetidslinje som enda uppspelningsgrund. Engelska systemord, svensk förklaring. Sekvenssträngar och nodvy är presentation av samma metadata, aldrig en andra motor. Nodvyn visar planerad avsikt; den fastställer inte en källfilms händelser. Nedanstående koordinat- och metadatakontrakt är dokumenterat men ännu inte implementerat för hela bordets utdelning.

## Tre ytor, två format

| Yta | Ansvar | Befintlig källa |
| --- | --- | --- |
| Bakgrund | Rummet bakom scenen | `assets/scene/room.png` |
| Bord | Matta, bordskant och mottagaryta | `assets/scene/table.png` |
| Dealer | Frilagd person och rörelse | `assets/frames/` och `assets/tracking/` |

Kort, marker, masker och kontaktskuggor komponerar dessa tre ytor; de är inga ytterligare valbara scenytor. Hand-/kortocklusion måste bevaras. V6 ger slutkomponerade bildrutor, inte tre fristående videolager.

| Format | Storlek | Regel |
| --- | --- | --- |
| Native / desktop | 1762×1174, exakt 881:587 | Bevara godkänd vinkel och yta. Ingen automatisk omformning till 16:9 eller exakt 3:2. |
| Porträtt / mobil | 1080×1920, 9:16 | Egen bord-/bakgrundskomposition och dealertransform. |

Verifierad kod i `src/pamela-card-contact-v6.ts`: native dealerkomposition skalas till 1586×1057, beskärs vid `(left=250,top=0,width=1080,height=1057)` och placeras på porträttytan vid `(0,80)`. Mattans native-utsnitt `(278,838,1200,336)` blir 1080×1086 vid `(0,834)`; kanten `(278,817,1200,21)` blir 1080×19 vid `(0,815)`. En global bildtransform kan därför inte beskriva alla tre ytorna. Återinför inte äldre bordskanter/magklippning utan separat granskning.

## Bottom-up och koordinatreferenser

Bottom-up betyder att höjd ökar uppåt. V6 mäter idag bildpixlar från övre vänstra hörnet med y nedåt. Originalmätningar och referenshashar bevaras; en adapter ska konvertera vid en uttrycklig systemgräns.

Dokumenterat förslag för normaliserad **bildrymd**: `u` ökar åt höger, `v` uppåt, båda i `[0,1]`. `(0,0)` är nedersta vänstra pixelcentrum och `(1,1)` översta högra pixelcentrum. För `W×H`:

```text
x_px = u × (W − 1)        u = x_px / (W − 1)
y_px = (1 − v) × (H − 1)  v = 1 − y_px / (H − 1)
```

Native centrum `(0.5,0.5)` ger `(880.5,586.5)` före rasteravrundning. Native-punkten `(820,1026)` blir `(820/1761,147/1173)`. Utsnitt med `left/top/width/height` beskriver pixelkanter, inte denna pixelcentrumkonvention. Bordets fysiska plan och 3D-kameran kräver egna kalibreringar; normaliserad bildrymd är inte ett perspektivmått.

Placeringseditorns utkast finns i `placements/default.json`; vyprofiler och pixelkonvertering finns i `src/placement-model.ts`. Geometri lagras separat per `native`/`portrait`; hand-/sidavsikt och materialval hålls skilda från geometrin. Alla standardplatser börjar ogranskade (`reviewed=false`), inte uppmätta. `angle` är grader medurs i bildens y-ned-rymd; `width`/`height` är andelar av respektive vys pixelcentrumspann. `taper` formar konturen och bevisar inte en kalibrerad 3D-projektion.

`tableProjection` sparar editorns gemensamma visningsval: `mode: flat | individual` och `heading` i grader (`-90,-45,-15,0,15,45,90`). Plant bord med 0° är standard. Äldre schema-v1-filer utan fältet accepteras; editorn erbjuder att spara standardinställningen utan att flytta koordinater. Planändringen går att ångra. Läget/riktningen följer med i export/import och publicerade webbläsarutkast. Plant bord beräknas från P4.C1 och är fortfarande inte en uppmätt fysisk kamera. Riktning i bordplanet är skild från kamerans lutning och kortets böjning.

En analys av de nuvarande separata native-/mobilprojektionerna finns i [table-projection-review](../evidence/table-projection-review.md). Den flyttar inga sparade punkter och ändrar inte V6. Villkorliga målskillnader i analysen är inte uppmätt handkontakt i en framtida film.

Rörelsernas framtida bindning använder `placementRef`, `sceneProfileId`, `viewProfileId`; inga x/y-tal i sekvenssträngen. Film och framtida React/Next-overlay ska använda samma uppslag och samma resize/crop/letterbox-offset. Editorns placeringsfil är ännu inte kopplad till V6-renderern eller Scout. DRAFT-ordningen i en planerad sekvens är inte uppmätta filmannoteringar; noder eller dokument får inte hitta på saknade mätningar.

## Ordlista och gräns mot Scout

| Ord | Betydelse |
| --- | --- |
| `IDLE`, `READY` | Vila respektive redo. Äldre VILA/REDO är alias, inte nya tillstånd. |
| `LH`, `RH` | Dealerns anatomiska vänster/höger, oberoende av bildspegling. |
| `BACK`, `EDGE`, `FRONT` | Observerad fysisk kortsida mot kameran. |
| `CLOSED`, `OPEN` | Visuell statusetikett: baksida respektive framsida; får inte ersätta bevis på fysisk sida. |
| `HIDDEN`, `REVEALED` | Vad Scoutmotorn tillåter spelaren att se. En filmvändning ändrar inte detta. |
| `TAKE`, `PASS`, `TURN` | Ta kortet, överlämna samma kort mellan händer, respektive vända kortet. PASS är inte TURN. |
| `LAND`, `RELEASE`, `RETURN(IDLE)` | Bordkontakt, släpp och återgång; kan ha olika bildrutor. |
| `P4.C2`, `D.C2`, `VAR03` | Placeringsnycklar och rörelsevariant. V6 är historisk renderingsversion. |

Målet är P1–P7 och D, två kortplatser vardera: 14 spelarkort plus två dealerkort. Fysisk platsnumrering, utdelningsordning och koordinater ska fastställas innan implementation. Historisk P4=`deal.player.centre/box3` är proveniens, inte en verifierad åttaplatskarta. DL1/v2 är inte importerat.

Scoutgaming äger regler, slump, kortvärden och händelser. `P4.C2` är inte kortets runtime-ID; vid split krävs även hand-ID, medan Scout behåller kortinstansens ID. Ingen ny spelmotor i dealer.

Exempel, **inte klassning av en befintlig film**:

```text
P4.C2@VAR03 | TAKE(LH,BACK) > LAND(BACK) > RELEASE(LH) > RETURN(IDLE)
```

Överlappande PASS/TURN beskrivs med faktiska intervall, inte påhittad ordning. Färgbyte eller passage genom kantläge bevisar ingen vändning. Jakobs CLOSED→CLOSED-korrigering gäller tills han ändrar den.

## Ett rörelseregister och tydliga bevis

- `motions/<clip-id>.json` är ensam källa för rörelsens klassning/beslut. Hand, pose, fysisk sida, spelstatus, mål och variant hålls separata.
- `data/library.json` pekar ut en liten visningskatalog utan mediekopior. V6-poster är referenser; diagnostiska poster hämtar granskningsbeslut från sitt `motionRef`. Gulprovet är 1764×1174 i källrymd, inte den kalibrerade native-vyn 1762×1174.
- `data/public-media.json` binder exakt dessa filmer till publika Blob-URL:er med samma SHA-256. `publicReview` i en rörelsepost anger exakt den publicerade granskningsfilen; publicering innebär inte godkänd rörelse eller Scoutintegration.
- Nya original placeras i `assets/motions/<clip-id>/source.mp4`. Korrigerad visningsversion har egen hash/relation till original. Befintliga registrerade original får refereras där de ligger; inga kopior per godkännandestatus.
- `KEYFRAME` är en källruta. `ANCHOR` är en utpekad källruta för exempelvis grepp, kantläge, kontakt, släpp eller vila: källhash + rutnummer. Saknad kunskap är `null`/`UNKNOWN`, inte uppskattade tider.
- Bevisgrund `MEASURED/OBSERVED/REPORTED/HYPOTHESIS/UNKNOWN` skiljs från beslut `PENDING/ACCEPTED/REJECTED`. Rörelse, mask/geometri, scen och Scoutanslutning bedöms separat.
- Maskkontrakt enligt TILLBAKA-2:s senaste användarkorrigering: CLOSED RGB `[255,255,0]`, OPEN `[0,0,255]`, bakgrund `[0,0,0]`, förlustfri mask; kontur separat. MP4 är visningsmaterial, inte exakt färgmask. Författad maskfärg bevisar inte originalets kortsida.

Genererad gul/blå färg kan också vara fel trots en fysisk vändning. Bedöm först rörelsen och märk BACK/EDGE/FRONT från sammanhängande källrutor; lägg därefter lokalt kortutseende. En rosa maskhjälpsyta provas i en separat filmkandidat; hela arbetsflödet är ännu inte verifierat. Filmklassning och beslut finns endast i motions-registret.

## Återbruk och införande

`materials/source/references/card-materials/new-front2/` innehåller medföljande 3D-materialreferenser; `new-front2` är en läsbar syskonreferens, inte ett runtime-beroende. Namnen Pamela/Göran i äldre material måste kopplas till verifierad filhash/proveniens innan identitet antas. Nya läsningar från gamla labbet registreras; inga gamla node_modules eller junctions importeras.

Underlag: `Dealer_sekvensguide_2026-11-10.md` och `Dealer_studio_skiss_2026-11-10.html` i Jakobs Downloads samt bifogad diskussion `2363882c-7e08-4c16-98fc-37620eb14bf9/Inklistrad text.txt`. De är referensförslag. Guidens semantik har sammanvägts här; HTML-skissen är inte installerad och texten är inte behörighet att ändra runtime. Källsökvägar/hashar finns i `.runtime/documentation-sources.json`.

Nästa steg: granska placeringsutkastet och rörelseprovet, bind därefter verifierade platser till den befintliga tidslinjen. Full acceptans kräver obruten tvåkortsutdelning till alla åtta platser i båda format, verifierad kontakt/mask och bevarad V6-referens. Befintliga reproduktionskvitton bevisar bara V6-basens återrendering.
