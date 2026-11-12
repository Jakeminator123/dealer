// The lab's one tab. Every lab page loads this module: it tells the lab server that the page is open and does what the
// server says (tools/tab-registry.ts). The newest page is the lab tab; an older one closes itself, or goes blank where
// the browser will not let a page close its tab, so that films and 3D scenes never run in tabs nobody looks at. A page
// an agent asks for (node tools/preview.ts --open <page>) is shown here instead of in a new tab. The open stream is also
// what keeps the server up. A page driven by a test (headless Chrome, or ?robot=1) only sends the old sign of life and
// never takes the place of the lab tab; ?robot=0 makes such a page behave as a person's.
// A page inside a frame (the studio's Casino view plays game.html in an iframe) is part of the page around it, which holds
// the tab's stream: it too only sends the old sign of life, whatever ?robot says, for as the newest page it would retire
// the lab tab and so close the very page it sits in.
const here=()=>location.pathname+location.search+location.hash;
const asked=new URLSearchParams(location.search).get('robot');
const robot=asked==='1'||(asked!=='0'&&(navigator.webdriver||/HeadlessChrome/.test(navigator.userAgent)));
const framed=window.top!==window;
if(robot||framed){const keepAlive=()=>fetch('/heartbeat',{method:'POST'}).catch(()=>{});keepAlive();setInterval(keepAlive,15000);}
else{
 const id=crypto.randomUUID?.()??Array.from(crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,'0')).join('');
 const events=new EventSource(`/tab/events?id=${id}&page=${encodeURIComponent(here())}`);
 let touched=0;for(const type of ['pointerdown','keydown','wheel'])addEventListener(type,()=>{touched=Date.now();},{capture:true,passive:true});
 // What is left of a page that could not close its tab: a new, empty document, so that nothing of the old page keeps running.
 const blank=(reason:string)=>{
  const text=reason==='stop'?'Labbservern är stoppad. Starta den med START.cmd.':'Labbet är öppet i en annan flik. Den här fliken gör inget längre och kan stängas.';
  const again=reason==='stop'?'':` <a style="color:#d9b96a" href="${location.origin}/lab.html">Använd den här fliken i stället</a>`;
  const page=`<!doctype html><html lang="sv"><meta charset="utf-8"><title>Dealer · stängd flik</title><body style="margin:0;height:100vh;display:grid;place-items:center;background:#0d0f0e;color:#93a098;font:15px system-ui,'Segoe UI',sans-serif"><p>${text}${again}</p></body></html>`;
  location.replace(URL.createObjectURL(new Blob([page],{type:'text/html'})));
 };
 events.addEventListener('retire',event=>{
  events.close();
  for(const media of document.querySelectorAll('video,audio'))(media as HTMLMediaElement).pause();
  const {reason}=JSON.parse((event as MessageEvent).data);
  // A restart of the server: the tab stays, waits for the new server and reloads. Only if none comes does it go blank.
  if(reason==='restart'){void(async()=>{await new Promise(done=>setTimeout(done,1500));
   for(let i=0;i<60;i++){if(await fetch('/health',{cache:'no-store'}).then(r=>r.ok,()=>false)){location.reload();return;}await new Promise(done=>setTimeout(done,500));}
   blank('stop');})();return;}
  window.close();setTimeout(()=>blank(reason),250); // a tab that closed never runs the timer
 });
 // A page to show. It is shown at once when nobody is using the tab; a person in the middle of something is asked first.
 events.addEventListener('navigate',event=>{
  const {url}=JSON.parse((event as MessageEvent).data),go=()=>{if(url===here())location.reload();else location.assign(url);};
  if(document.hidden||Date.now()-touched>15000){go();return;}
  document.getElementById('lab-tab-offer')?.remove();
  const box=document.createElement('div'),text=document.createElement('span'),show=document.createElement('button'),later=document.createElement('button');
  box.id='lab-tab-offer';box.setAttribute('role','status');
  box.style.cssText='position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483647;display:flex;gap:10px;align-items:center;padding:10px 12px 10px 16px;border-radius:12px;background:#151917;color:#e8ece9;border:1px solid #d9b96a;box-shadow:0 10px 30px rgba(0,0,0,.5);font:14px system-ui,"Segoe UI",sans-serif';
  const button='border-radius:8px;padding:6px 14px;font:inherit;cursor:pointer;border:1px solid #d9b96a;';
  text.textContent='Nytt att titta på';show.textContent='Visa';later.textContent='Inte nu';
  show.style.cssText=button+'background:#d9b96a;color:#1a1404;font-weight:600';later.style.cssText=button+'background:transparent;color:#e8ece9;border-color:#27302b';
  show.addEventListener('click',go);later.addEventListener('click',()=>box.remove());
  box.append(text,show,later);document.body.append(box);
 });
}
