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

const renderRepoCard = (repo) => {
  const fragment = repoCardTemplate.content.cloneNode(true);
  const link = fragment.querySelector('.repo-link');
  const description = fragment.querySelector('.repo-description');
  const folders = fragment.querySelector('.repo-folders');
  const workflows = fragment.querySelector('.repo-workflows');
  const pushed = fragment.querySelector('.repo-pushed');

  link.href = repo.html_url;
  link.textContent = repo.full_name;
  description.textContent = repo.description || 'No description provided.';
  folders.textContent = repo.intelligence_folders.join(', ');
  workflows.textContent = String(repo.workflow_count);
  pushed.textContent = formatDate(repo.pushed_at);

  repoGrid.appendChild(fragment);
};

const renderDashboard = (data) => {
  setText('owner', data.owner);
  setText('repo-count', String(data.active_intelligence_repos));
  setText('scanned-count', String(data.total_public_repos_scanned));
  setText('generated-at', formatDate(data.generated_at));
  setText('scope-text', data.published_scope);

  if (!Array.isArray(data.repos) || data.repos.length === 0) {
    statusMessage.textContent = 'No active intelligence repositories were found in the latest scan.';
    return;
  }

  statusMessage.textContent = `Showing ${data.repos.length} active intelligence repos.`;
  data.repos.forEach(renderRepoCard);
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
