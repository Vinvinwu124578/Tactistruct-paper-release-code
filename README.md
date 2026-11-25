# Tacflow Paper Results Gallery

The static site contains 2,750 simulated tactile inputs and matching reconstructions.
The checkpoint is B regression, epoch 850. Each case uses 1,024 points from 40 patches.
One out-of-bounds test reference is explicitly flagged; the measured result is retained.

Raster previews, per-case metrics and the 1,024 model-input XYZ points are distributed. No raw CAD, weights,
experimental logs, or unpublished patch-run results are included.

The interactive mesh view loads each case's predicted vertices and triangle
indices on demand. The browser verifies the decoded geometry against its digest.

The 4-patch and 10-raw-patch protocols each cover the same 2,750 cases.
They include comparison previews, per-case metrics, and interactive views of
their saved prediction meshes and exact model-input points. The respective
asset branches contain only the geometry needed by these on-demand viewers.

The Real-World Experiments section shows laboratory photos, original TacTip
marker inputs, and predicted meshes for six captures. It publishes photos
and rendered views without raw tactile archives, robot coordinates, or model weights.
