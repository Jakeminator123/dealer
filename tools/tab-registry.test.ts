import test from 'node:test';
import assert from 'node:assert/strict';
import {tabRegistry,localPath,type Tab,type TabEvent} from './tab-registry.ts';

const origin='http://127.0.0.1:4319';
const page=(id:string,path='/lab.html')=>{const got:TabEvent[]=[];const tab:Tab={id,page:path,send:event=>{got.push(event);}};return {tab,got};};

test('the newest page is the lab tab and the older one is told to step aside',()=>{
 const tabs=tabRegistry(),first=page('a'),second=page('b','/scene3d.html');
 tabs.connect(first.tab);
 assert.deepEqual(tabs.status(),{open:1,page:'/lab.html'});
 tabs.connect(second.tab);
 assert.deepEqual(first.got,[{type:'retire',reason:'newer'}]);
 assert.deepEqual(second.got,[]);
 assert.deepEqual(tabs.status(),{open:1,page:'/scene3d.html'});
});

test('a retired page that ends its stream does not empty the place of the lab tab',()=>{
 const tabs=tabRegistry(),first=page('a'),second=page('b');
 tabs.connect(first.tab);tabs.connect(second.tab);
 tabs.disconnect(first.tab);
 assert.equal(tabs.status().open,1);
 tabs.disconnect(second.tab);
 assert.deepEqual(tabs.status(),{open:0,page:null});
});

test('a page that reconnects its own stream is not retired',()=>{
 const tabs=tabRegistry(),before=page('a'),after=page('a');
 tabs.connect(before.tab);tabs.connect(after.tab);
 assert.deepEqual(before.got,[]);
 tabs.disconnect(before.tab); // the old stream of the same page closes late
 assert.equal(tabs.status().open,1);
});

test('a page asked for is shown in the open tab, and only without one does the caller open a tab',()=>{
 const tabs=tabRegistry(),only=page('a','/lab.html?tab=prov');
 assert.deepEqual(tabs.show('/lab.html'),{reused:false,page:null});
 tabs.connect(only.tab);
 assert.deepEqual(tabs.show('/scene3d.html?room=skog'),{reused:true,page:'/lab.html?tab=prov'});
 assert.deepEqual(only.got,[{type:'navigate',url:'/scene3d.html?room=skog'}]);
});

test('stopping tells the lab tab and leaves no tab behind',()=>{
 const tabs=tabRegistry(),only=page('a');
 tabs.connect(only.tab);tabs.retire('stop');
 assert.deepEqual(only.got,[{type:'retire',reason:'stop'}]);
 assert.equal(tabs.status().open,0);
 tabs.retire('stop'); // nothing to tell
 assert.equal(only.got.length,1);
});

test('the lab is never idle while its tab is open, and idle time counts from the last page or sign of life',()=>{
 let clock=1000;const tabs=tabRegistry(()=>clock),only=page('a');
 clock=31000;assert.equal(tabs.idleFor(),30000);
 tabs.touch();clock=41000;assert.equal(tabs.idleFor(),10000);
 tabs.connect(only.tab);clock=900000;assert.equal(tabs.idleFor(),0);
 tabs.disconnect(only.tab);clock=930000;assert.equal(tabs.idleFor(),30000);
});

test('only pages of this lab can be asked for',()=>{
 assert.equal(localPath('lab.html?tab=prov&proof=pamela-film',origin),'/lab.html?tab=prov&proof=pamela-film');
 assert.equal(localPath('/game.html',origin),'/game.html');
 assert.equal(localPath('http://127.0.0.1:4319/scene3d.html?room=skog#x',origin),'/scene3d.html?room=skog#x');
 for(const refused of ['//example.com/lab.html','https://example.com/','http://127.0.0.1:4320/lab.html','http://localhost:4319/lab.html','lab.html?a=b c','..\\lab.html','',null,42,'x'.repeat(601)])
  assert.equal(localPath(refused,origin),null,String(refused));
});
