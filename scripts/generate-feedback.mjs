// Original short musical cues, bundled for offline playback. No external audio service.
import fs from 'node:fs';
const rate=22050;
const cues={
  'cheer':[[523,.16],[659,.16],[784,.18],[1047,.32]],
  'try-again':[[392,.22],[440,.22],[523,.3]],
  'pair':[[659,.13],[880,.22]],
  'complete':[[523,.2],[659,.2],[784,.3]],
};
for(const [name,notes] of Object.entries(cues)){
  const length=Math.ceil((notes.reduce((s,n)=>s+n[1],0)+.12)*rate),data=Buffer.alloc(length*2);let start=0;
  for(const [frequency,duration] of notes){
    const count=Math.floor(duration*rate);
    for(let i=0;i<count;i++){
      const t=i/rate,envelope=Math.min(1,t/.015)*Math.max(0,1-t/duration)**1.5;
      const sample=(Math.sin(2*Math.PI*frequency*t)+.22*Math.sin(4*Math.PI*frequency*t))*.32*envelope;
      data.writeInt16LE(Math.round(sample*32767),(start+i)*2);
    }
    start+=count;
  }
  const header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(data.length+36,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(rate,24);header.writeUInt32LE(rate*2,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(data.length,40);
  fs.writeFileSync(`public/assets/${name}.wav`,Buffer.concat([header,data]));
}
