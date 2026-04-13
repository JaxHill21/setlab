/* app.js — SetLab application logic */

(async () => {

  /* ============================================================
     1. Load data
  ============================================================ */
  let sets = [];
  try {
    const res = await fetch('data/sets.json');
    sets = await res.json();
  } catch (e) {
    console.error('Could not load sets.json', e);
    return;
  }

  // Sort newest first
  sets.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  /* ============================================================
     2. State
  ============================================================ */
  let currentIndex = 0;
  let currentSet = null;

  // Animation state
  let animRunning = true;
  let currentPhase = 0;
  let phaseProgress = 0;   // 0..1
  let lastTimestamp = null;
  let rafId = null;

  // Per-player trail history
  const trails = {};

  /* ============================================================
     3. Canvas setup
  ============================================================ */
  const canvas = document.getElementById('court-canvas');
  const ctx = canvas.getContext('2d');

  /* ============================================================
     4. DOM refs
  ============================================================ */
  const elTitle      = document.getElementById('set-title');
  const elEpBadge    = document.getElementById('ep-badge');
  const elEpCurrent  = document.getElementById('ep-current');
  const elEpTotal    = document.getElementById('ep-total');
  const elMetaCat    = document.getElementById('meta-category');
  const elMetaAction = document.getElementById('meta-action');
  const elMetaDate   = document.getElementById('meta-date');
  const elPhaseLabel = document.getElementById('phase-label');
  const elPhaseDots  = document.getElementById('phase-dots');
  const elPhaseCount = document.getElementById('phase-counter');
  const elProgressFill = document.getElementById('progress-fill');
  const elBreakdown  = document.getElementById('breakdown-text');
  const elReadsList  = document.getElementById('reads-list');
  const elFilmThumb  = document.getElementById('film-thumb');
  const elFilmLink   = document.getElementById('film-link');
  const elArchiveList = document.getElementById('archive-list');
  const btnPrev      = document.getElementById('btn-prev');
  const btnNext      = document.getElementById('btn-next');
  const btnPlayPause = document.getElementById('btn-playpause');
  const elPlayPauseIcon = document.getElementById('playpause-icon');

  // Tab switching
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });

  /* ============================================================
     5. Load a set into the UI
  ============================================================ */
  function loadSet(index) {
    currentIndex = index;
    currentSet = sets[index];

    // Reset animation
    currentPhase = 0;
    phaseProgress = 0;
    lastTimestamp = null;
    animRunning = true;
    Object.keys(trails).forEach(k => delete trails[k]);
    updatePlayPauseIcon();

    // Update header
    elEpBadge.textContent = `EP. ${currentSet.episode}`;
    elEpCurrent.textContent = index + 1;
    elEpTotal.textContent = sets.length;

    // Update title strip
    elTitle.textContent = currentSet.title;
    elMetaCat.textContent = currentSet.category;
    elMetaAction.textContent = currentSet.action;
    elMetaDate.textContent = formatDate(currentSet.pubDate);

    // Breakdown
    elBreakdown.textContent = currentSet.breakdown;

    // Key reads (generated from phase labels)
    elReadsList.innerHTML = '';
    currentSet.phases.slice(1).forEach(phase => {
      const item = document.createElement('div');
      item.className = 'read-item';
      item.innerHTML = `<span class="read-bullet"></span><span>${phase.label}</span>`;
      elReadsList.appendChild(item);
    });

    // Film tab
    elFilmThumb.src = currentSet.thumbnail;
    elFilmThumb.alt = currentSet.title + ' — Coach Chang';
    elFilmLink.href = currentSet.facebookUrl;
    document.querySelector('.film-thumb-wrap').onclick = () => {
      window.open(currentSet.facebookUrl, '_blank', 'noopener');
    };

    // Phase dots
    elPhaseDots.innerHTML = '';
    currentSet.phases.forEach((_, i) => {
      const dot = document.createElement('div');
      dot.className = 'phase-dot' + (i === 0 ? ' active' : '');
      dot.id = `pdot-${i}`;
      elPhaseDots.appendChild(dot);
    });

    // Nav buttons
    btnPrev.disabled = index === 0;
    btnNext.disabled = index === sets.length - 1;

    // Archive highlight
    document.querySelectorAll('.archive-item').forEach((el, i) => {
      el.classList.toggle('active', i === index);
    });
  }

  /* ============================================================
     6. Build archive
  ============================================================ */
  function buildArchive() {
    elArchiveList.innerHTML = '';
    sets.forEach((set, i) => {
      const item = document.createElement('div');
      item.className = 'archive-item' + (i === 0 ? ' active' : '');
      item.innerHTML = `
        <span class="archive-ep">EP. ${set.episode}</span>
        <span class="archive-title">${set.title}</span>
        <span class="archive-date">${formatDate(set.pubDate)}</span>
      `;
      item.addEventListener('click', () => loadSet(i));
      elArchiveList.appendChild(item);
    });
    elEpTotal.textContent = sets.length;
  }

  /* ============================================================
     7. Animation loop
  ============================================================ */
  function animate(timestamp) {
    if (!currentSet) { rafId = requestAnimationFrame(animate); return; }

    const phases = currentSet.phases;
    const phase = phases[currentPhase];
    const nextPhase = phases[currentPhase + 1] || phases[0];

    // Advance progress
    if (animRunning) {
      if (lastTimestamp !== null) {
        const delta = timestamp - lastTimestamp;
        phaseProgress += delta / phase.duration;
      }
      lastTimestamp = timestamp;
    } else {
      lastTimestamp = null;
    }

    // Advance to next phase or loop
    if (phaseProgress >= 1) {
      phaseProgress = 0;
      currentPhase = (currentPhase + 1) % phases.length;
      // Clear trails on loop restart
      if (currentPhase === 0) {
        Object.keys(trails).forEach(k => trails[k] = []);
      }
      updatePhaseUI();
    }

    // Compute current player positions
    const positions = {};
    const fromPos = phase.positions;
    const toPos = nextPhase.positions;
    currentSet.players.forEach(p => {
      const from = fromPos[p.id];
      const to = toPos[p.id];
      positions[p.id] = CourtRenderer.bezierPoint(from, to, phaseProgress);
    });

    // Update trails
    currentSet.players.forEach(p => {
      if (!trails[p.id]) trails[p.id] = [];
      trails[p.id].push([...positions[p.id]]);
      if (trails[p.id].length > 28) trails[p.id].shift();
    });

    // Progress bar: overall progress across all phases
    const totalDuration = currentSet.phases.reduce((s, ph) => s + ph.duration, 0);
    let elapsed = 0;
    for (let i = 0; i < currentPhase; i++) elapsed += phases[i].duration;
    elapsed += phaseProgress * phase.duration;
    elProgressFill.style.width = ((elapsed / totalDuration) * 100).toFixed(1) + '%';

    // Draw
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    CourtRenderer.drawCourt(ctx);

    // Trails
    currentSet.players.forEach(p => {
      if (trails[p.id]) CourtRenderer.drawTrail(ctx, trails[p.id], p.color);
    });

    // Players (ball handler — id "1" — drawn last / on top with glow)
    const sorted = [...currentSet.players].sort(a => a.id === '1' ? 1 : -1);
    sorted.forEach(p => {
      const pos = positions[p.id];
      CourtRenderer.drawPlayer(ctx, pos[0], pos[1], p.label, p.color, p.id === '1');
    });

    rafId = requestAnimationFrame(animate);
  }

  function updatePhaseUI() {
    const phases = currentSet.phases;
    elPhaseLabel.textContent = phases[currentPhase].label;
    elPhaseCount.textContent = `${currentPhase + 1} / ${phases.length}`;
    document.querySelectorAll('.phase-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i === currentPhase);
    });
  }

  /* ============================================================
     8. Controls
  ============================================================ */
  function updatePlayPauseIcon() {
    elPlayPauseIcon.innerHTML = animRunning ? '&#9646;&#9646;' : '&#9654;';
  }

  btnPlayPause.addEventListener('click', () => {
    animRunning = !animRunning;
    if (animRunning) lastTimestamp = null;
    updatePlayPauseIcon();
  });

  btnPrev.addEventListener('click', () => {
    if (currentIndex > 0) loadSet(currentIndex - 1);
  });

  btnNext.addEventListener('click', () => {
    if (currentIndex < sets.length - 1) loadSet(currentIndex + 1);
  });

  // Keyboard nav
  document.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' && currentIndex > 0) loadSet(currentIndex - 1);
    if (e.key === 'ArrowRight' && currentIndex < sets.length - 1) loadSet(currentIndex + 1);
    if (e.key === ' ') { e.preventDefault(); btnPlayPause.click(); }
  });

  /* ============================================================
     9. Helpers
  ============================================================ */
  function formatDate(iso) {
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  /* ============================================================
     10. Init
  ============================================================ */
  buildArchive();
  loadSet(0);
  updatePhaseUI();
  rafId = requestAnimationFrame(animate);

})();
