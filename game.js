(() => {
  'use strict';
  const canvas = document.querySelector('#world');
  const ctx = canvas.getContext('2d', { alpha: false });
  const mini = document.querySelector('#minimap');
  const mctx = mini.getContext('2d');
  const $ = (s) => document.querySelector(s);
  const WORLD = 3600, TILE = 128, TAU = Math.PI * 2;
  const biomeNames = ['PINEWOOD', 'GOLDEN MEADOW', 'AUTUMN FOREST', 'HIGHLANDS'];
  const palettes = [
    { ground: '#405b43', alt: '#496449', dark: '#344e3a', leaf: ['#294936','#31563c','#3c6544','#466a49'], flower:'#d0d68e' },
    { ground: '#829052', alt: '#8d9855', dark: '#737e45', leaf: ['#53734a','#65844d','#779252','#8b9b5b'], flower:'#e9d293' },
    { ground: '#68784a', alt: '#75834e', dark: '#586640', leaf: ['#76533a','#966244','#b07143','#a47742'], flower:'#d5b97a' },
    { ground: '#65705b', alt: '#737b62', dark: '#545e50', leaf: ['#4c6252','#5a715b','#71805c','#89875b'], flower:'#d7d4a0' }
  ];
  let W = 0, H = 0, dpr = 1, last = 0, gameState = 'menu', elapsed = 0, toastTimer = 0;
  let seed = 93751;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const hash = (x, y, n=0) => { let a = Math.sin(x * 127.1 + y * 311.7 + n * 74.7) * 43758.5453; return a - Math.floor(a); };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a,b,t) => a+(b-a)*t;
  const smoothstep = (a,b,v) => { const t=clamp((v-a)/(b-a),0,1); return t*t*(3-2*t); };
  const mixColor = (a,b,t) => {
    const ca=parseInt(a.slice(1),16),cb=parseInt(b.slice(1),16),r=Math.round(lerp(ca>>16,cb>>16,t)),g=Math.round(lerp((ca>>8)&255,(cb>>8)&255,t)),bl=Math.round(lerp(ca&255,cb&255,t));
    return `rgb(${r},${g},${bl})`;
  };
  const dist2 = (a,b) => (a.x-b.x)**2 + (a.y-b.y)**2;
  const player = { x: 1800, y: 1800, vx: 0, vy: 0, angle: -0.5, health: 100, armor: 65, ammo: 30, reserve: 120, kills: 0, shoot: 0, reload: 0, invuln: 0, moving: 0 };
  const camera = { x: 0, y: 0 };
  const keys = new Set(), flora = [], animals = [], enemies = [], bullets = [], particles = [], props = [], pickups = [];
  let pointer = { x: 0, y: 0, down: false }, joy = { x: 0, y: 0, active: false }, fireHeld = false;

  function biomeAt(x,y) {
    // Four generous ecoregions meet in a naturally varied central transition.
    const nx = x / WORLD, ny = y / WORLD;
    if (nx < .5 && ny < .5) return 0;
    if (nx >= .5 && ny < .5) return 2;
    if (nx < .5 && ny >= .5) return 1;
    return 3;
  }
  function biomeNameAt(x,y) { return biomeNames[biomeAt(x,y)]; }
  function buildWorld() {
    seed = 897239;
    for (let i=0;i<1370;i++) {
      const x=rand()*WORLD,y=rand()*WORLD,b=biomeAt(x,y),r=rand();
      if (r<.61) flora.push({x,y,type:'tree',size: .7+rand()*.78, variant:Math.floor(rand()*4), b, phase:rand()*TAU});
      else if (r<.76) flora.push({x,y,type:'pine',size:.65+rand()*.8,variant:Math.floor(rand()*3),b,phase:rand()*TAU});
      else if(r<.88) flora.push({x,y,type:'rock',size:.45+rand()*.8,b,variant:Math.floor(rand()*3)});
      else flora.push({x,y,type:'plant',size:.55+rand()*1.25,b,variant:Math.floor(rand()*4),phase:rand()*TAU});
    }
    for(let i=0;i<29;i++) {
      let x=220+rand()*(WORLD-440), y=220+rand()*(WORLD-440);
      props.push({x,y,type:i<17?'crate':'barrel',size:i<17?18:13,vx:0,vy:0,angle:rand()*TAU,health:1});
    }
    // Calm wildlife; animals are never targets and scatter from combat.
    for(let i=0;i<34;i++) {
      const x=100+rand()*(WORLD-200),y=100+rand()*(WORLD-200);
      animals.push({x,y,vx:0,vy:0,angle:rand()*TAU,kind:rand()<.72?'deer':'fox',size:rand()<.72?1:.76,turn:rand()*4,alert:0});
    }
    for(let i=0;i<8;i++) spawnEnemy(520+rand()*220,Math.PI*2*rand());
  }
  function spawnEnemy(radius=500, angle=Math.random()*TAU) {
    const x=clamp(player.x+Math.cos(angle)*radius,80,WORLD-80), y=clamp(player.y+Math.sin(angle)*radius,80,WORLD-80);
    enemies.push({x,y,vx:0,vy:0,angle:angle+Math.PI,health:3,maxHealth:3,fire:1+Math.random()*1.5,stun:0,phase:Math.random()*TAU,dead:false});
  }
  function resize() {
    const rect=canvas.getBoundingClientRect(); W=rect.width;H=rect.height;dpr=Math.min(window.devicePixelRatio||1,2.5);
    canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  window.addEventListener('resize',resize); resize(); buildWorld();

  function riverPath(index=0) {
    if(index===0){ctx.moveTo(-100,590);ctx.bezierCurveTo(780,480,750,1110,1580,1180);ctx.bezierCurveTo(2200,1240,2120,1890,2750,2010);ctx.bezierCurveTo(3210,2090,3260,2600,3700,2800);}
    else {ctx.moveTo(500,-100);ctx.bezierCurveTo(650,380,1250,350,1370,780);ctx.bezierCurveTo(1500,1050,1240,1300,1450,1510);}
  }
  function drawTerrain() {
    const left=Math.max(0,Math.floor(camera.x/TILE)-1), top=Math.max(0,Math.floor(camera.y/TILE)-1);
    const right=Math.min(Math.ceil(WORLD/TILE),Math.ceil((camera.x+W)/TILE)+1), bottom=Math.min(Math.ceil(WORLD/TILE),Math.ceil((camera.y+H)/TILE)+1);
    for(let gy=top;gy<bottom;gy++) for(let gx=left;gx<right;gx++) {
      const x=gx*TILE,y=gy*TILE,b=biomeAt(x+TILE/2,y+TILE/2),p=palettes[b],n=hash(gx,gy);
      const tx=smoothstep(1660,1940,x+TILE/2),ty=smoothstep(1660,1940,y+TILE/2);
      const upper=mixColor(palettes[0].ground,palettes[2].ground,tx),lower=mixColor(palettes[1].ground,palettes[3].ground,tx);
      ctx.fillStyle=mixColor(upper,lower,ty);ctx.fillRect(x,y,TILE+1,TILE+1);
      // Soft, irregular earth patches break up the terrain without visible tile seams.
      for(let j=0;j<4;j++) {
        const px=x+hash(gx,gy,j+4)*TILE,py=y+hash(gx,gy,j+21)*TILE;
        ctx.globalAlpha=.045+hash(gx,gy,j+38)*.035;ctx.fillStyle=j%2?p.dark:p.alt;
        ctx.beginPath();ctx.ellipse(px,py,18+hash(gx,gy,j+51)*28,12+hash(gx,gy,j+67)*21,hash(gx,gy,j+81)*TAU,0,TAU);ctx.fill();
      }
      // Fine grasses and flecks are stable between frames, so the ground stays crisp.
      for(let j=0;j<12;j++) {
        const px=x+hash(gx,gy,j+104)*TILE,py=y+hash(gx,gy,j+121)*TILE;
        ctx.globalAlpha=.08+hash(gx,gy,j+138)*.12;ctx.fillStyle=j%3?'#d8d09a':'#182b20';
        if(j%3===0){ctx.beginPath();ctx.ellipse(px,py,4+hash(gx,gy,j+151)*7,1.3,hash(gx,gy,j+167),0,TAU);ctx.fill();}
        else {ctx.beginPath();ctx.arc(px,py,1+hash(gx,gy,j+161)*1.5,0,TAU);ctx.fill();}
      }
      ctx.globalAlpha=1;
    }
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
    for(let r=0;r<2;r++){
      ctx.beginPath();riverPath(r);ctx.strokeStyle='rgba(25,42,37,.32)';ctx.lineWidth=r===0?215:104;ctx.stroke();
      ctx.beginPath();riverPath(r);ctx.strokeStyle='#6b927d';ctx.lineWidth=r===0?193:87;ctx.stroke();
      ctx.beginPath();riverPath(r);ctx.strokeStyle='#739f96';ctx.lineWidth=r===0?159:67;ctx.stroke();
      ctx.beginPath();riverPath(r);ctx.setLineDash([35,40]);ctx.lineDashOffset=-elapsed*25;ctx.strokeStyle='rgba(186,221,202,.29)';ctx.lineWidth=2;ctx.stroke();ctx.setLineDash([]);
    }
    // The falls where the feeder stream spills into the main river.
    const fx=1420,fy=1045, pulse=.5+.5*Math.sin(elapsed*3.1);
    const grad=ctx.createRadialGradient(fx,fy,10,fx,fy,78);grad.addColorStop(0,'rgba(226,241,211,.5)');grad.addColorStop(.35,'rgba(176,216,197,.38)');grad.addColorStop(1,'rgba(177,218,200,0)');
    ctx.fillStyle=grad;ctx.beginPath();ctx.ellipse(fx,fy,86,63, -.38,0,TAU);ctx.fill();
    ctx.strokeStyle=`rgba(237,245,219,${.42+pulse*.2})`;ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(fx-31,fy-12);ctx.quadraticCurveTo(fx,fy+8,fx+36,fy+17);ctx.stroke();
    for(let i=0;i<14;i++){const a=i*2.4+elapsed*1.1;ctx.fillStyle=`rgba(225,242,219,${.18+hash(i,1)*.25})`;ctx.beginPath();ctx.arc(fx+Math.cos(a)*(30+(i%4)*8),fy+Math.sin(a)*20,1.5+(i%3),0,TAU);ctx.fill();}
    ctx.restore();
  }
  function drawTree(o) {
    const p=palettes[o.b],s=o.size,x=o.x,y=o.y;
    ctx.save();ctx.translate(x,y);ctx.scale(s,s);
    ctx.fillStyle='rgba(18,30,19,.25)';ctx.beginPath();ctx.ellipse(6,13,22,10,0,0,TAU);ctx.fill();
    ctx.fillStyle=o.b===0?'#523d2d':o.b===2?'#59402e':'#594b34';ctx.fillRect(-3,-7,7,15);
    // Overlapping canopy lobes, with a bright sunward edge, read as a single crown from above.
    const crown=p.leaf[(o.variant+1)%p.leaf.length];
    ctx.fillStyle=crown;ctx.beginPath();
    for(let k=0;k<12;k++){const a=k*TAU/12,rr=13+hash(o.x|0,o.y|0,k)*3,px=Math.cos(a)*rr,py=Math.sin(a)*rr-8;if(k===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);}ctx.closePath();ctx.fill();
    for(let k=0;k<4;k++){const a=k*TAU/4+o.variant*.35;ctx.fillStyle=p.leaf[(o.variant+k)%p.leaf.length];ctx.beginPath();ctx.ellipse(Math.cos(a)*6-1,Math.sin(a)*5-10,7.3,5.8,a*.3,0,TAU);ctx.fill();}
    ctx.globalAlpha=.42;ctx.fillStyle='#d5df9a';ctx.beginPath();ctx.ellipse(-5,-16,5.4,2.7,-.5,0,TAU);ctx.fill();ctx.restore();
  }
  function drawPine(o) {
    const s=o.size;ctx.save();ctx.translate(o.x,o.y);ctx.scale(s,s);
    ctx.fillStyle='rgba(15,27,19,.27)';ctx.beginPath();ctx.ellipse(5,11,17,8,0,0,TAU);ctx.fill();
    ctx.fillStyle='#554732';ctx.fillRect(-2,-3,5,14);
    for(let j=0;j<3;j++){ctx.fillStyle=['#294c3c','#315a42','#3c6746'][(j+o.variant)%3];ctx.beginPath();ctx.moveTo(0,-29+j*9);ctx.lineTo(-13+j*2,-1+j*5);ctx.lineTo(13-j*2,-1+j*5);ctx.closePath();ctx.fill();}
    ctx.restore();
  }
  function drawRock(o) {
    ctx.save();ctx.translate(o.x,o.y);ctx.scale(o.size,o.size);ctx.fillStyle='rgba(15,24,17,.24)';ctx.beginPath();ctx.ellipse(4,8,15,8,0,0,TAU);ctx.fill();
    ctx.fillStyle=['#828575','#777a69','#928d79'][o.variant];ctx.beginPath();ctx.moveTo(-12,3);ctx.lineTo(-10,-5);ctx.lineTo(-3,-11);ctx.lineTo(7,-8);ctx.lineTo(13,-1);ctx.lineTo(10,6);ctx.lineTo(-5,8);ctx.closePath();ctx.fill();
    ctx.fillStyle='rgba(230,225,199,.23)';ctx.beginPath();ctx.moveTo(-8,-4);ctx.lineTo(-2,-9);ctx.lineTo(5,-7);ctx.lineTo(-1,-3);ctx.closePath();ctx.fill();ctx.restore();
  }
  function drawPlant(o) {
    const s=o.size,p=palettes[o.b];ctx.save();ctx.translate(o.x,o.y);ctx.scale(s,s);
    if(o.variant===0){ctx.strokeStyle='#536c41';ctx.lineWidth=1.6;for(let i=-1;i<=1;i++){ctx.beginPath();ctx.moveTo(0,3);ctx.quadraticCurveTo(i*4,-4,i*6,-11-(i===0?4:0));ctx.stroke();ctx.fillStyle=p.flower;ctx.beginPath();ctx.arc(i*6,-11-(i===0?4:0),2.1,0,TAU);ctx.fill();}}
    else if(o.variant===1){ctx.fillStyle='#688649';ctx.beginPath();ctx.ellipse(0,1,7,3,.2,0,TAU);ctx.fill();ctx.fillStyle='#c2b576';ctx.beginPath();ctx.arc(2,-1,2.6,0,TAU);ctx.fill();}
    else {ctx.fillStyle='#526c43';ctx.beginPath();ctx.ellipse(0,1,5,2,.5,0,TAU);ctx.ellipse(6,-1,5,2,-.4,0,TAU);ctx.fill();}
    ctx.restore();
  }
  function drawFlora() {
    for(const o of flora){if(o.x<camera.x-50||o.x>camera.x+W+50||o.y<camera.y-50||o.y>camera.y+H+50)continue;
      if(o.type==='tree')drawTree(o);else if(o.type==='pine')drawPine(o);else if(o.type==='rock')drawRock(o);else drawPlant(o);
    }
  }
  function drawProp(o) {
    ctx.save();ctx.translate(o.x,o.y);ctx.rotate(o.angle);ctx.fillStyle='rgba(10,17,13,.25)';ctx.beginPath();ctx.ellipse(3,8,o.size*.85,o.size*.54,0,0,TAU);ctx.fill();
    if(o.type==='crate'){ctx.fillStyle='#745b3a';ctx.fillRect(-o.size/2,-o.size/2,o.size,o.size);ctx.strokeStyle='#b29562';ctx.lineWidth=2;ctx.strokeRect(-o.size/2+2,-o.size/2+2,o.size-4,o.size-4);ctx.beginPath();ctx.moveTo(-o.size/2+3,-o.size/2+3);ctx.lineTo(o.size/2-3,o.size/2-3);ctx.moveTo(o.size/2-3,-o.size/2+3);ctx.lineTo(-o.size/2+3,o.size/2-3);ctx.stroke();}
    else {ctx.fillStyle='#6b7049';ctx.fillRect(-o.size*.55,-o.size*.7,o.size*1.1,o.size*1.4);ctx.fillStyle='#b4a06a';ctx.fillRect(-o.size*.5,-o.size*.48,o.size,.22*o.size);ctx.fillStyle='#272e24';ctx.beginPath();ctx.ellipse(0,-o.size*.7,o.size*.38,3,0,0,TAU);ctx.fill();}
    ctx.restore();
  }
  function drawAnimal(a) {
    ctx.save();ctx.translate(a.x,a.y);ctx.rotate(a.angle);const s=a.size;ctx.scale(s,s);
    ctx.fillStyle='rgba(15,22,16,.22)';ctx.beginPath();ctx.ellipse(2,7,12,5,0,0,TAU);ctx.fill();
    const coat=a.kind==='deer'?'#9c7951':'#b77a4a';ctx.fillStyle=coat;ctx.beginPath();ctx.ellipse(0,0,10,5,0,0,TAU);ctx.fill();ctx.beginPath();ctx.ellipse(8,-2,4,3,-.25,0,TAU);ctx.fill();
    ctx.fillStyle='#4b3929';for(const leg of [-6,4]){ctx.fillRect(leg,-1,1.5,6);ctx.fillRect(leg+3,0,1.4,5);}
    if(a.kind==='deer'){ctx.strokeStyle='#e2d4b8';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(9,-4);ctx.lineTo(11,-9);ctx.lineTo(13,-11);ctx.moveTo(11,-8);ctx.lineTo(8,-11);ctx.stroke();ctx.fillStyle='#e5cda9';ctx.fillRect(-10,-2,2,2);}
    else {ctx.fillStyle='#3e3326';ctx.beginPath();ctx.moveTo(-9,-1);ctx.lineTo(-15,-4);ctx.lineTo(-10,1);ctx.fill();}
    ctx.restore();
  }
  function drawPlayer() {
    const moving=Math.hypot(player.vx,player.vy)>12, bob=moving?Math.sin(elapsed*15)*1.25:Math.sin(elapsed*2)*.35;
    ctx.save();ctx.translate(player.x,player.y+bob);ctx.fillStyle='rgba(8,15,10,.35)';ctx.beginPath();ctx.ellipse(0,10,13,7,0,0,TAU);ctx.fill();
    ctx.rotate(player.angle);ctx.fillStyle='#253a31';ctx.beginPath();ctx.ellipse(-1,1,11,12,0,0,TAU);ctx.fill();
    ctx.fillStyle='#72806a';ctx.fillRect(-8,-4,14,9);ctx.fillStyle='#b2a57d';ctx.fillRect(-5,-8,7,5);
    ctx.fillStyle='#c7a984';ctx.beginPath();ctx.arc(2,-2,5.2,0,TAU);ctx.fill();ctx.fillStyle='#354539';ctx.beginPath();ctx.arc(2,-3,5.2,Math.PI,TAU);ctx.fill();
    ctx.fillStyle='#303c32';ctx.fillRect(2,-9,4,4);
    // Field carbine.
    ctx.fillStyle='#222a25';ctx.fillRect(3,1,17,3);ctx.fillStyle='#68715e';ctx.fillRect(8,-.4,12,1);ctx.fillStyle='#202721';ctx.fillRect(16,-1,9,2);ctx.fillStyle='#4b5548';ctx.fillRect(6,2,3,5);
    ctx.restore();
  }
  function drawEnemy(e) {
    const bob=Math.sin(elapsed*5+e.phase)*1.5;
    ctx.save();ctx.translate(e.x,e.y+bob);ctx.rotate(e.angle);
    ctx.fillStyle='rgba(10,14,13,.3)';ctx.beginPath();ctx.ellipse(2,12,17,8,0,0,TAU);ctx.fill();
    ctx.fillStyle='#343b39';ctx.beginPath();ctx.ellipse(0,0,15,11,0,0,TAU);ctx.fill();ctx.fillStyle='#65706a';ctx.beginPath();ctx.ellipse(-2,-3,9,5,-.15,0,TAU);ctx.fill();
    ctx.fillStyle='#c16b57';ctx.beginPath();ctx.arc(10,-1,3.2,0,TAU);ctx.fill();ctx.shadowColor='#ff755e';ctx.shadowBlur=9;ctx.fill();ctx.shadowBlur=0;
    ctx.strokeStyle='#252b28';ctx.lineWidth=2;for(let i=0;i<4;i++){const a=i*TAU/4;ctx.beginPath();ctx.moveTo(Math.cos(a)*10,Math.sin(a)*7);ctx.lineTo(Math.cos(a)*19,Math.sin(a)*12);ctx.stroke();ctx.fillStyle='#778077';ctx.beginPath();ctx.arc(Math.cos(a)*19,Math.sin(a)*12,2,0,TAU);ctx.fill();}
    ctx.restore();
    if(e.health<e.maxHealth){ctx.fillStyle='rgba(10,16,13,.7)';ctx.fillRect(e.x-14,e.y-22,28,3);ctx.fillStyle='#e68b6f';ctx.fillRect(e.x-14,e.y-22,28*e.health/e.maxHealth,3);}
  }
  function drawBullet(b) {
    ctx.save();ctx.translate(b.x,b.y);ctx.rotate(Math.atan2(b.vy,b.vx));ctx.fillStyle=b.hostile?'#ff8b6e':'#f6df92';ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=10;ctx.fillRect(-7,-1,13,2);ctx.restore();
  }
  function drawPickup(p) {
    const bob=Math.sin(elapsed*3+p.phase)*3;ctx.save();ctx.translate(p.x,p.y+bob);ctx.fillStyle='rgba(11,17,12,.25)';ctx.beginPath();ctx.ellipse(0,9,10,4,0,0,TAU);ctx.fill();ctx.fillStyle=p.kind==='med'?'#c86d5e':'#c6d878';ctx.beginPath();ctx.arc(0,0,8,0,TAU);ctx.fill();ctx.fillStyle='#202a20';ctx.fillRect(-4,-1,8,2);if(p.kind==='med')ctx.fillRect(-1,-4,2,8);else ctx.fillRect(-1,-4,2,8);ctx.restore();
  }
  function drawParticles() {
    for(const p of particles){const alpha=clamp(p.life/p.max,0,1);ctx.globalAlpha=alpha;ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.size*alpha,0,TAU);ctx.fill();}ctx.globalAlpha=1;
  }
  function drawMinimap() {
    const s=mini.width/WORLD;mctx.clearRect(0,0,mini.width,mini.height);
    for(let i=0;i<4;i++){mctx.fillStyle=['#34513b','#77824b','#775b3e','#596354'][i];const x=i%2*mini.width/2,y=Math.floor(i/2)*mini.height/2;mctx.fillRect(x,y,mini.width/2,mini.height/2);}
    mctx.strokeStyle='#759b89';mctx.lineWidth=6;mctx.beginPath();mctx.moveTo(-5,29);mctx.bezierCurveTo(35,25,40,52,79,57);mctx.bezierCurveTo(113,64,100,98,148,106);mctx.bezierCurveTo(160,110,157,126,174,132);mctx.stroke();
    mctx.strokeStyle='#81a397';mctx.lineWidth=2;mctx.beginPath();mctx.moveTo(25,-5);mctx.bezierCurveTo(31,28,53,25,58,43);mctx.bezierCurveTo(68,61,55,72,65,78);mctx.stroke();
    mctx.fillStyle='rgba(225,235,216,.55)';for(const e of enemies){mctx.beginPath();mctx.arc(e.x*s,e.y*s,2.1,0,TAU);mctx.fill();}
    mctx.fillStyle='#ff795e';for(const e of enemies){mctx.beginPath();mctx.arc(e.x*s,e.y*s,1.5,0,TAU);mctx.fill();}
    mctx.fillStyle='#d8ed91';mctx.beginPath();mctx.arc(player.x*s,player.y*s,3.7,0,TAU);mctx.fill();mctx.strokeStyle='#f0f3db';mctx.lineWidth=1;mctx.beginPath();mctx.arc(player.x*s,player.y*s,6,0,TAU);mctx.stroke();
    mctx.save();mctx.translate(player.x*s,player.y*s);mctx.rotate(player.angle);mctx.fillStyle='#e9f2cf';mctx.beginPath();mctx.moveTo(9,0);mctx.lineTo(-5,-4);mctx.lineTo(-3,0);mctx.lineTo(-5,4);mctx.fill();mctx.restore();
  }
  function render() {
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
    camera.x=clamp(player.x-W/2,0,WORLD-W);camera.y=clamp(player.y-H/2,0,WORLD-H);
    ctx.save();ctx.translate(-camera.x,-camera.y);drawTerrain();drawFlora();
    for(const o of props)if(o.x>camera.x-40&&o.x<camera.x+W+40&&o.y>camera.y-40&&o.y<camera.y+H+40)drawProp(o);
    for(const a of animals)if(a.x>camera.x-30&&a.x<camera.x+W+30&&a.y>camera.y-30&&a.y<camera.y+H+30)drawAnimal(a);
    for(const p of pickups)drawPickup(p);for(const b of bullets)drawBullet(b);for(const e of enemies)if(!e.dead)drawEnemy(e);drawParticles();drawPlayer();
    ctx.restore();drawMinimap();
  }
  function nearRiver(x,y) {
    // Sample the hand-drawn waterways; return approximate bank-to-bank distance.
    let best=1e9;
    for(let i=0;i<=80;i++){
      const t=i/80;
      const px=lerp(-100,3700,t),py=590+Math.sin(t*5.7)*355+Math.sin(t*11.3)*72;
      const dx=x-px,dy=y-py,d=dx*dx+dy*dy;if(d<best)best=d;
      const qx=500+870*t,qy=-100+1450*t+Math.sin(t*8)*120;const d2x=x-qx,d2y=y-qy,dd=d2x*d2x+d2y*d2y;if(dd<best)best=dd;
    }
    return Math.sqrt(best)<92;
  }
  function blocked(x,y,r=10) {
    if(x<40||y<40||x>WORLD-40||y>WORLD-40)return true;
    for(const o of flora)if((o.type==='rock'||o.type==='tree'||o.type==='pine')&&Math.abs(o.x-x)<35&&Math.abs(o.y-y)<35){const rad=o.type==='rock'?o.size*10:o.size*8;if((x-o.x)**2+(y-o.y)**2<(rad+r)**2)return true;}
    for(const o of props)if(Math.abs(o.x-x)<o.size*.7+r&&Math.abs(o.y-y)<o.size*.7+r)return true;
    return false;
  }
  function movePlayer(dx,dy,dt) {
    const mag=Math.hypot(dx,dy);if(mag>1){dx/=mag;dy/=mag;}
    const river=nearRiver(player.x,player.y),speed=(keys.has('shift')?270:190)*(river?.62:1),targetX=dx*speed,targetY=dy*speed;
    const smoothing=1-Math.exp(-dt*12);player.vx=lerp(player.vx,targetX,smoothing);player.vy=lerp(player.vy,targetY,smoothing);
    let nx=player.x+player.vx*dt,ny=player.y+player.vy*dt;
    if(!blocked(nx,player.y,10))player.x=nx;else player.vx*=-.1;
    if(!blocked(player.x,ny,10))player.y=ny;else player.vy*=-.1;
    // Shove loose field supplies with satisfying, damped momentum.
    for(const o of props){const d=Math.hypot(o.x-player.x,o.y-player.y),min=o.size*.55+11;if(d<min&&d>0){const nx=(o.x-player.x)/d,ny=(o.y-player.y)/d;o.vx+=nx*50*dt;o.vy+=ny*50*dt;o.x+=nx*(min-d);o.y+=ny*(min-d);}}
  }
  function shoot() {
    if(player.reload>0||player.shoot>0||gameState!=='playing')return;
    if(player.ammo<=0){showToast('MAGAZINE EMPTY — PRESS R TO RELOAD');player.shoot=.28;return;}
    player.ammo--;player.shoot=.145;
    const spread=(Math.random()-.5)*.045,ang=player.angle+spread,startX=player.x+Math.cos(ang)*23,startY=player.y+Math.sin(ang)*23;
    bullets.push({x:startX,y:startY,vx:Math.cos(ang)*730,vy:Math.sin(ang)*730,life:.85,hostile:false,damage:1});
    for(let i=0;i<3;i++)particles.push({x:startX,y:startY,vx:Math.cos(ang+(Math.random()-.5)*.8)*(50+Math.random()*120),vy:Math.sin(ang+(Math.random()-.5)*.8)*(50+Math.random()*120),life:.11+Math.random()*.12,max:.2,size:1.5,color:'#f5cf7a'});
    if(player.ammo===0)showToast('LAST ROUND — RELOAD WHEN SAFE',850);
    updateHud();
  }
  function reload() {
    if(player.reload>0||player.ammo===30||player.reserve===0)return;
    player.reload=1.25;$('#reload-label').textContent='RELOADING';showToast('RELOADING');
  }
  function damagePlayer(amount) {
    if(player.invuln>0)return;player.invuln=.32;
    const absorbed=Math.min(player.armor,amount*.7);player.armor-=absorbed;player.health-=amount-absorbed;
    if(player.health<=0){player.health=0;gameState='over';$('#overlay-title').innerHTML='SIGNAL<br><em>LOST.</em>';$('#overlay-copy').textContent=`You disabled ${player.kills} rogue sentries before the outpost went dark. The wild is still out there. Redeploy when you're ready.`;$('#start-button').innerHTML='REDEPLOY <span>→</span>';$('#overlay').classList.remove('hidden');}
    updateHud();
  }
  function addParticles(x,y,count,color,force=120){for(let i=0;i<count;i++){const a=Math.random()*TAU,s=Math.random()*force;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.35+Math.random()*.5,max:.85,size:1+Math.random()*2.2,color});}}
  function killEnemy(e) {
    e.dead=true;player.kills++;addParticles(e.x,e.y,13,'#c27b61',180);
    if(Math.random()<.48)pickups.push({x:e.x,y:e.y,kind:Math.random()<.25?'med':'ammo',phase:Math.random()*TAU});
    showToast(player.kills>=8?'OUTPOST SECURE — SIGNAL RESTORED':'SENTRY NEUTRALIZED',1200);
    if(player.kills>=8){$('#objective').textContent='Frontier signal restored';$('#objective-sub').textContent='Outpost secure · wildlife safe';gameState='won';$('#overlay-title').innerHTML='THE WILD<br><em>ENDURES.</em>';$('#overlay-copy').textContent=`Outpost Zero is back online. You disabled all eight rogue sentries without harming the wildlife. Take a breath, explore the frontier, and enjoy the view.`;$('#start-button').innerHTML='EXPLORE THE FRONTIER <span>→</span>';$('#overlay').classList.remove('hidden');}
    updateHud();
  }
  function update(dt) {
    elapsed+=dt;
    const mouseAim=pointer.x||pointer.y;
    if(mouseAim){const sx=player.x-camera.x,sy=player.y-camera.y;player.angle=Math.atan2(pointer.y-sy,pointer.x-sx);}
    let dx=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0)+joy.x;
    let dy=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0)+joy.y;
    const moving=Math.hypot(dx,dy);player.moving=moving;movePlayer(dx,dy,dt);
    if(player.shoot>0)player.shoot-=dt;if(player.invuln>0)player.invuln-=dt;
    if(player.reload>0){player.reload-=dt;if(player.reload<=0){const n=Math.min(30-player.ammo,player.reserve);player.ammo+=n;player.reserve-=n;$('#reload-label').textContent='';updateHud();showToast('MAGAZINE READY');}}
    if(pointer.down||fireHeld)shoot();
    for(const o of props){o.vx*=Math.exp(-dt*3.4);o.vy*=Math.exp(-dt*3.4);o.x+=o.vx*dt;o.y+=o.vy*dt;}
    for(const a of animals){
      a.turn-=dt;if(a.alert>0)a.alert-=dt;
      const d=Math.hypot(a.x-player.x,a.y-player.y);
      if(d<145){a.alert=1.2;a.angle=Math.atan2(a.y-player.y,a.x-player.x);}
      else if(a.turn<=0){a.angle+=(Math.random()-.5)*1.2;a.turn=1+Math.random()*3;}
      const pace=a.alert>0?82:(a.kind==='deer'?20:27),f=1-Math.exp(-dt*2);a.vx=lerp(a.vx,Math.cos(a.angle)*pace,f);a.vy=lerp(a.vy,Math.sin(a.angle)*pace,f);
      if(!blocked(a.x+a.vx*dt,a.y+a.vy*dt,5)){a.x+=a.vx*dt;a.y+=a.vy*dt;}else a.angle+=Math.PI*.7;
    }
    for(const e of enemies){if(e.dead)continue;const dxp=player.x-e.x,dyp=player.y-e.y,d=Math.hypot(dxp,dyp),desired=Math.atan2(dyp,dxp);e.angle=desired;
      if(d>185){e.vx=lerp(e.vx,Math.cos(desired)*72,1-Math.exp(-dt*2));e.vy=lerp(e.vy,Math.sin(desired)*72,1-Math.exp(-dt*2));e.x+=e.vx*dt;e.y+=e.vy*dt;}
      else{e.vx*=Math.exp(-dt*4);e.vy*=Math.exp(-dt*4);}
      if(d<24)damagePlayer(10);
      e.fire-=dt;if(d<560&&e.fire<=0){e.fire=1.5+Math.random()*1.2;const a=desired+(Math.random()-.5)*.09;bullets.push({x:e.x+Math.cos(a)*17,y:e.y+Math.sin(a)*17,vx:Math.cos(a)*290,vy:Math.sin(a)*290,life:2.5,hostile:true,damage:11});}
    }
    for(let i=bullets.length-1;i>=0;i--){const b=bullets[i];b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;let remove=b.life<=0||b.x<0||b.y<0||b.x>WORLD||b.y>WORLD;
      if(!remove&&b.hostile&&Math.hypot(b.x-player.x,b.y-player.y)<14){damagePlayer(b.damage);remove=true;addParticles(b.x,b.y,3,'#ff9879',45);}
      if(!remove&&!b.hostile){for(const e of enemies){if(e.dead)continue;if(Math.hypot(b.x-e.x,b.y-e.y)<17){e.health-=1;e.stun=.1;addParticles(b.x,b.y,4,'#e1ba80',65);if(e.health<=0)killEnemy(e);remove=true;break;}}}
      if(!remove&&b.hostile&&props.some(o=>Math.hypot(b.x-o.x,b.y-o.y)<o.size*.6))remove=true;
      if(remove)bullets.splice(i,1);
    }
    for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.exp(-dt*2.6);p.vy*=Math.exp(-dt*2.6);p.life-=dt;if(p.life<=0)particles.splice(i,1);}
    for(let i=pickups.length-1;i>=0;i--){const p=pickups[i];if(Math.hypot(p.x-player.x,p.y-player.y)<25){if(p.kind==='med'){player.health=Math.min(100,player.health+24);player.armor=Math.min(65,player.armor+8);showToast('FIELD MEDKIT — VITALS RESTORED');}else{player.reserve=Math.min(180,player.reserve+30);showToast('AMMO CACHE — +30 ROUNDS');}pickups.splice(i,1);updateHud();}}
    while(enemies.filter(e=>!e.dead).length<4&&player.kills<8&&gameState==='playing')spawnEnemy(560+Math.random()*180,Math.random()*TAU);
    if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)$('#toast').classList.remove('show');}
    const b=biomeNameAt(player.x,player.y);$('#biome-label').textContent=b;
    $('#coords').textContent=`E ${Math.round(player.x/36)} · N ${Math.round((WORLD-player.y)/36)}`;
  }
  function updateHud() {
    $('#health-value').textContent=Math.ceil(player.health);$('#health-bar').style.width=`${player.health}%`;
    $('#armor-value').textContent=Math.ceil(player.armor);$('#armor-bar').style.width=`${player.armor/65*100}%`;
    $('#ammo-value').textContent=String(player.ammo).padStart(2,'0');$('#reserve-value').textContent=player.reserve;
    $('#objective-sub').textContent=player.kills>=8?'Outpost secure · wildlife safe':`Neutralize hostiles · ${player.kills} / 8`;
    $('#status-text').textContent=player.health<30?'VITALS CRITICAL':'SIGNAL ACQUIRED';
  }
  function showToast(message,duration=1100){const el=$('#toast');el.textContent=message;el.classList.add('show');toastTimer=duration/1000;}
  function frame(now){const dt=Math.min(.04,(now-last)/1000||0);last=now;if(gameState==='playing')update(dt);else elapsed+=dt;render();requestAnimationFrame(frame);}
  requestAnimationFrame(frame);
  function startGame(){
    if(gameState==='over'||gameState==='won'){
      player.x=1800;player.y=1800;player.vx=player.vy=0;player.health=100;player.armor=65;player.ammo=30;player.reserve=120;player.kills=0;enemies.length=0;bullets.length=0;particles.length=0;pickups.length=0;for(let i=0;i<8;i++)spawnEnemy(520+Math.random()*220,Math.random()*TAU);
      $('#objective').textContent='Clear the rogue sentries';updateHud();
    }
    gameState='playing';$('#overlay').classList.add('hidden');$('#crosshair').classList.add('visible');canvas.focus?.();
  }
  $('#start-button').addEventListener('click',startGame);
  $('#pause-button').addEventListener('click',()=>{if(gameState==='playing'){gameState='paused';$('#overlay-title').innerHTML='TAKE A<br><em>BREATHER.</em>';$('#overlay-copy').textContent='The frontier is holding. Regroup, then head back out.';$('#start-button').innerHTML='RESUME MISSION <span>→</span>';$('#overlay').classList.remove('hidden');}else if(gameState==='paused')startGame();});
  window.addEventListener('keydown',e=>{const k=e.key.toLowerCase();if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault();keys.add(k);if(k==='r')reload();if(k==='escape'&&gameState==='playing')$('#pause-button').click();if(k==='enter'&&(gameState==='menu'||gameState==='paused'))startGame();});
  window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
  canvas.addEventListener('pointermove',e=>{const r=canvas.getBoundingClientRect();pointer.x=e.clientX-r.left;pointer.y=e.clientY-r.top;});
  canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button===0){pointer.down=true;canvas.setPointerCapture?.(e.pointerId);}});
  window.addEventListener('pointerup',e=>{if(e.pointerType==='mouse')pointer.down=false;});
  const joyEl=$('#joystick'),knob=$('#joy-knob');
  joyEl.addEventListener('pointerdown',e=>{joy.active=true;joyEl.setPointerCapture(e.pointerId);updateJoy(e);});
  joyEl.addEventListener('pointermove',e=>{if(joy.active)updateJoy(e);});
  joyEl.addEventListener('pointerup',()=>{joy.active=false;joy.x=joy.y=0;knob.style.transform='translate(0,0)';});
  joyEl.addEventListener('pointercancel',()=>{joy.active=false;joy.x=joy.y=0;knob.style.transform='translate(0,0)';});
  function updateJoy(e){const r=joyEl.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,max=34,dx=e.clientX-cx,dy=e.clientY-cy,d=Math.hypot(dx,dy),scale=d>max?max/d:1;joy.x=dx*scale/max;joy.y=dy*scale/max;knob.style.transform=`translate(${joy.x*max}px,${joy.y*max}px)`;}
  const fire=$('#fire-button');fire.addEventListener('pointerdown',e=>{fireHeld=true;fire.setPointerCapture(e.pointerId);if(!pointer.x&&!pointer.y){const closest=enemies.filter(x=>!x.dead).sort((a,b)=>dist2(a,player)-dist2(b,player))[0];if(closest){pointer.x=closest.x-camera.x;pointer.y=closest.y-camera.y;}}});fire.addEventListener('pointerup',()=>fireHeld=false);fire.addEventListener('pointercancel',()=>fireHeld=false);
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&gameState==='playing')$('#pause-button').click();});
})();
