/* court.js — Canvas renderer for animated basketball sets */

const CourtRenderer = (() => {
  const W = 520;
  const H = 340;
  const RIM = [W / 2, 22];

  function drawCourt(ctx) {
    ctx.fillStyle = '#0e0e0e';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(255,255,255,0.018)';
    ctx.lineWidth = 1;
    for (let y = 0; y < H; y += 6) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(14, 10, W - 28, H - 20);

    ctx.beginPath();
    ctx.moveTo(14, H / 2);
    ctx.lineTo(W - 14, H / 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(W / 2, H / 2, 44, Math.PI, 2 * Math.PI);
    ctx.stroke();

    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.strokeRect(180, 10, 160, 132);

    ctx.beginPath();
    ctx.moveTo(180, 142);
    ctx.lineTo(340, 142);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(W / 2, 142, 80, Math.PI, 2 * Math.PI);
    ctx.stroke();

    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.arc(W / 2, 142, 80, 0, Math.PI);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.moveTo(75, 10);
    ctx.lineTo(75, 72);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(445, 10);
    ctx.lineTo(445, 72);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(W / 2, 20, 236, Math.PI + 0.30, 2 * Math.PI - 0.30);
    ctx.stroke();

    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(W / 2, 20, 40, Math.PI + 0.15, 2 * Math.PI - 0.15);
    ctx.stroke();

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.moveTo(W / 2 - 28, 10);
    ctx.lineTo(W / 2 + 28, 10);
    ctx.stroke();

    ctx.lineWidth = 2;
    ctx.strokeStyle = '#E85D24';
    ctx.beginPath();
    ctx.arc(RIM[0], RIM[1], 11, 0, 2 * Math.PI);
    ctx.stroke();

    ctx.fillStyle = 'rgba(232,93,36,0.5)';
    ctx.beginPath();
    ctx.arc(RIM[0], RIM[1], 3, 0, 2 * Math.PI);
    ctx.fill();

    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    [42, 62, 88, 108].forEach(y => {
      ctx.beginPath();
      ctx.moveTo(180, y);
      ctx.lineTo(168, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(340, y);
      ctx.lineTo(352, y);
      ctx.stroke();
    });
  }

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  function clamp01(t) {
    return Math.max(0, Math.min(1, t));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function lerpPoint(a, b, t) {
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
  }

  function distance(a, b) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    return Math.hypot(dx, dy);
  }

  function autoViaPoint(p0, p1, route = {}) {
    const dx = p1[0] - p0[0];
    const dy = p1[1] - p0[1];
    const len = Math.hypot(dx, dy) || 1;
    const mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
    const side = route.side === -1 ? -1 : 1;
    const lift = route.lift != null ? route.lift : Math.min(len * 0.2, 26);
    return [mid[0] - (dy / len) * lift * side, mid[1] + (dx / len) * lift * side];
  }

  function quadraticPoint(p0, cp, p1, t) {
    const u = 1 - t;
    return [
      (u * u * p0[0]) + (2 * u * t * cp[0]) + (t * t * p1[0]),
      (u * u * p0[1]) + (2 * u * t * cp[1]) + (t * t * p1[1])
    ];
  }

  function polylinePoint(points, t) {
    if (points.length === 1) return [...points[0]];
    const segments = [];
    let total = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const len = distance(points[i], points[i + 1]);
      segments.push(len);
      total += len;
    }
    if (!total) return [...points[points.length - 1]];

    let target = total * clamp01(t);
    for (let i = 0; i < segments.length; i++) {
      if (target <= segments[i] || i === segments.length - 1) {
        const local = segments[i] ? target / segments[i] : 1;
        return lerpPoint(points[i], points[i + 1], local);
      }
      target -= segments[i];
    }
    return [...points[points.length - 1]];
  }

  function samplePolyline(points, segmentsPerLeg = 14) {
    const sampled = [];
    for (let i = 0; i < points.length - 1; i++) {
      for (let s = 0; s < segmentsPerLeg; s++) {
        sampled.push(lerpPoint(points[i], points[i + 1], s / segmentsPerLeg));
      }
    }
    sampled.push(points[points.length - 1]);
    return sampled;
  }

  function interpolateMovement(p0, p1, t, route = null) {
    const eased = easeInOut(clamp01(t));
    const mode = route?.type || (route?.via ? 'arc' : 'line');

    if (mode === 'hold') return [...p0];

    if (mode === 'poly' && Array.isArray(route?.via) && route.via.length) {
      const points = [p0, ...route.via, p1];
      return polylinePoint(points, eased);
    }

    if ((mode === 'arc' || route?.via) && Array.isArray(route?.via) && route.via.length === 2) {
      return quadraticPoint(p0, route.via, p1, eased);
    }

    if (mode === 'arc') {
      const cp = autoViaPoint(p0, p1, route || {});
      return quadraticPoint(p0, cp, p1, eased);
    }

    return lerpPoint(p0, p1, eased);
  }

  function sampleRoute(p0, p1, route = null, samples = 24) {
    const mode = route?.type || (route?.via ? 'arc' : 'line');
    if (mode === 'hold') return [p0, p1];

    if (mode === 'poly' && Array.isArray(route?.via) && route.via.length) {
      return samplePolyline([p0, ...route.via, p1]);
    }

    if ((mode === 'arc' || route?.via) && Array.isArray(route?.via) && route.via.length === 2) {
      const pts = [];
      for (let i = 0; i <= samples; i++) {
        pts.push(quadraticPoint(p0, route.via, p1, i / samples));
      }
      return pts;
    }

    if (mode === 'arc') {
      const cp = autoViaPoint(p0, p1, route || {});
      const pts = [];
      for (let i = 0; i <= samples; i++) {
        pts.push(quadraticPoint(p0, cp, p1, i / samples));
      }
      return pts;
    }

    return [p0, p1];
  }

  function drawTrail(ctx, trail, color) {
    if (!trail || trail.length < 2) return;
    for (let i = 1; i < trail.length; i++) {
      const alpha = (i / trail.length) * 0.28;
      const radius = 1.6 + (i / trail.length) * 1.6;
      ctx.beginPath();
      ctx.arc(trail[i][0], trail[i][1], radius, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawRouteGuide(ctx, points, color, opts = {}) {
    if (!points || points.length < 2) return;
    const last = points[points.length - 1];
    const prev = points[Math.max(0, points.length - 2)];

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = opts.lineWidth || 1.6;
    ctx.globalAlpha = opts.alpha ?? 0.35;
    ctx.setLineDash(opts.dash || [6, 5]);

    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    const angle = Math.atan2(last[1] - prev[1], last[0] - prev[0]);
    const size = opts.arrowSize || 7;
    ctx.beginPath();
    ctx.moveTo(last[0], last[1]);
    ctx.lineTo(last[0] - Math.cos(angle - Math.PI / 6) * size, last[1] - Math.sin(angle - Math.PI / 6) * size);
    ctx.lineTo(last[0] - Math.cos(angle + Math.PI / 6) * size, last[1] - Math.sin(angle + Math.PI / 6) * size);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.globalAlpha = opts.arrowAlpha ?? Math.min((opts.alpha ?? 0.35) + 0.15, 0.75);
    ctx.fill();
    ctx.restore();
  }

  function drawPlayer(ctx, x, y, label, color, isActive) {
    const r = 14;
    if (isActive) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
    }

    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.globalAlpha = isActive ? 1 : 0.9;
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

  function drawBall(ctx, x, y, opts = {}) {
    const bx = opts.stickToPlayer ? x + 10 : x;
    const by = opts.stickToPlayer ? y - 10 : y;
    const radius = opts.radius || 5;

    ctx.beginPath();
    ctx.arc(bx, by, radius, 0, 2 * Math.PI);
    ctx.fillStyle = '#E85D24';
    ctx.shadowColor = '#E85D24';
    ctx.shadowBlur = opts.flying ? 14 : 8;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(bx, by, radius, 0.2, Math.PI - 0.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(bx, by, radius, Math.PI + 0.2, 2 * Math.PI - 0.2);
    ctx.stroke();
  }

  return {
    W,
    H,
    RIM,
    drawCourt,
    drawTrail,
    drawRouteGuide,
    drawPlayer,
    drawBall,
    interpolateMovement,
    sampleRoute,
    lerpPoint,
    easeInOut,
    clamp01,
    distance
  };
})();
