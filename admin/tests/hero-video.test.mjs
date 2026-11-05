import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../../redesign.js',import.meta.url),'utf8');
const init=source.slice(source.indexOf('function fsInitHeroVideo(){'),source.indexOf('/* Presentation only:'));
function setup({reduced=false,saveData=false,reject=false}={}){
 const events={},pageEvents={},classes=new Set();let intersection,preferenceChange;
 const preference={matches:reduced,addEventListener:(_,fn)=>{preferenceChange=fn;}};
 const toggle={hidden:true,addEventListener:(_,fn)=>{toggle.click=fn;}};
 const hero={classList:{add:v=>classes.add(v),remove:v=>classes.delete(v)}};
 const video={paused:true,src:'',dataset:{src:'assets/videos/freshsouk-hero-harvest.mp4'},closest:()=>hero,getAttribute:()=>video.src,addEventListener:(type,fn)=>{events[type]=fn;},pause(){this.paused=true;events.pause?.();},play(){if(reject)return Promise.reject(Error('Autoplay blocked'));this.paused=false;events.playing?.();return Promise.resolve();}};
 const document={hidden:false,getElementById:id=>id==='fsHeroVideo'?video:toggle,addEventListener:(type,fn)=>{pageEvents[type]=fn;}};
 const context={document,navigator:{connection:{saveData}},matchMedia:()=>preference,window:{IntersectionObserver:true},IntersectionObserver:class{constructor(fn){intersection=fn;}observe(){}}};
 vm.runInNewContext(init+';fsInitHeroVideo();',context);
 return {video,toggle,classes,document,preference,visibility:()=>pageEvents.visibilitychange(),view:value=>intersection([{isIntersecting:value}]),reduce:()=>{preference.matches=true;preferenceChange();},error:()=>events.error()};
}
test('hero does not download or autoplay with reduced motion or data saving; manual play works',()=>{
 for(const options of [{reduced:true},{saveData:true}]){const f=setup(options);assert.equal(f.video.src,'');assert.equal(f.video.paused,true);assert.equal(f.toggle.hidden,false);f.toggle.click();assert.equal(f.video.paused,false);assert(f.video.muted&&f.video.defaultMuted);assert(f.classes.has('fs-video-ready'));}
});
test('hero pauses outside viewport and hidden page, preserves manual pause and responds to reduced motion',()=>{
 const f=setup();assert.equal(f.video.paused,false);f.view(false);assert.equal(f.video.paused,true);f.view(true);assert.equal(f.video.paused,false);
 f.document.hidden=true;f.visibility();assert.equal(f.video.paused,true);f.document.hidden=false;f.visibility();assert.equal(f.video.paused,false);
 f.toggle.click();f.view(false);f.view(true);assert.equal(f.video.paused,true);f.toggle.click();f.reduce();assert.equal(f.video.paused,true);
});
test('blocked playback and media failures retain fallback and expose manual retry',async()=>{
 const f=setup({reject:true});await Promise.resolve();assert.equal(f.video.paused,true);assert.match(f.toggle.textContent,/Lire/);assert.equal(f.classes.has('fs-video-ready'),false);
 const g=setup();g.error();assert.equal(g.classes.has('fs-video-ready'),false);
});
