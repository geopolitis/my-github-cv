const form = document.getElementById("resume-form");
const usernameInput = document.getElementById("username");
const generateButton = document.getElementById("generate-btn");
const printButton = document.getElementById("print-btn");
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
const languageChartEl = document.getElementById("language-chart");
const languagesEl = document.getElementById("languages");
const achievementsEl = document.getElementById("achievements");
const insightsListEl = document.getElementById("insights-list");
const languageBytesChartEl = document.getElementById("language-bytes-chart");
const languageBytesListEl = document.getElementById("language-bytes-list");
const stackFingerprintEl = document.getElementById("stack-fingerprint");
const repoMaturityEl = document.getElementById("repo-maturity");
const recentActivityEl = document.getElementById("recent-activity");

const GITHUB_API = "https://api.github.com";

printButton.addEventListener("click", () => window.print());

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = usernameInput.value.trim();
  if (!username) {
    setStatus("Enter a GitHub username.", true);
    return;
  }

  setLoading(true);
  resumeEl.classList.add("hidden");
  printButton.classList.add("hidden");
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
    const insightBundle = await buildInsightBundle({
      login: user.login,
      repos,
      events,
      authoredPrs,
      mergedPrs,
    });

    renderUser({
      user,
      repos,
      orgs,
      events,
      authoredPrs,
      mergedPrs,
      lifetimeCommitEstimate,
      insightBundle,
    });

    setStatus(`Advanced resume generated for @${user.login}.`);
    resumeEl.classList.remove("hidden");
    printButton.classList.remove("hidden");
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
  const {
    user,
    repos,
    orgs,
    events,
    authoredPrs,
    mergedPrs,
    lifetimeCommitEstimate,
    insightBundle,
  } = payload;

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
  renderLanguageChart(sortedLanguages);

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
  renderPlainList(insightsListEl, insightBundle.insightRows);
  renderPlainList(stackFingerprintEl, insightBundle.stackRows);
  renderPlainList(repoMaturityEl, insightBundle.maturityRows);
  renderLanguageBytesChart(insightBundle.languageBytesRows);
  renderLanguageBytesList(insightBundle.languageBytesRows);

  renderRecentActivity(eventSummary.recentEvents);

  dataScopeEl.textContent =
    "This report uses public GitHub API data. Private organizations, private repos, private commits, and line-level code volume are not exposed here.";
}

async function buildInsightBundle(payload) {
  const { login, repos, events, authoredPrs, mergedPrs } = payload;
  const ownedRepos = repos
    .filter((repo) => repo.owner && repo.owner.login === login && !repo.fork)
    .sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at))
    .slice(0, 8);

  const perRepoInsights = await Promise.all(
    ownedRepos.map(async (repo) => {
      const repoPath = `/repos/${encodeURIComponent(login)}/${encodeURIComponent(repo.name)}`;
      const [languagesRes, rootRes, workflowsRes] = await Promise.all([
        fetchJson(`${repoPath}/languages`),
        fetchJson(`${repoPath}/contents`),
        fetchJson(`${repoPath}/contents/.github/workflows`),
      ]);
      return {
        repo,
        languages: languagesRes.ok && languagesRes.data ? languagesRes.data : {},
        root: rootRes.ok && Array.isArray(rootRes.data) ? rootRes.data : [],
        workflows: workflowsRes.ok && Array.isArray(workflowsRes.data) ? workflowsRes.data : [],
      };
    })
  );

  const languageBytes = {};
  const stackCounts = {};
  const maturityRows = [];
  let withCi = 0;
  let withTests = 0;
  let withReadme = 0;
  let matureRepos = 0;

  perRepoInsights.forEach((entry) => {
    Object.entries(entry.languages).forEach(([lang, bytes]) => {
      languageBytes[lang] = (languageBytes[lang] || 0) + bytes;
    });

    const rootNames = new Set(entry.root.map((item) => String(item.name || "").toLowerCase()));
    const hasReadme = [...rootNames].some((name) => name.startsWith("readme"));
    const hasLicense = entry.repo.license !== null;
    const hasTests =
      rootNames.has("test") ||
      rootNames.has("tests") ||
      rootNames.has("__tests__") ||
      rootNames.has("spec") ||
      rootNames.has("specs");
    const hasCi = entry.workflows.length > 0;
    const recentPush =
      Date.now() - new Date(entry.repo.pushed_at).getTime() <= 180 * 24 * 60 * 60 * 1000;

    const score = [hasReadme, hasLicense, hasTests, hasCi, recentPush].filter(Boolean).length * 20;
    if (score >= 60) matureRepos += 1;
    if (hasCi) withCi += 1;
    if (hasTests) withTests += 1;
    if (hasReadme) withReadme += 1;

    const badges = [];
    if (hasReadme) badges.push("README");
    if (hasLicense) badges.push("License");
    if (hasTests) badges.push("Tests");
    if (hasCi) badges.push("CI");
    if (recentPush) badges.push("Recent");
    maturityRows.push(
      `${entry.repo.name}: ${score}/100 ${badges.length ? `(${badges.join(" • ")})` : "(No maturity signals found)"}`
    );

    registerStackSignals(stackCounts, rootNames, hasCi);
  });

  const languageBytesRows = Object.entries(languageBytes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const stackRows = Object.entries(stackCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => `${name}: detected in ${count} repo${count > 1 ? "s" : ""}`);

  const mergeRate =
    authoredPrs && authoredPrs > 0 && mergedPrs !== null
      ? `${Math.round((mergedPrs / authoredPrs) * 100)}%`
      : "Unavailable";
  const eventWindowDays = estimateEventWindowDays(events);
  const externalRepos = getExternalContributionRepoCount(login, events);
  const recentCommitCount = events
    .filter((event) => event.type === "PushEvent")
    .reduce((sum, event) => sum + ((event.payload && event.payload.commits && event.payload.commits.length) || 0), 0);

  const insightRows = [
    `PR Merge Rate (public): ${mergeRate}`,
    `External Collaboration Breadth: ${externalRepos} repos in recent public events`,
    `Commit Velocity: ${recentCommitCount} commits over ~${eventWindowDays} days of visible events`,
    ownedRepos.length
      ? `Mature Repo Coverage: ${matureRepos}/${ownedRepos.length} sampled owned repos score 60+`
      : "Mature Repo Coverage: Unavailable (no owned repos sampled)",
    ownedRepos.length
      ? `Quality Signals in Sample: README ${withReadme}/${ownedRepos.length}, Tests ${withTests}/${ownedRepos.length}, CI ${withCi}/${ownedRepos.length}`
      : "Quality Signals in Sample: Unavailable (no owned repos sampled)",
  ];

  return {
    insightRows,
    languageBytesRows,
    stackRows: stackRows.length ? stackRows : ["No framework/tool signals detected from sampled repositories."],
    maturityRows: maturityRows.length ? maturityRows : ["No owned public repositories available for maturity analysis."],
  };
}

function registerStackSignals(stackCounts, rootNames, hasCi) {
  const checks = [
    ["TypeScript", rootNames.has("tsconfig.json")],
    ["Node.js", rootNames.has("package.json")],
    ["Python", rootNames.has("requirements.txt") || rootNames.has("pyproject.toml") || rootNames.has("pipfile")],
    ["Go", rootNames.has("go.mod")],
    ["Rust", rootNames.has("cargo.toml")],
    ["Java", rootNames.has("pom.xml") || rootNames.has("build.gradle") || rootNames.has("build.gradle.kts")],
    ["Docker", rootNames.has("dockerfile") || rootNames.has("docker-compose.yml")],
    ["Terraform", [...rootNames].some((name) => name.endsWith(".tf"))],
    ["Next.js", [...rootNames].some((name) => name.startsWith("next.config."))],
    ["Vite", [...rootNames].some((name) => name.startsWith("vite.config."))],
    ["GitHub Actions", hasCi],
  ];

  checks.forEach(([label, hit]) => {
    if (!hit) return;
    stackCounts[label] = (stackCounts[label] || 0) + 1;
  });
}

function estimateEventWindowDays(events) {
  if (!events.length) return 0;
  const newest = new Date(events[0].created_at).getTime();
  const oldest = new Date(events[events.length - 1].created_at).getTime();
  return Math.max(1, Math.round((newest - oldest) / (24 * 60 * 60 * 1000)));
}

function getExternalContributionRepoCount(login, events) {
  const repos = new Set();
  events.forEach((event) => {
    if (!event.repo || !event.repo.name) return;
    if (!event.repo.name.toLowerCase().startsWith(`${login.toLowerCase()}/`)) {
      repos.add(event.repo.name);
    }
  });
  return repos.size;
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

function renderLanguageBytesChart(rows) {
  if (!rows.length) {
    languageBytesChartEl.innerHTML = "";
    return;
  }
  const total = rows.reduce((sum, row) => sum + row[1], 0);
  languageBytesChartEl.innerHTML = "";
  rows.forEach(([language, bytes]) => {
    const percent = total > 0 ? Math.round((bytes / total) * 100) : 0;
    const row = document.createElement("div");
    row.className = "lang-row";
    row.innerHTML = `
      <span class="lang-label">${escapeHtml(language)}</span>
      <div class="lang-bar" style="width:${percent}%"></div>
      <span class="lang-value">${percent}%</span>
    `;
    languageBytesChartEl.appendChild(row);
  });
}

function renderLanguageBytesList(rows) {
  if (!rows.length) {
    languageBytesListEl.appendChild(createEmptyItem("No language byte data available from sampled repositories."));
    return;
  }
  const total = rows.reduce((sum, row) => sum + row[1], 0);
  rows.forEach(([language, bytes]) => {
    const percent = total > 0 ? ((bytes / total) * 100).toFixed(1) : "0.0";
    languageBytesListEl.appendChild(
      createEmptyItem(`${language}: ${percent}% (${formatNumber(bytes)} bytes)`)
    );
  });
}

function renderLanguageChart(languages) {
  if (languages.length === 0) {
    languageChartEl.innerHTML = "";
    return;
  }

  const total = languages.reduce((sum, row) => sum + row[1], 0);
  languageChartEl.innerHTML = "";

  languages.forEach(([language, count]) => {
    const percent = total > 0 ? Math.round((count / total) * 100) : 0;
    const row = document.createElement("div");
    row.className = "lang-row";
    row.innerHTML = `
      <span class="lang-label">${escapeHtml(language)}</span>
      <div class="lang-bar" style="width:${percent}%"></div>
      <span class="lang-value">${percent}%</span>
    `;
    languageChartEl.appendChild(row);
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
  languageChartEl.innerHTML = "";
  languagesEl.innerHTML = "";
  achievementsEl.innerHTML = "";
  insightsListEl.innerHTML = "";
  languageBytesChartEl.innerHTML = "";
  languageBytesListEl.innerHTML = "";
  stackFingerprintEl.innerHTML = "";
  repoMaturityEl.innerHTML = "";
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
