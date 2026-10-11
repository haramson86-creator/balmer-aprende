import test from 'node:test';
import assert from 'node:assert/strict';
import {cloud,connectCloud,cloudParents,bindCloudParents} from '../public/cloud.js';
test('parent onboarding exposes only its next step and preserves child restriction',async()=>{
 globalThis.location={hash:''};globalThis.fetch=async()=>Response.json({authenticated:false});
 await connectCloud({escape:s=>String(s).replaceAll('<','&lt;'),changed(){}});
 assert.match(cloudParents(),/Entrar con ChatGPT/);
 Object.assign(cloud,{authenticated:true,role:'parent',family:null,profiles:[]});
 assert.match(cloudParents(),/Crear mi familia y continuar/);assert.doesNotMatch(cloudParents(),/id="cloud-photo"/);
 Object.assign(cloud,{family:{name:'Familia <QA>'}});
 assert.match(cloudParents(),/¿Quién va a practicar/);assert.match(cloudParents(),/Familia &lt;QA>/);assert.doesNotMatch(cloudParents(),/id="cloud-photo"/);
 const elements=new Map();globalThis.document={querySelectorAll:()=>[],querySelector:s=>s==='#cloud-create-family'||s==='#cloud-refresh'?null:(elements.get(s)||elements.set(s,{}).get(s))};
 assert.doesNotThrow(()=>bindCloudParents());
 cloud.profiles=[{id:'qa',name:'Dani'}];assert.match(cloudParents(),/Subid una foto/);assert.match(cloudParents(),/<details/);assert.match(cloudParents(),/id="cloud-photo"/);
 cloud.role='child';assert.doesNotMatch(cloudParents(),/cloud-photo|cloud-family-name/);
});
