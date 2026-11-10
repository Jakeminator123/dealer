# Desktop och mobil: projektionsgranskning

Status: endast analys. Inga placeringar, UI-filer, bilder eller V6 ändrade.

- Mobilbilden omkomponeras. Mattan skalas från 1200×336 till 1080×1086 (x0,9; y3,232). Dealer/hand/kort skalas cirka x0,9/y0,9 och beskärs separat. Se src/pamela-card-contact-v6.ts:71–73 och 170–171.
- Jämförelsens 0° är kortens riktning i bordplanet, inte kamerans lutning. P4:s förhållande mellan över-/underkant extrapoleras separat i varje vy; det är ingen uppmätt kamerakalibrering.
- Exporten placements/references/user-flat-native-20261110.json bevarar Jakobs visuella referens. Vid denna historiska analys sparades inte jämförelsens kryssruta eller heading. Nu sparar vanlig Spara båda i `tableProjection`; se docs/SYSTEM.md. Mätvärdena nedan beskriver fortfarande analysens frysta underlag.

Tabellen räknar på **planerade punkter och konturer** från native-exporten, inte på uppmätt eller godkänd handkontakt. **Om dessa native-mål används med dagens foregroundtransform** hamnar de 357–541 px från de separat sparade mobilmålen, och P1/P7:s planerade konturer skulle klippas. Detta säger inte var en ännu ej granskad framtida film faktiskt landar.

| Kort | Planerad native-mittpunkt | Native-målet med dagens filmtransform | Sparad mobilmittpunkt | Villkorlig målskillnad | Planerad kontur skulle klippas |
| --- | --- | --- | --- | --- | --- |
| P1.C1 | 217.98, 996.12 | -53.84, 976.8 | 107.9, 1295.33 | 357.24 px | ja |
| P2.C1 | 440.25, 1020.51 | 146.23, 998.76 | 242.78, 1400.87 | 413.54 px | nej |
| P3.C1 | 642.6, 1044.9 | 328.36, 1020.72 | 377.65, 1506.42 | 488.19 px | nej |
| P4.C1 | 851.49, 1100.87 | 516.39, 1071.11 | 512.53, 1611.96 | 540.86 px | nej |
| P5.C1 | 1085.51, 1058.72 | 727.03, 1033.16 | 647.4, 1506.42 | 479.91 px | nej |
| P6.C1 | 1277.54, 1028.41 | 899.88, 1005.87 | 782.28, 1400.87 | 412.14 px | nej |
| P7.C1 | 1465.72, 950.72 | 1069.26, 935.92 | 917.15, 1295.33 | 390.26 px | ja |

För första tagningen: använd den frysta native-referensen som planerat 2D-mål med samma källkamera. Faktisk landning och handkontakt måste sedan mätas i det accepterade källklippet. Ändra inte mobilautomatik nu. Ett senare gemensamt bordplan bör ha separata, versionsmärkta projektioner per vy. Uppmätt filmkontakt och handmask ska följa samma transformation; den stretchade mattans textur är ingen kalibrering. Om dessa native-mål ska användas behöver mobilens framing prövas så att alla sju planerade platser ryms. Fysisk böjning/glans hålls separata från projektionen.

Detaljer, beräkningar och källhashar: [table-projection-review.json](table-projection-review.json).
