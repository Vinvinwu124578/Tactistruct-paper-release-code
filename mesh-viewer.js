import * as THREE from './vendor/three.module.js';

const status=document.querySelector('#mesh-status');
const canvas=document.querySelector('#mesh-scene');
const id=new URLSearchParams(location.search).get('case');
const format=new Intl.NumberFormat('en');

function unpack(raw,offset,n,vertex){
  const output=new Int32Array(n*3);
  for(let k=0;k<3;k++){
    let last=0;
    for(let i=0;i<n;i++){
      let d=0;
      for(let b=0;b<4;b++)d|=raw[offset+(k*4+b)*n+i]<<(8*b);
      const value=vertex?(d^last):last+((d>>>1)^-(d&1));
      output[3*i+k]=value;
      last=value;
    }
  }
  return output;
}

async function request(url){
  const r=await fetch(url);
  if(!r.ok)throw Error('Could not load the reconstruction');
  return r;
}

async function start(){
  if(!/^[a-f0-9]{24}$/.test(id))throw Error('Unknown case');
  document.querySelector('#input-link').href='point-cloud.html?case='+id;
  const index=await (await request('mesh-index.json')).json();
  if(!Object.hasOwn(index,id))throw Error('No 3D mesh published for this case');
  const entry=index[id];
  const response=await request('meshes/'+id+'.mesh.gz');
  const zipped=await response.arrayBuffer();
  const buffer=await new Response(new Blob([zipped]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const raw=new Uint8Array(buffer), header=new DataView(buffer);
  const n=header.getUint32(0,true), f=header.getUint32(4,true);
  if(n!==entry.vertices||f!==entry.triangles||raw.length!==8+12*(n+f))throw Error('Invalid mesh size');
  const v=unpack(raw,8,n,true);
  const indices=unpack(raw,8+12*n,f,false);
  const original=new Uint8Array(v.byteLength+indices.byteLength);
  original.set(new Uint8Array(v.buffer));
  original.set(new Uint8Array(indices.buffer),v.byteLength);
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',original)),x=>x.toString(16).padStart(2,'0')).join('');
  if(digest!==entry.sha256)throw Error('Mesh integrity check failed');
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(v.buffer),3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices.buffer),1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0xf2f7f6);
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({
    color:0x479aa4,roughness:.79,side:THREE.DoubleSide
  }));
  scene.add(mesh,new THREE.HemisphereLight(0xffffff,0x667079,2.1));
  const key=new THREE.DirectionalLight(0xffffff,2.4);
  scene.add(key,key.target);
  const {radius,center}=geometry.boundingSphere;
  const camera=new THREE.PerspectiveCamera(39,1,radius*.03,radius*40);
  const orbit=new THREE.Spherical();
  let theta=.45,phi=1.13,zoom=1,drag;
  const draw=()=>{
    const w=canvas.clientWidth,h=canvas.clientHeight;
    renderer.setSize(w,h,false);
    camera.aspect=w/h;
    camera.updateProjectionMatrix();
    orbit.set(radius*3.6/zoom/Math.min(1,camera.aspect),phi,theta);
    camera.position.setFromSpherical(orbit).add(center);
    key.position.copy(camera.position).add(new THREE.Vector3(radius,radius,0));
    key.target.position.copy(center);
    camera.lookAt(center);
    renderer.render(scene,camera);
  };
  const rotate=(x,y)=>{theta+=x;phi=Math.max(.08,Math.min(Math.PI-.08,phi+y));draw();};
  canvas.onpointerdown=e=>{
    drag={x:e.clientX,y:e.clientY,id:e.pointerId};canvas.setPointerCapture(e.pointerId);
  };
  canvas.onpointermove=e=>{
    if(drag?.id!==e.pointerId)return;
    rotate((drag.x-e.clientX)*.009,(drag.y-e.clientY)*.009);
    drag.x=e.clientX;drag.y=e.clientY;
  };
  canvas.onlostpointercapture=()=>{drag=null;};
  canvas.onwheel=e=>{e.preventDefault();zoom=Math.min(2.6,Math.max(.55,zoom*Math.exp(-e.deltaY*.001)));draw();};
  canvas.onkeydown=e=>{
    const d={ArrowLeft:[-.15,0],ArrowRight:[.15,0],ArrowUp:[0,-.15],ArrowDown:[0,.15]}[e.key];
    if(d){e.preventDefault();rotate(...d);}
  };
  document.querySelector('#reset').onclick=()=>{theta=.45;phi=1.13;zoom=1;draw();};
  new ResizeObserver(draw).observe(canvas);
  draw();
  status.textContent=format.format(n)+' vertices / '+format.format(f)+' triangles';
  status.dataset.verified='true';
}

start().catch(error=>{status.textContent=error.message;console.error(error);});
