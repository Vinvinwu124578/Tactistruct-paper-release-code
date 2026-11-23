'use strict';

function setPatchDetailImage(image, item) {
  const protocol = document.querySelector('main > .inputs [aria-current="page"]').dataset.inputMode;
  const preview = 'comparisons/' + item.id + '.avif';
  const original = 'https://raw.githubusercontent.com/Vinvinwu124578/Tactistruct-paper-release-code/16ee5803b84db6d109b09219816b56bf2d8cb48e/'
    + protocol + '/' + item.id + '.webp';
  const link = document.getElementById('detail-full-image');
  const warning = document.getElementById('detail-image-warning');
  link.href = original;
  link.hidden = true;
  warning.hidden = true;
  image.onload = () => {
    if (image.naturalWidth === 1408 && image.naturalHeight === 512) link.hidden = false;
  };
  image.onerror = () => {
    image.onerror = null;
    warning.hidden = false;
    image.src = preview;
  };
  image.src = original;
}

function setPatchDetailViewers(item){
  const mode=document.querySelector('main > .inputs [aria-current="page"]').dataset.inputMode;
  const query='?'+new URLSearchParams({mode,case:item.id,embed:'1'});
  document.getElementById('inline-points').src='../patch-points.html'+query;
  document.getElementById('inline-mesh').src='../mesh.html'+query;
}

document.getElementById('detail').addEventListener('close',()=>{
  for(const id of ['inline-points','inline-mesh'])document.getElementById(id).removeAttribute('src');
});
