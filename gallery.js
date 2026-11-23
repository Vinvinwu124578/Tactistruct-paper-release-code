'use strict';

const {cases, splits, anomaly} = globalThis.galleryData;
const query = new URLSearchParams(window.location.search);
const names = {all:'All cases', train:'Training', val:'Validation', test:'Test'};
const state = {split:Object.hasOwn(names,query.get('split'))?query.get('split'):'test', mode:'grid', page:0};
const byId = new Map(cases.map(item=>[item.id,item]));
const el = id=>document.getElementById(id);
const category = el('category'), search = el('search'), sort = el('sort');
const dialog = el('detail'), grid = el('case-list');
const totalCategories = new Set(cases.map(item=>item.category)).size;
const size = 32;
const integer = new Intl.NumberFormat('en-US');
const pct = x=>`${(x*100).toFixed(2)}%`;
const cd = x=>x.toFixed(5);

function node(tag, className='', content) {
  const out = document.createElement(tag);
  if(className) out.className=className;
  if(content!==undefined) out.textContent=content;
  return out;
}
function metricPair(label,val) {
  const div=node('div');
  div.append(node('dt','',label),node('dd','',val));
  return div;
}
function metricsForSplit() {
  const row=splits[state.split];
  const stats=row?[
    ['Meshes extracted',integer.format(row.objects)],
    [state.split==='test'?'Median CD ↓':'Mean CD ↓',cd(state.split==='test'?row.median:row.cd)],
    ['F@0.01 ↑',pct(row.f01)],['F@0.02 ↑',pct(row.f02)]
  ]:[
    ['Meshes extracted',integer.format(cases.length)],['Shape categories',totalCategories],
    ['Dataset splits',3],['Flagged references',cases.filter(item=>item.referenceIssue).length]
  ];
  el('summary').replaceChildren(...stats.map(([a,b])=>metricPair(a,b)));
  el('anomaly-banner').hidden=!['test','all'].includes(state.split);
}

function syncUrl(item) {
  if(window.location.protocol==='file:') return;
  const url=new URL(window.location.href);
  url.searchParams.set('split',state.split);
  if(item) url.searchParams.set('case',item.id); else url.searchParams.delete('case');
  history.replaceState(null,'',url);
}

function openCase(item) {
  el('detail-title').textContent=item.category;
  el('detail-split').textContent=names[item.split].toUpperCase()+' / SAVED CASE';
  const pointLink=el('view-points');
  pointLink.href='point-cloud.html?case='+encodeURIComponent(item.id);
  el('detail-id').textContent=`Case ${item.id} · ${integer.format(item.f)} triangles`;
  const image=el('detail-image');
  image.src=`comparisons/${item.id}.webp`;
  image.alt=`Tactile input and predicted ${item.category} mesh in the same frame`;
  el('detail-input').textContent=`Input: ${integer.format(item.input.points)} points, ${item.input.patches} patches · simulation groups ${item.input.groups.join(', ')} (zero-based).`;
  el('detail-metrics').replaceChildren(...[
    ['CD ↓',cd(item.cd)],['F@0.01 ↑',pct(item.f01)],['F@0.02 ↑',pct(item.f02)],
    ['Prediction to reference',cd(item.p2g)],['Reference to prediction',cd(item.g2p)],['Mesh','Extracted']
  ].map(([a,b])=>metricPair(a,b)));
  el('detail-overlap').hidden=!item.overlap.length;
  el('detail-overlap').textContent=item.overlap.length?`Shared original ShapeID in: ${item.overlap.map(s=>names[s]).join(', ')}.`:'';
  el('detail-anomaly').hidden=!item.referenceIssue;
  if (!dialog.open) dialog.showModal();
  syncUrl(item);
}

function card(item) {
  const button=node('button','case');
  button.type='button';
  button.addEventListener('click',()=>openCase(item));
  const image=node('img');
  image.width=704;
  image.height=256;
  image.loading='lazy';
  image.alt=`Tactile input and predicted ${item.category} surface`;
  image.src=`comparisons/${item.id}.webp`;
  const labels=node('span','pair-labels');
  labels.append(node('span','','Tactile input'),node('span','','Predicted mesh'));
  const box=node('span','case-info');
  box.append(node('span','case-category',item.category),
    node('span','case-data',`CD ${cd(item.cd)}  ·  F@0.02 ${pct(item.f02)}`),
    node('span','case-id',names[item.split]+` · ${item.id.slice(0,8)}`));
  if(item.referenceIssue) box.append(node('span','flag','Reference out of bounds'));
  button.append(labels,image,box);
  return button;
}

function table(items) {
  const wrap=node('div','table-wrap'), table=node('table'), head=node('thead'), body=node('tbody');
  const header=node('tr');
  for(const label of ['Case','Category','Split','CD ↓','F@0.01 ↑','F@0.02 ↑','Reference']){
    const th=node('th','',label); th.scope='col'; header.append(th);
  }
  head.append(header);
  for(const item of items){
    const row=node('tr'), cell=node('td'), button=node('button','',item.id.slice(0,8));
    button.type='button';
    button.addEventListener('click',()=>openCase(item));
    cell.append(button); row.append(cell);
    for(const value of [item.category,names[item.split],cd(item.cd),pct(item.f01),pct(item.f02),
      item.referenceIssue?'Out of bounds':'—']) row.append(node('td','',value));
    body.append(row);
  }
  table.append(head,body); wrap.append(table);
  return wrap;
}

function options() {
  const found=[...new Set(cases.filter(x=>state.split==='all'||x.split===state.split).map(x=>x.category))].sort();
  const selected=category.value;
  category.replaceChildren(new Option('All categories',''),...found.map(x=>new Option(x,x)));
  if (found.includes(selected)) category.value=selected;
}

function show() {
  const value=search.value.trim().toLowerCase();
  const filtered=cases.filter(x=>(state.split==='all'||x.split===state.split) &&
    (!category.value||x.category===category.value) && (!value||x.category.includes(value)||x.id.includes(value)));
  const sorters={category:(a,b)=>a.category.localeCompare(b.category), cd:(a,b)=>a.cd-b.cd, f02:(a,b)=>b.f02-a.f02};
  if (sorters[sort.value]) filtered.sort(sorters[sort.value]);
  const pages=Math.max(1,Math.ceil(filtered.length/size));
  state.page=Math.min(pages-1,state.page);
  const pageItems=filtered.slice(state.page*size,(state.page+1)*size);
  el('match-count').textContent=`${integer.format(filtered.length)} matching cases`;
  el('page-label').textContent=`Page ${state.page+1} of ${pages}`;
  el('prev').disabled=state.page===0;
  el('next').disabled=state.page>=pages-1;
  grid.className=state.mode==='grid'&&pageItems.length?'grid':'';
  if(!pageItems.length){grid.replaceChildren(node('p','empty','No cases match these filters.'));return;}
  grid.replaceChildren(...(state.mode==='grid'?pageItems.map(card):[table(pageItems)]));
}

function splitTo(split) {
  state.split=split;
  state.page=0;
  for(const b of document.querySelectorAll('[data-split]')) b.setAttribute('aria-pressed',b.dataset.split===split);
  options(); metricsForSplit(); show();
}

for(const b of document.querySelectorAll('[data-split]')) b.addEventListener('click',()=>{splitTo(b.dataset.split);syncUrl();});
for(const b of document.querySelectorAll('[data-mode]')) b.addEventListener('click',()=>{
  state.mode=b.dataset.mode;
  for(const other of document.querySelectorAll('[data-mode]')) other.setAttribute('aria-pressed',other===b);
  show();
});
for(const f of [search,category,sort]) f.addEventListener(f===search?'input':'change',()=>{state.page=0;show();});
for(const [id,step] of [['prev',-1],['next',1]]) el(id).addEventListener('click',()=>{
  state.page+=step;show();el('results-title').scrollIntoView({block:'start'});
});
el('open-anomaly').addEventListener('click',()=>openCase(byId.get(anomaly)));
dialog.addEventListener('close',()=>syncUrl());
splitTo(state.split);
if (byId.has(query.get('case'))) openCase(byId.get(query.get('case')));
