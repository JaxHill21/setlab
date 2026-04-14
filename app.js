/* app.js — SetLab application logic
   - Loads local sets.json
   - Optionally merges live RSS metadata
   - Animates player movement, passes, handoffs, and shots
   - Supports optional custom route data per phase
*/

(async () => {
  const RSS_PROXY = 'https://api.allorigins.win/get?url=' +
    encodeURIComponent('https://rss.app/feeds/8H2DOBqqibOJJI2O.xml');
  const LOCAL_DATA_PATH = 'sets.json';

  let sets = [];
  try {
    const res = await fetch(LOCAL_DATA_PATH);
    if (!res.ok) throw new Error(`Could not load ${LOCAL_DATA_PATH}`);
    sets = (await res.json()).map(normalizeSet);
  } catch (err) {
    console.error('Could not load sets:', err);
    document.getElementById('set-title').textContent = 'Could not load sets.json';
    return;
  }

  sets.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  try {
    const rssRes = await fetch(RSS_PROXY);
    const rssJson = await rssRes.json();
    const parser = new DOMParser();
    const doc = parser.parseFromString(rssJson.contents, 'text/xml');
    const items = Array.from(doc.querySelectorAll('item'));

    items.forEach(item => {
      const rawTitle = item.querySelector('title')?.textContent || '';
      const link = item.querySelector('link')?.textContent || '';
      const thumb = item.querySelector('content')?.getAttribute('url') || '';
      const pubDate = item.querySelector('pubDate')?.textContent || '';

      const epMatch = rawTitle.match(/Episode\s+(\d+)/i);
      const nameMatch = rawTitle.match(/Episode\s+\d+:\s*([^#\n]+)/i);
      if (!epMatch) return;

      const episode = parseInt(epMatch[1], 10);
      const title = nameMatch ? nameMatch[1].trim() : rawTitle;
      const existing = sets.find(set => set.episode === episode);

      if (existing) {
        if (thumb) existing.thumbnail = thumb;
        if (link) existing.facebookUrl = link;
      } else {
        sets.push(normalizeSet({
          episode,
          slug: `ep-${episode}`,
          title,
          pubDate: new Date(pubDate).toISOString().split('T')[0],
          category: 'Half-court',
          action: '—',
          facebookUrl: link,
          youtubeSearch: `${title} basketball set NBA`,
          thumbnail: thumb,
          breakdown: 'Diagram coming soon — add custom routes and ball actions in sets.json.',
          players: defaultPlayers(),
          phases: defaultPhases()
        }));
      }
    });

    sets.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  } catch (err) {
    console.warn('RSS fetch failed. Using local data only.', err);
  }

  const canvas = document.getElementById('court-canvas');
  const ctx = canvas.getContext('2d');

  const elTitle = document.getElementById('set-title');
  const elEpBadge = document.getElementById('ep-badge');
  const elEpCurrent = document.getElementById('ep-current');
  const elEpTotal = document.getElementById('ep-total');
  const elMetaCat = document.getElementById('meta-category');
  const elMetaAction = document.getElementById('meta-action');
  const elMetaDate = document.getElementById('meta-date');
  const elPhaseLabel = document.getElementById('phase-label');
  const elPhaseDots = document.getElementById('phase-dots');
  const elPhaseCount = document.getElementById('phase-counter');
  const elProgressFill = document.getElementById('progress-fill');
  const elBreakdown = document.getElementById('breakdown-text');
  const elReadsList = document.getElementById('reads-list');
  const elFilmThumb = document.getElementById('film-thumb');
  const elFilmLink = document.getElementById('film-link');
  const elArchiveList = document.getElementById('archive-list');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const btnPlayPause = document.getElementById('btn-playpause');
  const elPlayIcon = document.getElementById('playpause-icon');
  const elYTEmbed = document.getElementById('yt-embed-area');

  let currentIndex = 0;
  let currentSet = null;
  let animRunning = true;
  let currentPhase = 0;
  let phaseProgress = 0;
  let lastTimestamp = null;
  const trails = {};

  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });

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
      {
        duration: 3000,
        label: 'Diagram coming soon',
        ballHolder: '1',
        positions: { '1': [260, 210], '2': [110, 155], '3': [410, 155], '4': [195, 115], '5': [325, 115] }
      }
    ];
  }

  function normalizeSet(set) {
    const players = (set.players || defaultPlayers()).map(player => ({
      ...player,
      label: player.label || player.id,
      color: player.color || '#3B8BD4'
    }));

    const fallbackPositions = Object.fromEntries(players.map(player => [player.id, player.start]));
    const phases = (set.phases?.length ? set.phases : defaultPhases()).map(phase => ({
      duration: phase.duration || 2400,
      label: phase.label || 'Action',
      ballHolder: phase.ballHolder || '1',
      positions: { ...fallbackPositions, ...(phase.positions || {}) },
      routes: phase.routes || {},
      ball: phase.ball || null
    }));

    return {
      ...set,
      players,
      phases,
      youtubeSearch: set.youtubeSearch || `${set.title} basketball set NBA`,
      thumbnail: set.thumbnail || '',
      facebookUrl: set.facebookUrl || '#'
    };
  }

  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(`${iso}T12:00:00`);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function buildArchive() {
    elArchiveList.innerHTML = '';
    sets.forEach((set, i) => {
      const item = document.createElement('div');
      item.className = `archive-item${i === 0 ? ' active' : ''}`;
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

  function buildFilmPanel(set) {
    elFilmThumb.src = set.thumbnail || '';
    elFilmThumb.alt = set.title || 'Set thumbnail';
    elFilmLink.href = set.facebookUrl || '#';
    document.querySelector('.film-thumb-wrap').onclick = () => {
      if (set.facebookUrl && set.facebookUrl !== '#') {
        window.open(set.facebookUrl, '_blank', 'noopener');
      }
    };

    if (!elYTEmbed) return;

    if (set.youtubeEmbed) {
      elYTEmbed.innerHTML = `
        <div class="yt-header">
          <span class="yt-label">MATCHING CLIP</span>
          <span class="yt-sub">Curated video for this exact action</span>
        </div>
        <div class="yt-frame-wrap">
          <iframe
            src="${set.youtubeEmbed}"
            title="${set.title} film clip"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen
            loading="lazy"
          ></iframe>
        </div>
      `;
      return;
    }

    const encoded = encodeURIComponent(set.youtubeSearch || `${set.title} basketball set NBA`);
    elYTEmbed.innerHTML = `
      <div class="yt-header">
        <span class="yt-label">FILM REFERENCE</span>
        <span class="yt-sub">Search YouTube for the closest live-game example</span>
      </div>
      <div class="video-placeholder">
        <p class="video-placeholder-copy">
          For GitHub-safe playback, this panel opens a search instead of embedding YouTube results.
          If you want an exact clip embedded here, add a <code>youtubeEmbed</code> URL to this set in <code>sets.json</code>.
        </p>
        <a class="film-link" href="https://www.youtube.com/results?search_query=${encoded}" target="_blank" rel="noopener">
          Search YouTube &#8599;
        </a>
      </div>
    `;
  }

  function loadSet(index) {
    currentIndex = index;
    currentSet = sets[index];
    currentPhase = 0;
    phaseProgress = 0;
    lastTimestamp = null;
    animRunning = true;

    currentSet.players.forEach(player => {
      trails[player.id] = [];
    });

    elEpBadge.textContent = `EP. ${currentSet.episode}`;
    elEpCurrent.textContent = index + 1;
    elEpTotal.textContent = sets.length;
    elTitle.textContent = currentSet.title;
    elMetaCat.textContent = currentSet.category || '—';
    elMetaAction.textContent = currentSet.action || '—';
    elMetaDate.textContent = formatDate(currentSet.pubDate);
    elBreakdown.textContent = currentSet.breakdown || '—';

    elReadsList.innerHTML = '';
    currentSet.phases.slice(1).forEach(phase => {
      const item = document.createElement('div');
      item.className = 'read-item';
      item.innerHTML = `<span class="read-bullet"></span><span>${phase.label}</span>`;
      elReadsList.appendChild(item);
    });

    buildFilmPanel(currentSet);

    elPhaseDots.innerHTML = '';
    currentSet.phases.forEach((_, i) => {
      const dot = document.createElement('div');
      dot.className = `phase-dot${i === 0 ? ' active' : ''}`;
      elPhaseDots.appendChild(dot);
    });

    btnPrev.disabled = index === 0;
    btnNext.disabled = index === sets.length - 1;

    document.querySelectorAll('.archive-item').forEach((el, i) => {
      el.classList.toggle('active', i === index);
    });

    updatePlayPauseIcon();
    updatePhaseUI();
  }

  function updatePhaseUI() {
    const phase = currentSet.phases[currentPhase];
    elPhaseLabel.textContent = phase.label;
    elPhaseCount.textContent = `${currentPhase + 1} / ${currentSet.phases.length}`;
    document.querySelectorAll('.phase-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i === currentPhase);
    });
  }

  function updatePlayPauseIcon() {
    elPlayIcon.innerHTML = animRunning ? '&#9646;&#9646;' : '&#9654;';
  }

  function getTransitionRoute(phase, playerId) {
    const route = phase.routes?.[playerId];
    if (!route) return null;
    return typeof route === 'string' ? { type: route } : route;
  }

  function getPlayerPosAtT(playerId, phase, nextPhase, t) {
    const from = phase.positions[playerId];
    const to = nextPhase.positions[playerId];
    const route = getTransitionRoute(phase, playerId);
    return CourtRenderer.interpolateMovement(from, to, t, route);
  }

  function resolveNamedTarget(target, phase, nextPhase, t) {
    if (target === 'rim') return [...CourtRenderer.RIM];
    if (Array.isArray(target) && target.length === 2) return [...target];
    if (typeof target === 'string' && phase.positions[target]) {
      return getPlayerPosAtT(target, phase, nextPhase, t);
    }
    return null;
  }

  function buildBallState(phase, nextPhase, t) {
    const explicit = phase.ball;
    const fallbackFromHolder = phase.ballHolder || '1';
    const fallbackToHolder = nextPhase.ballHolder || fallbackFromHolder;

    if (!explicit && fallbackFromHolder === fallbackToHolder) {
      const holderPos = getPlayerPosAtT(fallbackFromHolder, phase, nextPhase, t);
      return {
        x: holderPos[0],
        y: holderPos[1],
        mode: 'hold',
        stickToPlayer: true,
        guidePoints: null
      };
    }

    const action = explicit || {
      type: 'pass',
      from: fallbackFromHolder,
      to: fallbackToHolder,
      startAt: 0.42,
      endAt: 0.74,
      route: { type: 'arc', lift: 28 }
    };

    const fromId = action.from || fallbackFromHolder;
    const toRef = action.to || fallbackToHolder;
    const startAt = action.startAt ?? 0.42;
    const endAt = action.endAt ?? 0.74;
    const startPos = resolveNamedTarget(fromId, phase, nextPhase, startAt) || getPlayerPosAtT(fallbackFromHolder, phase, nextPhase, startAt);
    const endPos = resolveNamedTarget(toRef, phase, nextPhase, endAt) || getPlayerPosAtT(fallbackToHolder, phase, nextPhase, endAt);
    const route = action.route || action.path || {
      type: action.type === 'handoff' ? 'arc' : 'arc',
      lift: action.type === 'handoff' ? 10 : 30,
      side: action.side || 1,
      via: action.via
    };

    if (t <= startAt) {
      const holderNow = resolveNamedTarget(fromId, phase, nextPhase, t) || startPos;
      return {
        x: holderNow[0],
        y: holderNow[1],
        mode: 'hold',
        stickToPlayer: typeof fromId === 'string' && fromId !== 'rim',
        guidePoints: CourtRenderer.sampleRoute(startPos, endPos, route)
      };
    }

    if (t >= endAt) {
      const targetNow = resolveNamedTarget(toRef, phase, nextPhase, t) || endPos;
      return {
        x: targetNow[0],
        y: targetNow[1],
        mode: action.type || 'pass',
        stickToPlayer: typeof toRef === 'string' && toRef !== 'rim',
        guidePoints: CourtRenderer.sampleRoute(startPos, endPos, route)
      };
    }

    const local = (t - startAt) / Math.max(endAt - startAt, 0.001);
    const ballPoint = CourtRenderer.interpolateMovement(startPos, endPos, local, route);
    return {
      x: ballPoint[0],
      y: ballPoint[1],
      mode: action.type || 'pass',
      stickToPlayer: false,
      guidePoints: CourtRenderer.sampleRoute(startPos, endPos, route)
    };
  }

  function animate(timestamp) {
    if (!currentSet) {
      requestAnimationFrame(animate);
      return;
    }

    const phases = currentSet.phases;
    const phase = phases[currentPhase];
    const nextPhase = phases[(currentPhase + 1) % phases.length];

    if (animRunning && lastTimestamp !== null) {
      phaseProgress += (timestamp - lastTimestamp) / phase.duration;
    }
    lastTimestamp = animRunning ? timestamp : null;

    if (phaseProgress >= 1) {
      phaseProgress = 0;
      currentPhase = (currentPhase + 1) % phases.length;
      currentSet.players.forEach(player => {
        trails[player.id] = [];
      });
      updatePhaseUI();
    }

    const positions = {};
    currentSet.players.forEach(player => {
      positions[player.id] = getPlayerPosAtT(player.id, phase, nextPhase, phaseProgress);
      trails[player.id].push([...positions[player.id]]);
      if (trails[player.id].length > 24) trails[player.id].shift();
    });

    const ballState = buildBallState(phase, nextPhase, phaseProgress);

    const totalDuration = phases.reduce((sum, item) => sum + item.duration, 0);
    const elapsedBeforePhase = phases.slice(0, currentPhase).reduce((sum, item) => sum + item.duration, 0);
    const elapsed = elapsedBeforePhase + (phaseProgress * phase.duration);
    elProgressFill.style.width = `${Math.min((elapsed / totalDuration) * 100, 100).toFixed(1)}%`;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    CourtRenderer.drawCourt(ctx);

    currentSet.players.forEach(player => {
      const from = phase.positions[player.id];
      const to = nextPhase.positions[player.id];
      if (!from || !to) return;
      if (CourtRenderer.distance(from, to) < 4) return;
      const route = getTransitionRoute(phase, player.id);
      const guidePoints = CourtRenderer.sampleRoute(from, to, route);
      CourtRenderer.drawRouteGuide(ctx, guidePoints, player.color, {
        alpha: 0.22,
        lineWidth: 1.3,
        dash: [5, 5],
        arrowSize: 6
      });
    });

    if (ballState.guidePoints) {
      const isShot = phase.ball?.type === 'shot' || phase.ball?.to === 'rim';
      CourtRenderer.drawRouteGuide(ctx, ballState.guidePoints, '#E85D24', {
        alpha: isShot ? 0.55 : 0.42,
        lineWidth: isShot ? 2 : 1.7,
        dash: isShot ? [3, 4] : [7, 5],
        arrowSize: isShot ? 8 : 7,
        arrowAlpha: 0.8
      });
    }

    currentSet.players.forEach(player => {
      CourtRenderer.drawTrail(ctx, trails[player.id], player.color);
    });

    const ballHolderId = phase.ballHolder || '1';
    const stationaryPlayers = currentSet.players.filter(player => player.id !== ballHolderId);
    stationaryPlayers.forEach(player => {
      const pos = positions[player.id];
      CourtRenderer.drawPlayer(ctx, pos[0], pos[1], player.label, player.color, false);
    });

    const activePlayer = currentSet.players.find(player => player.id === ballHolderId);
    if (activePlayer) {
      const pos = positions[activePlayer.id];
      CourtRenderer.drawPlayer(ctx, pos[0], pos[1], activePlayer.label, activePlayer.color, true);
    }

    CourtRenderer.drawBall(ctx, ballState.x, ballState.y, {
      stickToPlayer: ballState.stickToPlayer,
      flying: !ballState.stickToPlayer
    });

    requestAnimationFrame(animate);
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

  document.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' && currentIndex > 0) loadSet(currentIndex - 1);
    if (event.key === 'ArrowRight' && currentIndex < sets.length - 1) loadSet(currentIndex + 1);
    if (event.key === ' ') {
      event.preventDefault();
      btnPlayPause.click();
    }
  });

  buildArchive();
  loadSet(0);
  requestAnimationFrame(animate);
})();
