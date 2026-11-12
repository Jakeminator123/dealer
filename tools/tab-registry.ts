// One lab tab at a time. Every lab page keeps an event stream open to the lab server (src/preview-ui.ts), and this is
// the server's book of them. The newest page is the lab tab: a page that connects while another is open makes the older
// one step aside (it closes itself, or goes blank where the browser refuses). A page an agent asks for is shown in the
// open tab instead of in a new one. Pure logic: no sockets, and the clock is handed in.
export type Reason='newer'|'stop'|'restart';
export type TabEvent={type:'navigate';url:string}|{type:'retire';reason:Reason};
export type Tab={id:string;page:string;send:(event:TabEvent)=>void};

// A page of this lab, as a path with its query: "lab.html?tab=prov", "/game.html" or the full local address. Anything
// that points somewhere else is refused, so that the open tab can never be sent away from the lab.
export const localPath=(value:unknown,origin:string):string|null=>{
 if(typeof value!=='string'||!value||value.length>600||/[\s\\]/.test(value))return null;
 try{const url=new URL(value,origin+'/');return url.origin===origin?url.pathname+url.search+url.hash:null;}catch{return null;}
};

export const tabRegistry=(now:()=>number=Date.now)=>{
 let current:Tab|null=null,lastSeen=now();
 return {
  // A page has opened its stream. It is the lab tab from now on; the page that was, if it is another one, steps aside.
  connect(tab:Tab){const previous=current;current=tab;lastSeen=now();if(previous&&previous.id!==tab.id)previous.send({type:'retire',reason:'newer'});},
  // The stream of a page has ended. Only the lab tab's own stream empties the place: a retired page's stream ends too.
  disconnect(tab:Tab){if(current===tab){current=null;lastSeen=now();}},
  // Show a page: in the open tab if there is one, and otherwise the caller opens the one tab.
  show(url:string):{reused:boolean;page:string|null}{if(!current)return {reused:false,page:null};current.send({type:'navigate',url});return {reused:true,page:current.page};},
  // The server is stopping: the lab tab is told, so that no page is left playing against a server that is gone. Before a
  // restart the tab is told that too, and waits for the new server instead of closing.
  retire(reason:Reason){const tab=current;current=null;lastSeen=now();tab?.send({type:'retire',reason});},
  // A sign of life from a page without a stream (a test in headless Chrome).
  touch(){lastSeen=now();},
  // How long the lab has been without any page; zero while the lab tab is open.
  idleFor(){return current?0:now()-lastSeen;},
  status(){return {open:current?1:0,page:current?.page??null};}
 };
};
