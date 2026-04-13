/* court.js — Canvas renderer for animated basketball sets */

const CourtRenderer = (() => {

  const W = 520, H = 340;
  // Court is drawn top-down, basket at top center
  // Paint: x=180-340, y=10-140
  // 3pt arc baseline points approx x=75, x=445

  /* ---- Draw the hardwood court ---- */
  function drawCourt(ctx) {
    // Floor
    ctx.fillStyle = '#0e0e0e';
    ctx.fillRect(0, 0, W, H);

    // Wood grain texture (subtle horizontal lines)
    ctx.strokeStyle = 'rgba(255,255,255,0.018)';
    ctx.lineWidth = 1;
    for (let y = 0; y < H; y += 6) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Court boundary
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(14, 10, W - 28, H - 20);

    // Half-court line
    ctx.beginPath();
    ctx.moveTo(14, H / 2);
    ctx.lineTo(W - 14, H / 2);
    ctx.stroke();

    // Center circle (half)
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, 44, Math.PI, 2 * Math.PI);
    ctx.stroke();

    // ---- TOP HALF (our offensive end) ----
    const lw = 1.2;
    ctx.lineWidth = lw;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';

    // Paint / key box
    ctx.strokeRect(180, 10, 160, 132);

    // Free throw line
    ctx.beginPath();
    ctx.moveTo(180, 142); ctx.lineTo(340, 142);
    ctx.stroke();

    // Free throw circle top
    ctx.beginPath();
    ctx.arc(W / 2, 142, 80, Math.PI, 2 * Math.PI);
    ctx.stroke();

    // Free throw circle bottom (dashed)
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.arc(W / 2, 142, 80, 0, Math.PI);
    ctx.stroke();
    ctx.setLineDash([]);

    // 3-point arc
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    // Corner 3pt lines
    ctx.beginPath();
    ctx.moveTo(75, 10); ctx.lineTo(75, 72);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(445, 10); ctx.lineTo(445, 72);
    ctx.stroke();
    // Arc
    ctx.beginPath();
    ctx.arc(W / 2, 20, 236, Math.PI + 0.30, 2 * Math.PI - 0.30);
    ctx.stroke();

    // Restricted arc
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(W / 2, 20, 40, Math.PI + 0.15, 2 * Math.PI - 0.15);
    ctx.stroke();

    // Backboard
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.moveTo(W / 2 - 28, 10);
    ctx.lineTo(W / 2 + 28, 10);
    ctx.stroke();

    // Rim
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#E85D24';
    ctx.beginPath();
    ctx.arc(W / 2, 22, 11, 0, 2 * Math.PI);
    ctx.stroke();

    // Rim dot
    ctx.fillStyle = 'rgba(232,93,36,0.5)';
    ctx.beginPath();
    ctx.arc(W / 2, 22, 3, 0, 2 * Math.PI);
    ctx.fill();

    // Lane hash marks
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    const hashes = [42, 62, 88, 108];
    hashes.forEach(y => {
      ctx.beginPath(); ctx.moveTo(180, y); ctx.lineTo(168, y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(340, y); ctx.lineTo(352, y); ctx.stroke();
    });
  }

  /* ---- Cubic bezier interpolation ---- */
  function lerp(a, b, t) { return a + (b - a) * t; }

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  // Build a smooth curved path between two points via a midpoint offset
  function bezierPoint(p0, p1, t) {
    // Midpoint with perpendicular offset for curved paths
    const mx = (p0[0] + p1[0]) / 2;
    const my = (p0[1] + p1[1]) / 2;
    const dx = p1[0] - p0[0];
    const dy = p1[1] - p0[1];
    const len = Math.sqrt(dx * dx + dy * dy);
    // Curve amount — proportional to distance, max 30px
    const curve = Math.min(len * 0.25, 30);
    const cp = [mx - dy / len * curve, my + dx / len * curve];
    // Quadratic bezier
    const et = easeInOut(t);
    const bx = lerp(lerp(p0[0], cp[0], et), lerp(cp[0], p1[0], et), et);
    const by = lerp(lerp(p0[1], cp[1], et), lerp(cp[1], p1[1], et), et);
    return [bx, by];
  }

  /* ---- Draw a player circle ---- */
  function drawPlayer(ctx, x, y, label, color, isActive) {
    const r = 14;

    // Glow for active ball handler
    if (isActive) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 16;
    }

    // Circle fill
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.92;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Border
    ctx.strokeStyle = isActive ? '#fff' : 'rgba(255,255,255,0.3)';
    ctx.lineWidth = isActive ? 2 : 1;
    ctx.stroke();

    ctx.shadowBlur = 0;

    // Label
    ctx.fillStyle = '#fff';
    ctx.font = `600 12px 'Barlow Condensed', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + 1);
  }

  /* ---- Draw trail dots ---- */
  function drawTrail(ctx, trail, color) {
    trail.forEach((pt, i) => {
      const alpha = (i / trail.length) * 0.3;
      ctx.beginPath();
      ctx.arc(pt[0], pt[1], 2.5, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      ctx.fill();
      ctx.globalAlpha = 1;
    });
  }

  return { drawCourt, drawPlayer, drawTrail, bezierPoint, lerp, easeInOut };
})();
