---
name: avsluta-arbete
description: Använd i dealer-repot när ett arbete är färdigt och ska in i Git - tester, staging, commit, publiceringskontrollen, push och kontroll av fjärren - eller när en session ska avslutas, HANDOFF.md uppdateras eller en push har stannat (rött i kontrollen, "Try running Pull first" i Cursor). Gäller också en underagent eller en annan session som lämnar sitt arbete till huvudagenten.
---

# Avsluta ett arbete

Rutinen står i [`AGENTS.md`](../../../AGENTS.md), "Git och samarbete", och i
[`docs/DRIFT.md`](../../../docs/DRIFT.md), "Git och kontroller"; sessionens sista steg i
[`HANDOFF.md`](../../../HANDOFF.md), "Före avslut".

## Reglerna som oftast bryts

1. **Bara huvudagenten committar, taggar och pushar** (vem det är: HANDOFF, "Vem äger vad"). En annan session eller
   underagent lämnar en fillista eller en kort gren till huvudagenten (AGENTS, "Git och samarbete").
2. **Ordningen:** `npm test`, uttrycklig staging av egna filer med namn (aldrig `git add -A` eller `.`), commit,
   `npm run check`, push, och sedan fjärrens SHA (AGENTS; DRIFT). Kontrollen körs bara på den här datorn; GitHub kör
   ingen egen.
3. **Push medan andra skriver** görs från ett valt rent arbetsträd: `node tools/push-clean.ts --trad <mapp>` (`--dry-run` gör allt utom
   `git push`). Det som pushas är incheckade commits, aldrig någons öppna filer (DRIFT, "Push medan andra skriver").
4. **Ingen force-push, ingen `--no-verify`, ingen automatisk commit av utkast** (AGENTS). "Try running Pull first" i
   Cursor betyder att pre-push-kontrollen blev röd: läs varför, dra inte och kringgå inte.
5. **Rött stoppar.** Utred orsaken och rätta den; sänk aldrig en kontroll och ändra aldrig en referens för att få grönt.
   En verklig kvarvarande begränsning skrivs kort i `docs/BRISTER.md` (AGENTS; DRIFT, "Rött" och "Gult").
6. **En ny testfil** skrivs in i `test`-skriptet i `package.json`, och bara där: pushkontrollen kör samma filer, och
   vakttestet fäller en testfil i `tools/` som skriptet inte namnger (DRIFT, "Git och kontroller").
7. **HANDOFF är en startsida med tak** (högst 120 rader och 900 ord; `tools/handoff.test.ts` håller det): läget skrivs
   i banans lägesfil (`docs/lage/<bana>.md`, fem delar, högst 60 rader och 800 ord), och i båda ersätts det som inte längre gäller;
   inget läggs till som dagbok. Det som väntar på Jakob blir ett kort i Beslut, ett nytt besked av honom en punkt i
   `docs/BESKED.md`, en ny brist en punkt i `docs/BRISTER.md`; vad som hände och varför står i commitmeddelandet
   (AGENTS, "Var kunskap står"; HANDOFF, "Före avslut").
8. **Städa efter den egna ändringen:** kod som den gör överflödig, ersatt status och döda sökvägar tas bort, och det nya
   beteendet beskrivs där det hör hemma (AGENTS, "Städa löpande"). Detta ger inget mandat att rensa andra sessioners
   grenar, arbetsträd eller arbetsfiler. Slaskverktyget används först som rapport; åtgärder följer DRIFT:s ägarkontroll.
9. **Media och hemligheter stannar utanför Git** (`assets/`, `output/`, `.runtime/`, `.env*`, `private/`); repot är
   publikt (AGENTS, "Det som skyddar Jakob").
10. **Efter mediearbete:** rensa egna överflödiga mellanresultat och kör `npm run media:status`. Översikten under
    `.runtime/media-status/` visar storlek, användning och förändring. Rutinen står i `tools/local-work.md`.
