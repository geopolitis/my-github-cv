const form = document.getElementById("resume-form");
const usernameInput = document.getElementById("username");
const generateButton = document.getElementById("generate-btn");
const statusEl = document.getElementById("status");
const resumeEl = document.getElementById("resume");

const avatarEl = document.getElementById("avatar");
const nameEl = document.getElementById("name");
const handleEl = document.getElementById("handle");
const bioEl = document.getElementById("bio");
const metaEl = document.getElementById("meta");
const dataScopeEl = document.getElementById("data-scope");

const repoCountEl = document.getElementById("repo-count");
const followersEl = document.getElementById("followers");
const followingEl = document.getElementById("following");
const yearsOnGithubEl = document.getElementById("years-on-github");
const orgCountEl = document.getElementById("org-count");
const totalStarsEl = document.getElementById("total-stars");

const contribSnapshotEl = document.getElementById("contrib-snapshot");
const topReposEl = document.getElementById("top-repos");
const languagesEl = document.getElementById("languages");
const achievementsEl = document.getElementById("achievements");
const recentActivityEl = document.getElementById("recent-activity");

const GITHUB_API = "https://api.github.com";

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = usernameInput.value.trim();
  if (!username) {
    setStatus("Enter a GitHub username.", true);
    return;
  }

  setLoading(true);
  resumeEl.classList.add("hidden");
  clearLists();

  try {
    const [userResponse, reposResponse, orgsResponse, eventsResponse] = await Promise.all([
      fetchJson(`/users/${encodeURIComponent(username)}`),
      fetchJson(`/users/${encodeURIComponent(username)}/repos?per_page=100`),
      fetchJson(`/users/${encodeURIComponent(username)}/orgs?per_page=100`),
      fetchJson(`/users/${encodeURIComponent(username)}/events/public?per_page=100`),
    ]);

    if (userResponse.status === 404) {
      throw new Error("User not found.");
    }

    const hasForbidden = [userResponse, reposResponse, orgsResponse, eventsResponse].some(
      (entry) => entry.status === 403
    );
    if (hasForbidden) {
      throw new Error("GitHub API rate limit reached. Please wait and try again.");
    }

    if (!userResponse.ok || !reposResponse.ok) {
      throw new Error("Could not fetch GitHub profile data.");
    }

    const user = userResponse.data;
    const repos = Array.isArray(reposResponse.data) ? reposResponse.data : [];
    const orgs = Array.isArray(orgsResponse.data) ? orgsResponse.data : [];
    const events = Array.isArray(eventsResponse.data) ? eventsResponse.data : [];

    const [authoredPrSearch, mergedPrSearch] = await Promise.all([
      fetchJson(`/search/issues?q=author:${encodeURIComponent(username)}+type:pr&per_page=1`),
      fetchJson(
        `/search/issues?q=author:${encodeURIComponent(
          username
        )}+type:pr+is:merged&per_page=1`
      ),
    ]);

    const lifetimeCommitEstimate = await estimateLifetimeCommits(user.login, repos);
    const authoredPrs = authoredPrSearch.ok ? authoredPrSearch.data.total_count : null;
    const mergedPrs = mergedPrSearch.ok ? mergedPrSearch.data.total_count : null;

    renderUser({
      user,
      repos,
      orgs,
      events,
      authoredPrs,
      mergedPrs,
      lifetimeCommitEstimate,
    });

    setStatus(`Advanced resume generated for @${user.login}.`);
    resumeEl.classList.remove("hidden");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    setLoading(false);
  }
});

async function fetchJson(path) {
  const response = await fetch(`${GITHUB_API}${path}`);
  let data = null;
  try {
    data = await response.json();
  } catch (_error) {
    data = null;
  }
  return { ok: response.ok, status: response.status, data };
}

async function estimateLifetimeCommits(login, repos) {
  const ownedRepos = repos
    .filter((repo) => repo.owner && repo.owner.login === login && !repo.fork)
    .sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at))
    .slice(0, 8);

  if (ownedRepos.length === 0) {
    return { value: null, sampledRepos: 0 };
  }

  const contributorCalls = await Promise.all(
    ownedRepos.map((repo) =>
      fetchJson(`/repos/${encodeURIComponent(login)}/${encodeURIComponent(repo.name)}/contributors?per_page=100`)
    )
  );

  let total = 0;
  let sampledRepos = 0;
  contributorCalls.forEach((entry) => {
    if (!entry.ok || !Array.isArray(entry.data)) return;
    const me = entry.data.find((c) => c.login === login);
    if (!me) return;
    sampledRepos += 1;
    total += me.contributions || 0;
  });

  return { value: sampledRepos > 0 ? total : null, sampledRepos };
}

function renderUser(payload) {
  const { user, repos, orgs, events, authoredPrs, mergedPrs, lifetimeCommitEstimate } = payload;

  avatarEl.src = user.avatar_url;
  nameEl.textContent = user.name || user.login;
  handleEl.textContent = `@${user.login}`;
  bioEl.textContent = user.bio || "No public bio.";
  metaEl.textContent = [user.location, user.blog].filter(Boolean).join(" • ");

  const accountAge = getGithubYears(user.created_at);
  const totalStars = repos.reduce((sum, repo) => sum + (repo.stargazers_count || 0), 0);

  repoCountEl.textContent = formatNumber(user.public_repos);
  followersEl.textContent = formatNumber(user.followers);
  followingEl.textContent = formatNumber(user.following);
  yearsOnGithubEl.textContent = accountAge;
  orgCountEl.textContent = formatNumber(orgs.length);
  totalStarsEl.textContent = formatNumber(totalStars);

  const topRepos = [...repos]
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 5);
  renderTopRepos(topRepos);

  const languageMap = repos.reduce((acc, repo) => {
    if (!repo.language) return acc;
    acc[repo.language] = (acc[repo.language] || 0) + 1;
    return acc;
  }, {});

  const sortedLanguages = Object.entries(languageMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  renderLanguages(sortedLanguages);

  const eventSummary = summarizeEvents(events);
  const contribItems = buildContributionItems({
    authoredPrs,
    mergedPrs,
    recentCommits: eventSummary.recentCommits,
    recentPushes: eventSummary.pushEvents,
    lifetimeCommitEstimate,
  });
  renderPlainList(contribSnapshotEl, contribItems);

  const achievementItems = buildAchievementItems({
    repos,
    languageCount: sortedLanguages.length,
    mergedPrs,
    totalStars,
    orgCount: orgs.length,
  });
  renderPlainList(achievementsEl, achievementItems);

  renderRecentActivity(eventSummary.recentEvents);

  dataScopeEl.textContent =
    "This report uses public GitHub API data. Private organizations, private repos, private commits, and line-level code volume are not exposed here.";
}

function summarizeEvents(events) {
  const recentCommits = events
    .filter((event) => event.type === "PushEvent")
    .reduce((sum, event) => sum + ((event.payload && event.payload.commits && event.payload.commits.length) || 0), 0);

  const pushEvents = events.filter((event) => event.type === "PushEvent").length;

  const recentEvents = events.slice(0, 8).map((event) => {
    const repoName = event.repo ? event.repo.name : "unknown-repo";
    const createdAt = prettyDate(event.created_at);

    if (event.type === "PushEvent") {
      const commitCount = (event.payload && event.payload.commits && event.payload.commits.length) || 0;
      return `${createdAt}: pushed ${commitCount} commit${commitCount === 1 ? "" : "s"} to ${repoName}`;
    }

    if (event.type === "PullRequestEvent") {
      const action = event.payload && event.payload.action ? event.payload.action : "updated";
      return `${createdAt}: ${action} a PR in ${repoName}`;
    }

    if (event.type === "IssuesEvent") {
      const action = event.payload && event.payload.action ? event.payload.action : "updated";
      return `${createdAt}: ${action} an issue in ${repoName}`;
    }

    return `${createdAt}: ${event.type.replace("Event", "")} in ${repoName}`;
  });

  return { recentCommits, pushEvents, recentEvents };
}

function buildContributionItems(payload) {
  const { authoredPrs, mergedPrs, recentCommits, recentPushes, lifetimeCommitEstimate } = payload;
  const rows = [];
  rows.push(
    `Pull Requests Authored (public): ${
      authoredPrs === null ? "Unavailable" : formatNumber(authoredPrs)
    }`
  );
  rows.push(
    `Pull Requests Merged (public): ${
      mergedPrs === null ? "Unavailable" : formatNumber(mergedPrs)
    }`
  );
  rows.push(`Recent Commits in Public Events: ${formatNumber(recentCommits)}`);
  rows.push(`Recent Push Events: ${formatNumber(recentPushes)}`);

  if (lifetimeCommitEstimate.value === null) {
    rows.push("Estimated Lifetime Commits (owned repos sample): Unavailable");
  } else {
    rows.push(
      `Estimated Lifetime Commits (owned repos sample): ${formatNumber(
        lifetimeCommitEstimate.value
      )} across ${lifetimeCommitEstimate.sampledRepos} repos`
    );
  }

  return rows;
}

function buildAchievementItems(payload) {
  const { repos, languageCount, mergedPrs, totalStars, orgCount } = payload;
  const repos100Stars = repos.filter((repo) => (repo.stargazers_count || 0) >= 100).length;
  const repos1000Stars = repos.filter((repo) => (repo.stargazers_count || 0) >= 1000).length;
  const archivedRepos = repos.filter((repo) => repo.archived).length;

  const rows = [];
  if (repos1000Stars > 0) {
    rows.push(`Maintains ${repos1000Stars} public repo${repos1000Stars > 1 ? "s" : ""} with 1000+ stars`);
  }
  if (repos100Stars > 0) {
    rows.push(`${repos100Stars} public repo${repos100Stars > 1 ? "s" : ""} with 100+ stars`);
  }
  if (totalStars > 0) {
    rows.push(`Community impact: ${formatNumber(totalStars)} stars across public repositories`);
  }
  if (languageCount >= 3) {
    rows.push(`Polyglot profile: active across ${languageCount} primary languages`);
  }
  if (mergedPrs !== null && mergedPrs > 0) {
    rows.push(`${formatNumber(mergedPrs)} merged public pull requests authored`);
  }
  if (orgCount > 0) {
    rows.push(`Visible member of ${formatNumber(orgCount)} public organization${orgCount > 1 ? "s" : ""}`);
  }
  if (archivedRepos > 0) {
    rows.push(`${formatNumber(archivedRepos)} archived public repo${archivedRepos > 1 ? "s" : ""}`);
  }

  if (rows.length === 0) {
    rows.push("No standout achievements detected from public API signals yet.");
  }

  return rows;
}

function renderTopRepos(repos) {
  if (repos.length === 0) {
    topReposEl.appendChild(createEmptyItem("No public repositories found."));
    return;
  }

  repos.forEach((repo) => {
    const item = document.createElement("li");
    item.innerHTML = `
      <div class="item-main">
        <strong>${escapeHtml(repo.name)}</strong>
        <span class="item-sub">${escapeHtml(repo.description || "No description")}</span>
      </div>
      <span class="pill">★ ${repo.stargazers_count}</span>
    `;
    topReposEl.appendChild(item);
  });
}

function renderLanguages(languages) {
  if (languages.length === 0) {
    languagesEl.appendChild(createEmptyItem("No languages detected."));
    return;
  }

  languages.forEach(([language, count]) => {
    const item = document.createElement("li");
    item.innerHTML = `
      <span class="item-main"><strong>${escapeHtml(language)}</strong></span>
      <span class="pill">${count} repo${count > 1 ? "s" : ""}</span>
    `;
    languagesEl.appendChild(item);
  });
}

function renderRecentActivity(lines) {
  if (!lines.length) {
    recentActivityEl.appendChild(createEmptyItem("No recent public activity available."));
    return;
  }

  lines.forEach((line) => {
    recentActivityEl.appendChild(createEmptyItem(line));
  });
}

function renderPlainList(listEl, rows) {
  if (!rows.length) {
    listEl.appendChild(createEmptyItem("No data available."));
    return;
  }

  rows.forEach((row) => {
    listEl.appendChild(createEmptyItem(row));
  });
}

function createEmptyItem(message) {
  const item = document.createElement("li");
  item.className = "simple-item";
  item.textContent = message;
  return item;
}

function clearLists() {
  contribSnapshotEl.innerHTML = "";
  topReposEl.innerHTML = "";
  languagesEl.innerHTML = "";
  achievementsEl.innerHTML = "";
  recentActivityEl.innerHTML = "";
}

function setLoading(loading) {
  generateButton.disabled = loading;
  generateButton.textContent = loading ? "Generating..." : "Generate Resume";
  if (loading) {
    setStatus("Collecting profile, repositories, organizations, PRs, and activity...");
  }
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#b00020" : "";
}

function formatNumber(value) {
  return Intl.NumberFormat().format(value || 0);
}

function getGithubYears(createdAt) {
  if (!createdAt) return "0";
  const createdDate = new Date(createdAt);
  const now = new Date();
  const years = Math.max(0, Math.floor((now - createdDate) / (365.25 * 24 * 60 * 60 * 1000)));
  return String(years);
}

function prettyDate(isoValue) {
  if (!isoValue) return "Unknown date";
  return new Date(isoValue).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
