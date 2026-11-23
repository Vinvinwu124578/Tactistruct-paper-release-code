'use strict';

const patchInputProtocol = document.querySelector('main > .inputs [aria-current="page"]').dataset.inputMode;
const patchImageBase = 'https://raw.githubusercontent.com/Vinvinwu124578/Tactistruct-paper-release-code/16ee5803b84db6d109b09219816b56bf2d8cb48e/'
  + patchInputProtocol + '/';

function loadPatchImage(image, item, onFallback) {
  image.onerror = () => {
    image.onerror = null;
    if (onFallback) onFallback();
    image.src = 'comparisons/' + item.id + '.avif';
  };
  image.src = patchImageBase + item.id + '.webp';
}

function setPatchDetailImage(image, item) {
  const link = document.getElementById('detail-full-image');
  const warning = document.getElementById('detail-image-warning');
  link.href = patchImageBase + item.id + '.webp';
  link.hidden = true;
  warning.hidden = true;
  image.onload = () => {
    if (image.naturalWidth === 1408 && image.naturalHeight === 512) link.hidden = false;
  };
  loadPatchImage(image, item, () => { warning.hidden = false; });
}

function setPatchDetailViewers(item){
  const query='?'+new URLSearchParams({mode:patchInputProtocol,case:item.id,embed:'1'});
  document.getElementById('inline-points').src='../patch-points.html'+query;
  document.getElementById('inline-mesh').src='../mesh.html'+query;
}

document.getElementById('detail').addEventListener('close',()=>{
  for(const id of ['inline-points','inline-mesh'])document.getElementById(id).removeAttribute('src');
});
