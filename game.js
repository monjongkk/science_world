"use strict";
const $=id=>document.getElementById(id);

/* ============ WebGL และหน้าจอ ============ */
const cv=$('game');
const gl=cv.getContext('webgl',{antialias:true});
if(!gl){document.body.innerHTML='<p style="padding:40px;font-size:20px">เบราว์เซอร์นี้ไม่รองรับ WebGL กรุณาใช้ Google Chrome</p>';throw new Error('no webgl');}
const lbl=$('lbl'), lctx=lbl.getContext('2d');
let VW=1,VH=1,DPR=1;
function resize(){
  DPR=Math.min(2,window.devicePixelRatio||1);VW=innerWidth;VH=innerHeight;
  cv.width=Math.floor(VW*DPR);cv.height=Math.floor(VH*DPR);
  gl.viewport(0,0,cv.width,cv.height);
  lbl.width=VW;lbl.height=VH;
}
addEventListener('resize',resize); resize();
const isTouch=('ontouchstart' in window)||matchMedia('(pointer:coarse)').matches;

/* ============ โปรแกรมแสดงผล (shader) ============ */
const VS=`attribute vec3 aPos;attribute vec3 aNor;attribute vec4 aCol;uniform mat4 uVP;varying vec3 vN;varying vec4 vC;varying float vD;uniform vec3 uEye;
void main(){gl_Position=uVP*vec4(aPos,1.0);vN=aNor;vC=aCol;vD=distance(aPos,uEye);}`;
const FS=`precision mediump float;varying vec3 vN;varying vec4 vC;varying float vD;uniform vec3 uL;uniform vec3 uFog;
void main(){float l=max(dot(normalize(vN),normalize(uL)),0.0);float k=0.55+0.45*l;vec3 c=vC.rgb*k;float f=clamp((vD-30.0)/45.0,0.0,1.0);c=mix(c,uFog,f);gl_FragColor=vec4(c,vC.a);}`;
function compile(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
const prog=gl.createProgram();
gl.attachShader(prog,compile(gl.VERTEX_SHADER,VS));
gl.attachShader(prog,compile(gl.FRAGMENT_SHADER,FS));
gl.linkProgram(prog);
gl.useProgram(prog);
const aPos=gl.getAttribLocation(prog,'aPos'), aNor=gl.getAttribLocation(prog,'aNor'), aCol=gl.getAttribLocation(prog,'aCol');
const uVP=gl.getUniformLocation(prog,'uVP'), uEye=gl.getUniformLocation(prog,'uEye'), uL=gl.getUniformLocation(prog,'uL'), uFog=gl.getUniformLocation(prog,'uFog');
gl.enableVertexAttribArray(aPos);gl.enableVertexAttribArray(aNor);gl.enableVertexAttribArray(aCol);
gl.enable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
gl.disable(gl.CULL_FACE);
const SKY=[0.62,0.85,1.0];
gl.clearColor(SKY[0],SKY[1],SKY[2],1);
gl.uniform3f(uL,0.5,1.0,0.35);
gl.uniform3f(uFog,SKY[0],SKY[1],SKY[2]);
const sBuf=gl.createBuffer(), dBuf=gl.createBuffer();
let staticCount=0;

/* ============ คณิตศาสตร์เมทริกซ์ ============ */
function persp(f,a,n,fa){const r=1/(n-fa);return new Float32Array([f/a,0,0,0, 0,f,0,0, 0,0,(fa+n)*r,-1, 0,0,2*fa*n*r,0]);}
function lookAt(e,t,u){
  let zx=e[0]-t[0],zy=e[1]-t[1],zz=e[2]-t[2];let l=Math.hypot(zx,zy,zz);zx/=l;zy/=l;zz/=l;
  let xx=u[1]*zz-u[2]*zy,xy=u[2]*zx-u[0]*zz,xz=u[0]*zy-u[1]*zx;l=Math.hypot(xx,xy,xz);xx/=l;xy/=l;xz/=l;
  const yx=zy*xz-zz*xy,yy=zz*xx-zx*xz,yz=zx*xy-zy*xx;
  return new Float32Array([xx,yx,zx,0, xy,yy,zy,0, xz,yz,zz,0, -(xx*e[0]+xy*e[1]+xz*e[2]),-(yx*e[0]+yy*e[1]+yz*e[2]),-(zx*e[0]+zy*e[1]+zz*e[2]),1]);
}
function mul(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];o[c*4+r]=s;}return o;}
let VP=new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
function project(x,y,z){
  const m=VP;
  const cx=m[0]*x+m[4]*y+m[8]*z+m[12], cy=m[1]*x+m[5]*y+m[9]*z+m[13], cw=m[3]*x+m[7]*y+m[11]*z+m[15];
  if(cw<=0.01)return null;
  return [(cx/cw*0.5+0.5)*VW,(1-(cy/cw*0.5+0.5))*VH];
}

/* ============ สร้างรูปทรง 3 มิติ ============ */
const RGBC={};
function col(h){if(RGBC[h])return RGBC[h];return RGBC[h]=[parseInt(h.slice(1,3),16)/255,parseInt(h.slice(3,5),16)/255,parseInt(h.slice(5,7),16)/255];}
function shadeHex(c,f=0.78){const n=parseInt(c.slice(1),16);const r=Math.round(((n>>16)&255)*f),g=Math.round(((n>>8)&255)*f),b=Math.round((n&255)*f);return '#'+((1<<24)|(r<<16)|(g<<8)|b).toString(16).slice(1);}
let M=[];
function quad(p0,p1,p2,p3,n,c,a,out){
  const pts=[p0,p1,p2,p3], idx=[0,1,2,0,2,3];
  for(const i of idx){const p=pts[i];out.push(p[0],p[1],p[2],n[0],n[1],n[2],c[0],c[1],c[2],a);}
}
// กล่องที่หมุนรอบแกน Y ได้ (yaw) และวางตำแหน่งที่ (ox,oy,oz)
function box(x0,y0,z0,x1,y1,z1,top,side,yaw,ox,oy,oz,out){
  yaw=yaw||0;ox=ox||0;oy=oy||0;oz=oz||0;out=out||M;
  const s=Math.sin(yaw),c=Math.cos(yaw);
  const R=(x,y,z)=>[ox+x*c+z*s,oy+y,oz-x*s+z*c];
  const N=(nx,ny,nz)=>[nx*c+nz*s,ny,-nx*s+nz*c];
  const tc=col(top), sc=col(side);
  quad(R(x0,y1,z0),R(x0,y1,z1),R(x1,y1,z1),R(x1,y1,z0),N(0,1,0),tc,1,out);
  quad(R(x1,y0,z0),R(x1,y1,z0),R(x1,y1,z1),R(x1,y0,z1),N(1,0,0),sc,1,out);
  quad(R(x0,y0,z1),R(x0,y1,z1),R(x0,y1,z0),R(x0,y0,z0),N(-1,0,0),sc,1,out);
  quad(R(x0,y0,z1),R(x1,y0,z1),R(x1,y1,z1),R(x0,y1,z1),N(0,0,1),sc,1,out);
  quad(R(x1,y0,z0),R(x0,y0,z0),R(x0,y1,z0),R(x1,y1,z0),N(0,0,-1),sc,1,out);
}
function flat(x0,z0,x1,z1,y,c,out){quad([x0,y,z0],[x0,y,z1],[x1,y,z1],[x1,y,z0],[0,1,0],col(c),1,out);}
function hashN(x,y){return ((x*73856093)^(y*19349663))&255;}

const T={
  grass:{c:'#8ee05e',s:'#3f9f3a'},
  path:{c:'#fde7a9',s:'#c49257'},
  sand:{c:'#fef0b8',s:'#d8b46a'},
  water:{c:'#38bdf8',s:'#0b6fb8',solid:true},
  bridge:{c:'#d9954f',s:'#8a5126'},
  bld:{c:'#fb7185',s:'#be3455',h:2.4,solid:true},
  lab:{c:'#a5d8ff',s:'#3b6fd1',h:2.2,solid:true},
  tree:{c:'#4ade80',s:'#22c55e',solid:true,tree:true},
  rock:{c:'#dcd7cf',s:'#7a7268',h:0.9},
  mount:{c:'#d8b4fe',s:'#6d28d9',h:3,solid:true},
  caveFloor:{c:'#5b4a6e',s:'#3a2e4a'},
  gate:{c:'#f472b6',s:'#be185d',h:2.6,solid:true}
};
const W=56,H=48;
const ZONES=[
  {n:'ศูนย์บัญชาการ',x1:0,y1:0,x2:27,y2:16},
  {n:'ดินแดนวัสดุมหัศจรรย์',x1:0,y1:17,x2:27,y2:33},
  {n:'หุบเขาแห่งเสียง',x1:28,y1:0,x2:55,y2:21},
  {n:'เกาะลึกลับแห่งหิน',x1:28,y1:26,x2:55,y2:47}
];
function zoneAt(x,y){for(const z of ZONES) if(x>=z.x1&&x<=z.x2&&y>=z.y1&&y<=z.y2) return z.n; return 'ทางเชื่อม';}

/* ============ ข้อมูลเกม ============ */
const MATS=[
  {id:'m_wood',name:'ไม้',x:5,y:21,c:'#c98a4b',info:'ไม้: แข็งปานกลาง ผิวขรุขระ ตัดและประกอบได้ง่าย และลอยน้ำได้'},
  {id:'m_iron',name:'เหล็ก',x:9,y:27,c:'#8e9aa8',info:'เหล็ก: แข็งและทนทานมาก มีน้ำหนักมาก และนำความร้อนได้ดี'},
  {id:'m_plastic',name:'พลาสติก',x:12,y:25,c:'#ff6fb1',info:'พลาสติก: เบา ขึ้นรูปได้ง่าย และทนแรงกระแทกได้ดี'},
  {id:'m_glass',name:'แก้ว',x:17,y:20,c:'#9be7ff',info:'แก้ว: แข็งแต่เปราะแตกง่าย และโปร่งใส มองทะลุไปด้านหลังได้'},
  {id:'m_rubber',name:'ยาง',x:23,y:27,c:'#333a44',info:'ยาง: ยืดหยุ่นสูง ดึงแล้วกลับคืนรูปเดิมได้ และไม่ดูดซึมน้ำ'},
  {id:'m_sponge',name:'ฟองน้ำ',x:4,y:19,c:'#ffd83d',info:'ฟองน้ำ: นุ่มและมีรูพรุน ดูดซึมน้ำได้มาก และบีบแล้วคืนรูปได้'}
];
const INSTR=[
  {id:'i_drum',name:'กลอง',x:33,y:6,act:'เคาะ',f:180,w:'triangle',c:'#ff4d4d',info:'กลองสั่นเมื่อถูกเคาะ การสั่นสะเทือนนี้ทำให้เกิดเสียง'},
  {id:'i_bell',name:'กระดิ่ง',x:36,y:15,act:'ตี',f:880,w:'sine',c:'#ffd23f',info:'กระดิ่งสั่นเมื่อถูกตี ถ้าสั่นถี่ เสียงจะสูง'},
  {id:'i_fork',name:'ส้อมเสียง',x:44,y:6,act:'เคาะ',f:440,w:'sine',c:'#c0c8d8',info:'ส้อมเสียงสั่นด้วยความถี่คงที่ เมื่อเคาะจึงได้เสียงที่สม่ำเสมอ'},
  {id:'i_hose',name:'สายยาง',x:48,y:14,act:'ดีด',f:300,w:'sawtooth',c:'#2d2d2d',info:'สายยางที่ถูกดีดจะสั่น ถ้าสั่นถี่เสียงจะสูง'},
  {id:'i_shaker',name:'กล่องเขย่า',x:32,y:17,act:'เขย่า',f:0,w:'noise',c:'#8ad46a',info:'เมล็ดในกล่องกระทบกันทำให้วัตถุสั่น แล้วส่งเสียงออกมา'},
  {id:'i_jar',name:'กล่องสุญญากาศ',x:30,y:10,act:'ตี',f:880,w:'sine',c:'#bfe9ff',quiet:true,info:'เสียงเบามาก เพราะเสียงต้องอาศัยตัวกลาง เช่น อากาศ ในการเดินทาง และในกล่องนี้อากาศถูกดูดออกไปแล้ว'}
];
const ROCKS=[
  {id:'r_gran',name:'หินแกรนิต',x:34,y:37,c:'#e8c4c4',info:'สีขาวปนชมพูหรือเทา เนื้อหยาบ เห็นเม็ดแร่ใหญ่ชัดเจน แข็งมาก เกิดจากหินหลอมเหลวเย็นตัวช้าใต้ดิน'},
  {id:'r_lime',name:'หินปูน',x:40,y:42,c:'#f2eedb',info:'สีขาวหรือครีม เนื้อละเอียด เม็ดแร่เล็ก ทำปฏิกิริยากับกรดแล้วเกิดฟองได้'},
  {id:'r_sand',name:'หินทราย',x:46,y:38,c:'#e3a56a',info:'สีเหลืองหรือน้ำตาล ประกอบด้วยเม็ดทรายที่ยึดติดกัน สัมผัสแล้วหยาบคล้ายทราย'}
];
const NPCS=[
  {id:'n_nuno',name:'นุ่น ผู้ช่วยนำทาง',x:11,y:11,shirt:'#ff5c8a',stage:0},
  {id:'n_pin',name:'ดร.ปิ่น',x:13,y:27,shirt:'#3aa0e8',stage:1},
  {id:'n_ek',name:'ดร.เอก',x:38,y:11,shirt:'#ffb020',stage:2},
  {id:'n_sri',name:'ดร.ศรี',x:40,y:33,shirt:'#5bc43a',stage:3}
];
const SIGNS=[
  {x:6,y:15,t:'↓ ดินแดนวัสดุ',full:'↓ ทางไปดินแดนวัสดุมหัศจรรย์ (ด่าน 1)'},
  {x:16,y:6,t:'→ หุบเขาเสียง',full:'→ ทางไปหุบเขาแห่งเสียง (ด่าน 2) ต้องทำด่าน 1 ให้สำเร็จก่อน'},
  {x:10,y:7,t:'ศูนย์บัญชาการ',full:'ศูนย์บัญชาการ: จุดเริ่มต้นการผจญภัย'},
  {x:40,y:20,t:'↓ เกาะหิน',full:'↓ เกาะลึกลับแห่งหิน (ด่าน 3) ต้องทำด่าน 2 ให้สำเร็จก่อน'}
];
const NPC_NAME={1:'ดร.ปิ่น',2:'ดร.เอก',3:'ดร.ศรี'};
const STAGE_SHORT={1:'ด่าน 1',2:'ด่าน 2',3:'ด่าน 3'};
const STAGE_NAMES={1:'ด่าน 1: ดินแดนวัสดุมหัศจรรย์',2:'ด่าน 2: หุบเขาแห่งเสียง',3:'ด่าน 3: เกาะลึกลับแห่งหิน'};
const STAGE_GOAL={1:'สำรวจวัสดุทั้ง 6 ชนิด จับคู่สมบัติ แล้วทำแบบทดสอบ',2:'ทดลองเครื่องดนตรีและอุปกรณ์ทั้ง 6 ชนิด แล้วทำแบบทดสอบ',3:'สำรวจตัวอย่างหินทั้ง 3 ชนิด แล้วทำแบบทดสอบ'};
const STAGE_INTRO={
  1:['ยินดีต้อนรับสู่ดินแดนวัสดุมหัศจรรย์!','ภารกิจ: สำรวจวัสดุ 6 ชนิด คือ ไม้ เหล็ก พลาสติก แก้ว ยาง และฟองน้ำ','เดินเข้าใกล้วัตถุแล้วกด E เพื่อสำรวจ และสังเกตสมบัติของแต่ละวัสดุ'],
  2:['ยินดีต้อนรับสู่หุบเขาแห่งเสียง!','ภารกิจ: ทดลองเครื่องดนตรีและอุปกรณ์ทั้ง 6 ชนิด','ลองเคาะ ตี ดีด และเขย่า แล้วฟังว่าเสียงเกิดขึ้นได้อย่างไร'],
  3:['ยินดีต้อนรับสู่เกาะลึกลับแห่งหิน!','ภารกิจ: สำรวจตัวอย่างหิน 3 ชนิด คือ แกรนิต หินปูน และหินทราย','สังเกตสี เนื้อหิน และเม็ดแร่ของแต่ละชนิดให้ดี']
};
const QUIZ={
  1:[
    {q:'วัสดุชนิดใด ยืดหยุ่นได้ดีที่สุด เมื่อดึงแล้วกลับคืนรูปเดิมได้?',c:['ไม้','เหล็ก','ยาง','แก้ว'],a:2,ex:'ยางมีความยืดหยุ่นสูง เมื่อดึงแล้วปล่อยก็กลับคืนรูปเดิมได้'},
    {q:'วัสดุชนิดใด ดูดซึมน้ำได้ดีที่สุด?',c:['ไม้','ฟองน้ำ','แก้ว','เหล็ก'],a:1,ex:'ฟองน้ำมีรูพรุนจำนวนมาก จึงดูดซึมน้ำได้ดี'},
    {q:'วัสดุชนิดใด โปร่งใส มองเห็นสิ่งที่อยู่ด้านหลังได้?',c:['ไม้','เหล็ก','แก้ว','ฟองน้ำ'],a:2,ex:'แก้วเป็นวัสดุโปร่งใส แสงผ่านได้ จึงมองทะลุได้'},
    {q:'ในสี่วัสดุนี้ วัสดุใดแข็งที่สุด?',c:['ฟองน้ำ','ยาง','ไม้','เหล็ก'],a:3,ex:'เหล็กแข็งและทนทานกว่าวัสดุอื่นในกลุ่มนี้'},
    {q:'หากต้องการทำถังน้ำที่ไม่แตกง่ายเมื่อตกพื้น ควรเลือกวัสดุใด?',c:['แก้ว','พลาสติก','ฟองน้ำ','ยาง'],a:1,ex:'พลาสติกทนแรงกระแทกได้ดีกว่าแก้วซึ่งเปราะแตกง่าย'}
  ],
  2:[
    {q:'เสียงเกิดจากอะไร?',c:['แสงสว่าง','การสั่นสะเทือน','ความร้อน','แม่เหล็ก'],a:1,ex:'เมื่อวัตถุสั่น จะทำให้อากาศรอบ ๆ สั่นตาม และส่งมาถึงหูเราเป็นเสียง'},
    {q:'ถ้าไม่มีตัวกลางเลย เสียงจะเดินทางได้หรือไม่?',c:['ได้เสมอ','ไม่ได้','ได้เฉพาะตอนกลางคืน','ได้เฉพาะในน้ำ'],a:1,ex:'เสียงต้องอาศัยตัวกลาง เช่น อากาศ น้ำ หรือของแข็งในการเดินทาง'},
    {q:'เมื่อตีกลองแรงขึ้น เสียงจะเป็นอย่างไร?',c:['เบาลง','ดังขึ้น','ไม่มีเสียง','เสียงต่ำลงเสมอ'],a:1,ex:'การตีแรงขึ้นทำให้วัตถุสั่นมากขึ้น เสียงจึงดังขึ้น'},
    {q:'อะไรเป็นตัวกำหนดว่าเสียงสูงหรือต่ำ?',c:['ความดังของเสียง','ความถี่ในการสั่น','สีของวัตถุ','ขนาดของห้อง'],a:1,ex:'ความถี่ของการสั่นมาก เสียงจะสูง ความถี่น้อย เสียงจะต่ำ'},
    {q:'เมื่อเขย่ากล่องที่มีเมล็ดถั่ว เสียงเกิดจากอะไร?',c:['ลมพัดผ่าน','การสั่นของวัตถุที่กระทบกัน','แสงที่ส่องเข้ามา','การเปลี่ยนสีของกล่อง'],a:1,ex:'เมล็ดถั่วกระทบกันและกระทบผนังกล่อง ทำให้เกิดการสั่นและเสียง'}
  ],
  3:[
    {q:'หินชนิดใดเกิดจากหินหลอมเหลวที่เย็นตัวช้าอยู่ใต้ดิน?',c:['หินแกรนิต','หินปูน','หินทราย','ดินเหนียว'],a:0,ex:'หินแกรนิตเกิดจากหินหลอมเหลวเย็นตัวช้า จึงมีเม็ดแร่ใหญ่และเห็นชัด'},
    {q:'หินปูนมีสมบัติเด่นอย่างไร?',c:['ลอยน้ำได้','ทำปฏิกิริยากับกรดแล้วเกิดฟอง','เป็นแม่เหล็ก','มีเม็ดแร่ใหญ่เป็นผลึกเงา'],a:1,ex:'หินปูนมีแคลเซียมคาร์บอเนต จึงเกิดฟองเมื่อหยดกรดลงไป'},
    {q:'หินทรายประกอบด้วยอะไรเป็นส่วนใหญ่?',c:['เม็ดทราย','เม็ดโลหะ','ผลึกเกลือ','น้ำแข็ง'],a:0,ex:'หินทรายเกิดจากเม็ดทรายที่ถูกอัดและยึดติดกันเป็นชั้น'},
    {q:'หินที่มีเม็ดแร่ใหญ่และเห็นชัดเจน มักเป็นหินชนิดใด?',c:['หินทราย','หินแกรนิต','หินปูน','หินดินดาน'],a:1,ex:'หินแกรนิตมีเม็ดแร่ใหญ่ เพราะเย็นตัวช้าใต้ผิวโลก'},
    {q:'เมื่อต้องจำแนกหินที่ไม่รู้ชนิด ควรสังเกตอะไรก่อน?',c:['สี เนื้อหิน และเม็ดแร่','ราคาของหิน','ชื่อของผู้พบ','น้ำหนักของกระเป๋า'],a:0,ex:'สี เนื้อหิน และเม็ดแร่ เป็นลักษณะที่สังเกตได้ง่าย ใช้เปรียบเทียบหินได้'}
  ]
};
const MATCH=[
  {id:'m_wood',name:'ไม้',t:'แข็งปานกลาง ลอยน้ำได้'},
  {id:'m_iron',name:'เหล็ก',t:'แข็งและทนทานมาก นำความร้อนดี'},
  {id:'m_plastic',name:'พลาสติก',t:'เบา ขึ้นรูปได้ง่าย ทนแรงกระแทก'},
  {id:'m_glass',name:'แก้ว',t:'โปร่งใส แต่เปราะแตกง่าย'},
  {id:'m_rubber',name:'ยาง',t:'ยืดหยุ่น ดึงแล้วคืนรูปได้'},
  {id:'m_sponge',name:'ฟองน้ำ',t:'ดูดซึมน้ำได้ดี'}
];

/* ============ สร้างแผนที่ ============ */
let grid=[], COINS=[], ENT=[];
const RESERVED=new Set();
function rng(seed){let s=seed;return()=>{s=(s*16807)%2147483647;return s/2147483647;};}
function tileAt(x,y){if(x<0||y<0||x>=W||y>=H)return null;return T[grid[y][x]];}
function solidAt(tx,ty,z){const t=tileAt(tx,ty);if(!t)return true;if(t.solid)return true;return (t.h||0)>z+0.25;}
const RAD=0.28;
function blocked(x,y,z){const r=RAD;return solidAt(Math.floor(x-r),Math.floor(y-r),z)||solidAt(Math.floor(x+r),Math.floor(y-r),z)||solidAt(Math.floor(x-r),Math.floor(y+r),z)||solidAt(Math.floor(x+r),Math.floor(y+r),z);}
function hAt(tx,ty){const t=tileAt(tx,ty);return (t&&!t.solid)?(t.h||0):0;}
function groundH(x,y){return hAt(Math.floor(x),Math.floor(y));}

function buildWorld(){
  grid=[];
  for(let y=0;y<H;y++) grid.push(Array(W).fill('grass'));
  const fill=(x1,y1,x2,y2,t)=>{for(let y=y1;y<=y2;y++)for(let x=x1;x<=x2;x++)if(x>=0&&y>=0&&x<W&&y<H)grid[y][x]=t;};
  fill(2,2,15,13,'path');
  fill(5,3,9,5,'lab');
  fill(16,7,25,9,'path');
  fill(7,14,9,17,'path');
  fill(26,5,27,11,'gate');
  fill(8,18,12,20,'path');
  fill(10,19,14,22,'lab');
  fill(19,17,20,47,'water');
  fill(19,24,20,25,'bridge');
  fill(2,25,8,30,'mount');
  fill(6,27,8,28,'caveFloor');
  fill(9,27,10,28,'path');
  fill(28,0,55,21,'grass');
  fill(28,7,33,9,'path');
  fill(33,4,44,12,'sand');
  fill(47,0,55,8,'mount');
  fill(44,16,47,18,'rock');
  fill(36,19,44,21,'path');
  fill(36,22,44,23,'gate');
  fill(36,24,44,25,'path');
  fill(28,26,52,47,'water');
  fill(39,26,41,30,'bridge');
  fill(31,31,49,45,'sand');
  [[36,33],[37,33],[43,33],[44,33],[42,36],[43,36]].forEach(([x,y])=>grid[y][x]='rock');

  RESERVED.clear();
  [...MATS,...INSTR,...ROCKS,...NPCS,...SIGNS].forEach(o=>RESERVED.add(o.x+','+o.y));
  RESERVED.add('8,10');
  const R=rng(20261010);
  const scatter=(n,x1,y1,x2,y2)=>{let c=0,t=0;while(c<n&&t<5000){t++;const x=x1+Math.floor(R()*(x2-x1+1)),y=y1+Math.floor(R()*(y2-y1+1));if(grid[y][x]==='grass'&&!RESERVED.has(x+','+y)){grid[y][x]='tree';c++;}}};
  scatter(22,2,18,18,31);
  scatter(6,21,18,26,33);
  scatter(10,28,0,46,21);
  scatter(10,0,32,17,47);
  [[2,2],[15,2],[2,13],[15,13]].forEach(([x,y])=>grid[y][x]='tree');

  const CP=[[12,4],[14,12],[20,8],[24,6],[30,8],[10,20],[16,22],[22,22],[7,31],[30,19],[41,15],[50,18],[36,28],[9,35],[24,40],[40,46],[12,38],[30,44]];
  COINS=CP.filter(([x,y])=>{const tn=grid[y][x];const t=T[tn];return !t.solid&&!t.h&&tn!=='gate'&&!RESERVED.has(x+','+y);}).map(([x,y],i)=>({x,y,id:'c'+i}));
}
function setGate(x1,y1,x2,y2,open){for(let y=y1;y<=y2;y++)for(let x=x1;x<=x2;x++)grid[y][x]=open?'path':'gate';}
function applyGates(){
  setGate(26,5,27,11,!!S.quiz[1]);
  setGate(36,22,44,23,!!S.quiz[2]);
  buildStatic();
  refreshMapImg();
}
function buildEntities(){
  ENT=[];
  MATS.forEach((m,i)=>ENT.push({kind:'item',id:m.id,name:m.name,x:m.x,y:m.y,c:m.c,info:m.info,stage:1,i}));
  INSTR.forEach(m=>ENT.push({kind:'instr',id:m.id,name:m.name,x:m.x,y:m.y,c:m.c,info:m.info,act:m.act,f:m.f,w:m.w,quiet:!!m.quiet,stage:2}));
  ROCKS.forEach(m=>ENT.push({kind:'rock',id:m.id,name:m.name,x:m.x,y:m.y,c:m.c,info:m.info,stage:3}));
  NPCS.forEach(n=>ENT.push({kind:'npc',id:n.id,name:n.name,x:n.x,y:n.y,shirt:n.shirt,stage:n.stage}));
  SIGNS.forEach((s,i)=>ENT.push({kind:'sign',id:'s'+i,name:'ป้าย',x:s.x,y:s.y,t:s.t,full:s.full}));
  COINS.forEach(c=>ENT.push({kind:'coin',id:c.id,name:'เหรียญ',x:c.x,y:c.y}));
}

/* สร้างพื้นและสิ่งปลูกสร้างแบบถาวร (สร้างใหม่เมื่อประตูเปิด) */
function buildStatic(){
  const A=[];
  flat(-40,-40,W+40,H+40,-0.05,'#6fbf4a',A);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const tn=grid[y][x], tt=T[tn];
    if(tn==='water'){flat(x,y,x+1,y+1,0,'#38bdf8',A);continue;}
    if(tn==='grass'){
      const hv=hashN(x,y);
      flat(x,y,x+1,y+1,0,hv<90?'#82d955':hv<200?'#8ee05e':'#78c94a',A);
      if((x*7+y*13)%9===0) flat(x+0.4,y+0.4,x+0.6,y+0.6,0.02,'#fff7a1',A);
      continue;
    }
    if(tn==='tree'){
      flat(x,y,x+1,y+1,0,'#78c94a',A);
      box(x+0.42,0,y+0.42,x+0.58,0.9,y+0.58,'#8a5a2b','#6b4220',0,0,0,0,A);
      box(x+0.1,0.8,y+0.1,x+0.9,1.9,y+0.9,'#4ade80','#22c55e',0,0,0,0,A);
      box(x+0.25,1.9,y+0.25,x+0.75,2.3,y+0.75,'#86efac','#4ade80',0,0,0,0,A);
      continue;
    }
    if(tt.h){
      flat(x,y,x+1,y+1,0,'#78c94a',A);
      box(x,0,y,x+1,tt.h,y+1,tt.c,tt.s,0,0,0,0,A);
      if(tn==='bld'||tn==='lab'){
        for(const hz of [0.7,1.5]){
          box(x+1,hz,y+0.3,x+1.03,hz+0.5,y+0.7,'#fff6c9','#fff6c9',0,0,0,0,A);
        }
      }
      continue;
    }
    if(tn==='caveFloor'){flat(x,y,x+1,y+1,0,'#5b4a6e',A);continue;}
    flat(x,y,x+1,y+1,0,tt.c,A);
    if(tn==='bridge'){
      for(const k of [0.25,0.5,0.75]) flat(x,y+k-0.05,x+1,y+k+0.05,0.01,'#6b3f1c',A);
    }
  }
  const arr=new Float32Array(A);
  gl.bindBuffer(gl.ARRAY_BUFFER,sBuf);
  gl.bufferData(gl.ARRAY_BUFFER,arr,gl.STATIC_DRAW);
  staticCount=arr.length/10;
}

/* ภาพแผนที่ย่อ */
const mapImg=document.createElement('canvas'); mapImg.width=W; mapImg.height=H;
const mctx=mapImg.getContext('2d');
function colorFor(tn){
  switch(tn){
    case 'tree': return '#1b7e40';
    case 'gate': return '#ff5c8a';
    case 'water': return '#2f8fd6';
    case 'bridge': return '#a06a35';
    case 'mount': return '#8a6ac0';
    case 'lab': return '#5c8fe0';
    case 'bld': return '#e0703a';
    case 'path': return '#e8c77a';
    case 'sand': return '#f1dc8e';
    case 'rock': return '#aaa49a';
    case 'caveFloor': return '#3a2e4a';
    default: return '#6ccc4a';
  }
}
function refreshMapImg(){for(let y=0;y<H;y++)for(let x=0;x<W;x++){mctx.fillStyle=colorFor(grid[y][x]);mctx.fillRect(x,y,1,1);}}

/* ============ บันทึกข้อมูลและผู้เล่น ============ */
function newSave(){return{explored:{},quiz:{},coins:0,score:0,stars:0,pos:null,coinGot:{},sound:true,matchDone:false};}
let S=newSave();
let PLAYER=null;
function saveKey(n){return 'sw_save:'+n;}
function saveGame(){if(!PLAYER)return;try{localStorage.setItem(saveKey(PLAYER),JSON.stringify(S));}catch(e){}}
function loadPlayers(){try{return JSON.parse(localStorage.getItem('sw_players')||'[]');}catch(e){return [];}}
function savePlayers(a){try{localStorage.setItem('sw_players',JSON.stringify(a));}catch(e){}}
function updateWho(){$('mWho').textContent=PLAYER?'👤 ผู้เล่น: '+PLAYER:'ยังไม่ได้ลงทะเบียน';}
function listFor(n){return n===1?MATS:n===2?INSTR:ROCKS;}
function progress(n){const L=listFor(n);return{done:L.filter(m=>S.explored[m.id]).length,total:L.length};}
function curStage(){for(let n=1;n<=3;n++) if(!S.quiz[n]) return n; return 0;}

function showRegister(){
  let last=''; try{last=localStorage.getItem('sw_last')||'';}catch(e){}
  $('rName').value=PLAYER||last; $('rMsg').textContent='';
  const list=$('rList'); list.innerHTML='';
  const ps=loadPlayers();
  if(ps.length){
    const t=document.createElement('p'); t.textContent='หรือเลือกผู้เล่นเดิม:'; list.appendChild(t);
    ps.forEach(n=>{const b=document.createElement('button');b.className='btn b';b.textContent='👤 '+n;b.onclick=()=>registerPlayer(n);list.appendChild(b);});
  }
  showOv('ovRegister');
  setTimeout(()=>$('rName').focus(),50);
}
function registerPlayer(raw){
  const name=String(raw||'').trim().slice(0,20);
  if(!name){$('rMsg').textContent='กรุณาใส่ชื่อก่อนนะ';return;}
  PLAYER=name;
  let loaded=null;
  try{const r=localStorage.getItem(saveKey(name));if(r)loaded=JSON.parse(r);}catch(e){}
  S=loaded?Object.assign(newSave(),loaded):newSave();
  S.name=name;
  const ps=loadPlayers(); if(!ps.includes(name)){ps.push(name);savePlayers(ps);}
  try{localStorage.setItem('sw_last',name);}catch(e){}
  P.x=S.pos?S.pos.x:8.5; P.y=S.pos?S.pos.y:10.5; P.z=0; P.vz=0;
  applyGates(); updateSoundBtn(); updateWho();
  saveGame();
  startGame();
}
function recordBoard(){
  let b=[]; try{b=JSON.parse(localStorage.getItem('sw_board')||'[]');}catch(e){}
  b.push({name:PLAYER||'ไม่ระบุ',score:S.score,stars:S.stars,date:new Date().toLocaleDateString('th-TH')});
  b.sort((x,y)=>(y.score-x.score)||(y.stars-x.stars));
  b=b.slice(0,10);
  try{localStorage.setItem('sw_board',JSON.stringify(b));}catch(e){}
  $('board').innerHTML='<h3 style="margin:10px 0 4px">🏅 กระดานคะแนน</h3>'+b.map((r,i)=>`<div class="qitem">${i+1}. <b>${r.name}</b> — ${r.score} คะแนน, ${r.stars} ดาว <small>(${r.date})</small></div>`).join('');
}

/* ============ เสียง ============ */
let AC=null;
function ac(){if(!AC){try{AC=new (window.AudioContext||window.webkitAudioContext)();}catch(e){return null;}}if(AC.state==='suspended')AC.resume();return AC;}
function tone(f,dur,type,vol,slide){
  if(!S.sound)return; const a=ac(); if(!a)return;
  const o=a.createOscillator(), g=a.createGain();
  o.type=type; o.frequency.setValueAtTime(f,a.currentTime);
  if(slide) o.frequency.exponentialRampToValueAtTime(slide,a.currentTime+dur);
  g.gain.setValueAtTime(vol,a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001,a.currentTime+dur);
  o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime+dur+0.05);
}
function sfx(n){
  if(n==='jump') tone(420,0.15,'square',0.04,700);
  else if(n==='coin'){tone(988,0.08,'square',0.05);setTimeout(()=>tone(1319,0.12,'square',0.05),80);}
  else if(n==='ok'){tone(660,0.1,'triangle',0.08);setTimeout(()=>tone(990,0.2,'triangle',0.08),100);}
  else if(n==='no') tone(220,0.3,'sawtooth',0.06,140);
  else if(n==='unlock') [523,659,784,1046].forEach((f,i)=>setTimeout(()=>tone(f,0.18,'triangle',0.08),i*120));
}
function playInstr(e){
  if(e.w==='noise'){for(let i=0;i<8;i++)setTimeout(()=>tone(900+Math.random()*900,0.04,'square',0.03),i*60);return;}
  tone(e.f,e.quiet?0.25:0.7,e.w,e.quiet?0.02:0.12,e.f*0.5);
}
function toggleSound(){S.sound=!S.sound;updateSoundBtn();saveGame();}
function updateSoundBtn(){const t=S.sound?'🔊 เสียง: เปิด':'🔇 เสียง: ปิด';$('bSound').textContent=t;$('bSoundP').textContent=t;}

/* ============ ข้อความและ HUD ============ */
let toastT=0;
function toast(msg,ms=2600){const el=$('toast');el.textContent=msg;el.style.display='block';clearTimeout(toastT);toastT=setTimeout(()=>el.style.display='none',ms);}
let DLG=null;
function say(name,lines,onEnd){DLG={name,lines,i:0,onEnd};$('dlgName').textContent=name;$('dialog').style.display='block';setMode('dialog');showLine();}
function showLine(){
  $('dlgText').textContent=DLG.lines[DLG.i];
  $('dlgHint').textContent=DLG.i<DLG.lines.length-1?'กด E หรือคลิกเพื่อไปต่อ ▶':'กด E หรือคลิกเพื่อปิด ✔';
}
function advance(){
  if(!DLG)return;
  if(DLG.i<DLG.lines.length-1){DLG.i++;showLine();return;}
  const cb=DLG.onEnd; DLG=null; $('dialog').style.display='none';
  setMode('play'); if(cb)cb();
}
$('dialog').addEventListener('pointerdown',e=>{e.stopPropagation();advance();});

function updateHUD(){
  $('stats').innerHTML=`👤 <b>${PLAYER||'-'}</b><br>⭐ คะแนน: <b>${S.score}</b> &nbsp; 🪙 เหรียญ: <b>${S.coins}</b> &nbsp; 🌟 ดาว: <b>${S.stars}</b><br>🎒 ไอเทมที่สำรวจ: <b>${Object.keys(S.explored).length}</b>`;
  const n=curStage();
  if(n===0){
    $('objective').innerHTML=`🏆 ภารกิจทั้งหมดสำเร็จแล้ว!<div class="bar"><div style="width:100%"></div></div>`;
    return;
  }
  const p=progress(n);
  const pct=p.done===p.total?100:Math.round(p.done/p.total*80);
  const txt=p.done<p.total
    ? `ภารกิจ ${STAGE_SHORT[n]}: ${STAGE_GOAL[n]} (${p.done}/${p.total})`
    : `ภารกิจ ${STAGE_SHORT[n]}: กลับไปคุยกับ ${NPC_NAME[n]} เพื่อทำกิจกรรมต่อ`;
  $('objective').innerHTML=`${txt}<div class="bar"><div style="width:${pct}%"></div></div>`;
}
function renderQuests(){
  let h='';
  for(let n=1;n<=3;n++){
    const locked=n>1&&!S.quiz[n-1];
    const pr=progress(n), done=!!S.quiz[n];
    let st;
    if(done) st=`✅ สำเร็จ (ได้ ${S.quiz[n].stars} ดาว, ตอบถูก ${S.quiz[n].correct}/5 ข้อ)`;
    else if(locked) st='🔒 ยังไม่ปลดล็อก (ต้องทำด่านก่อนหน้าให้สำเร็จก่อน)';
    else if(pr.done<pr.total) st=`⏳ กำลังทำ: ${pr.done}/${pr.total}`;
    else st=`📝 พร้อมทำกิจกรรม: คุยกับ ${NPC_NAME[n]}`;
    const pct=done?100:locked?0:Math.round((pr.done/pr.total)*80+(pr.done===pr.total?20:0));
    h+=`<div class="qitem"><b>${STAGE_NAMES[n]}</b><br>${STAGE_GOAL[n]}<br><small>${st}</small><div class="bar" style="background:#ddd"><div style="width:${pct}%;background:#3cba54"></div></div></div>`;
  }
  $('questList').innerHTML=h;
}

/* ============ โหมดหน้าจอ ============ */
let MODE='menu';
const OVS=['ovMenu','ovHow','ovOut','ovCred','ovPause','ovQuest','ovMap','ovQuiz','ovEnd','ovMatch','ovRegister'];
function showOv(id){OVS.forEach(o=>$(o).classList.toggle('show',o===id));}
function sizeBig(){const c=$('bigMap');c.width=Math.floor(Math.min(VW*0.86,900));c.height=Math.floor(Math.min(VH*0.6,600));}
function setMode(m){
  MODE=m;
  const map={menu:'ovMenu',pause:'ovPause',map:'ovMap',quests:'ovQuest',quiz:'ovQuiz',end:'ovEnd',match:'ovMatch'};
  showOv(map[m]||null);
  if(m==='map') sizeBig();
  if(m==='quests') renderQuests();
  const hudOn=!(m==='menu'||m==='end');
  $('hudL').style.display=hudOn?'block':'none';
  $('hudR').style.display=hudOn?'flex':'none';
  const tbOn=isTouch&&(m==='play'||m==='dialog');
  document.querySelectorAll('.tb').forEach(b=>b.style.display=tbOn?'flex':'none');
  if(m==='menu'||m==='end'){$('dialog').style.display='none';DLG=null;}
}
function toggleOv(name){if(MODE==='play')setMode(name);else if(MODE===name)setMode('play');}
function togglePause(){if(MODE==='play')setMode('pause');else if(MODE==='pause')setMode('play');}

/* ============ ผู้เล่น ============ */
const P={x:8.5,y:10.5,z:0,vz:0,yaw:0,walk:0,moving:false,grounded:true};
const K={}, VK={up:false,down:false,left:false,right:false,run:false};
let camYaw=0, camPitch=0.5, camDist=7, dragId=null, lastX=0, lastY=0;
let gateCool=0, saveT=0, curZone='';
function doJump(){if(MODE==='play'&&P.grounded){P.vz=8.2;P.grounded=false;sfx('jump');}}
function nearest(){
  let best=null,bd=1.6;
  for(const e of ENT){if(e.kind==='coin')continue;const d=Math.hypot(P.x-(e.x+0.5),P.y-(e.y+0.5));if(d<bd){bd=d;best=e;}}
  return best;
}
function doAct(){
  if(MODE==='dialog'){advance();return;}
  if(MODE!=='play')return;
  const e=nearest(); if(e) interact(e);
}
function promptText(e){
  if(e.kind==='npc')return 'E: คุยกับ '+e.name;
  if(e.kind==='item')return 'E: สำรวจ '+e.name;
  if(e.kind==='instr')return 'E: ทดลอง '+e.name;
  if(e.kind==='rock')return 'E: เก็บตัวอย่าง '+e.name;
  return 'E: อ่านป้าย';
}

/* ============ การโต้ตอบ ============ */
function interact(e){
  if(e.kind==='npc') return talk(e);
  if(e.kind==='sign') return say('ป้ายบอกทาง',[e.full]);
  if(e.kind==='item'||e.kind==='rock'){
    const first=!S.explored[e.id];
    const lines=[e.info];
    if(first){
      S.explored[e.id]=true; S.score+=10; S.coins+=2;
      sfx('ok'); saveGame(); updateHUD();
      lines.push('สำรวจสำเร็จ! +10 คะแนน และได้ 🪙 2 เหรียญ');
    } else lines.push('(สำรวจแล้ว)');
    return say(e.name,lines);
  }
  if(e.kind==='instr'){
    const first=!S.explored[e.id];
    playInstr(e);
    const lines=[`ทดลอง: ${e.act}${e.name} แล้วได้ยินเสียง`, e.info];
    if(first){
      S.explored[e.id]=true; S.score+=10; S.coins+=2;
      saveGame(); updateHUD();
      lines.push('ทดลองสำเร็จ! +10 คะแนน');
    } else lines.push('ลองใหม่อีกครั้ง: ตีหรือเคาะแรงขึ้น เสียงจะดังขึ้น');
    return say(e.name,lines);
  }
}
function talk(n){
  if(n.stage===0){
    return say(n.name,[
      'สวัสดี! ฉันชื่อนุ่น ผู้ช่วยนำทางของเกมนี้',
      'เดินไปหานักวิทยาศาสตร์แต่ละด่านเพื่อรับภารกิจ',
      'กด Q เพื่อดูรายการภารกิจและความคืบหน้า',
      'ด่าน 1 เปิดให้เล่นได้แล้ว ส่วนด่าน 2 และ 3 ต้องปลดล็อกก่อน'
    ]);
  }
  const k=n.stage;
  if(S.quiz[k]){
    return say(n.name,[
      `ขอบคุณที่ช่วยทำ${STAGE_SHORT[k]} สำเร็จ`,
      `คุณได้ ${S.quiz[k].stars} ดาว และตอบถูก ${S.quiz[k].correct}/5 ข้อ`,
      k<3?'ประตูด่านถัดไปเปิดแล้ว ลองไปสำรวจกันเถอะ!':'คุณคือนักวิทยาศาสตร์ตัวจริง!'
    ]);
  }
  const pr=progress(k);
  if(pr.done<pr.total) return say(n.name,[...STAGE_INTRO[k],`ความคืบหน้า: ${pr.done}/${pr.total}`]);
  if(k===1&&!S.matchDone) return say(n.name,['เก่งมาก! คุณสำรวจครบแล้ว','ก่อนทำแบบทดสอบ มาจับคู่วัสดุกับสมบัติกันก่อน'],()=>openMatch());
  say(n.name,['เก่งมาก! คุณสำรวจครบแล้ว','มาทำแบบทดสอบเพื่อรับดาวกันเถอะ'],()=>openQuiz(k));
}

/* ============ จับคู่วัสดุกับสมบัติ ============ */
function openMatch(){
  const opts=MATCH.map(m=>m.t).slice().reverse();
  let h='';
  MATCH.forEach(m=>{
    h+=`<div style="margin:8px 0"><b>${m.name}</b><select id="mt_${m.id}" style="width:100%;padding:8px;font-size:15px;margin-top:4px;font-family:inherit"><option value="">-- เลือกสมบัติ --</option>${opts.map(o=>`<option value="${o}">${o}</option>`).join('')}</select></div>`;
  });
  $('mRows').innerHTML=h;
  $('mFb').textContent='';
  setMode('match');
}
$('bMatchCheck').onclick=()=>{
  const wrong=MATCH.filter(m=>$('mt_'+m.id).value!==m.t);
  if(wrong.length===0){
    S.matchDone=true; S.score+=30; S.coins+=5;
    sfx('ok'); saveGame(); updateHUD();
    setMode('play');
    say('ดร.ปิ่น',['ยอดเยี่ยม! จับคู่ถูกทุกข้อ +30 คะแนน','ตอนนี้มาทำแบบทดสอบเพื่อเปิดประตูไปหุบเขาแห่งเสียงกันเถอะ'],()=>openQuiz(1));
  } else {
    sfx('no');
    $('mFb').textContent='ยังไม่ถูกต้องอีก '+wrong.length+' ข้อ ลองตรวจสอบสมบัติของ: '+wrong.map(m=>m.name).join(', ');
  }
};

/* ============ แบบทดสอบ ============ */
let QZ={s:0,i:0,correct:0,answered:false};
function openQuiz(s){QZ={s,i:0,correct:0,answered:false};setMode('quiz');renderQ();}
function renderQ(){
  const qs=QUIZ[QZ.s], q=qs[QZ.i];
  $('qTitle').textContent=`แบบทดสอบ ${STAGE_SHORT[QZ.s]} • ข้อ ${QZ.i+1}/${qs.length}`;
  $('qText').textContent=q.q;
  const box=$('qOpts'); box.innerHTML='';
  q.c.forEach((t,k)=>{
    const b=document.createElement('button');
    b.className='opt'; b.textContent=(k+1)+'. '+t;
    b.onclick=()=>quizAnswer(k);
    box.appendChild(b);
  });
  $('qFb').textContent='เลือกคำตอบ (กดปุ่ม 1-4 บนคีย์บอร์ดก็ได้)';
  $('bNext').style.display='none';
  QZ.answered=false;
}
function quizAnswer(k){
  if(MODE!=='quiz'||QZ.answered)return;
  QZ.answered=true;
  const q=QUIZ[QZ.s][QZ.i];
  [...$('qOpts').children].forEach((b,j)=>{
    if(j===q.a)b.classList.add('ok'); else if(j===k)b.classList.add('no');
    b.disabled=true;
  });
  if(k===q.a){QZ.correct++;sfx('ok');$('qFb').textContent='✅ ถูกต้อง! '+q.ex;}
  else{sfx('no');$('qFb').textContent='❌ ยังไม่ถูก เฉลยคือ "'+q.c[q.a]+'" ... '+q.ex;}
  $('bNext').textContent=QZ.i<QUIZ[QZ.s].length-1?'ข้อถัดไป ▶':'ดูผลคะแนน 🏁';
  $('bNext').style.display='block';
}
$('bNext').onclick=()=>{
  if(!QZ.answered)return;
  if(QZ.i<QUIZ[QZ.s].length-1){QZ.i++;renderQ();}
  else finishQuiz();
};
function finishQuiz(){
  const s=QZ.s, c=QZ.correct, stars=c>=5?3:c>=3?2:1;
  S.quiz[s]={correct:c,stars};
  S.score+=c*20+30; S.stars+=stars; S.coins+=5;
  applyGates(); saveGame(); sfx('unlock');
  setMode('play'); updateHUD();
  if(s===3){showEnd();return;}
  say(NPC_NAME[s],[
    `จบแบบทดสอบ ตอบถูก ${c}/5 ข้อ ได้รับ ${stars} ดาว 🌟`,
    `ประตูไปยัง${STAGE_SHORT[s+1]} เปิดแล้ว! ลองไปสำรวจกันเลย`
  ]);
}
function showEnd(){
  const expl=Object.keys(S.explored).length;
  const totalC=[1,2,3].reduce((a,n)=>a+(S.quiz[n]?S.quiz[n].correct:0),0);
  const rank=totalC>=13?'อัจฉริยะ':totalC>=9?'นักสำรวจ':'นักเรียนฝึกหัด';
  $('endStats').innerHTML=`<div>⭐ คะแนนรวม<b>${S.score}</b></div><div>🪙 เหรียญ<b>${S.coins}</b></div><div>🌟 ดาว<b>${S.stars}</b></div><div>🎒 ไอเทมที่สำรวจ<b>${expl}</b></div><div>✅ ตอบถูก<b>${totalC}/15</b></div><div>🏆 ระดับ<b>${rank}</b></div>`;
  recordBoard();
  setMode('end');
}

/* ============ เริ่ม / รีเซ็ต ============ */
function startGame(){
  ac();
  const fresh=!S.quiz[1]&&Object.keys(S.explored).length===0;
  setMode('play'); updateHUD();
  if(fresh) say('นุ่น ผู้ช่วยนำทาง',[
    'สวัสดี! ยินดีต้อนรับสู่ SCIENCE WORLD ROBLOX 3D',
    'เป้าหมายของเราคือเรียนรู้วิทยาศาสตร์ผ่านการผจญภัย',
    'ไปคุยกับ ดร.ปิ่น ทางทิศใต้เพื่อเริ่มด่านแรก!',
    'ควบคุม: W A S D เดิน | ลากเมาส์เพื่อหมุนกล้อง | Shift วิ่ง | Space กระโดด | E สำรวจ/คุย | M แผนที่ | Q ภารกิจ | P หยุด'
  ]);
  else toast('กลับมาแล้ว! กด Q เพื่อดูภารกิจที่ต้องทำต่อ');
}
function resetGame(){
  const snd=S.sound;
  S=newSave(); S.sound=snd; S.name=PLAYER;
  P.x=8.5;P.y=10.5;P.z=0;P.vz=0;
  applyGates(); saveGame(); updateSoundBtn();
  startGame();
}

/* ============ การรับอินพุต ============ */
addEventListener('keydown',e=>{
  if(e.target&&e.target.tagName==='INPUT')return;
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
  K[e.code]=true;
  if(MODE==='quiz'&&!e.repeat){
    const n=['Digit1','Digit2','Digit3','Digit4'].indexOf(e.code);
    if(n>=0)quizAnswer(n);
    return;
  }
  if(e.repeat)return;
  if(e.code==='Space')doJump();
  else if(e.code==='KeyE'||e.code==='Enter')doAct();
  else if(e.code==='KeyM')toggleOv('map');
  else if(e.code==='KeyQ')toggleOv('quests');
  else if(e.code==='KeyP'||e.code==='Escape')togglePause();
});
addEventListener('keyup',e=>{K[e.code]=false;});
addEventListener('blur',()=>{for(const k in K)K[k]=false;if(MODE==='play')setMode('pause');});
document.querySelectorAll('.tb').forEach(b=>{
  const k=b.dataset.k;
  b.addEventListener('pointerdown',e=>{
    e.preventDefault();e.stopPropagation();
    if(k==='jump')doJump();
    else if(k==='act')doAct();
    else VK[k]=true;
  });
  const rel=()=>{VK[k]=false;};
  b.addEventListener('pointerup',rel);
  b.addEventListener('pointercancel',rel);
  b.addEventListener('pointerleave',rel);
});
// ลากบนจอเพื่อหมุนกล้อง
cv.addEventListener('pointerdown',e=>{dragId=e.pointerId;lastX=e.clientX;lastY=e.clientY;});
cv.addEventListener('pointermove',e=>{
  if(dragId!==e.pointerId)return;
  camYaw-=(e.clientX-lastX)*0.008;
  camPitch=Math.min(1.15,Math.max(0.2,camPitch+(e.clientY-lastY)*0.005));
  lastX=e.clientX;lastY=e.clientY;
});
const endDrag=()=>{dragId=null;};
cv.addEventListener('pointerup',endDrag);
cv.addEventListener('pointercancel',endDrag);

/* ปุ่มในเมนูและ HUD */
$('bStart').onclick=()=>{if(PLAYER)startGame();else showRegister();};
$('bSwitch').onclick=showRegister;
document.querySelectorAll('[data-ov]').forEach(b=>b.onclick=()=>showOv(b.dataset.ov));
document.querySelectorAll('[data-back]').forEach(b=>b.onclick=()=>showOv('ovMenu'));
$('bRegister').onclick=()=>registerPlayer($('rName').value);
$('rName').addEventListener('keydown',e=>{if(e.key==='Enter')registerPlayer($('rName').value);});
$('bPause').onclick=togglePause;
$('bQuest').onclick=()=>toggleOv('quests');
$('bCloseQ').onclick=()=>toggleOv('quests');
$('bMap').onclick=()=>toggleOv('map');
$('bCloseMap').onclick=()=>toggleOv('map');
$('bSound').onclick=toggleSound;
$('bSoundP').onclick=toggleSound;
$('bResume').onclick=togglePause;
$('bMenu').onclick=()=>{saveGame();setMode('menu');};
$('bReset').onclick=()=>{if(confirm('เริ่มเกมใหม่? ความคืบหน้าทั้งหมดจะถูกลบ'))resetGame();};
$('bEndMenu').onclick=()=>setMode('menu');
$('bEndAgain').onclick=()=>{if(confirm('เล่นใหม่ตั้งแต่ต้น? ความคืบหน้าเดิมจะถูกลบ'))resetGame();};

/* ============ อัปเดตเกม (เดินตามทิศของกล้อง) ============ */
function update(dt){
  let ix=0,iy=0;
  if(K.KeyD||K.ArrowRight||VK.right)ix+=1;
  if(K.KeyA||K.ArrowLeft||VK.left)ix-=1;
  if(K.KeyW||K.ArrowUp||VK.up)iy+=1;
  if(K.KeyS||K.ArrowDown||VK.down)iy-=1;
  const L=Math.hypot(ix,iy);
  const run=!!(K.ShiftLeft||K.ShiftRight||VK.run);
  const sp=run?5.8:3.2;
  P.moving=L>0;
  if(L>0){
    ix/=L; iy/=L;
    const fx=-Math.sin(camYaw), fz=-Math.cos(camYaw), rx=Math.cos(camYaw), rz=-Math.sin(camYaw);
    const dX=rx*ix+fx*iy, dZ=rz*ix+fz*iy;
    P.yaw=Math.atan2(dX,dZ);
    const nx=P.x+dX*sp*dt; if(!blocked(nx,P.y,P.z))P.x=nx;
    const nz=P.y+dZ*sp*dt; if(!blocked(P.x,nz,P.z))P.y=nz;
    P.walk+=dt*sp*2.4;
  }
  P.vz-=24*dt; P.z+=P.vz*dt;
  const g=groundH(P.x,P.y);
  if(P.z<=g){P.z=g;if(P.vz<0)P.vz=0;}
  P.grounded=(P.z<=g+0.001&&P.vz===0);

  const tx=Math.floor(P.x),ty=Math.floor(P.y);
  const zn=zoneAt(tx,ty);
  if(zn!==curZone){curZone=zn;$('zoneName').textContent='📍 '+zn;if(zn!=='ทางเชื่อม')toast('เข้าสู่: '+zn);}
  gateCool=Math.max(0,gateCool-dt);
  if(gateCool===0){
    let hit=false;
    for(let oy=-1;oy<=1&&!hit;oy++)for(let ox=-1;ox<=1&&!hit;ox++){
      const row=grid[ty+oy];
      if(row&&row[tx+ox]==='gate'){
        const n=(tx+ox)<=27?1:2;
        toast(`🔒 ประตูล็อก: ต้องทำ${STAGE_SHORT[n]} ให้สำเร็จก่อน`);
        gateCool=6; hit=true;
      }
    }
  }
  for(const e of ENT){
    if(e.kind!=='coin'||S.coinGot[e.id])continue;
    if(Math.hypot(P.x-e.x-0.5,P.y-e.y-0.5)<0.8){S.coinGot[e.id]=1;S.coins++;S.score+=5;sfx('coin');updateHUD();}
  }
  saveT+=dt;
  if(saveT>4){saveT=0;S.pos={x:P.x,y:P.y};saveGame();}
}

/* ============ วาดภาพ 3 มิติ ============ */
function buildDynamic(t){
  const A=[];
  const gp=groundH(P.x,P.y);
  // เงาใต้ตัวละคร
  const sr=0.42*(1-Math.min(0.5,(P.z-gp)/3));
  quad([P.x-sr,gp+0.02,P.y-sr],[P.x-sr,gp+0.02,P.y+sr],[P.x+sr,gp+0.02,P.y+sr],[P.x+sr,gp+0.02,P.y-sr],[0,1,0],[0,0,0],0.3,A);
  // ผู้เล่น
  character(P.x,P.z,P.y,P.yaw,{shirt:'#ff4b4b',pants:'#2f4fb8',skin:'#ffd7a3',hair:'#3b2a1a'},P.walk,P.moving,A);
  for(const e of ENT){
    const cx=e.x+0.5, cz=e.y+0.5;
    if(e.kind==='npc'){
      const yaw=Math.atan2(P.x-cx,P.y-cz);
      character(cx,0,cz,yaw,{shirt:e.shirt,pants:'#3b3f66',skin:'#ffd7a3',hair:'#3b2a1a'},0,false,A);
      continue;
    }
    if(e.kind==='coin'){
      if(S.coinGot[e.id])continue;
      box(-0.16,0.35+Math.sin(t*3+e.x)*0.08,-0.03,0.16,0.5+Math.sin(t*3+e.x)*0.08,0.03,'#ffd23f','#b07d00',t*3+e.x,cx,0,cz,A);
      continue;
    }
    const done=!!S.explored[e.id];
    if(e.kind==='item'){
      const b=Math.sin(t*2.6+e.i)*0.06;
      const c=done?'#9fb3c8':e.c;
      box(cx-0.2,0.15+b,cz-0.2,cx+0.2,0.55+b,cz+0.2,c,shadeHex(c,0.7),0,0,0,0,A);
    } else if(e.kind==='instr'){
      box(cx-0.3,0,cz-0.3,cx+0.3,0.45,cz+0.3,'#f4ead2','#b9976a',0,0,0,0,A);
      box(cx-0.22,0.45,cz-0.22,cx+0.22,1.0,cz+0.22,e.c,shadeHex(e.c,0.7),0,0,0,0,A);
    } else if(e.kind==='rock'){
      box(cx-0.3,0,cz-0.22,cx+0.3,0.5,cz+0.22,e.c,shadeHex(e.c,0.72),0,0,0,0,A);
    } else if(e.kind==='sign'){
      box(e.x+0.44,0,e.y+0.44,e.x+0.56,1.6,e.y+0.56,'#c8925a','#7a4f25',0,0,0,0,A);
      box(e.x+0.5-0.7,1.1,e.y+0.47,e.x+0.5+0.7,1.6,e.y+0.53,'#fff7e0','#f1e3c0',0,0,0,0,A);
    }
  }
  return A;
}
// ตัวละครทรงบล็อก (หัว ลำตัว แขน ขา)
function character(px,py,pz,yaw,c,walk,moving,out){
  const sw=moving?Math.sin(walk)*0.18:0;
  const bob=moving?Math.abs(Math.sin(walk))*0.05:0;
  const sk=c.skin, hr=c.hair;
  box(-0.22,0,-0.1+sw,-0.02,0.6,0.1+sw,c.pants,shadeHex(c.pants,0.8),yaw,px,py,pz,out);
  box(0.02,0,-0.1-sw,0.22,0.6,0.1-sw,c.pants,shadeHex(c.pants,0.8),yaw,px,py,pz,out);
  box(-0.3,0.6+bob,-0.15,0.3,1.3+bob,0.15,c.shirt,shadeHex(c.shirt,0.8),yaw,px,py,pz,out);
  box(-0.45,0.65+bob,-0.1-sw*0.8,-0.3,1.25+bob,0.1-sw*0.8,c.shirt,shadeHex(c.shirt,0.8),yaw,px,py,pz,out);
  box(0.3,0.65+bob,-0.1+sw*0.8,0.45,1.25+bob,0.1+sw*0.8,c.shirt,shadeHex(c.shirt,0.8),yaw,px,py,pz,out);
  box(-0.25,1.3+bob,-0.22,0.25,1.8+bob,0.22,sk,shadeHex(sk,0.85),yaw,px,py,pz,out);
  box(-0.27,1.7+bob,-0.24,0.27,1.86+bob,0.24,hr,hr,yaw,px,py,pz,out);
  box(-0.14,1.45+bob,0.22,-0.06,1.56+bob,0.245,'#1b1b1b','#1b1b1b',yaw,px,py,pz,out);
  box(0.06,1.45+bob,0.22,0.14,1.56+bob,0.245,'#1b1b1b','#1b1b1b',yaw,px,py,pz,out);
}

/* มุมมองกล้องบุคคลที่สาม */
function updateCamera(){
  const tx=P.x, ty=P.z+1.2, tz=P.y;
  const hd=camDist*Math.cos(camPitch), vd=camDist*Math.sin(camPitch);
  const eye=[tx+Math.sin(camYaw)*hd, ty+vd, tz+Math.cos(camYaw)*hd];
  const view=lookAt(eye,[tx,ty,tz],[0,1,0]);
  const proj=persp(Math.PI/3.2,VW/VH,0.1,200);
  VP=mul(proj,view);
  return eye;
}
function drawBuf(buf,count){
  gl.bindBuffer(gl.ARRAY_BUFFER,buf);
  gl.vertexAttribPointer(aPos,3,gl.FLOAT,false,40,0);
  gl.vertexAttribPointer(aNor,3,gl.FLOAT,false,40,12);
  gl.vertexAttribPointer(aCol,4,gl.FLOAT,false,40,24);
  gl.drawArrays(gl.TRIANGLES,0,count);
}

/* ป้ายชื่อและเครื่องหมายบนจอ (วาดทับ 3 มิติ) */
function lpill(s,x,y,fg,bg){
  lctx.font='bold 13px Tahoma,"Noto Sans Thai",sans-serif';
  const w=lctx.measureText(s).width+12;
  lctx.fillStyle=bg; lctx.fillRect(x-w/2,y-10,w,19);
  lctx.fillStyle=fg; lctx.textAlign='center'; lctx.textBaseline='middle';
  lctx.fillText(s,x,y);
  lctx.textAlign='left'; lctx.textBaseline='alphabetic';
}
function drawLabels(){
  lctx.clearRect(0,0,VW,VH);
  for(const e of ENT){
    if(e.kind==='coin')continue;
    const cx=e.x+0.5, cz=e.y+0.5;
    const d=Math.hypot(P.x-cx,P.y-cz);
    if(e.kind==='npc'){
      if(d>16)continue;
      const top=project(cx,2.1,cz); if(!top)continue;
      if(e.stage>0){
        if(!S.quiz[e.stage]&&(e.stage===1||S.quiz[e.stage-1])){ const p=project(cx,2.5,cz); if(p)lpill('!',p[0],p[1],'#222','#ffd23f'); }
        else if(S.quiz[e.stage]){ const p=project(cx,2.5,cz); if(p)lpill('✓',p[0],p[1],'#222','#7CFC7C'); }
      }
      lpill(e.name,top[0],top[1],'#fff','rgba(0,0,0,.55)');
      continue;
    }
    if(e.kind==='sign'){
      const p=project(cx,1.35,e.y+0.5); if(p){lctx.font='bold 12px Tahoma,"Noto Sans Thai",sans-serif';lctx.fillStyle='#4a2d10';lctx.textAlign='center';lctx.fillText(e.t,p[0],p[1]+4);lctx.textAlign='left';}
      continue;
    }
    const top=project(cx,e.kind==='instr'?1.25:0.9,cz); if(!top)continue;
    if(S.explored[e.id]) lpill('✓',top[0],top[1]-12,'#222','#7CFC7C');
    else if(e.stage===curStage()){
      const b=Math.sin(performance.now()/250)*3;
      lctx.fillStyle='#ffd23f'; lctx.beginPath();
      lctx.moveTo(top[0],top[1]-22+b-7); lctx.lineTo(top[0]+6,top[1]-22+b); lctx.lineTo(top[0],top[1]-22+b+7); lctx.lineTo(top[0]-6,top[1]-22+b);
      lctx.closePath(); lctx.fill();
    }
    if(d<3.2)lpill(e.name,top[0],top[1]-34,'#fff','rgba(0,0,0,.55)');
  }
  // ประตูที่ล็อก
  if(grid[8]&&grid[8][26]==='gate'){const p=project(26.5,2.9,8.5);if(p)lpill('🔒',p[0],p[1],'#fff','rgba(0,0,0,.4)');}
  if(grid[22]&&grid[22][40]==='gate'){const p=project(40.5,2.9,22.5);if(p)lpill('🔒',p[0],p[1],'#fff','rgba(0,0,0,.4)');}
}

function render(t){
  updateCamera();
  gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.useProgram(prog);
  gl.uniformMatrix4fv(uVP,false,VP);
  const eye=[0,0,0];
  // จุดกล้องเพื่อคำนวณระยะหมอก
  const hd=camDist*Math.cos(camPitch), vd=camDist*Math.sin(camPitch);
  eye[0]=P.x+Math.sin(camYaw)*hd; eye[1]=P.z+1.2+vd; eye[2]=P.y+Math.cos(camYaw)*hd;
  gl.uniform3f(uEye,eye[0],eye[1],eye[2]);
  gl.bindBuffer(gl.ARRAY_BUFFER,sBuf);
  drawBuf(sBuf,staticCount);
  const A=buildDynamic(t);
  if(A.length){
    gl.bindBuffer(gl.ARRAY_BUFFER,dBuf);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(A),gl.DYNAMIC_DRAW);
    drawBuf(dBuf,A.length/10);
  }
  drawLabels();

  const nb=(MODE==='play')?nearest():null;
  const pe=$('prompt');
  const pp=nb?project(nb.x+0.5,2.2,nb.y+0.5):null;
  if(nb&&pp){
    pe.style.display='block'; pe.style.left=pp[0]+'px'; pe.style.top=pp[1]+'px';
    pe.textContent=promptText(nb);
  } else pe.style.display='none';

  paintMap(miniX,160,120,false);
  if(MODE==='map')paintMap(bigX,bigC.width,bigC.height,true);
}
function paintMap(c,w,h,big){
  c.imageSmoothingEnabled=false;
  const sc=Math.min(w/W,h/H), ox=(w-W*sc)/2, oy=(h-H*sc)/2;
  c.fillStyle='#1d3557'; c.fillRect(0,0,w,h);
  c.drawImage(mapImg,ox,oy,W*sc,H*sc);
  const dot=(x,y,col,r)=>{c.fillStyle=col;c.beginPath();c.arc(ox+x*sc,oy+y*sc,r,0,Math.PI*2);c.fill();};
  ENT.forEach(e=>{
    if(e.kind==='npc')dot(e.x+.5,e.y+.5,'#ff3d7f',big?5:2.5);
    else if(e.kind==='item'||e.kind==='instr'||e.kind==='rock')dot(e.x+.5,e.y+.5,S.explored[e.id]?'#9fb3c8':'#ffe066',big?4:2);
  });
  if(big){
    c.font='bold 14px Tahoma,"Noto Sans Thai",sans-serif';c.textAlign='center';c.textBaseline='middle';
    ZONES.forEach(z=>{
      const x=ox+(z.x1+z.x2)/2*sc, y=oy+(z.y1+z.y2)/2*sc;
      c.lineWidth=3;c.strokeStyle='#000';c.strokeText(z.n,x,y);c.fillStyle='#fff';c.fillText(z.n,x,y);
    });
    c.textAlign='left';c.textBaseline='alphabetic';
  }
  c.fillStyle='#fff'; c.beginPath(); c.arc(ox+P.x*sc,oy+P.y*sc,big?8:4,0,Math.PI*2); c.fill();
  c.fillStyle='#ff2e2e'; c.beginPath(); c.arc(ox+P.x*sc,oy+P.y*sc,big?6:3,0,Math.PI*2); c.fill();
}
const miniX=$('mini').getContext('2d');
const bigC=$('bigMap'), bigX=bigC.getContext('2d');

/* ============ วนลูปเกม ============ */
let last=performance.now();
function loop(now){
  const dt=Math.min(0.05,(now-last)/1000); last=now;
  if(MODE==='play')update(dt);
  render(now/1000);
  requestAnimationFrame(loop);
}

/* ============ เริ่มต้นโปรแกรม ============ */
S=newSave();
buildWorld();
buildEntities();
applyGates();
updateSoundBtn();
setMode('menu');
updateHUD();
updateWho();
requestAnimationFrame(loop);
