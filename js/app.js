/* app.js — SetLab application logic
   - Loads sets.json for diagram data
   - Fetches RSS feed to auto-surface new episodes (title, thumbnail, link)
   - Animated court with persistent movement paths
   - YouTube search embed for film reference
*/

(async () => {

  /* ============================================================
     CONFIG
  ============================================================ */
  const RSS_PROXY = 'https://api.allorigins.win/get?url=' +
    encodeURIComponent('https://rss.app/feeds/8H2DOBqqibOJJI2O.xml');

  /* ============================================================
     1. Load local diagram data
  ============================================================ */
  let sets = [];
  try {
    const res = await fetch('data/sets.json');
    if (!res.ok) throw new Error('sets.json not found');
    sets = await res.json();
  } catch (e) {
    console.error('Could not load sets.json:', e);
    document.getElementById('set-title').textContent = 'Could not load sets. Check console.';
    return;
  }
  sets.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  /* ============================================================
     2. Fetch RSS to merge in any new episodes not yet in sets.json
     (auto-updates title, thumbnail, link for known episodes;
      surfaces unknowns as "coming soon" placeholders)
  ============================================================ */
  try {
    const rssRes = await fetch(RSS_PROXY);
    const rssJson = await rssRes.json();
    const parser = new DOMParser();
    const doc = parser.parseFromString(rssJson.contents, 'text/xml');
    const items = Array.from(doc.querySelectorAll('item'));

    items.forEach(item => {
      const rawTitle = item.querySelector('title')?.textContent || '';
      const link     = item.querySelector('link')?.textContent || '';
      const thumb    = item.querySelector('content')?.getAttribute('url') || '';
      const pubDate  = item.querySelector('pubDate')?.textContent || '';

      // Parse episode number and set name from "Coffee and Sets Episode NNN: NAME #..."
      const epMatch   = rawTitle.match(/Episode\s+(\d+)/i);
      const nameMatch = rawTitle.match(/Episode\s+\d+:\s*([^#\n]+)/i);
      if (!epMatch) return;

      const epNum    = parseInt(epMatch[1]);
      const setName  = nameMatch ? nameMatch[1].trim() : rawTitle;
      const existing = sets.find(s => s.episode === epNum);

      if (existing) {
        // Refresh live RSS data into existing entry (thumbnail URLs expire)
        if (thumb) existing.thumbnail = thumb;
        if (link)  existing.facebookUrl = link;
      } else {
        // New episode not yet in sets.json — add as placeholder
        sets.push({
          episode:      epNum,
          slug:         'ep-' + epNum,
          title:        setName,
          pubDate:      new Date(pubDate).toISOString().split('T')[0],
          category:     'Half-court',
          action:       '—',
          facebookUrl:  link,
          youtubeSearch: setName + ' basketball set NBA',
          thumbnail:    thumb,
          breakdown:    'Diagram coming soon — check back after the next update.',
          players:      defaultPlayers(),
          phases:       defaultPhases()
        });
      }
    });

    sets.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  } catch (e) {
    // RSS fetch failed silently — sets.json data still works fine
    console.warn('RSS fetch failed, using local data only:', e);
  }

  /* ============================================================
     3. Default players/phases for auto-surfaced RSS episodes
  ============================================================ */
  function defaultPlayers() {
    return [
      { id: '1', label: '1', color: '#E85D24', start: [260, 210] },
      { id: '2', label: '2', color: '#3B8BD4', start: [110, 155] },
      { id: '3', label: '3', color: '#3B8BD4', start: [410, 155] },
      { id: '4', label: '4', color: '#1D9E75', start: [195, 115] },
      { id: '5', label: '5', color: '#1D9E75', start: [325, 115] }
    ];
  }
  function defaultPhases() {
    return [
      { duration: 3000, label: 'Diagram coming soon', ballHolder: '1',
        positions: { '1': [260,210], '2': [110,155], '3': [410,155], '4': [195,115], '5': [325,115] } }
    ];
  }

  /* ============================================================
     4. State
  ============================================================ */
  let currentIndex = 0;
  let currentSet   = null;

  let animRunning   = true;
  let currentPhase  = 0;
  let phaseProgress = 0;
  let lastTimestamp = null;
  let rafId         = null;

  // Per-player: short trail (recent dots) + full path history across phases
  const trails      = {};   // { id: [[x,y]...] } rolling window
  const pathHistory = {};   // { id: [[x,y]...] } all phase waypoints so far

  /* ============================================================
     5. Canvas
  ============================================================ */
  const canvas = document.getElementById('court-canvas');
  const ctx    = canvas.getContext('2d');

  /* ============================================================
     6. DOM refs
  ============================================================ */
  const elTitle       = document.getElementById('set-title');
  const elEpBadge     = document.getElementById('ep-badge');
  const elEpCurrent   = document.getElementById('ep-current');
  const elEpTotal     = document.getElementById('ep-total');
  const elMetaCat     = document.getElementById('meta-category');
  const elMetaAction  = document.getElementById('meta-action');
  const elMetaDate    = document.getElementById('meta-date');
  const elPhaseLabel  = document.getElementById('phase-label');
  const elPhaseDots   = document.getElementById('phase-dots');
  const elPhaseCount  = document.getElementById('phase-counter');
  const elProgressFill= document.getElementById('progress-fill');
  const elBreakdown   = document.getElementById('breakdown-text');
  const elReadsList   = document.getElementById('reads-list');
  const elFilmThumb   = document.getElementById('film-thumb');
  const elFilmLink    = document.getElementById('film-link');
  const elArchiveList = document.getElementById('archive-list');
  const btnPrev       = document.getElementById('btn-prev');
  const btnNext       = document.getElementById('btn-next');
  const btnPlayPause  = document.getElementById('btn-playpause');
  const elPlayIcon    = document.getElementById('playpause-icon');
  const elYTEmbed     = document.getElementById('yt-embed-area');

  /* ============================================================
     7. Tab switching
  ============================================================ */
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });

  /* ============================================================
     8. Load a set
  ============================================================ */
  function loadSet(index) {
    currentIndex  = index;
    currentSet    = sets[index];

    // Reset animation
    currentPhase  = 0;
    phaseProgress = 0;
    lastTimestamp = null;
    animRunning   = true;
    Object.keys(trails).forEach(k => delete trails[k]);
    Object.keys(pathHistory).forEach(k => delete pathHistory[k]);

    // Seed pathHistory with starting positions
    currentSet.players.forEach(p => {
      pathHistory[p.id] = [[...currentSet.phases[0].positions[p.id]]];
      trails[p.id] = [];
    });

    updatePlayPauseIcon();

    // Header
    elEpBadge.textContent   = `EP. ${currentSet.episode}`;
    elEpCurrent.textContent = index + 1;
    elEpTotal.textContent   = sets.length;

    // Title strip
    elTitle.textContent      = currentSet.title;
    elMetaCat.textContent    = currentSet.category;
    elMetaAction.textContent = currentSet.action;
    elMetaDate.textContent   = formatDate(currentSet.pubDate);

    // Breakdown
    elBreakdown.textContent = currentSet.breakdown;

    // Key reads from phase labels
    elReadsList.innerHTML = '';
    currentSet.phases.slice(1).forEach(phase => {
      const item = document.createElement('div');
      item.className = 'read-item';
      item.innerHTML = `<span class="read-bullet"></span><span>${phase.label}</span>`;
      elReadsList.appendChild(item);
    });

    // Film tab — thumbnail + facebook link
    elFilmThumb.src  = currentSet.thumbnail;
    elFilmThumb.alt  = currentSet.title;
    elFilmLink.href  = currentSet.facebookUrl;
    document.querySelector('.film-thumb-wrap').onclick = () =>
      window.open(currentSet.facebookUrl, '_blank', 'noopener');

    // YouTube search embed
    buildYTEmbed(currentSet.youtubeSearch || currentSet.title + ' basketball set NBA');

    // Phase dots
    elPhaseDots.innerHTML = '';
    currentSet.phases.forEach((_, i) => {
      const dot = document.createElement('div');
      dot.className = 'phase-dot' + (i === 0 ? ' active' : '');
      dot.id = `pdot-${i}`;
      elPhaseDots.appendChild(dot);
    });

    // Nav
    btnPrev.disabled = index === 0;
    btnNext.disabled = index === sets.length - 1;

    // Archive highlight
    document.querySelectorAll('.archive-item').forEach((el, i) => {
      el.classList.toggle('active', i === index);
    });

    updatePhaseUI();
  }

  /* ============================================================
     9. YouTube search embed
  ============================================================ */
  function buildYTEmbed(searchQuery) {
    if (!elYTEmbed) return;
    const encoded = encodeURIComponent(searchQuery);
    // YouTube search embedded in iframe — shows results inline, fully embeddable
    elYTEmbed.innerHTML = `
      <div class="yt-header">
        <span class="yt-label">FILM REFERENCE</span>
        <span class="yt-sub">YouTube search results for this set</span>
      </div>
      <div class="yt-frame-wrap">
        <iframe
          src="https://www.youtube.com/results?search_query=${encoded}&embedded=1"
          title="YouTube search: ${searchQuery}"
          frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen
          loading="lazy"
        ></iframe>
      </div>
      <a class="yt-open-link" href="https://www.youtube.com/results?search_query=${encoded}"
         target="_blank" rel="noopener">
        Open in YouTube &#8599;
      </a>
    `;
  }

  /* ============================================================
     10. Archive
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
     11. Animation loop
  ============================================================ */
  function animate(timestamp) {
    if (!currentSet) { rafId = requestAnimationFrame(animate); return; }

    const phases    = currentSet.phases;
    const phase     = phases[currentPhase];
    const nextPhase = phases[(currentPhase + 1) % phases.length];

    // Advance time
    if (animRunning && lastTimestamp !== null) {
      phaseProgress += (timestamp - lastTimestamp) / phase.duration;
    }
    lastTimestamp = animRunning ? timestamp : null;

    // Phase transition
    if (phaseProgress >= 1) {
      phaseProgress = 0;
      const wasLast = (currentPhase === phases.length - 1);
      currentPhase = (currentPhase + 1) % phases.length;

      if (wasLast) {
        // Full loop restart — clear paths
        Object.keys(trails).forEach(k => trails[k] = []);
        Object.keys(pathHistory).forEach(k => {
          pathHistory[k] = [[...phases[0].positions[k]]];
        });
      } else {
        // Record new waypoints into path history
        currentSet.players.forEach(p => {
          if (!pathHistory[p.id]) pathHistory[p.id] = [];
          pathHistory[p.id].push([...phases[currentPhase].positions[p.id]]);
        });
      }
      updatePhaseUI();
    }

    // Compute interpolated positions
    const positions = {};
    currentSet.players.forEach(p => {
      const from = phase.positions[p.id];
      const to   = nextPhase.positions[p.id];
      positions[p.id] = CourtRenderer.bezierPoint(from, to, phaseProgress);
    });

    // Update trails (rolling 32-frame window)
    currentSet.players.forEach(p => {
      if (!trails[p.id]) trails[p.id] = [];
      trails[p.id].push([...positions[p.id]]);
      if (trails[p.id].length > 32) trails[p.id].shift();
    });

    // Progress bar
    const totalDur = phases.reduce((s, ph) => s + ph.duration, 0);
    let elapsed = 0;
    for (let i = 0; i < currentPhase; i++) elapsed += phases[i].duration;
    elapsed += phaseProgress * phase.duration;
    elProgressFill.style.width = Math.min((elapsed / totalDur) * 100, 100).toFixed(1) + '%';

    // ---- DRAW ----
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    CourtRenderer.drawCourt(ctx);

    // Draw persistent movement paths for all players
    currentSet.players.forEach(p => {
      if (pathHistory[p.id] && pathHistory[p.id].length > 1) {
        CourtRenderer.drawPaths(ctx, pathHistory[p.id], p.color);
      }
    });

    // Draw motion trails
    currentSet.players.forEach(p => {
      CourtRenderer.drawTrail(ctx, trails[p.id], p.color);
    });

    // Draw players (ball handler on top)
    const ballHolderId = phase.ballHolder || '1';
    const sorted = [...currentSet.players].sort(a => a.id === ballHolderId ? 1 : -1);
    sorted.forEach(p => {
      const pos = positions[p.id];
      CourtRenderer.drawPlayer(ctx, pos[0], pos[1], p.label, p.color, p.id === ballHolderId);
    });

    // Draw basketball on ball holder
    const ballPos = positions[ballHolderId];
    CourtRenderer.drawBall(ctx, ballPos[0], ballPos[1]);

    rafId = requestAnimationFrame(animate);
  }

  /* ============================================================
     12. Phase UI
  ============================================================ */
  function updatePhaseUI() {
    const phases = currentSet.phases;
    elPhaseLabel.textContent = phases[currentPhase].label;
    elPhaseCount.textContent = `${currentPhase + 1} / ${phases.length}`;
    document.querySelectorAll('.phase-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i === currentPhase);
    });
  }

  /* ============================================================
     13. Controls
  ============================================================ */
  function updatePlayPauseIcon() {
    elPlayIcon.innerHTML = animRunning ? '&#9646;&#9646;' : '&#9654;';
  }

  btnPlayPause.addEventListener('click', () => {
    animRunning = !animRunning;
    if (animRunning) lastTimestamp = null;
    updatePlayPauseIcon();
  });

  btnPrev.addEventListener('click', () => { if (currentIndex > 0) loadSet(currentIndex - 1); });
  btnNext.addEventListener('click', () => { if (currentIndex < sets.length - 1) loadSet(currentIndex + 1); });

  document.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft'  && currentIndex > 0)              loadSet(currentIndex - 1);
    if (e.key === 'ArrowRight' && currentIndex < sets.length - 1) loadSet(currentIndex + 1);
    if (e.key === ' ') { e.preventDefault(); btnPlayPause.click(); }
  });

  /* ============================================================
     14. Helpers
  ============================================================ */
  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  /* ============================================================
     15. Init
  ============================================================ */
  buildArchive();
  loadSet(0);
  rafId = requestAnimationFrame(animate);

})();
