const statusMessage = document.getElementById('status-message');
const repoGrid = document.getElementById('repo-grid');
const repoCardTemplate = document.getElementById('repo-card-template');

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
let refreshTimerId = null;
let nextRefreshAt = null;
let currentData = null;

const setText = (id, value) => {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
};

const formatDate = (value) => {
  if (!value) {
    return 'Unknown';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const relativeTime = (value) => {
  if (!value) {
    return 'Unknown';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) {
    return 'just now';
  }
  if (diffMin < 60) {
    return `${diffMin}m ago`;
  }
  if (diffHr < 24) {
    return `${diffHr}h ago`;
  }
  if (diffDay < 30) {
    return `${diffDay}d ago`;
  }

  return formatDate(value);
};

const freshnessLevel = (value) => {
  if (!value) {
    return 'unknown';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'unknown';
  }

  const diffMs = Date.now() - date.getTime();
  const diffHr = diffMs / (1000 * 60 * 60);

  if (diffHr < 1) {
    return 'now';
  }
  if (diffHr < 24) {
    return 'today';
  }
  if (diffHr < 168) {
    return 'week';
  }

  return 'stale';
};

const extractIntelligenceType = (folders) => {
  if (!Array.isArray(folders) || folders.length === 0) {
    return 'unknown';
  }

  const match = folders[0].match(/^\.github-(.+?)-intelligences?$/);
  return match ? match[1] : 'unknown';
};

const renderEmergency = (emergency) => {
  const section = document.getElementById('emergency-section');
  if (!emergency || !emergency.found) {
    return;
  }

  section.hidden = false;

  const repoLink = document.getElementById('emergency-repo-link');
  repoLink.href = emergency.html_url;

  setText('emergency-description', emergency.description || 'No description provided.');
  setText('emergency-version', emergency.version ? `Version ${emergency.version}` : '');
  setText('dry-run-log-count', String(emergency.dry_run_log_count));
  setText('emergency-workflow-count', String(emergency.workflow_files.length));
  setText('emergency-pushed-at', formatDate(emergency.pushed_at));

  const failSafeEl = document.getElementById('fail-safe-status');
  const disableEl = document.getElementById('disable-trigger-status');
  const killEl = document.getElementById('kill-trigger-status');

  if (emergency.fail_safe_active) {
    failSafeEl.textContent = 'Active';
    document.getElementById('indicator-fail-safe').classList.add('indicator--safe');
  } else {
    failSafeEl.textContent = 'Removed';
    document.getElementById('indicator-fail-safe').classList.add('indicator--danger');
  }

  if (emergency.disable_trigger_present) {
    disableEl.textContent = 'Present';
    document.getElementById('indicator-disable').classList.add('indicator--safe');
  } else {
    disableEl.textContent = 'Triggered';
    document.getElementById('indicator-disable').classList.add('indicator--danger');
  }

  if (emergency.kill_trigger_present) {
    killEl.textContent = 'Present';
    document.getElementById('indicator-kill').classList.add('indicator--safe');
  } else {
    killEl.textContent = 'Triggered';
    document.getElementById('indicator-kill').classList.add('indicator--danger');
  }

  const workflowList = document.getElementById('emergency-workflow-list');
  emergency.workflow_files.forEach((name) => {
    const li = document.createElement('li');
    li.textContent = name;
    workflowList.appendChild(li);
  });
};

const renderTypeBreakdown = (repos) => {
  if (!Array.isArray(repos) || repos.length === 0) {
    return;
  }

  const section = document.getElementById('type-breakdown');
  const grid = document.getElementById('type-grid');

  const counts = {};
  repos.forEach((repo) => {
    const type = extractIntelligenceType(repo.intelligence_folders);
    counts[type] = (counts[type] || 0) + 1;
  });

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  section.hidden = false;
  grid.innerHTML = '';

  sorted.forEach(([type, count]) => {
    const tile = document.createElement('div');
    tile.className = 'type-tile';

    const countSpan = document.createElement('span');
    countSpan.className = 'type-tile__count';
    countSpan.textContent = String(count);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'type-tile__name';
    nameSpan.textContent = type;

    tile.appendChild(countSpan);
    tile.appendChild(nameSpan);
    grid.appendChild(tile);
  });
};

const renderRepoCard = (repo) => {
  const fragment = repoCardTemplate.content.cloneNode(true);
  const card = fragment.querySelector('.repo-card');
  const link = fragment.querySelector('.repo-link');
  const description = fragment.querySelector('.repo-description');
  const folders = fragment.querySelector('.repo-folders');
  const workflows = fragment.querySelector('.repo-workflows');
  const pushed = fragment.querySelector('.repo-pushed');
  const badge = fragment.querySelector('.repo-badge');
  const freshness = fragment.querySelector('.repo-freshness');
  const runBadge = fragment.querySelector('.repo-run-badge');

  link.href = repo.html_url;
  link.textContent = repo.full_name;
  description.textContent = repo.description || 'No description provided.';
  folders.textContent = repo.intelligence_folders.join(', ');
  pushed.textContent = relativeTime(repo.pushed_at);
  pushed.title = formatDate(repo.pushed_at);

  if (Array.isArray(repo.workflow_files) && repo.workflow_files.length > 0) {
    workflows.textContent = repo.workflow_files.join(', ');
  } else {
    workflows.textContent = String(repo.workflow_count);
  }

  if (repo.name === 'github-intelligence-emergency') {
    badge.textContent = '🆘 Emergency';
    badge.classList.add('repo-badge--emergency');
    card.classList.add('repo-card--emergency');
  }

  const level = freshnessLevel(repo.pushed_at);
  if (level !== 'unknown') {
    freshness.hidden = false;
    const labels = { now: '🟢 Active now', today: '🔵 Today', week: '🟡 This week', stale: '⚪ Stale' };
    freshness.textContent = labels[level] || '';
    freshness.classList.add(`freshness--${level}`);
  }

  if (repo.last_workflow_run) {
    const run = repo.last_workflow_run;
    runBadge.hidden = false;
    const conclusionLabels = {
      success: '✅ Passing',
      failure: '❌ Failing',
      cancelled: '⏹️ Cancelled',
      skipped: '⏭️ Skipped',
      timed_out: '⏰ Timed out',
    };
    runBadge.textContent = conclusionLabels[run.conclusion] || run.conclusion || 'unknown';
    runBadge.classList.add(`run-badge--${run.conclusion || 'unknown'}`);
    if (run.html_url) {
      runBadge.title = `Last run: ${run.workflow_name || 'workflow'} — ${relativeTime(run.run_started_at)}`;
    }
  }

  card.dataset.type = extractIntelligenceType(repo.intelligence_folders);
  card.dataset.name = (repo.full_name || '').toLowerCase();

  repoGrid.appendChild(fragment);
};

const renderFilterBar = (repos) => {
  if (!Array.isArray(repos) || repos.length === 0) {
    return;
  }

  const filterBar = document.getElementById('filter-bar');
  const filterSearch = document.getElementById('filter-search');
  const filterType = document.getElementById('filter-type');

  const types = new Set();
  repos.forEach((repo) => {
    types.add(extractIntelligenceType(repo.intelligence_folders));
  });

  filterType.innerHTML = '<option value="">All types</option>';
  [...types].sort().forEach((type) => {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = type;
    filterType.appendChild(option);
  });

  filterBar.hidden = false;

  const applyFilters = () => {
    const searchTerm = filterSearch.value.toLowerCase().trim();
    const selectedType = filterType.value;

    const cards = repoGrid.querySelectorAll('.repo-card');
    let visible = 0;
    cards.forEach((card) => {
      const matchesSearch = !searchTerm || (card.dataset.name || '').includes(searchTerm);
      const matchesType = !selectedType || card.dataset.type === selectedType;
      const show = matchesSearch && matchesType;
      card.style.display = show ? '' : 'none';
      if (show) {
        visible += 1;
      }
    });

    statusMessage.textContent = `Showing ${visible} of ${repos.length} active intelligence repos.`;
  };

  filterSearch.addEventListener('input', applyFilters);
  filterType.addEventListener('change', applyFilters);
};

const renderDashboard = (data) => {
  currentData = data;

  setText('owner', data.owner);
  setText('repo-count', String(data.active_intelligence_repos));
  setText('scanned-count', String(data.total_public_repos_scanned));
  const generatedAtEl = document.getElementById('generated-at');
  if (generatedAtEl) {
    generatedAtEl.textContent = relativeTime(data.generated_at);
    generatedAtEl.title = formatDate(data.generated_at);
  }
  setText('scope-text', data.published_scope);

  if (data.emergency) {
    renderEmergency(data.emergency);
  }

  renderTypeBreakdown(data.repos);

  if (!Array.isArray(data.repos) || data.repos.length === 0) {
    statusMessage.textContent = 'No active intelligence repositories were found in the latest scan.';
    return;
  }

  statusMessage.textContent = `Showing ${data.repos.length} active intelligence repos.`;
  repoGrid.innerHTML = '';
  data.repos.forEach(renderRepoCard);
  renderFilterBar(data.repos);
};

const renderScanLog = (entries) => {
  const section = document.getElementById('scan-log-section');
  const body = document.getElementById('scan-log-body');

  if (!Array.isArray(entries) || entries.length === 0) {
    return;
  }

  section.hidden = false;

  body.innerHTML = '';
  const sorted = [...entries].reverse();
  sorted.forEach((entry) => {
    const row = document.createElement('tr');

    const ts = document.createElement('td');
    ts.textContent = formatDate(entry.timestamp);

    const scanned = document.createElement('td');
    scanned.textContent = String(entry.total_repos_scanned);

    const intel = document.createElement('td');
    intel.textContent = String(entry.active_intelligence_repos);

    const emerg = document.createElement('td');
    emerg.textContent = entry.emergency_found ? `✅ v${entry.emergency_version || 'unknown'}` : '—';

    const safe = document.createElement('td');
    if (entry.emergency_found) {
      const span = document.createElement('span');
      span.textContent = entry.emergency_fail_safe_active ? 'Active' : 'Removed';
      span.className = entry.emergency_fail_safe_active ? 'log-badge--safe' : 'log-badge--danger';
      safe.appendChild(span);
    } else {
      safe.textContent = '—';
    }

    row.appendChild(ts);
    row.appendChild(scanned);
    row.appendChild(intel);
    row.appendChild(emerg);
    row.appendChild(safe);
    body.appendChild(row);
  });
};

const renderError = (error) => {
  statusMessage.textContent = 'Unable to load dashboard data right now.';
  repoGrid.innerHTML = '';
  console.error(error);
};

const startRefreshTimer = () => {
  nextRefreshAt = Date.now() + REFRESH_INTERVAL_MS;
  const timerEl = document.getElementById('refresh-timer');

  if (refreshTimerId) {
    clearInterval(refreshTimerId);
  }

  const tick = () => {
    const remaining = Math.max(0, nextRefreshAt - Date.now());
    const sec = Math.ceil(remaining / 1000);
    const min = Math.floor(sec / 60);
    const s = sec % 60;
    timerEl.textContent = `Auto-refresh in ${min}:${String(s).padStart(2, '0')}`;

    if (remaining <= 0) {
      clearInterval(refreshTimerId);
      loadDashboard();
    }
  };

  tick();
  refreshTimerId = setInterval(tick, 1000);
};

const loadDashboard = () => {
  const emergencySection = document.getElementById('emergency-section');
  emergencySection.hidden = true;
  emergencySection.querySelectorAll('.indicator--safe, .indicator--danger').forEach((el) => {
    el.classList.remove('indicator--safe', 'indicator--danger');
  });
  const emergencyWorkflowList = document.getElementById('emergency-workflow-list');
  if (emergencyWorkflowList) {
    emergencyWorkflowList.innerHTML = '';
  }

  fetch('./data/status.json', { cache: 'no-store' })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      return response.json();
    })
    .then(renderDashboard)
    .catch(renderError)
    .finally(startRefreshTimer);

  fetch('./data/scan-log.json', { cache: 'no-store' })
    .then((response) => {
      if (!response.ok) {
        return [];
      }

      return response.json();
    })
    .then(renderScanLog)
    .catch(() => {});
};

loadDashboard();
