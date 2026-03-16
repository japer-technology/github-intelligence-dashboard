#!/usr/bin/env bash

set -euo pipefail

: "${OWNER:=${GITHUB_REPOSITORY:-}}"
: "${OWNER:=japer-technology}"
OWNER="${OWNER%%/*}"
: "${OUTPUT_PATH:=docs/data/status.json}"

API_ROOT="${API_ROOT:-https://api.github.com}"
ACCEPT_HEADER="Accept: application/vnd.github+json"
USER_AGENT_HEADER="User-Agent: github-intelligence-dashboard"

if [ -n "${GITHUB_TOKEN:-}" ]; then
  AUTH_HEADER="Authorization: Bearer ${GITHUB_TOKEN}"
else
  AUTH_HEADER=""
fi

api_get() {
  local url=$1
  local curl_args=(-fsSL -H "${ACCEPT_HEADER}" -H "${USER_AGENT_HEADER}")

  if [ -n "${AUTH_HEADER}" ]; then
    curl_args+=(-H "${AUTH_HEADER}")
  fi

  curl "${curl_args[@]}" "${url}"
}

fetch_repo_page() {
  local owner=$1
  local page=$2
  local url="${API_ROOT}/orgs/${owner}/repos?per_page=100&page=${page}&type=public"

  api_get "${url}" 2>/dev/null || api_get "${API_ROOT}/users/${owner}/repos?per_page=100&page=${page}&type=public"
}

main() {
  local output_dir
  output_dir=$(dirname "${OUTPUT_PATH}")
  mkdir -p "${output_dir}"

  local temp_dir
  temp_dir=$(mktemp -d)
  trap 'rm -rf "${temp_dir:-}"' EXIT

  local repo_pages_file="${temp_dir}/repos.jsonl"
  local intelligence_repos_file="${temp_dir}/intelligence-repos.jsonl"
  touch "${repo_pages_file}" "${intelligence_repos_file}"

  local page=1
  while :; do
    local response
    response=$(fetch_repo_page "${OWNER}" "${page}") || {
      echo "Failed to fetch repositories for ${OWNER}. Set GITHUB_TOKEN if the GitHub API denies anonymous access." >&2
      return 1
    }

    if [ "$(printf '%s' "${response}" | jq 'length')" -eq 0 ]; then
      break
    fi

    printf '%s' "${response}" | jq -c '.[] | select(.archived | not) | select((.disabled // false) | not) | {name, full_name, html_url, description, updated_at, pushed_at}' >> "${repo_pages_file}"
    page=$((page + 1))
  done

  local total_repos_scanned=0
  while IFS= read -r repo_json; do
    [ -z "${repo_json}" ] && continue

    total_repos_scanned=$((total_repos_scanned + 1))

    local repo_name
    repo_name=$(printf '%s' "${repo_json}" | jq -r '.name')

    local root_contents
    root_contents=$(api_get "${API_ROOT}/repos/${OWNER}/${repo_name}/contents/" 2>/dev/null || printf '[]')

    local folders_json
    folders_json=$(printf '%s' "${root_contents}" | jq -c '[.[]? | select(.type == "dir" and (.name | test("^\\.github-.*-intelligences?$"))) | .name]')

    if [ "${folders_json}" = "[]" ]; then
      continue
    fi

    local workflow_count
    workflow_count=$(api_get "${API_ROOT}/repos/${OWNER}/${repo_name}/contents/.github/workflows" 2>/dev/null | jq '[.[]? | select(.type == "file" and (.name | test("\\.(yml|yaml)$")))] | length' 2>/dev/null || printf '0')

    jq -n \
      --argjson repo "${repo_json}" \
      --argjson folders "${folders_json}" \
      --argjson workflowCount "${workflow_count}" \
      '{
        name: $repo.name,
        full_name: $repo.full_name,
        html_url: $repo.html_url,
        description: $repo.description,
        updated_at: $repo.updated_at,
        pushed_at: $repo.pushed_at,
        intelligence_folders: $folders,
        workflow_count: $workflowCount
      }' >> "${intelligence_repos_file}"
  done < "${repo_pages_file}"

  local repos_json
  repos_json=$(jq -s 'sort_by(.name)' "${intelligence_repos_file}")

  local generated_at
  generated_at=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

  local output_tmp="${temp_dir}/status.json"
  jq -n \
    --arg owner "${OWNER}" \
    --arg generatedAt "${generated_at}" \
    --arg scope "public repositories only" \
    --argjson totalPublicReposScanned "${total_repos_scanned}" \
    --argjson activeIntelligenceRepos "$(printf '%s' "${repos_json}" | jq 'length')" \
    --argjson repos "${repos_json}" \
    '{
      owner: $owner,
      generated_at: $generatedAt,
      published_scope: $scope,
      total_public_repos_scanned: $totalPublicReposScanned,
      active_intelligence_repos: $activeIntelligenceRepos,
      repos: $repos
    }' > "${output_tmp}"

  mv "${output_tmp}" "${OUTPUT_PATH}"
}

main "$@"
