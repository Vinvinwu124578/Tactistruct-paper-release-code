import * as THREE from './vendor/three.module.js';
import {patchAssets} from './patch-assets.js';

const params=new URLSearchParams(location.search);
const status=document.querySelector('#point-status'), canvas=document.querySelector('#point-scene');
const format=new Intl.NumberFormat('en');
if(params.get('embed')==='1')document.documentElement.classList.add('embedded');

async function request(url){
  const r=await fetch(url);
  if(!r.ok)throw Error('Could not load the point cloud');
  return r;
}

async function digest(bytes){
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
    x=>x.toString(16).padStart(2,'0')).join('');
}

async function start(){
  const id=params.get('case'), mode=params.get('mode');
  if(!/^[a-f0-9]{24}$/.test(id))throw Error('Unknown case');
  const base=patchAssets(mode);
  const index=await (await request(base+'point-index.json')).json();
  if(!Object.hasOwn(index,id))throw Error('No point cloud published for this case');
  const entry=index[id], n=mode==='raw10'?30000:1024, patchCount=mode==='raw10'?10:4;
  const zipped=await (await request(base+'points/'+id+'.ply.gz')).blob();
  const buffer=await new Response(zipped.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  if(entry.points!==n||entry.colors.length!==patchCount||buffer.byteLength!==entry.headerBytes+n*16)
    throw Error('Unexpected input point layout');
  const header=new TextDecoder().decode(buffer.slice(0,entry.headerBytes));
  if(!header.startsWith('ply\nformat binary_little_endian 1.0\nelement vertex '+n+'\n')
      ||!header.endsWith('property int patch_id\nend_header\n'))throw Error('Invalid point cloud header');

  const interleaved=new Uint8Array(buffer,entry.headerBytes);
  const xyz=new Uint8Array(n*12), ids=new Uint8Array(n*4);
  for(let i=0;i<n;i++){
    xyz.set(interleaved.subarray(i*16,i*16+12),i*12);
    ids.set(interleaved.subarray(i*16+12,i*16+16),i*4);
  }
  if(await digest(xyz)!==entry.sha256||await digest(ids)!==entry.patchSha256)
    throw Error('Point cloud integrity check failed');
  const positions=new Float32Array(n*3), colors=new Float32Array(n*3), palette=new Map(
    entry.colors.map(([id,rgb])=>[id,new THREE.Color().setRGB(...rgb.map(c=>c/255),THREE.SRGBColorSpace)]));
  const pos=new DataView(xyz.buffer), labels=new DataView(ids.buffer);
  for(let i=0;i<n;i++){
    for(let k=0;k<3;k++)positions[i*3+k]=pos.getFloat32(i*12+k*4,true);
    const c=palette.get(labels.getInt32(i*4,true));
    if(!c)throw Error('Unrecognized patch label');
    c.toArray(colors,i*3);
  }

  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  geometry.computeBoundingSphere();
  const {center,radius}=geometry.boundingSphere;
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0xf2f7f6);
  const sprite=document.createElement('canvas');
  sprite.width=sprite.height=32;
  const ctx=sprite.getContext('2d');
  ctx.fillStyle='#fff';
  ctx.beginPath();
  ctx.arc(16,16,14,0,2*Math.PI);
  ctx.fill();
  scene.add(new THREE.Points(geometry,new THREE.PointsMaterial({
    map:new THREE.CanvasTexture(sprite),alphaTest:.55,vertexColors:true,
    size:radius*(n===30000?.014:.027)
  })));
  const camera=new THREE.PerspectiveCamera(39,1,radius*.03,radius*40), orbit=new THREE.Spherical();
  let theta=.45,phi=1.13,zoom=1,drag=null;
  const draw=()=>{
    const w=canvas.clientWidth,h=canvas.clientHeight;
    if(!w||!h)return;
    renderer.setSize(w,h,false);
    camera.aspect=w/h;
    camera.updateProjectionMatrix();
    orbit.set(radius*3.6/zoom/Math.min(1,camera.aspect),phi,theta);
    camera.position.setFromSpherical(orbit).add(center);
    camera.lookAt(center);
    renderer.render(scene,camera);
  };
  const rotate=(x,y)=>{theta+=x;phi=Math.max(.08,Math.min(Math.PI-.08,phi+y));draw();};
  canvas.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY,id:e.pointerId};canvas.setPointerCapture(e.pointerId);};
  canvas.onpointermove=e=>{
    if(drag?.id!==e.pointerId)return;
    rotate((drag.x-e.clientX)*.009,(drag.y-e.clientY)*.009);
    drag.x=e.clientX;drag.y=e.clientY;
  };
  canvas.onlostpointercapture=()=>{drag=null;};
  canvas.onwheel=e=>{e.preventDefault();zoom=Math.max(.55,Math.min(2.6,zoom*Math.exp(-e.deltaY*.001)));draw();};
  canvas.onkeydown=e=>{
    const d={ArrowLeft:[-.15,0],ArrowRight:[.15,0],ArrowUp:[0,-.15],ArrowDown:[0,.15]}[e.key];
    if(d){e.preventDefault();rotate(...d);}
  };
  document.querySelector('#reset').onclick=()=>{theta=.45;phi=1.13;zoom=1;draw();};
  const download=document.querySelector('#download');
  download.href=URL.createObjectURL(zipped);
  download.download=id+'.ply.gz';
  download.hidden=false;
  addEventListener('pagehide',()=>URL.revokeObjectURL(download.href),{once:true});
  new ResizeObserver(draw).observe(canvas);
  draw();
  status.textContent=format.format(n)+' points / '+patchCount+' patches';
  status.dataset.verified='true';
}

start().catch(error=>{status.textContent=error.message;console.error(error);});
