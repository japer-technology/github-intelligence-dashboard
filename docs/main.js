const statusMessage = document.getElementById('status-message');
const repoGrid = document.getElementById('repo-grid');
const repoCardTemplate = document.getElementById('repo-card-template');

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

const renderRepoCard = (repo) => {
  const fragment = repoCardTemplate.content.cloneNode(true);
  const link = fragment.querySelector('.repo-link');
  const description = fragment.querySelector('.repo-description');
  const folders = fragment.querySelector('.repo-folders');
  const workflows = fragment.querySelector('.repo-workflows');
  const pushed = fragment.querySelector('.repo-pushed');
  const badge = fragment.querySelector('.repo-badge');

  link.href = repo.html_url;
  link.textContent = repo.full_name;
  description.textContent = repo.description || 'No description provided.';
  folders.textContent = repo.intelligence_folders.join(', ');
  pushed.textContent = formatDate(repo.pushed_at);

  if (Array.isArray(repo.workflow_files) && repo.workflow_files.length > 0) {
    workflows.textContent = repo.workflow_files.join(', ');
  } else {
    workflows.textContent = String(repo.workflow_count);
  }

  if (repo.name === 'github-intelligence-emergency') {
    badge.textContent = '🆘 Emergency';
    badge.classList.add('repo-badge--emergency');
    const card = fragment.querySelector('.repo-card');
    card.classList.add('repo-card--emergency');
  }

  repoGrid.appendChild(fragment);
};

const renderDashboard = (data) => {
  setText('owner', data.owner);
  setText('repo-count', String(data.active_intelligence_repos));
  setText('scanned-count', String(data.total_public_repos_scanned));
  setText('generated-at', formatDate(data.generated_at));
  setText('scope-text', data.published_scope);

  if (data.emergency) {
    renderEmergency(data.emergency);
  }

  if (!Array.isArray(data.repos) || data.repos.length === 0) {
    statusMessage.textContent = 'No active intelligence repositories were found in the latest scan.';
    return;
  }

  statusMessage.textContent = `Showing ${data.repos.length} active intelligence repos.`;
  data.repos.forEach(renderRepoCard);
};

const renderScanLog = (entries) => {
  const section = document.getElementById('scan-log-section');
  const body = document.getElementById('scan-log-body');

  if (!Array.isArray(entries) || entries.length === 0) {
    return;
  }

  section.hidden = false;

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
    emerg.textContent = entry.emergency_found ? `✅ v${entry.emergency_version || '?'}` : '—';

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

fetch('./data/status.json', { cache: 'no-store' })
  .then((response) => {
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    return response.json();
  })
  .then(renderDashboard)
  .catch(renderError);

fetch('./data/scan-log.json', { cache: 'no-store' })
  .then((response) => {
    if (!response.ok) {
      return [];
    }

    return response.json();
  })
  .then(renderScanLog)
  .catch(() => {});
