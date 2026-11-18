import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiagnosis} from '../src/game-diagnosis.ts';

// The controls use native events and AbortSignal, with no need for a WebGL context in this test.
class Element extends EventTarget {
  readonly children: Element[] = [];
  readonly attributes = new Map<string, string>();
  readonly style = {cssText: ''};
  textContent = '';
  type = '';
  disabled = false;
  removed = false;
  readonly tag: string;
  readonly ownerDocument: object;

  constructor(tag: string, ownerDocument: object) {
    super();
    this.tag = tag;
    this.ownerDocument = ownerDocument;
  }
  append(...children: Element[]) { this.children.push(...children); }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getBoundingClientRect() { return {width: 640, height: 480}; }
  remove() { this.removed = true; }
  async click() { if (!this.disabled) this.dispatchEvent(new Event('click')); }
}

function elements() {
  const view = Object.assign(new EventTarget(), {navigator: {userAgent: 'test browser'}, performance, devicePixelRatio: 1});
  const document = {defaultView: view, visibilityState: 'visible', createElement(tag: string): Element { return new Element(tag, this); }};
  const stage = document.createElement('stage');
  const canvas = Object.assign(document.createElement('canvas'), {width: 640, height: 480, getContext: () => null});
  return {stage, mount: (read: () => string[], options?: Parameters<typeof createDiagnosis>[3]) =>
    createDiagnosis(stage as unknown as HTMLElement, canvas as unknown as HTMLCanvasElement, read, options)};
}

test('the plain diagnosis stays passive without playback controls', (t) => {
  const {stage, mount} = elements();
  const cleanup = mount(() => ['active clip']);
  t.after(cleanup);
  assert.deepEqual(stage.children.map(el => el.tag), ['pre']);
  assert.equal(stage.children[0].attributes.get('aria-hidden'), 'true');
  assert.match(stage.children[0].textContent, /active clip/);
});

test('diagnosis pauses, steps by one and ignores overlap and completion after closing', async (t) => {
  t.mock.timers.enable({apis: ['setInterval']});
  const {stage, mount} = elements();
  const playing = {clip: 'P1 retur', frame: 138, rate: 1.15, paused: false};
  const steps: number[] = [];
  let hold = Promise.withResolvers<void>() as ReturnType<typeof Promise.withResolvers<void>> | null;
  let reads = 0, toggles = 0;
  const cleanup = mount(() => [], {
    playback() { reads++; return playing; },
    toggle() { toggles++; playing.paused = !playing.paused; },
    async step(direction) {
      steps.push(direction);
      // currentTime already names the target while the old decoded picture is still shown.
      playing.frame += direction;
      playing.paused = true;
      if (hold) await hold.promise;
    },
  });
  t.after(cleanup);

  const [panel] = stage.children, [report, group] = panel.children;
  const [toggle, back, next, status] = group.children;
  assert.equal(report.attributes.get('aria-hidden'), 'true');
  assert.equal(group.attributes.get('aria-label'), 'Filmuppspelning');
  assert.deepEqual([toggle, back, next].map(button => [button.tag, button.type, button.textContent]), [
    ['button', 'button', 'Pausa'], ['button', 'button', '−1 ruta'], ['button', 'button', '+1 ruta'],
  ]);
  assert.equal(status.attributes.get('role'), 'status');
  assert.equal(status.textContent, 'P1 retur · ruta 138 · 1,15×');
  assert.equal(status.attributes.get('aria-live'), 'off');
  await toggle.click();
  assert.equal(toggle.textContent, 'Fortsätt');
  assert.equal(status.attributes.get('aria-live'), 'polite');
  await toggle.click();
  assert.equal(toggle.textContent, 'Pausa');

  await next.click();
  t.mock.timers.tick(600);
  assert.equal(status.textContent, 'P1 retur · söker filmruta… · 1,15×', 'a delayed seek must not label the old picture with its target frame');
  await back.click();
  await toggle.click();
  assert.deepEqual(steps, [1], 'a slow seek does not accept overlapping steps');
  assert.equal(toggles, 2, 'a slow seek cannot be interrupted by a toggle');
  hold!.resolve();
  hold = null;
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(status.textContent, 'P1 retur · ruta 139 · 1,15×');
  assert.equal(toggle.textContent, 'Fortsätt');
  await back.click();
  assert.deepEqual(steps, [1, -1]);
  assert.equal(status.textContent, 'P1 retur · ruta 138 · 1,15×');

  t.mock.timers.tick(500);
  hold = Promise.withResolvers<void>();
  await next.click();
  const beforeCleanup = reads;
  cleanup();
  hold.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await next.click();
  await toggle.click();
  t.mock.timers.tick(1000);
  assert.equal(panel.removed, true);
  assert.equal(reads, beforeCleanup, 'the timer and the resolved seek cannot draw after teardown');
  assert.deepEqual(steps, [1, -1, 1], 'detached controls have no listeners');
  assert.equal(toggles, 2);
});
