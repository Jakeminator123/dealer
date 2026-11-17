---
name: avsluta-arbete
description: Använd i dealer-repot när ett arbete är färdigt och ska in i Git - tester, staging, commit, publiceringskontrollen, push och kontroll av fjärren - eller när en session ska avslutas, HANDOFF.md uppdateras eller en push har stannat (rött i kontrollen, "Try running Pull first" i Cursor). Gäller också en underagent eller en annan session som lämnar sitt arbete till huvudagenten.
---

# Avsluta ett arbete

Rutinen står i [`AGENTS.md`](../../../AGENTS.md), "Git och samarbete", och i
[`docs/DRIFT.md`](../../../docs/DRIFT.md), "Git och kontroller"; sessionens sista steg i
[`HANDOFF.md`](../../../HANDOFF.md), "Före avslut av en session".

## Reglerna som oftast bryts

1. **Bara huvudagenten committar, taggar och pushar** (vem det är: HANDOFF, "Vem äger vad"). En annan session eller
   underagent lämnar en fillista eller en kort gren till huvudagenten (AGENTS, "Git och samarbete").
2. **Ordningen:** `npm test`, uttrycklig staging av egna filer med namn (aldrig `git add -A` eller `.`), commit,
   `npm run check`, push, och sedan fjärrens SHA och GitHub-kontrollen (AGENTS; DRIFT).
3. **Push medan andra skriver** görs från ett rent arbetsträd: `node tools/push-clean.ts` (`--dry-run` gör allt utom
   `git push`). Det som pushas är incheckade commits, aldrig någons öppna filer (DRIFT, "Push medan andra skriver").
4. **Ingen force-push, ingen `--no-verify`, ingen automatisk commit av utkast** (AGENTS). "Try running Pull first" i
   Cursor betyder att pre-push-kontrollen blev röd: läs varför, dra inte och kringgå inte.
5. **Rött stoppar.** Utred orsaken och rätta den; sänk aldrig en kontroll och ändra aldrig en referens för att få grönt.
   En verklig kvarvarande begränsning skrivs kort i HANDOFF (AGENTS; DRIFT, "Rött" och "Gult").
6. **En ny testfil** ska in i både `test` i `package.json` och `TESTS` i `tools/publication-check.ts`; vakttestet fäller
   en testfil i `tools/` som ingen lista namnger (DRIFT, "Git och kontroller").
7. **HANDOFF uppdateras på plats:** det som inte längre gäller ersätts, ingen dagbok; det som väntar på Jakob blir ett
   kort i Beslut; vad som hände och varför står i commitmeddelandet (AGENTS, "Var kunskap står"; HANDOFF, "Före avslut
   av en session").
8. **Städa i samma ändring:** kod som inget anropar, ersatt status och döda sökvägar tas bort, och det nya beteendet
   beskrivs där det hör hemma (AGENTS, "Städa löpande").
9. **Media och hemligheter stannar utanför Git** (`assets/`, `output/`, `.runtime/`, `.env*`, `private/`); repot är
   publikt (AGENTS, "Det som skyddar Jakob").
