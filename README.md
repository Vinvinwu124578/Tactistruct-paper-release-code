# Tacflow simulation gallery

The static site contains 2,750 simulated tactile inputs and matching reconstructions.
The checkpoint is B regression, epoch 850. Each case uses 1,024 points from 40 patches.
One out-of-bounds test reference is explicitly flagged; the measured result is retained.

Raster previews, per-case metrics and the 1,024 model-input XYZ points are distributed. No raw CAD, weights,
experimental logs, or unpublished patch-run results are included.

The interactive mesh view loads each case's predicted vertices and triangle
indices on demand. The browser verifies the decoded geometry against its digest.

The 4-patch and 10-raw-patch protocols each cover the same 2,750 cases.
These two modes publish compressed comparison previews and per-case metrics;
their underlying 3D assets are not included.
