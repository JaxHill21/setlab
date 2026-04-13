/* court.js — Canvas renderer for animated basketball sets */

const CourtRenderer = (() => {

  const W = 520, H = 340;

  function drawCourt(ctx) {
    // Floor
    ctx.fillStyle = '#0e0e0e';
    ctx.fillRect(0, 0, W, H);

    // Subtle wood grain
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
    ctx.beginPath(); ctx.moveTo(14, H / 2); ctx.lineTo(W - 14, H / 2); ctx.stroke();

    // Center circle (half)
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, 44, Math.PI, 2 * Math.PI);
    ctx.stroke();

    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';

    // Paint box
    ctx.strokeRect(180, 10, 160, 132);

    // Free throw line
    ctx.beginPath(); ctx.moveTo(180, 142); ctx.lineTo(340, 142); ctx.stroke();

    // FT circle top
    ctx.beginPath();
    ctx.arc(W / 2, 142, 80, Math.PI, 2 * Math.PI);
    ctx.stroke();

    // FT circle bottom (dashed)
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.arc(W / 2, 142, 80, 0, Math.PI);
    ctx.stroke();
    ctx.setLineDash([]);

    // 3pt lines
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath(); ctx.moveTo(75, 10); ctx.lineTo(75, 72); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(445, 10); ctx.lineTo(445, 72); ctx.stroke();
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
    ctx.beginPath(); ctx.moveTo(W/2 - 28, 10); ctx.lineTo(W/2 + 28, 10); ctx.stroke();

    // Rim
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#E85D24';
    ctx.beginPath(); ctx.arc(W / 2, 22, 11, 0, 2 * Math.PI); ctx.stroke();

    // Rim dot
    ctx.fillStyle = 'rgba(232,93,36,0.5)';
    ctx.beginPath(); ctx.arc(W / 2, 22, 3, 0, 2 * Math.PI); ctx.fill();

    // Lane hash marks
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    [42, 62, 88, 108].forEach(y => {
      ctx.beginPath(); ctx.moveTo(180, y); ctx.lineTo(168, y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(340, y); ctx.lineTo(352, y); ctx.stroke();
    });
  }

  // Easing
  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  // Lerp
  function lerp(a, b, t) { return a + (b - a) * t; }

  // Curved bezier point between two positions
  function bezierPoint(p0, p1, t) {
    const mx = (p0[0] + p1[0]) / 2;
    const my = (p0[1] + p1[1]) / 2;
    const dx = p1[0] - p0[0];
    const dy = p1[1] - p0[1];
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const curve = Math.min(len * 0.22, 28);
    const cp = [mx - (dy / len) * curve, my + (dx / len) * curve];
    const et = easeInOut(t);
    const bx = lerp(lerp(p0[0], cp[0], et), lerp(cp[0], p1[0], et), et);
    const by = lerp(lerp(p0[1], cp[1], et), lerp(cp[1], p1[1], et), et);
    return [bx, by];
  }

  // Draw persistent path lines between ALL historical positions for a player
  function drawPaths(ctx, pathHistory, color) {
    if (!pathHistory || pathHistory.length < 2) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.moveTo(pathHistory[0][0], pathHistory[0][1]);
    for (let i = 1; i < pathHistory.length; i++) {
      ctx.lineTo(pathHistory[i][0], pathHistory[i][1]);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Draw motion trail (recent positions, fading dots)
  function drawTrail(ctx, trail, color) {
    if (!trail || trail.length < 2) return;
    for (let i = 1; i < trail.length; i++) {
      const alpha = (i / trail.length) * 0.35;
      const radius = 2 + (i / trail.length) * 2;
      ctx.beginPath();
      ctx.arc(trail[i][0], trail[i][1], radius, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // Draw player circle
  function drawPlayer(ctx, x, y, label, color, isActive) {
    const r = 14;
    if (isActive) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.globalAlpha = isActive ? 1 : 0.88;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = isActive ? '#fff' : 'rgba(255,255,255,0.35)';
    ctx.lineWidth = isActive ? 2.5 : 1;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    ctx.font = `600 12px 'Barlow Condensed', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + 1);
  }

  // Draw the basketball (small orange circle near ball holder)
  function drawBall(ctx, x, y) {
    const bx = x + 10, by = y - 10;
    ctx.beginPath();
    ctx.arc(bx, by, 5, 0, 2 * Math.PI);
    ctx.fillStyle = '#E85D24';
    ctx.shadowColor = '#E85D24';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;
    // Ball seam lines
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(bx, by, 5, 0.2, Math.PI - 0.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(bx, by, 5, Math.PI + 0.2, 2 * Math.PI - 0.2);
    ctx.stroke();
  }

  return { drawCourt, drawPlayer, drawBall, drawTrail, drawPaths, bezierPoint, lerp, easeInOut };
})();
