---
name: avsluta-arbete
description: Använd i dealer-repot när ett arbete är färdigt och ska in i Git - tester, staging, commit, publiceringskontrollen, push och kontroll av fjärren - eller när en session ska avslutas, HANDOFF.md uppdateras eller en push har stannat (rött i kontrollen, "Try running Pull first" i Cursor). Gäller också en underagent eller en annan session som lämnar sitt arbete till huvudagenten.
---

# Avsluta ett arbete

Rutinen står i [`AGENTS.md`](../../../AGENTS.md), "Git och samarbete" och "Regler och spärrar", och i
[`docs/DRIFT.md`](../../../docs/DRIFT.md), "Git och kontroller"; sessionens sista steg i
[`HANDOFF.md`](../../../HANDOFF.md), "Före avslut". Här står bara var det står.

## Reglerna som oftast bryts

1. **Bara huvudagenten committar, taggar och pushar** (vem det är: HANDOFF, "Vem äger vad"). Andra lämnar en
   fillista till huvudagenten (AGENTS, "Git och samarbete").
2. **Ordningen** står i DRIFT, "Git och kontroller": egna filer stagas med namn, commit, `npm run check` en gång,
   push, fjärrens SHA. Andras öppna filer stoppar inte: kontrollen testar då commiten i byggträdet. Det som stoppar är
   ett fynd i commitarna eller ett rött test på commiten.
3. **Ingen force-push och ingen `--no-verify`** (AGENTS). Råd: "Try running Pull first" i Cursor betyder att
   pre-push-kontrollen blev röd; läs varför i stället för att dra.
4. **Rött stoppar; utred orsaken** (AGENTS, "Regler och spärrar"). Ett test som bara låser hur kod eller text ser ut i
   dag stryks när det hindrar; skyddet sänks aldrig. En verklig kvarvarande begränsning skrivs kort i `docs/BRISTER.md`.
5. **HANDOFF och lägesfilen har tak** (Jakob 2026-11-18; `tools/handoff.test.ts`): ersätt det som inte längre gäller.
   Var resten hör hemma står i AGENTS, "Var kunskap står".
6. **Städa efter den egna ändringen** (AGENTS, "Git och samarbete"). Andra sessioners grenar, träd och arbetsfiler
   är deras.
7. **Media och hemligheter stannar utanför Git**; repot är publikt (AGENTS, "Det som skyddar Jakob").
8. **Efter mediearbete:** `npm run media:status`; gallringen följer `tools/local-work.md`.
