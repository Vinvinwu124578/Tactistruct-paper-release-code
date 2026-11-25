'use strict';

for (const album of document.querySelectorAll('.capture-photos')) {
  album.addEventListener('toggle', () => {
    const grid = album.querySelector('.photo-grid');
    if (!album.open || grid.childElementCount) return;
    const name = album.closest('article').querySelector('h2').textContent;
    for (let i = 1; i <= Number(album.dataset.count); i += 1) {
      const ordinal = String(i).padStart(2, '0');
      const file = `photos/${album.dataset.slug}-${ordinal}.webp`;
      const link = document.createElement('a');
      link.href = file;
      const image = document.createElement('img');
      image.src = file;
      image.alt = `${name} laboratory photo ${i}`;
      image.loading = 'lazy';
      link.append(image);
      grid.append(link);
    }
  });
}
