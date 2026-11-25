import * as THREE from '../vendor/three.module.js';

const status = document.querySelector('#tilt-status');
const picker = document.querySelector('#case-select');
const query = document.querySelector('#query');
const angles = [...document.querySelectorAll('button[data-angle]')];
const modeButtons = [...document.querySelectorAll('button[data-mode]')];
const canvases = [...document.querySelectorAll('canvas')];
const local = ['127.0.0.1','localhost'].includes(location.hostname);
const remoteRoot = 'https://raw.githubusercontent.com/Vinvinwu124578/Tactistruct-paper-release-code/';
const modes = {
  patch4:{label:'4 patches', file:'catalog.json', points:1024, patches:4, labelled:true,
    baseline:'__baseline', tilted:'__tilt', colors:[0x12666c,0x2463a4,0xb87138,0x538458]},
  balanced40:{label:'40 patches', file:'balanced40.json', points:1024, patches:40, labelled:false,
    baseline:'__baseline40', tilted:'__tilt40', colors:[0x12666c]},
  raw10:{label:'10 raw patches', file:'raw10.json', points:30000, patches:10, labelled:true,
    baseline:'__baseline10', tilted:'__tilt10', colors:[0x0f7b82,0xcc7327,0x7c4e99,0x2969b9,0x9e4444,
      0x4b823c,0x9a6a9b,0x686536,0x2e5270,0x8d501c]}
};
const defaultOrbit = {theta:1.04, phi:1.23, zoom:1};
const orbit = {...defaultOrbit};
const clamp = (v, lo, hi) => Math.max(lo,Math.min(hi,v));
const cd = value => value.toFixed(3);
const f02 = value => (100*value).toFixed(2)+'%';

function source(rev, file, alias) {
  if (!/^[0-9a-f]{40}$/.test(rev)) throw Error('Unpinned asset revision.');
  return local ? '../'+alias+'/'+file : remoteRoot+rev+'/'+file;
}

async function request(url, signal) {
  const response = await fetch(url, {signal});
  if (!response.ok) throw Error('Could not load the selected pose. Try the angle again.');
  return response;
}

async function inflate(url, signal) {
  const bytes = await (await request(url, signal)).arrayBuffer();
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}

async function verify(bytes, digest) {
  const actual = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    x => x.toString(16).padStart(2,'0')).join('');
  if (actual !== digest) throw Error('Asset integrity check failed.');
}

function unpack(raw, offset, n, vertices) {
  const out = new Int32Array(n*3);
  for (let k=0; k<3; k++) {
    let last=0;
    for (let i=0; i<n; i++) {
      let word=0;
      for (let b=0; b<4; b++) word |= raw[offset+(k*4+b)*n+i]<<(8*b);
      const value = vertices ? word^last : last+((word>>>1)^-(word&1));
      out[3*i+k] = value;
      last = value;
    }
  }
  return out;
}

async function baseline(catalog, item, spec, signal) {
  const {points,mesh} = item.baseline;
  const path = file => source(catalog.baseline_revision,file,spec.baseline);
  const [cloud,data] = await Promise.all([
    inflate(path('points/'+item.id+'.ply.gz'),signal),
    inflate(path('meshes/'+item.id+'.mesh.gz'),signal),
  ]);
  const stride=spec.labelled ? 16 : 12;
  if (points.points!==spec.points || cloud.byteLength!==points.headerBytes+stride*points.points) throw Error('Invalid baseline input.');
  const xyz=new Float32Array(3*points.points), labels=spec.labelled ? new Int32Array(points.points) : null;
  const view=new DataView(cloud);
  for (let i=0; i<points.points; i++) {
    const o=points.headerBytes+stride*i;
    for (let k=0; k<3; k++) xyz[3*i+k]=view.getFloat32(o+4*k,true);
    if (labels) labels[i]=view.getInt32(o+12,true);
  }
  const header=new DataView(data), n=header.getUint32(0,true), f=header.getUint32(4,true);
  if (n!==mesh.vertices || f!==mesh.triangles || data.byteLength!==8+12*(n+f)) throw Error('Invalid baseline mesh.');
  const raw=new Uint8Array(data), v=unpack(raw,8,n,true), tris=unpack(raw,8+12*n,f,false);
  const content=new Uint8Array(v.byteLength+tris.byteLength);
  content.set(new Uint8Array(v.buffer)); content.set(new Uint8Array(tris.buffer), v.byteLength);
  await Promise.all([verify(content,mesh.sha256),verify(xyz.buffer,points.sha256),
    labels ? verify(labels.buffer,points.patchSha256) : null]);
  return {xyz,labels,verts:new Float32Array(v.buffer),indices:new Uint32Array(tris.buffer)};
}

async function tilted(catalog, pose, spec, signal) {
  const data = await inflate(source(catalog.asset_revision,pose.path,spec.tilted),signal);
  const view=new DataView(data), n=view.getUint32(4,true), v=view.getUint32(8,true), f=view.getUint32(12,true);
  const offset=16+(spec.labelled?16:12)*n;
  if (view.getUint32(0,false)!==(spec.labelled?0x54505631:0x54505632) || n!==spec.points || v!==pose.vertices
      || f!==pose.faces || data.byteLength!==offset+12*(v+f)) throw Error('Invalid tilt payload.');
  await verify(data,pose.sha256);
  const raw=new Uint8Array(data), xyz=new Float32Array(data,16,3*n);
  const labels=spec.labelled ? new Int32Array(data,16+12*n,n) : null;
  const verts=new Float32Array(unpack(raw,offset,v,true).buffer);
  const indices=new Uint32Array(unpack(raw,offset+12*v,f,false).buffer);
  return {xyz,labels,verts,indices};
}

function geometry({xyz,labels,verts,indices}, spec) {
  const colors=new Float32Array(xyz.length);
  const swatches=spec.colors.map(x=>new THREE.Color(x));
  if (labels) {
    const ids=[...new Set(labels)].sort((a,b)=>a-b);
    if (ids.length!==spec.patches) throw Error('Unexpected patch assignment.');
    const byId=new Map(ids.map((id,i)=>[id,swatches[i]]));
    for (let i=0;i<labels.length;i++) byId.get(labels[i]).toArray(colors,3*i);
  } else {
    for (let i=0;i<colors.length;i+=3) swatches[0].toArray(colors,i);
  }
  const cloud=new THREE.BufferGeometry();
  cloud.setAttribute('position',new THREE.BufferAttribute(xyz,3));
  cloud.setAttribute('color',new THREE.BufferAttribute(colors,3));
  const mesh=new THREE.BufferGeometry();
  mesh.setAttribute('position',new THREE.BufferAttribute(verts,3));
  mesh.setIndex(new THREE.BufferAttribute(indices,1));
  mesh.computeVertexNormals();
  return {cloud,mesh};
}

function pane(canvas, cloud) {
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,1.75));
  const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(39,1,.04,30);
  scene.background=new THREE.Color(0xf2f7f6);
  const light=new THREE.DirectionalLight(0xffffff,2);
  light.position.set(2,3,2.5);
  const grid=new THREE.GridHelper(2.4,6,0xc7d6d8,0xdbe7e7);
  grid.position.y=-1.1;
  scene.add(grid,light,new THREE.HemisphereLight(0xffffff,0x687b81,2.05));
  const empty=new THREE.BufferGeometry();
  const object=cloud
    ? new THREE.Points(empty,new THREE.PointsMaterial({size:.02,vertexColors:true}))
    : new THREE.Mesh(empty,new THREE.MeshStandardMaterial({color:0x63a2ae,roughness:.8,side:THREE.DoubleSide}));
  object.visible=false;
  scene.add(object);
  const orientation=new THREE.Spherical();
  const draw=()=>{
    const w=canvas.clientWidth,h=canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w,h,false);
    camera.aspect=w/h;
    camera.updateProjectionMatrix();
    orientation.set(3.75/orbit.zoom/Math.min(1,camera.aspect),orbit.phi,orbit.theta);
    camera.position.setFromSpherical(orientation);
    camera.lookAt(0,0,0);
    renderer.render(scene,camera);
  };
  new ResizeObserver(draw).observe(canvas);
  return {draw, hide(){ object.visible=false; }, replace(next, pointSize) {
    object.geometry.dispose();
    object.geometry=next;
    if (cloud) object.material.size=pointSize;
    object.visible=true;
  }};
}

function controls(draw) {
  function rotate(x,y) {
    orbit.theta+=x;
    orbit.phi=clamp(orbit.phi+y,.10,Math.PI-.10);
    draw();
  }
  for (const canvas of canvases) {
    let drag;
    canvas.addEventListener('pointerdown',e=>{
      if (e.button!==0) return;
      drag={id:e.pointerId,x:e.clientX,y:e.clientY};
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove',e=>{
      if (drag?.id!==e.pointerId) return;
      rotate((drag.x-e.clientX)*.009,(drag.y-e.clientY)*.009);
      drag.x=e.clientX; drag.y=e.clientY;
    });
    canvas.addEventListener('lostpointercapture',()=>{drag=null;});
    canvas.addEventListener('wheel',e=>{
      e.preventDefault();
      orbit.zoom=clamp(orbit.zoom*Math.exp(-e.deltaY*.001),.7,2.65);
      draw();
    },{passive:false});
    canvas.addEventListener('keydown',e=>{
      const delta={ArrowLeft:[-.15,0],ArrowRight:[.15,0],ArrowUp:[0,-.15],ArrowDown:[0,.15]}[e.key];
      if (delta) {e.preventDefault();rotate(...delta);}
    });
  }
  document.querySelector('.tilt-reset').onclick=()=>{Object.assign(orbit,defaultOrbit);draw();};
}

function fillSummary(results) {
  const table=document.querySelector('#tilt-table');
  table.replaceChildren();
  for (const value of results) {
    const r=table.insertRow();
    const heading=document.createElement('th');
    heading.scope='row';
    heading.textContent=value.angle+'\u00b0';
    r.append(heading);
    r.dataset.angle=value.angle;
    const valid=value.valid_reference_mean, all=value.all_original_test_mean;
    for (const entry of [cd(valid.chamfer_l1),f02(valid['fscore_0.02']),cd(all.chamfer_l1),
                         f02(all['fscore_0.02']),value.input_outside_grid_objects,value.no_zero_surface]) {
      r.insertCell().textContent=entry;
    }
  }
}

async function main() {
  const catalog=await (await request(modes.patch4.file)).json();
  if (catalog.cases.length!==275 || catalog.summary.length!==5
      || catalog.summary.some(row=>row.objects!==275 || row.valid_reference_objects!==274)) throw Error('Incomplete cohort catalog.');
  const all=catalog.cases.sort((a,b)=>a.category.localeCompare(b.category)||a.id.localeCompare(b.id));
  const byId=new Map(all.map(item=>[item.id,item]));
  if (byId.size!==275 || !byId.get(catalog.flagged_case)?.reference_outside) throw Error('Invalid test index.');
  const params=new URLSearchParams(location.search);
  let mode=Object.hasOwn(modes,params.get('mode')) ? params.get('mode') : 'patch4';
  let id=byId.has(params.get('case')) ? params.get('case') : all[0].id;
  let degrees=catalog.angles.includes(Number(params.get('angle'))) && params.has('angle') ? Number(params.get('angle')) : 30;
  let inflight, summaryMode;
  const catalogs=new Map([['patch4',{data:catalog,items:byId}]]);
  async function dataset(key, signal) {
    if (catalogs.has(key)) return catalogs.get(key);
    const data=await (await request(modes[key].file,signal)).json();
    const items=new Map(data.cases.map(c=>[c.id,c]));
    if (data.mode!==key || items.size!==275 || data.cases.length!==275 || data.summary.length!==5
        || data.flagged_case!==catalog.flagged_case || data.angles.join()!==catalog.angles.join()
        || data.summary.some(row=>row.objects!==275 || row.valid_reference_objects!==274)
        || all.some(c=>items.get(c.id)?.category!==c.category)) throw Error('Input protocol index differs from the test cohort.');
    const ready={data,items};
    catalogs.set(key,ready);
    return ready;
  }
  const panes=canvases.map((item,i)=>pane(item,i===0));
  const draw=()=>panes.forEach(scene=>scene.draw());
  controls(draw);
  function fillPicker() {
    const search=query.value.trim().toLowerCase();
    const results=all.filter(item=>(item.category+' '+item.id).includes(search));
    const selected=results.some(item=>item.id===id);
    picker.replaceChildren();
    if (!selected) picker.add(new Option(results.length ? 'Choose a matching case' : 'No matching cases',''));
    for (const item of results) {
      picker.add(new Option(item.category+' \u00b7 '+item.id+(item.reference_outside?' \u00b7 reference flag':''),item.id));
    }
    if (selected) picker.value=id;
  }
  async function show() {
    inflight?.abort();
    const signal=(inflight=new AbortController()).signal;
    const selectedId=id, angle=degrees, key=mode, spec=modes[key];
    const warning=document.querySelector('#case-reference-warning');
    warning.hidden=true;
    status.textContent='Loading '+byId.get(selectedId).category+' at '+angle+'\u00b0';
    status.removeAttribute('data-ready');
    status.removeAttribute('data-mode');
    for (const button of modeButtons) button.setAttribute('aria-pressed',button.dataset.mode===key);
    for (const button of angles) button.setAttribute('aria-pressed',Number(button.dataset.angle)===angle);
    document.querySelector('#input-score').textContent='';
    document.querySelector('#direct-score').textContent='';
    panes.forEach(p=>p.hide());
    draw();
    if (key!==summaryMode) document.querySelector('#tilt-table').replaceChildren();
    try {
      const {data:active,items}=await dataset(key,signal);
      if (signal.aborted) return;
      if (summaryMode!==key || !document.querySelector('#tilt-table').rows.length) {
        fillSummary(active.summary);
        summaryMode=key;
      }
      document.querySelector('#summary-title').textContent='Test split summary: '+spec.label;
      const item=items.get(selectedId), pose=item.poses.find(p=>p.angle===angle);
      const data=angle ? await tilted(active,pose,spec,signal) : await baseline(active,item,spec,signal);
      if (signal.aborted) return;
      const {cloud,mesh}=geometry(data,spec);
      panes[0].replace(cloud,spec.points>1024 ? .012 : .02); panes[1].replace(mesh); draw();
      warning.hidden=!item.reference_outside;
      if (!warning.hidden) warning.textContent=item.id+': '+item.reference_outside.toLocaleString('en')
        +' archived reference samples lie outside the grid. Scores are retained for traceability only.';
      document.querySelector('#input-score').textContent=spec.points.toLocaleString('en')+' points / '+spec.label
        +(pose.input_outside?' \u00b7 '+pose.input_outside+' outside grid':'');
      document.querySelector('#direct-score').textContent='CD '+cd(pose.cd)+' \u00b7 F@0.02 '+f02(pose.f02)
        +(item.reference_outside?' \u00b7 invalid reference':'')+(pose.mesh_boundary?' \u00b7 grid boundary':'');
      for (const row of document.querySelector('#tilt-table').rows) row.setAttribute('aria-current',Number(row.dataset.angle)===angle);
      params.set('case',item.id); params.set('angle',angle); params.set('mode',key);
      history.replaceState(null,'','?'+params.toString());
      status.textContent=item.category+' \u00b7 '+angle+'\u00b0 about X \u00b7 '+spec.label;
      status.dataset.mode=key;
      status.dataset.ready=item.id+':'+angle;
    } catch (error) {
      if (signal.aborted) return;
      status.textContent=error.message;
      console.error(error);
    }
  }
  fillPicker();
  query.oninput=fillPicker;
  picker.onchange=()=>{if (picker.value) {id=picker.value;show();}};
  for (const button of angles) button.onclick=()=>{degrees=Number(button.dataset.angle);show();};
  for (const button of modeButtons) button.onclick=()=>{mode=button.dataset.mode;show();};
  document.querySelector('#open-reference-issue').onclick=()=>{
    id=catalog.flagged_case; query.value=''; fillPicker(); show();
  };
  await show();
}

main().catch(error=>{status.textContent=error.message;console.error(error);});
