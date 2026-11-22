
import { rotate } from './guide.js';

export function furnitureDimensions(guide) {
  if (!guide.panels?.length) return null;

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  for (const panel of guide.panels) {
    const size = guide.parts?.[panel.part]?.size_mm;

    if (!size || size.length !== 3 ||
        !size.every(v => Number.isFinite(v) && v > 0)) {
      return null;
    }

    for (const x of [-1, 1]) {
      for (const y of [-1, 1]) {
        for (const z of [-1, 1]) {
          const corner = rotate(
            [x * size[0] / 2, y * size[1] / 2, z * size[2] / 2],
            panel.rot
          );

          corner.forEach((v, i) => {
            const world = v + panel.pos[i];
            min[i] = Math.min(min[i], world);
            max[i] = Math.max(max[i], world);
          });
        }
      }
    }
  }

  const [width, height, depth] = max.map((v, i) => v - min[i]);

  if (![width, height, depth].every(v =>
    Number.isFinite(v) && v > 0
  )) return null;

  const cm = mm => Math.round(mm / 10 * 10) / 10;
  const m2 = mm2 => Math.round(mm2 / 1_000_000 * 100) / 100;

  return {
    width_cm: cm(width),
    height_cm: cm(height),
    depth_cm: cm(depth),
    wall_m2: m2(width * height),
    floor_m2: m2(width * depth)
  };
}
