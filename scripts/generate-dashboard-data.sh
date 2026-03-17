#!/usr/bin/env bash

set -euo pipefail

: "${OWNER:=${GITHUB_REPOSITORY:-}}"
: "${OWNER:=japer-technology}"
OWNER="${OWNER%%/*}"
: "${OUTPUT_PATH:=docs/data/status.json}"
: "${SCAN_LOG_PATH:=docs/data/scan-log.json}"

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

    local workflow_files_json
    workflow_files_json=$(api_get "${API_ROOT}/repos/${OWNER}/${repo_name}/contents/.github/workflows" 2>/dev/null | jq -c '[.[]? | select(.type == "file" and (.name | test("\\.(yml|yaml)$"))) | .name]' 2>/dev/null || printf '[]')

    jq -n \
      --argjson repo "${repo_json}" \
      --argjson folders "${folders_json}" \
      --argjson workflowFiles "${workflow_files_json}" \
      '{
        name: $repo.name,
        full_name: $repo.full_name,
        html_url: $repo.html_url,
        description: $repo.description,
        updated_at: $repo.updated_at,
        pushed_at: $repo.pushed_at,
        intelligence_folders: $folders,
        workflow_count: ($workflowFiles | length),
        workflow_files: $workflowFiles
      }' >> "${intelligence_repos_file}"
  done < "${repo_pages_file}"

  local repos_json
  repos_json=$(jq -s 'sort_by(.name)' "${intelligence_repos_file}")

  # --- Emergency repo detection ---
  local emergency_repo_name="github-intelligence-emergency"
  local emergency_json
  local emergency_repo_info
  emergency_repo_info=$(api_get "${API_ROOT}/repos/${OWNER}/${emergency_repo_name}" 2>/dev/null || printf '')

  if [ -n "${emergency_repo_info}" ] && printf '%s' "${emergency_repo_info}" | jq -e '.id' >/dev/null 2>&1; then
    local emergency_html_url emergency_description emergency_updated_at emergency_pushed_at
    emergency_html_url=$(printf '%s' "${emergency_repo_info}" | jq -r '.html_url // ""')
    emergency_description=$(printf '%s' "${emergency_repo_info}" | jq -r '.description // ""')
    emergency_updated_at=$(printf '%s' "${emergency_repo_info}" | jq -r '.updated_at // ""')
    emergency_pushed_at=$(printf '%s' "${emergency_repo_info}" | jq -r '.pushed_at // ""')

    local emergency_root_contents
    emergency_root_contents=$(api_get "${API_ROOT}/repos/${OWNER}/${emergency_repo_name}/contents/" 2>/dev/null || printf '[]')

    local fail_safe_active="false"
    if printf '%s' "${emergency_root_contents}" | jq -e '.[]? | select(.name == "DELETE-TO-ACTIVATE.md")' >/dev/null 2>&1; then
      fail_safe_active="true"
    fi

    local disable_trigger_present="false"
    if printf '%s' "${emergency_root_contents}" | jq -e '.[]? | select(.name == "DELETE-TO-DISABLE-ALL-INTELLIGENCES.md")' >/dev/null 2>&1; then
      disable_trigger_present="true"
    fi

    local kill_trigger_present="false"
    if printf '%s' "${emergency_root_contents}" | jq -e '.[]? | select(.name == "DELETE-TO-KILL-ALL-INTELLIGENCES.md")' >/dev/null 2>&1; then
      kill_trigger_present="true"
    fi

    local emergency_version
    emergency_version=$(api_get "${API_ROOT}/repos/${OWNER}/${emergency_repo_name}/contents/VERSION" 2>/dev/null | jq -r '.content // ""' | base64 -d 2>/dev/null | tr -d '[:space:]' || printf '')

    local dry_run_log_count
    dry_run_log_count=$(api_get "${API_ROOT}/repos/${OWNER}/${emergency_repo_name}/contents/dry-run-log" 2>/dev/null | jq '[.[]? | select(.type == "file")] | length' 2>/dev/null || printf '0')

    local emergency_workflow_files
    emergency_workflow_files=$(api_get "${API_ROOT}/repos/${OWNER}/${emergency_repo_name}/contents/.github/workflows" 2>/dev/null | jq -c '[.[]? | select(.type == "file" and (.name | test("\\.(yml|yaml)$"))) | .name]' 2>/dev/null || printf '[]')

    emergency_json=$(jq -n \
      --argjson found true \
      --arg html_url "${emergency_html_url}" \
      --arg description "${emergency_description}" \
      --arg version "${emergency_version}" \
      --argjson fail_safe_active "${fail_safe_active}" \
      --argjson disable_trigger_present "${disable_trigger_present}" \
      --argjson kill_trigger_present "${kill_trigger_present}" \
      --argjson dry_run_log_count "${dry_run_log_count}" \
      --argjson workflow_files "${emergency_workflow_files}" \
      --arg pushed_at "${emergency_pushed_at}" \
      --arg updated_at "${emergency_updated_at}" \
      '{
        found: $found,
        html_url: $html_url,
        description: $description,
        version: $version,
        fail_safe_active: $fail_safe_active,
        disable_trigger_present: $disable_trigger_present,
        kill_trigger_present: $kill_trigger_present,
        dry_run_log_count: $dry_run_log_count,
        workflow_files: $workflow_files,
        pushed_at: $pushed_at,
        updated_at: $updated_at
      }')
  else
    emergency_json=$(jq -n \
      '{
        found: false,
        html_url: "",
        description: "",
        version: "",
        fail_safe_active: false,
        disable_trigger_present: false,
        kill_trigger_present: false,
        dry_run_log_count: 0,
        workflow_files: [],
        pushed_at: "",
        updated_at: ""
      }')
  fi

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
    --argjson emergency "${emergency_json}" \
    '{
      owner: $owner,
      generated_at: $generatedAt,
      published_scope: $scope,
      total_public_repos_scanned: $totalPublicReposScanned,
      active_intelligence_repos: $activeIntelligenceRepos,
      emergency: $emergency,
      repos: $repos
    }' > "${output_tmp}"

  mv "${output_tmp}" "${OUTPUT_PATH}"

  # --- Scan log generation ---
  local scan_log_dir
  scan_log_dir=$(dirname "${SCAN_LOG_PATH}")
  mkdir -p "${scan_log_dir}"

  local active_intelligence_count
  active_intelligence_count=$(printf '%s' "${repos_json}" | jq 'length')

  local repos_fingerprint
  repos_fingerprint=$(printf '%s' "${repos_json}" | jq -r '[.[].name] | sort | join(",")' | md5sum | cut -d' ' -f1)

  local emergency_found emergency_version_log emergency_fail_safe_log
  emergency_found=$(printf '%s' "${emergency_json}" | jq -r '.found')
  emergency_version_log=$(printf '%s' "${emergency_json}" | jq -r '.version // ""')
  emergency_fail_safe_log=$(printf '%s' "${emergency_json}" | jq -r '.fail_safe_active')

  local new_entry
  new_entry=$(jq -n \
    --arg timestamp "${generated_at}" \
    --argjson total_repos_scanned "${total_repos_scanned}" \
    --argjson active_intelligence_repos "${active_intelligence_count}" \
    --argjson emergency_found "${emergency_found}" \
    --arg emergency_version "${emergency_version_log}" \
    --argjson emergency_fail_safe_active "${emergency_fail_safe_log}" \
    --arg repos_fingerprint "${repos_fingerprint}" \
    '{
      timestamp: $timestamp,
      total_repos_scanned: $total_repos_scanned,
      active_intelligence_repos: $active_intelligence_repos,
      emergency_found: $emergency_found,
      emergency_version: $emergency_version,
      emergency_fail_safe_active: $emergency_fail_safe_active,
      repos_fingerprint: $repos_fingerprint
    }')

  local existing_log="[]"
  if [ -f "${SCAN_LOG_PATH}" ]; then
    existing_log=$(jq -c '.' "${SCAN_LOG_PATH}" 2>/dev/null || printf '[]')
  fi

  local scan_log_tmp="${temp_dir}/scan-log.json"
  printf '%s' "${existing_log}" | jq --argjson entry "${new_entry}" \
    '. + [$entry] | .[-50:]' > "${scan_log_tmp}"

  mv "${scan_log_tmp}" "${SCAN_LOG_PATH}"
}

main "$@"
