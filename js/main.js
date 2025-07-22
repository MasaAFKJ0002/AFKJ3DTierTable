/* ==== 定数 ==== */
const INITIAL_GEOM_SCALE = 1.25; let GEOM_SCALE = INITIAL_GEOM_SCALE;
const IMG_W = 180, IMG_H = 200, REF_IMG_H = 256;
const SPRITE_SCALE = 0.30 * (IMG_H / REF_IMG_H);
const SPACING_FACTOR = 1.15, COLLISION_SAFETY = 1.02;
const FACTION_LABEL = {
  1: 'ブライト', 2: 'ババリア', 3: 'ヴェルディア',
  4: 'グレイヴボーン', 5: 'セレスチアル', 6: 'カタストロフ', 7: 'ボイド'
};
const COLLAPSED_HEIGHT = 110, EXPANDED_HEIGHT = 240, VIEW_OFFSET_Y = -0.9;
const SCALE_FACTOR = 8, H = 1.2;
const MIN = 1, MAX = 5, SAFETY = 1.05;
const MIN_WEIGHT_BASE = SAFETY * SPRITE_SCALE / Math.sqrt(3);
const MIN_DYN_SCALE = 0.6, MAX_DYN_SCALE = 2.2;
const SAFETY_MARGIN = 1.05;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const SUM_MIN_REAL = 3, SUM_MAX_REAL = 15;
const RAD_MARGIN_COEFF = 1.15;
const SUM15_EPS_T = 0.995;
const CLUSTER_PULL_FACTOR = 0.12;
const OUT_OF_BOUNDS_PULL = 0.8;               // 拡散抑制: 内側へ戻す力を強める
const TOP_SPRITE_ALIGN = 'bottom';

/* 新規追加定数 */
const MIN_RING_RADIUS_FACTOR = 0.85;           // 同スコア重複リングの最小半径係数
const MAX_COLLISION_EXPAND = 0.9;              // 衝突回避拡大の上限

/* ==== 状態 ==== */
let FACE_PLANES = null;
let sortState = { key: null, dir: 1 }, FULL_DATA = [];

/* ==== DOM ==== */
const threeContainer   = document.getElementById('threeContainer');
const bottomPanel      = document.getElementById('bottomPanel'); bottomPanel.style.height = COLLAPSED_HEIGHT + 'px';
const toggleListBtn    = document.getElementById('toggleListBtn');
const loadStatus       = document.getElementById('loadStatus');
const displayCountEl   = document.getElementById('displayCount');
const dynScaleVal      = document.getElementById('dynScaleVal');
const collisionScaleVal= document.getElementById('collisionScaleVal');
const baseScaleVal     = document.getElementById('baseScaleVal');
const effectiveScaleVal= document.getElementById('effectiveScaleVal');
const countBadge       = document.getElementById('countBadge');
const fAfkMin          = document.getElementById('fAfkMin'), fAfkMax = document.getElementById('fAfkMax');
const fPvpMin          = document.getElementById('fPvpMin'), fPvpMax = document.getElementById('fPvpMax');
const fDrMin           = document.getElementById('fDrMin'), fDrMax = document.getElementById('fDrMax');
const btnFilterReset   = document.getElementById('btnFilterReset');
const btnRebuild       = document.getElementById('btnRebuild');
const dataTableBody    = document.querySelector('#dataTable tbody');
const factionRadios    = document.querySelectorAll('input[name="factionFilter"]');
const fName            = document.getElementById('fName');
const tooltip          = document.getElementById('tooltip');
const allRadio         = document.querySelector('input[name="factionFilter"][value="all"]');

/* ==== Three.js 変数 ==== */
let scene, renderer, camera, controls, pivot;
let modelGroup, chartGroup, axisGroup, productGroup;
let A, B, C, D, G, BASE_CENTER, XY_CENTER;

/* ==== 初期化 ==== */
function initThree() {
  // シーン・レンダラー
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111111);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(threeContainer.clientWidth, threeContainer.clientHeight);
  threeContainer.appendChild(renderer.domElement);

  // カメラ・コントロール
  camera = new THREE.PerspectiveCamera(
    52,
    threeContainer.clientWidth / threeContainer.clientHeight,
    0.05,
    500
  );
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  // グループ構成
  pivot        = new THREE.Group();              scene.add(pivot);
  modelGroup   = new THREE.Group();              pivot.add(modelGroup);
  chartGroup   = new THREE.Group();              modelGroup.add(chartGroup);   // レーダーチャート用
  axisGroup    = new THREE.Group();              modelGroup.add(axisGroup);    // 軸線＋ラベル用
  productGroup = new THREE.Group();              modelGroup.add(productGroup);

  pivot.position.y = VIEW_OFFSET_Y;

  // 底面の頂点
  A = new THREE.Vector3(-0.5, -Math.sqrt(3)/6, 0);
  B = new THREE.Vector3( 0.5, -Math.sqrt(3)/6, 0);
  C = new THREE.Vector3(   0,  Math.sqrt(3)/3, 0);
  D = new THREE.Vector3(   0,               0, H);
  G = new THREE.Vector3().add(A).add(B).add(C).add(D).multiplyScalar(0.25);
  BASE_CENTER = new THREE.Vector3(0,0,0);
  XY_CENTER   = BASE_CENTER.clone();

  buildTetraWire();
  buildLabels();

  // 軸線＋ラベル描画
  addRadarAxes(axisGroup);

  // カメラ設置
  camera.position.copy(
    new THREE.Vector3(2.2,1.9,2.6).normalize().multiplyScalar(3.5 * SCALE_FACTOR)
  );
  controls.target.set(0, VIEW_OFFSET_Y, 0);
  controls.update();

  animate();
}

/* ==== 四面体ワイヤー + 底面 ==== */
function buildTetraWire() {
  // 底面
  const gBase = new THREE.BufferGeometry().setFromPoints([A,B,C]);
  gBase.setIndex([0,1,2]);
  modelGroup.add(new THREE.Mesh(
    gBase,
    new THREE.MeshBasicMaterial({ color:0xff00ff, side:THREE.DoubleSide, transparent:true, opacity:0.25 })
  ));
  // エッジ
  const gEdges = new THREE.BufferGeometry().setFromPoints([
    A,B,B,C,C,A,
    A,D,B,D,C,D
  ]);
  modelGroup.add(new THREE.LineSegments(
    gEdges,
    new THREE.LineBasicMaterial({ color:0xff44ff })
  ));
  // 内部グリッド
  const matGrid = new THREE.LineBasicMaterial({ color:0xff00ff, transparent:true, opacity:0.20 });
  for(let i=1;i<=4;i++){
    const t = i/5;
    const pA=A.clone().lerp(D,t), pB=B.clone().lerp(D,t), pC=C.clone().lerp(D,t);
    const g = new THREE.BufferGeometry().setFromPoints([pA,pB,pC,pA]);
    modelGroup.add(new THREE.Line(g, matGrid));
  }
}

/* ==== スプライト文字列 ==== */
function makeTextSprite(txt) {
  const cvs = document.createElement('canvas'),
        ctx = cvs.getContext('2d'),
        fs  = 64;
  ctx.font = 'bold ' + fs + 'px sans-serif';
  const w = ctx.measureText(txt).width;
  cvs.width  = w + 32; cvs.height = fs + 32;
  ctx.font        = 'bold ' + fs + 'px sans-serif';
  ctx.fillStyle   = '#fff';
  ctx.textBaseline= 'top';
  ctx.fillText(txt,16,0);
  const tex = new THREE.CanvasTexture(cvs);
  const sp  = new THREE.Sprite(new THREE.SpriteMaterial({ map:tex, transparent:true }));
  sp.scale.set(0.35 * cvs.width/cvs.height, 0.35,1);
  return sp;
}

/* ==== 頂点ラベル ==== */
function buildLabels() {
  modelGroup.add(
    (() => { const s=makeTextSprite('AFKステージ'); s.position.copy(A).add(new THREE.Vector3(-0.12,-0.04,0)); return s; })(),
    (() => { const s=makeTextSprite('PVP');       s.position.copy(C).add(new THREE.Vector3( 0,  0.06,0)); return s; })(),
    (() => { const s=makeTextSprite('幻影の域');   s.position.copy(B).add(new THREE.Vector3( 0.12,0,0)); return s; })(),
    (() => { const s=makeTextSprite('総合');       s.position.copy(D).add(new THREE.Vector3( 0,  0.12,0.02)); return s; })()
  );
}

/**
 * 軸線＋対称ティック＋スコアラベルを描画
 * - 軸線: 原点→各頂点
 * - ティック: 軸上の対応点を中心に、XY平面内で軸線に垂直な線を両側に伸ばす
 * - 「1」は1.5扱いの位置
 * - ラベルはティックの片端、下中央アンカー、40% スケール、Zオフセット0.3
 */
function addRadarAxes(axisGroup) {
  // 既存をクリア
  while (axisGroup.children.length) {
    axisGroup.remove(axisGroup.children[0]);
  }

  const axisMat    = new THREE.LineBasicMaterial({ color: 0x66ccff });
  const tickMat    = new THREE.LineBasicMaterial({ color: 0xffffff });
  const tickLength = 0.025;  // ティックの半長さ
  const zOffset    = 0.05;   // ラベルZオフセット

  [ { dir: A }, { dir: B }, { dir: C } ].forEach(({ dir }) => {
    // 軸線: 原点 → 頂点
    const origin  = new THREE.Vector3(0, 0, 0);
    const axisGeo = new THREE.BufferGeometry().setFromPoints([origin, dir]);
    axisGeo.setIndex([0, 1]);
    axisGroup.add(new THREE.Line(axisGeo, axisMat));

    // 各スコア値ごとにティック＆ラベル
    for (let score = MIN; score <= MAX; score++) {
      // MIN=1 は擬似的に1.5扱い
      const val = (score === MIN) ? MIN + 0.5 : score;
      const r   = (val - MIN) / (MAX - MIN);

      // 軸上の対応点
      const axisPos = dir.clone().multiplyScalar(r);

      // 軸線に対してXY平面内で垂直な方向ベクトル
      const perp = new THREE.Vector3(-dir.y, dir.x, 0).normalize();

      // 対称ティックの両端
      const tickStart = axisPos.clone().add(perp.clone().multiplyScalar(-tickLength));
      const tickEnd   = axisPos.clone().add(perp.clone().multiplyScalar( tickLength));

      // ティック描画
      const tickGeo = new THREE.BufferGeometry().setFromPoints([tickStart, tickEnd]);
      tickGeo.setIndex([0, 1]);
      axisGroup.add(new THREE.Line(tickGeo, tickMat));

      // ラベル生成＆配置（ティック端を基準にZオフセット）
      const labelPos = tickEnd.clone();
      labelPos.z += zOffset;
      const sprite = makeTextSprite(String(score));
      sprite.center.set(0.5, 0);          // 下中央アンカー
      sprite.scale.multiplyScalar(0.4);   // 40% スケール
      sprite.position.copy(labelPos);
      axisGroup.add(sprite);
    }
  });
}




/**
 * レーダーチャート描画
 * MIN=1 が2つ以上なら1.5扱い
 */
function addRadarTriangles(list) {
  while(chartGroup.children.length){
    chartGroup.remove(chartGroup.children[0]);
  }
  list.forEach(p=>{
    let a=p.afkstage, b=p.DreamRealm, c=p.PVP;
    const cnt=[a,b,c].filter(v=>v===MIN).length;
    if(cnt>=1){
      if(a===MIN)a=MIN+0.5;
      if(b===MIN)b=MIN+0.5;
      if(c===MIN)c=MIN+0.5;
    }
    const rA=(a-MIN)/(MAX-MIN),
          rB=(b-MIN)/(MAX-MIN),
          rC=(c-MIN)/(MAX-MIN);
    const vA=A.clone().multiplyScalar(rA),
          vB=B.clone().multiplyScalar(rB),
          vC=C.clone().multiplyScalar(rC);
    const geom=new THREE.BufferGeometry().setFromPoints([vA,vB,vC]);
    geom.setIndex([0,1,2]);
    const mat=new THREE.MeshBasicMaterial({
      color:       0x66ccff,
      side:        THREE.DoubleSide,
      transparent: true,
      opacity:     0.5
    });
    chartGroup.add(new THREE.Mesh(geom,mat));
  });
}

/* ==== 面平面 ==== */
function computeInwardFacePlanes() {
  if(FACE_PLANES) return FACE_PLANES;
  const faces=[[B,C,D],[A,D,C],[A,B,D],[A,C,B]];
  FACE_PLANES=faces.map(f=>{
    const [p0,p1,p2]=f;
    const v1=new THREE.Vector3().subVectors(p1,p0);
    const v2=new THREE.Vector3().subVectors(p2,p0);
    let n=new THREE.Vector3().crossVectors(v1,v2).normalize();
    if(n.dot(new THREE.Vector3().subVectors(G,p0))<0) n.multiplyScalar(-1);
    const d=-n.dot(p0);
    return {n,d};
  });
  return FACE_PLANES;
}

function clampSpritesInsideTetra(sprites){
  if(!sprites.length) return;
  const planes=computeInwardFacePlanes();
  const targetDist=SPRITE_SCALE*SAFETY_MARGIN;
  for(let iter=0;iter<3;iter++){
    let moved=false;
    sprites.forEach(s=>{
      if(s.userData.isTopSum15) return;
      const wp=new THREE.Vector3(s.position.x,s.position.y,s.position.z);
      planes.forEach(({n,d})=>{
        const dist=n.dot(wp)+d;
        if(dist<targetDist){
          wp.addScaledVector(n,targetDist-dist);
          moved=true;
        }
      });
      if(moved){
        s.position.x=wp.x; s.position.y=wp.y;
      }
    });
    if(!moved) break;
  }
}

/* ==== 位置計算 ==== */
function norm(v){return (v-MIN)/(MAX-MIN);}
function basePoint(p){
  let wa=norm(p.afkstage), wb=norm(p.PVP), wc=norm(p.DreamRealm);
  let s=wa+wb+wc;
  if(s===0) return new THREE.Vector3(0,0,0);
  wa/=s; wb/=s; wc/=s;
  const floor=MIN_WEIGHT_BASE;
  if(wa<floor||wb<floor||wc<floor){
    wa=Math.max(wa,floor);
    wb=Math.max(wb,floor);
    wc=Math.max(wc,floor);
    const s2=wa+wb+wc; wa/=s2; wb/=s2; wc/=s2;
  }
  return new THREE.Vector3()
    .addScaledVector(A,wa)
    .addScaledVector(B,wb)
    .addScaledVector(C,wc);
}
function getSumZ(sum){
  let t=(sum-SUM_MIN_REAL)/(SUM_MAX_REAL-SUM_MIN_REAL);
  t=Math.max(0,Math.min(1,t));
  return t*H;
}

/* ==== スケール & 衝突回避 ==== */
function computeDynamicScale(arr){
  if(!arr.length) return 1;
  let rMax=0;
  arr.forEach(p=>{
    const bp=basePoint(p);
    const r=Math.hypot(bp.x-XY_CENTER.x,bp.y-XY_CENTER.y);
    if(r>rMax) rMax=r;
  });
  if(rMax<=0) return 1;
  const Rb=1/Math.sqrt(3), dyn=Rb/rMax;
  return Math.min(Math.max(dyn,MIN_DYN_SCALE),MAX_DYN_SCALE);
}
function computeCollisionExpand(arr,baseScale){
  if(arr.length<=1) return 1;
  const pts=arr.map(p=>basePoint(p));
  let minDist=Infinity;
  for(let i=0;i<pts.length;i++){
    for(let j=i+1;j<pts.length;j++){
      const d=Math.hypot(pts[i].x-pts[j].x,pts[i].y-pts[j].y);
      if(d<minDist) minDist=d;
    }
  }
  const EPS=1e-4; if(!isFinite(minDist)||minDist<=EPS) return 1;
  const spriteDiam=SPRITE_SCALE*GEOM_SCALE*baseScale*2;
  const req=spriteDiam*SPACING_FACTOR;
  if(req<=minDist) return 1;
  let exp=req/minDist*COLLISION_SAFETY;
  exp=Math.min(exp,MAX_COLLISION_EXPAND);
  return Math.max(exp,1);
}

/* ==== 合計値別配置 ==== */
function applyRadialLayoutBySum(sprites,finalScale){
  if(!sprites.length) return;
  const groups=new Map();
  sprites.forEach(s=>{
    const sum=s.userData.product.sum;
    if(!groups.has(sum)) groups.set(sum,[]);
    groups.get(sum).push(s);
  });
  const r_base=1/(2*Math.sqrt(3)), spriteR=SPRITE_SCALE*finalScale;
  groups.forEach((list,sum)=>{
    let t=(sum-SUM_MIN_REAL)/(SUM_MAX_REAL-SUM_MIN_REAL);
    t=Math.max(0,Math.min(1,t));
    const multiTop=(t===1 && list.length>1);
    list.sort((a,b)=>a.userData.product.name.localeCompare(b.userData.product.name,'ja'));
    const t_eff=multiTop?SUM15_EPS_T:t;
    let r=r_base*(1-t_eff)-spriteR*RAD_MARGIN_COEFF;
    if(list.length>1){
      const minR=spriteR*MIN_RING_RADIUS_FACTOR;
      r=Math.max(r,minR);
    }
    const z=getSumZ(sum);
    if(list.length===1){
      if(t===1) placeTopSprite(list[0]);
      else list[0].position.set(0,0,z);
      return;
    }
    const countOnCircle=multiTop?(list.length-1):list.length;
    list.forEach((s,i)=>{
      if(multiTop && i===0){ placeTopSprite(s); return; }
      const idx=multiTop?(i-1):i;
      const angle=2*Math.PI*idx/countOnCircle;
      s.position.set(r*Math.cos(angle),r*Math.sin(angle),z);
    });
  });
}

/* ==== 重複リング配置 ==== */
function applyDuplicateRingLayout(sprites,finalScale){
  if(!sprites.length) return;
  const groups=new Map();
  sprites.forEach(s=>{
    const p=s.userData.product;
    const key=`${p.afkstage}_${p.PVP}_${p.DreamRealm}_${p.sum}`;
    if(!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(s);
  });
  const spriteR=SPRITE_SCALE*finalScale;
  const baseStep=spriteR*1.10, MAX_PER_RING=12, ANG_OFF=0.18, JITTER=spriteR*0.01;
  const tri=[A,B,C];
  function minEdgeDist(x,y){
    let mD=Infinity;
    for(let i=0;i<3;i++){
      const p1=tri[i], p2=tri[(i+1)%3];
      const num=Math.abs((p2.y-p1.y)*x - (p2.x-p1.x)*y + p2.x*p1.y - p2.y*p1.x);
      const den=Math.hypot(p2.x-p1.x,p2.y-p1.y);
      mD=Math.min(mD,num/den);
    }
    return mD;
  }
  groups.forEach(list=>{
    if(list.length<2) return;
    const sum15=list[0].userData.product.sum===15;
    const start=sum15?1:0; if(start>=list.length) return;
    let cx=0,cy=0;
    list.forEach(s=>{cx+=s.position.x;cy+=s.position.y;});
    cx/=list.length; cy/=list.length;
    const rMax=minEdgeDist(cx,cy)-spriteR*1.2;
    const dupCount=list.length-start;
    for(let k=0;k<dupCount;k++){
      const s=list[start+k];
      const lvl=Math.floor(k/MAX_PER_RING);
      const idx=k%MAX_PER_RING;
      const rem=dupCount-lvl*MAX_PER_RING;
      const cnt=Math.min(MAX_PER_RING,rem);
      let desired=baseStep*(1+lvl*1.05);
      const packMin=(cnt>1)?(spriteR*2*1.05/(2*Math.sin(Math.PI/cnt))):0;
      desired=Math.max(desired,packMin);
      let r=Math.min(desired, rMax>0?rMax:desired);
      if(r<spriteR*0.25){
        const theta=(2*Math.PI*(idx+0.5)/cnt)+lvl*ANG_OFF;
        r=spriteR*0.28;
        s.position.x=cx+r*Math.cos(theta)+(Math.random()*2-1)*JITTER;
        s.position.y=cy+r*Math.sin(theta)+(Math.random()*2-1)*JITTER;
      } else {
        const angle=(2*Math.PI*idx/cnt)+lvl*ANG_OFF;
        s.position.x=cx+r*Math.cos(angle)+(Math.random()*2-1)*JITTER;
        s.position.y=cy+r*Math.sin(angle)+(Math.random()*2-1)*JITTER;
      }
    }
  });
  sprites.forEach(s=>{
    if(s.userData.isTopSum15) return;
    const bp=basePoint(s.userData.product);
    s.position.x+=(bp.x-s.position.x)*OUT_OF_BOUNDS_PULL;
    s.position.y+=(bp.y-s.position.y)*OUT_OF_BOUNDS_PULL;
  });
}

/* ==== 頂点配置 ==== */
function placeTopSprite(sprite){
  const vTop=new THREE.Vector3(D.x,D.y,H);
  sprite.position.copy(vTop);
  sprite.userData.isTopSum15=true;
  if(TOP_SPRITE_ALIGN==='bottom') sprite.center.set(0.5,0);
  else                             sprite.center.set(0.5,0.5);
}
function finalizeTopSpritePositions(){
  if(!productGroup) return;
  productGroup.children.forEach(s=>{
    if(s.userData.isTopSum15) placeTopSprite(s);
  });
}


/* ==== 垂線上+放射状レイアウト: BASE_CENTER→D軸に沿って配置+放射状配置 ==== */
function applyPerpendicularLayout(sprites, finalScale) {
  if (!sprites.length) return;
  // 垂線方向ベクトル
  const axis = new THREE.Vector3().subVectors(D, BASE_CENTER).normalize();
  // 直交ベクトル取得
  const arbitrary = Math.abs(axis.dot(new THREE.Vector3(0,1,0))) < 0.9
    ? new THREE.Vector3(0,1,0)
    : new THREE.Vector3(1,0,0);
  const u = new THREE.Vector3().crossVectors(axis, arbitrary).normalize();
  const v = new THREE.Vector3().crossVectors(axis, u).normalize();
  // グループ化 by sum
  const groups = new Map();
  sprites.forEach(s => {
    const sum = s.userData.product.sum;
    if (!groups.has(sum)) groups.set(sum, []);
    groups.get(sum).push(s);
  });
  const r_base = 1/(2*Math.sqrt(3));
  const spriteR = SPRITE_SCALE * finalScale;
  groups.forEach((list, sum) => {
    let t = (sum - SUM_MIN_REAL) / (SUM_MAX_REAL - SUM_MIN_REAL);
    t = Math.max(0, Math.min(1, t));
    const multiTop = (t === 1 && list.length > 1);
    // 名前順でソート
    list.sort((a,b)=>a.userData.product.name.localeCompare(b.userData.product.name,'ja'));
    const t_eff = multiTop ? SUM15_EPS_T : t;
    let r = r_base * (1 - t_eff) - spriteR * RAD_MARGIN_COEFF;
    if (list.length > 1) {
      const minR = spriteR * MIN_RING_RADIUS_FACTOR;
      r = Math.max(r, minR);
    }
    list.forEach((s,i) => {
      if (multiTop && i === 0) { placeTopSprite(s); return; }
      const centerPos = new THREE.Vector3().lerpVectors(BASE_CENTER, D, t);
      if (list.length === 1) {
        if (t === 1) placeTopSprite(s);
        else s.position.copy(centerPos);
      } else {
        const idx = multiTop ? (i - 1) : i;
        const count = multiTop ? (list.length - 1) : list.length;
        const angle = 2 * Math.PI * idx / count;
        const offset = u.clone().multiplyScalar(r * Math.cos(angle))
          .add(v.clone().multiplyScalar(r * Math.sin(angle)));
        const finalPos = centerPos.clone().add(offset);
        s.position.copy(finalPos);
      }
    });
  });
}

/* ==== フィルタ/補助 ==== */
function normalizeName(s){
  if(!s) return '';
  return s.replace(/[Ａ-Ｚａ-ｚ０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0))
          .replace(/[\u30A1-\u30F6]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60))
          .toLowerCase();
}
function getSelectedFaction(){
  const r=[...factionRadios].find(r=>r.checked);
  return r?r.value:'all';
}
function getFilter(){
  return {
    nameQuery: normalizeName(fName.value.trim()),
    afkMin: +fAfkMin.value, afkMax: +fAfkMax.value,
    pvpMin: +fPvpMin.value, pvpMax: +fPvpMax.value,
    drMin: +fDrMin.value, drMax: +fDrMax.value,
    faction: getSelectedFaction()
  };
}
function passFilter(p,f){
  if(f.nameQuery) return normalizeName(p.name).includes(f.nameQuery);
  if(!(p.afkstage>=f.afkMin&&p.afkstage<=f.afkMax&&
       p.PVP>=f.pvpMin&&p.PVP<=f.pvpMax&&
       p.DreamRealm>=f.drMin&&p.DreamRealm<=f.drMax)) return false;
  if(f.faction!=='all' && p.faction!==+f.faction) return false;
  return true;
}
function escapeHtml(s){
  return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function highlight(text,q){
  if(!text) return '';
  if(!q) return escapeHtml(text);
  const n=normalizeName(text),i=n.indexOf(q);
  if(i<0) return escapeHtml(text);
  return escapeHtml(text.slice(0,i))+'<mark>'+escapeHtml(text.slice(i,i+q.length))+'</mark>'+escapeHtml(text.slice(i+q.length));
}
function updateRangeDisplays(){
  [['vAfkMin',fAfkMin],['vAfkMax',fAfkMax],
   ['vPvpMin',fPvpMin],['vPvpMax',fPvpMax],
   ['vDrMin',fDrMin],  ['vDrMax',fDrMax]]
    .forEach(([id,input])=>{
      document.getElementById(id).textContent=input.value;
    });
}

/* ==== 再構築 ==== */
const palette=['#ff00ff','#ff33ff','#ff66ff','#ff00cc','#ff1493','#ff55aa','#ff99dd','#cc44ff','#ff22aa','#ffaaee'];
function rebuild(){
  try{
    if(!productGroup) return;

    // 既存削除
    while(productGroup.children.length) productGroup.remove(productGroup.children[0]);
    while(chartGroup.children.length)    chartGroup.remove(chartGroup.children[0]);
    dataTableBody.innerHTML='';

    // フィルタ
    const disp=+displayCountEl.value;
    const subset=FULL_DATA.slice(0,disp);
    const filter=getFilter();
    const filtered=subset.filter(p=>passFilter(p,filter));
    filtered.forEach(p=>p.sum=p.afkstage+p.PVP+p.DreamRealm);

    // ソート
    if(sortState.key){
      filtered.sort((a,b)=>(a[sortState.key]-b[sortState.key])*sortState.dir);
    }

    // スケール計算
    const dyn=computeDynamicScale(filtered);
    const baseScale=SCALE_FACTOR*dyn;
    const collisionExpand=computeCollisionExpand(filtered,baseScale*GEOM_SCALE);
    const finalScale=baseScale*GEOM_SCALE*collisionExpand;

    // pivot スケール
    pivot.scale.set(finalScale,finalScale,finalScale);
    camera.position.copy(
      new THREE.Vector3(2.2,1.9,2.6).normalize().multiplyScalar(3.5*finalScale)
    );
    controls.target.set(0,VIEW_OFFSET_Y,0);
    controls.update();

    // スプライト生成
    const sprites=[];
    filtered.forEach((p,i)=>{
      const bp=basePoint(p), z=getSumZ(p.sum);
      let sprite;
      if(p.image){
        const loader=new THREE.TextureLoader();
        const tex=loader.load(p.image);
        sprite=new THREE.Sprite(new THREE.SpriteMaterial({ map:tex,transparent:true }));
      } else {
        const size=256,cvs=document.createElement('canvas'); cvs.width=cvs.height=size;
        const ctx=cvs.getContext('2d');
        ctx.beginPath();ctx.fillStyle=palette[i%palette.length];
        ctx.arc(size/2,size/2,size*0.40,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#fff';ctx.font='bold 80px sans-serif';
        ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.fillText(p.name.slice(-2),size/2,size/2);
        sprite=new THREE.Sprite(new THREE.SpriteMaterial({ map:new THREE.CanvasTexture(cvs),transparent:true }));
      }
      sprite.position.set(bp.x,bp.y,z);
      sprite.scale.set(SPRITE_SCALE,SPRITE_SCALE,SPRITE_SCALE);
      sprite.userData.product=p;
      productGroup.add(sprite);
      sprites.push(sprite);

      // テーブル行
      const factionLabel=FACTION_LABEL[p.faction]??('F'+p.faction);
      const tr=document.createElement('tr');
      tr.innerHTML=`
        <td>${highlight(p.name,filter.nameQuery)}</td>
        <td>${escapeHtml(factionLabel)}</td>
        <td>${p.afkstage}</td>
        <td>${p.PVP}</td>
        <td>${p.DreamRealm}</td>
        <td>${p.sum}</td>
      `;
      dataTableBody.appendChild(tr);
    });

    // 名前検索1件ならレーダーチャート
    if(filter.nameQuery&&filtered.length===1){
      addRadarTriangles(filtered);
    }

    // レイアウト
    // レイアウト: 垂線レイアウトのみ
    applyPerpendicularLayout(sprites, finalScale);
    // クランプ: スプライトをテトラ内部に収める
    clampSpritesInsideTetra(sprites);

    // 該当なし
    if(!filtered.length){
      const tr=document.createElement('tr');
      tr.innerHTML='<td colspan="6" class="no-data">(該当なし)</td>';
      dataTableBody.appendChild(tr);
    }

    // ステータス更新
    dynScaleVal.textContent=dyn.toFixed(3);
    collisionScaleVal.textContent='col '+collisionExpand.toFixed(3);
    baseScaleVal.textContent=baseScale.toFixed(2);
    effectiveScaleVal.textContent=finalScale.toFixed(2);
    countBadge.textContent=`${filtered.length}/${disp}`;
    document.querySelectorAll('#dataTable thead th[data-sort-key]').forEach(th=>{
      const key=th.getAttribute('data-sort-key');
      const base=th.getAttribute('data-base-text')||th.textContent.replace(/[▲▼]/,'').trim();
      if(!th.getAttribute('data-base-text')) th.setAttribute('data-base-text',base);
      th.textContent=(sortState.key===key)? base+(sortState.dir===1?' ▲':' ▼'):base;
    });
    updateRangeDisplays();
    resizeRenderer();
  }catch(e){
    console.error('rebuild error',e);
    loadStatus.textContent='Error(rebuild)';
    loadStatus.classList.add('status-error');
  }
}

function rebuildEmpty(){
  dynScaleVal.textContent='1.000';
  collisionScaleVal.textContent='col 1.000';
  baseScaleVal.textContent=SCALE_FACTOR.toFixed(2);
  effectiveScaleVal.textContent=(SCALE_FACTOR*GEOM_SCALE).toFixed(2);
  countBadge.textContent='0/0';
  updateRangeDisplays();
  resizeRenderer();
}

/* ==== データ読み込み ==== */
function isValidRecord(p){
  return p&&typeof p.name==='string'&&p.name.length>0&&
         Number.isInteger(p.afkstage)&&p.afkstage>=1&&p.afkstage<=5&&
         Number.isInteger(p.PVP)&&p.PVP>=1&&p.PVP<=5&&
         Number.isInteger(p.DreamRealm)&&p.DreamRealm>=1&&p.DreamRealm<=5&&
         Number.isInteger(p.faction)&&p.faction>=1&&p.faction<=7;
}
function loadData(){
  loadStatus.textContent='Loading...';
  fetch('json/Heroes.json',{cache:'no-store'})
    .then(r=>{if(!r.ok) throw Error('HTTP '+r.status);return r.json();})
    .then(arr=>{
      FULL_DATA=Array.isArray(arr)?arr.filter(isValidRecord):[];
      loadStatus.textContent='Loaded '+FULL_DATA.length;
      rebuild();
    })
    .catch(err=>{
      console.error(err);
      loadStatus.textContent='Error(loadData)';
      loadStatus.classList.add('status-error');
    });
}

/* ==== イベントバインド ==== */
document.querySelectorAll('#dataTable thead th[data-sort-key]').forEach(th=>{
  th.addEventListener('click',()=>{
    const key=th.getAttribute('data-sort-key');
    if(sortState.key===key) sortState.dir*=-1;
    else { sortState.key=key; sortState.dir=1; }
    rebuild();
  });
});
displayCountEl.addEventListener('input',rebuild);
displayCountEl.addEventListener('change',rebuild);
[fAfkMin,fAfkMax,fPvpMin,fPvpMax,fDrMin,fDrMax].forEach(inp=>{
  const handler=()=>{ updateRangeDisplays(); rebuild(); };
  inp.addEventListener('input',handler);
  inp.addEventListener('change',handler);
});
factionRadios.forEach(r=>r.addEventListener('change',rebuild));
btnFilterReset.addEventListener('click',()=>{
  fName.value='';
  fAfkMin.value=1; fAfkMax.value=5;
  fPvpMin.value=1; fPvpMax.value=5;
  fDrMin.value=1;  fDrMax.value=5;
  allRadio.checked=true;
  sortState={key:null,dir:1};
  GEOM_SCALE=INITIAL_GEOM_SCALE;
  updateRangeDisplays();
  rebuild();
});
btnRebuild.addEventListener('click',rebuild);
let nameDebTimer=null;
fName.addEventListener('input',()=>{
  if(nameDebTimer) clearTimeout(nameDebTimer);
  if(fName.value.trim()!=='') allRadio.checked=true;
  nameDebTimer=setTimeout(()=>rebuild(),90);
});
function toggleList(){
  const expanded=bottomPanel.style.height!==COLLAPSED_HEIGHT+'px';
  bottomPanel.style.height=(expanded?EXPANDED_HEIGHT:COLLAPSED_HEIGHT)+'px';
  toggleListBtn.textContent=expanded?'一覧▼':'一覧▲';
  setTimeout(resizeRenderer,260);
}
toggleListBtn.addEventListener('click',toggleList);
(function(){
  const btn=document.getElementById('criteriaToggle');
  const panel=document.getElementById('criteriaPanel');
  if(btn&&panel){
    btn.addEventListener('click',()=>{
      const open=panel.classList.toggle('open');
      btn.textContent=open?'評価基準 隠す ▲':'評価基準 表示 ▼';
      setTimeout(resizeRenderer,380);
    });
  }
})();

/* ==== ホバー ==== */
const raycaster = new THREE.Raycaster(), mouse = new THREE.Vector2();
addEventListener('mousemove', e=>{
  if(!camera) return;
  mouse.x=(e.clientX/window.innerWidth)*2-1;
  mouse.y=-(e.clientY/window.innerHeight)*2+1;
  raycaster.setFromCamera(mouse,camera);
  if(!productGroup) return;
  const hit=raycaster.intersectObjects(productGroup.children,false)[0];
  if(hit){
    const p=hit.object.userData.product;
    if(p){
      const lbl=FACTION_LABEL[p.faction]??('F'+p.faction);
      tooltip.style.display='block';
      tooltip.style.left=(e.clientX+12)+'px';
      tooltip.style.top=(e.clientY+10)+'px';
      tooltip.textContent=`${p.name} ${lbl} AFK${p.afkstage} PVP${p.PVP} 幻${p.DreamRealm} 合${p.sum}`;
    }
  } else {
    tooltip.style.display='none';
  }
});

/* ==== キー回転 ==== */
addEventListener('keydown', e=>{
  if(!pivot) return;
  if(e.code==='KeyQ') pivot.rotation.z+=0.05;
  if(e.code==='KeyE') pivot.rotation.z-=0.05;
});

/* ==== リサイズ ==== */
function resizeRenderer(){
  if(!renderer||!camera) return;
  const w=threeContainer.clientWidth, h=threeContainer.clientHeight;
  if(h===0) return;
  renderer.setSize(w,h);
  camera.aspect=w/h;
  camera.updateProjectionMatrix();
}
addEventListener('resize',resizeRenderer);

/* ==== アニメーションループ ==== */
function animate(){
  requestAnimationFrame(animate);
  if(controls) controls.update();
  if(renderer&&scene&&camera){
    if(productGroup){
      productGroup.children.forEach(s=>s.quaternion.copy(camera.quaternion));
    }  
    renderer.render(scene,camera);
  }
}

/* ==== 初期化呼び出し ==== */
function init(){
  initThree();
  rebuildEmpty();
  loadData();
}
window.addEventListener('DOMContentLoaded', init);
