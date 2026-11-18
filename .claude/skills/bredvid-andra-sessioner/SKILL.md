---
name: bredvid-andra-sessioner
description: Använd i dealer-repot när arbetet startar i en session eller underagent medan andra sessioner skriver i samma repo - innan en fil ändras, en gren eller ett arbetsträd görs, en ny modul under src/ importeras, ett meddelande skickas till en annan session, eller headless Chrome, grafikkortet eller många testarbetare används. Gäller varje session som inte är huvudagenten, och huvudagenten när den delar ut arbete.
---

# Arbeta bredvid andra sessioner

Vem som äger vilka filer, och vilken session som är huvudagenten, står på ett ställe:
[`HANDOFF.md`](../../../HANDOFF.md), "Vem äger vad". Reglerna står i [`AGENTS.md`](../../../AGENTS.md), "Git och
samarbete", "Labbservern" och "Kod"; rutinerna i [`docs/DRIFT.md`](../../../docs/DRIFT.md).

## Reglerna som oftast bryts

1. **Läs "Vem äger vad" och din banas lägesfil (`docs/lage/<bana>.md`) först, och skriv till huvudagenten vilka filer du
   tar** innan du ändrar något. En skribent per
   fil; allt in i repot går genom huvudagenten med en fillista (AGENTS; HANDOFF). Adressen kontrolleras med ListAgents
   före ett meddelande (HANDOFF).
2. **Ett eget arbetsträd på en kort gren** för ett avgränsat arbete: `git worktree add D:/dealer-scratch/tmp/<bana>/trad
   -b <gren> main`, och grenen lämnas till huvudagenten, som slår ihop den (AGENTS, "Git och samarbete"; DRIFT, "Grenar").
3. **Labbservern lämnar ut huvudträdets filer:** en halvfärdig fil där syns genast i Jakobs flik. En ny modul under
   `src/` görs i ordningen fil, rad i `SCRIPTS` (`tools/lab-routes.ts`), omstart av huvudagenten, import; kör `node
   --test tools/lab-modules.test.ts` efter en ny import (DRIFT, "Labbservern och fliken").
4. **Starta ingen egen labbserver** och stoppa aldrig en server via processnamn eller port; andra projekts och sessioners
   servrar rörs inte (AGENTS, "Labbservern"; DRIFT, portarna).
5. **Headless Chrome och grafikkortet under det delade låset** `D:/dealer-scratch/tmp/gpu-och-headless.lock`, en körning
   i taget, kort; den som startar ett fönster stänger det. En titt på labbsidor: `node tools/lab-look.ts` (AGENTS,
   "Labbservern"; DRIFT, "Labbservern och fliken", En titt på labbsidor; låsets regel i `docs/TAL.md`, "Så skickas ett
   jobb").
6. **Högst fyra render- eller testarbetare samtidigt** på hela datorn (AGENTS, "Kod").
7. **Jakob talar bara med huvudagenten;** det som bara han kan svara på blir ett kort i Beslut genom huvudagenten
   (HANDOFF, "Vem äger vad").
8. **Betalt utanför Beställ** rapporteras till huvudagenten med belopp (AGENTS; `docs/BESKED.md`, "Domar, beställningar och pengar").
9. **Arbetsfiler på slaskdisken** under `D:/dealer-scratch/tmp/<bana>/`; bilder och filmer som kan användas hör hemma i
   `assets/` med en roll (AGENTS, "Det som skyddar Jakob"; DRIFT, "Arbetsskript utanför repot").
