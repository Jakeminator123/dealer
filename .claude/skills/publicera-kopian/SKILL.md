---
name: publicera-kopian
description: Använd i dealer-repot när studions kopia på nätet (dealer-lake.vercel.app, Vercel-projektet dealer-studio) ska publiceras igen, när något ska upp på eller tas bort från kopian, eller när kopian ska kontrolleras efter en publicering. Bara på Jakobs uttryckliga ord. Gäller tools/publish-studio.ts, data/studio-release.json, Vercel och Blob.
---

# Publicera kopian på nätet

Rutinen, det som ska finnas på plats och vad som görs när ett steg stannar står i
[`docs/DRIFT.md`](../../../docs/DRIFT.md), "Den låsta kopian på nätet" och "Publicera igen från en nyare commit";
kommandot som gäller just nu, med vad kontrollen ska vänta sig, i [`HANDOFF.md`](../../../HANDOFF.md), "Arbetsyta".

## Reglerna som oftast bryts

1. **Bara på Jakobs uttryckliga ord.** Deploy och mediauppladdning är hans beslut, och att Git är pushat är inget ja
   till en publicering (AGENTS, "Det som skyddar Jakob"; DRIFT, "Git och kontroller").
2. **Planen först:** `node tools/publish-studio.ts` utan flagga visar commit, arbetskopia och stegen och kör inget;
   `--kor` först när planen stämmer (DRIFT).
3. **Det som går ut är pushat till `origin/main`.** Bygget görs i den egna rena arbetskopian; huvudträdets ocommittade
   filer kommer aldrig med, och arbetskopian ändras eller committas aldrig för hand (DRIFT).
4. **Vad som går upp avgör `data/studio-release.json`**; taket för Blob höjs först när tabellen visar vad som har vuxit
   (DRIFT, "Taket för Blob").
5. **Inga hemligheter eller adresser i repot:** storens id, kvittot med filmernas Blob-adresser, lösenorden och nycklarna
   stannar i `.runtime/` och i Vercel; kör aldrig `vercel blob …` eller `vercel env …` i repots rot (DRIFT).
6. **Labbservern på 4319 startas och stoppas inte av publiceringen,** och inget stoppas på port eller processnamn; en
   kvarlämnad server på 4341 stoppas med sin egen nyckel (DRIFT, "När ett steg stannar halvvägs").
7. **Faller kontrollen efter deployen:** lägg tillbaka den förra versionen och läs vad som föll innan nästa försök
   (DRIFT).
8. **Fråga kopian som en ny besökare** efter varje publicering, utan sparade val och i telefonstorlek, med skripten som
   HANDOFF namnger under "Arbetsyta" (HANDOFF, "Arbetsyta" och "Nästa steg").
