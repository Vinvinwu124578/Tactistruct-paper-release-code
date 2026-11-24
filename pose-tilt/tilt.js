import * as THREE from '../vendor/three.module.js';

const status = document.querySelector('#tilt-status');
const buttons = [...document.querySelectorAll('button[data-angle]')];
const canvases = [...document.querySelectorAll('canvas')];
const swatches = [0x12666c, 0x2463a4, 0xb87138, 0x538458].map(hex => new THREE.Color(hex));
const initialOrbit = {theta: 1.02, phi: 1.24, zoom: 1};
const orbit = {...initialOrbit};
const loaded = new Map();
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

async function request(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error('Could not load the pose test.');
  return response;
}

async function readAsset(row) {
  const packed = await (await request(row.asset)).arrayBuffer();
  const stream = new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'));
  const data = await new Response(stream).arrayBuffer();
  const view = new DataView(data);
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)),
    byte => byte.toString(16).padStart(2, '0')).join('');
  const n = view.getUint32(4, true), v = view.getUint32(8, true), f = view.getUint32(12, true);
  if (view.getUint32(0, false) !== 0x544c5431 || digest !== row.sha256
      || n !== 1024 || v !== row.vertices || f !== row.faces || data.byteLength !== 16 + 16*n + 12*(v+f)) {
    throw new Error('Pose asset did not pass integrity checks.');
  }
  const xyz = new Float32Array(data, 16, 3*n);
  const labels = new Int32Array(data, 16 + 12*n, n);
  const ids = [...new Set(labels)].sort((a,b) => a-b);
  if (ids.length !== swatches.length) throw new Error('Unexpected input patch count.');
  const colors = new Float32Array(3*n);
  for (let i = 0; i < n; i++) swatches[ids.indexOf(labels[i])].toArray(colors, 3*i);
  const input = new THREE.BufferGeometry();
  input.setAttribute('position', new THREE.BufferAttribute(xyz, 3));
  input.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  let mesh = null;
  if (v && f) {
    mesh = new THREE.BufferGeometry();
    mesh.setAttribute('position', new THREE.BufferAttribute(new Float32Array(data, 16 + 16*n, 3*v), 3));
    mesh.setIndex(new THREE.BufferAttribute(new Uint32Array(data, 16 + 16*n + 12*v, 3*f), 1));
    mesh.computeVertexNormals();
  }
  return {input, mesh};
}

function download(row) {
  if (!loaded.has(row.angle)) {
    loaded.set(row.angle, readAsset(row).catch(error => {
      loaded.delete(row.angle);
      throw error;
    }));
  }
  return loaded.get(row.angle);
}

function createPane(canvas, input) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf2f7f6);
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, preserveDrawingBuffer: true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  const camera = new THREE.PerspectiveCamera(38, 1, .04, 30);
  const key = new THREE.DirectionalLight(0xffffff, 2.0);
  key.position.set(2, 3, 2.5);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x687b81, 2.05), key);
  const grid = new THREE.GridHelper(2.4, 6, 0xc7d6d8, 0xdbe7e7);
  grid.position.y = -1.1;
  scene.add(grid);
  const initial = new THREE.BufferGeometry();
  const object = input
    ? new THREE.Points(initial, new THREE.PointsMaterial({size: .020, vertexColors: true}))
    : new THREE.Mesh(initial, new THREE.MeshStandardMaterial({color: 0x63a2ae, roughness: .8, side: THREE.DoubleSide}));
  object.visible = false;
  scene.add(object);
  const coord = new THREE.Spherical();
  function draw() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    coord.set(3.2 / orbit.zoom / Math.min(1, camera.aspect), orbit.phi, orbit.theta);
    camera.position.setFromSpherical(coord).y += .05;
    camera.lookAt(0, .05, 0);
    renderer.render(scene, camera);
  }
  new ResizeObserver(draw).observe(canvas);
  return {
    draw,
    replace(geometry, degrees = 0) {
      object.visible = Boolean(geometry);
      if (geometry) object.geometry = geometry;
      object.rotation.x = THREE.MathUtils.degToRad(degrees);
    },
  };
}

function attachControls(draw) {
  for (const canvas of canvases) {
    let drag;
    function rotate(dx, dy) {
      orbit.theta += dx;
      orbit.phi = clamp(orbit.phi + dy, .10, Math.PI-.10);
      draw();
    }
    canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      drag = {id: event.pointerId, x: event.clientX, y: event.clientY};
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', event => {
      if (drag?.id !== event.pointerId) return;
      rotate((drag.x-event.clientX)*.009, (drag.y-event.clientY)*.009);
      drag.x = event.clientX;
      drag.y = event.clientY;
    });
    canvas.addEventListener('lostpointercapture', () => { drag = null; });
    canvas.addEventListener('wheel', event => {
      event.preventDefault();
      orbit.zoom = clamp(orbit.zoom*Math.exp(-event.deltaY*.001), .7, 2.65);
      draw();
    }, {passive: false});
    canvas.addEventListener('keydown', event => {
      const delta = {ArrowLeft: [-.15,0], ArrowRight: [.15,0], ArrowUp: [0,-.15], ArrowDown: [0,.15]}[event.key];
      if (delta) {
        event.preventDefault();
        rotate(...delta);
      }
    });
  }
  document.querySelector('.tilt-reset').addEventListener('click', () => {
    Object.assign(orbit, initialOrbit);
    draw();
  });
}

const cd = m => m ? m.cd.toFixed(3) : '\u2014';
const f02 = m => m ? (100*m.f02).toFixed(1) + '%' : '\u2014';
const scores = m => m ? 'CD ' + cd(m) + '  \u00b7  F@0.02 ' + f02(m) : 'No extracted mesh';

async function main() {
  const {cases} = await (await request('manifest.json')).json();
  const rows = new Map(cases.map(c => [c.angle,c]));
  if (buttons.some(b => !rows.has(Number(b.dataset.angle)))) throw new Error('Incomplete angle index.');
  const table = document.querySelector('#tilt-table');
  for (const row of cases) {
    const tr = document.createElement('tr');
    const label = document.createElement('th');
    label.scope = 'row';
    label.textContent = row.angle + '\u00b0';
    tr.append(label);
    for (const value of [cd(row.direct), f02(row.direct), cd(row.aligned), f02(row.aligned)]) {
      const td = document.createElement('td');
      td.textContent = value;
      tr.append(td);
    }
    tr.dataset.angle = row.angle;
    table.append(tr);
  }
  const panes = canvases.map((canvas, index) => createPane(canvas, index === 0));
  const draw = () => panes.forEach(pane => pane.draw());
  attachControls(draw);
  let requestID = 0;
  async function show(angle) {
    const id = ++requestID;
    const row = rows.get(angle);
    status.textContent = 'Loading ' + angle + '\u00b0';
    try {
      const [baseline, current] = await Promise.all([download(rows.get(0)), download(row)]);
      if (id !== requestID) return;
      panes[0].replace(current.input);
      panes[1].replace(current.mesh);
      panes[2].replace(baseline.mesh, angle);
      document.querySelector('#no-surface').hidden = Boolean(current.mesh);
      document.querySelector('#direct-score').textContent = scores(row.direct);
      document.querySelector('#aligned-score').textContent = scores(row.aligned);
      for (const button of buttons) button.setAttribute('aria-pressed', Number(button.dataset.angle) === angle);
      for (const entry of table.rows) entry.setAttribute('aria-current', Number(entry.dataset.angle) === angle);
      draw();
      status.textContent = angle + '\u00b0 about X' + (row.boundary ? ' \u00b7 direct mesh reaches grid boundary' : '');
      status.dataset.ready = String(angle);
    } catch (error) {
      if (id === requestID) status.textContent = error.message;
      console.error(error);
    }
  }
  for (const button of buttons) button.addEventListener('click', () => show(Number(button.dataset.angle)));
  await show(30);
}

main().catch(error => {
  status.textContent = error.message;
  console.error(error);
});
