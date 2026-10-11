import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {exerciseProgress} from '../public/exercise-progress.js';
const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('function exerciseState('),source.indexOf('function renderPractice('))+source.slice(source.indexOf('function showResult('),source.indexOf('function bindMatch('));
function setup(){
 const nodes=new Map(),listeners=new Map();let document;
 class Node{constructor(id,parent=null){this.id=id;this.parent=parent;this.isConnected=true;this.attrs=new Map();this.inert=false;this.disabled=false;this._html='';nodes.set(id,this)}
 getAttribute(k){return this.attrs.has(k)?this.attrs.get(k):null}setAttribute(k,v){this.attrs.set(k,v)}removeAttribute(k){this.attrs.delete(k)}
 contains(n){while(n){if(n===this)return true;n=n.parent}return false}
 focus(){document.activeElement=this;for(const fn of [...(listeners.get('focusin')||[])])fn({target:this})}
 querySelectorAll(){return [...nodes.values()].filter(n=>n.isButton&&this.contains(n)&&!n.disabled)}
 set innerHTML(html){this._html=html;for(const [id,n] of [...nodes])if(n!==this&&this.contains(n)){n.isConnected=false;nodes.delete(id)}let dialog=null;for(const m of html.matchAll(/<(\w+)[^>]*\bid="([^"]+)"[^>]*>/g)){const n=new Node(m[2],dialog||this);n.isButton=m[1]==='button';if(n.id==='result-dialog')dialog=n}}
 get innerHTML(){return this._html}}
 document={activeElement:null,querySelectorAll:()=>[],addEventListener:(k,fn)=>{if(!listeners.has(k))listeners.set(k,new Set());listeners.get(k).add(fn)},removeEventListener:(k,fn)=>listeners.get(k)?.delete(fn)};
 const app=new Node('app');new Node('practice-actions',app);new Node('modal-root');new Node('outside');
 const counts={chime:0,stop:0,start:0,navigate:0};
 const ctx=vm.createContext({document,exerciseProgress,available:()=>[{id:'x',cloud:true,revision:1},{id:'y',cloud:true,revision:1}],attempts:[],childId:'child',$:s=>s.startsWith('#')?nodes.get(s.slice(1))||null:null,escape:s=>String(s).replace(/[<>]/g,'_'),icon:()=>'',stopVoice:()=>counts.stop++,chime:()=>counts.chime++,startActivity:id=>{counts.start++;counts.startedId=id},navigate:()=>counts.navigate++});
 vm.runInContext(`let practice={saved:true,activity:{id:'x'}};${code};globalThis.session=()=>practice;globalThis.replace=()=>{practice={saved:true,activity:{id:'new'}}}`,ctx);
 const key=(key,shiftKey=false)=>{let prevented=0;nodes.get('result-dialog').onkeydown({key,shiftKey,preventDefault(){prevented++},stopPropagation(){}});return prevented};
 return {ctx,nodes,listeners,app,counts,key,document};
}
test('result opens floating and isolates background only after saved attempt',()=>{const s=setup();s.ctx.session().saved=false;s.ctx.showResult('Listo',7,'Nota');assert.equal(s.nodes.has('result-dialog'),false);s.ctx.session().saved=true;s.ctx.showResult('Listo',7,'Nota');assert.equal(s.app.inert,true);assert.equal(s.app.getAttribute('aria-hidden'),'true');assert.equal(s.document.activeElement.id,'result-dialog');assert.equal(s.ctx.session().feedback.score,7);assert.equal(s.counts.chime,1);assert.equal(s.nodes.get('modal-root').innerHTML.includes('aria-modal="true"'),true);assert.equal(s.nodes.get('modal-root').onclick,undefined)});
test('Tab wraps and Escape restores previous accessibility state/focus',()=>{const s=setup();s.app.setAttribute('aria-hidden','false');s.ctx.showResult('Listo',7,'Nota');s.key('Tab');assert.equal(s.document.activeElement.id,'result-close');s.key('Tab',true);assert.equal(s.document.activeElement.id,'next-activity');s.key('Tab');assert.equal(s.document.activeElement.id,'result-close');s.key('Escape');assert.equal(s.app.inert,false);assert.equal(s.app.getAttribute('aria-hidden'),'false');assert.equal(s.document.activeElement.id,'view-result');assert.equal(s.nodes.has('result-dialog'),false);assert.equal(s.listeners.get('focusin').size,0)});
test('reopen preserves saved feedback without duplicate sound and focuses containment fallback',()=>{const s=setup();s.ctx.showResult('Listo',null,'Sin nota');s.nodes.get('result-close').onclick();s.nodes.get('view-result').onclick();assert.equal(s.counts.chime,1);assert.equal(s.ctx.session().feedback.score,null);s.nodes.get('outside').focus();assert.equal(s.document.activeElement.id,'result-dialog');const close=s.nodes.get('result-close').onclick;close();close();assert.equal(s.app.inert,false);assert.equal(s.app.getAttribute('aria-hidden'),null)});
test('result actions are one-shot and stale sessions cannot navigate',()=>{const s=setup();s.ctx.showResult('Listo',7,'Nota');const click=s.nodes.get('try-again').onclick;click();click();assert.equal(s.counts.start,1);assert.equal(s.counts.navigate,0);s.nodes.get('view-result').onclick();const next=s.nodes.get('next-activity').onclick;s.ctx.replace();next();assert.equal(s.counts.navigate,0);s.nodes.get('result-close').onclick()});
test('uploaded exercise result advances directly and the activity action remains available after closing feedback',()=>{const s=setup();s.ctx.session().activity.cloud=true;s.ctx.showResult('Logrado',10,'Guardado');assert.match(s.nodes.get('modal-root').innerHTML,/Siguiente ejercicio/);s.nodes.get('result-close').onclick();assert.ok(s.nodes.has('next-exercise'));s.nodes.get('next-exercise').onclick();assert.equal(s.counts.startedId,'y');assert.equal(s.counts.navigate,0)});

