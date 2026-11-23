---
name: publicera-kopian
description: Använd i dealer-repot när studions kopia på nätet (dealer-lake.vercel.app, Vercel-projektet dealer-studio) ska publiceras igen, när något ska upp på eller tas bort från kopian, eller när kopian ska kontrolleras efter en publicering. Bara på Jakobs uttryckliga ord. Gäller tools/publish-studio.ts, data/studio-release.json, Vercel och Blob.
---

# Publicera kopian på nätet

Rutinen, det som ska finnas på plats och vad som görs när ett steg stannar står i
[`docs/DRIFT.md`](../../../docs/DRIFT.md), "Den låsta kopian på nätet" och "Publicera igen från en nyare commit";
kopians läge nu och skripten som frågar den efteråt i [`docs/lage/spelet.md`](../../../docs/lage/spelet.md). Här står
bara var det står.

## Reglerna som oftast bryts

1. **Bara på Jakobs uttryckliga ord;** en push är inget ja till en publicering (AGENTS, "Det som skyddar Jakob"; hans
   ord om kopian: `docs/BESKED.md`, "Kopian och nätet").
2. **Inga hemligheter eller adresser i repot:** storens id, Blob-adresserna, lösenorden och nycklarna stannar i
   `.runtime/` och i Vercel (DRIFT, "Den låsta kopian på nätet").
3. **Labbservern rörs inte av publiceringen,** och inget stoppas på port eller processnamn (AGENTS, "Labbservern";
   DRIFT, "När ett steg stannar halvvägs").
4. **Det som går ut är pushat till `origin/main`,** byggt i den egna rena arbetskopian (DRIFT).
5. **Råd: planen först,** `node tools/publish-studio.ts` utan flagga, och `--kor` när den stämmer; vad som går upp
   avgör `data/studio-release.json` (DRIFT).
6. **Råd: faller kontrollen efter deployen,** lägg tillbaka den förra versionen och läs vad som föll (DRIFT).
7. **Råd: fråga kopian som en ny besökare** efteråt, utan sparade val och i telefonstorlek (`docs/lage/spelet.md`,
   "Var saker ligger").
