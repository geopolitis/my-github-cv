const form = document.getElementById("resume-form");
const usernameInput = document.getElementById("username");
const generateButton = document.getElementById("generate-btn");
const printButton = document.getElementById("print-btn");
const statusEl = document.getElementById("status");
const resumeEl = document.getElementById("resume");

const relayUrlInput = document.getElementById("oauth-relay-url");
const clientIdInput = document.getElementById("oauth-client-id");
const loginButton = document.getElementById("login-btn");
const logoutButton = document.getElementById("logout-btn");
const authMetaEl = document.getElementById("auth-meta");
const devicePanelEl = document.getElementById("device-panel");
const verifyLinkEl = document.getElementById("verify-link");
const userCodeEl = document.getElementById("user-code");
const deviceStatusEl = document.getElementById("device-status");

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
const OAUTH_SCOPES = "read:user user:email repo read:org";
const STORAGE = {
  relayUrl: "gh_resume_oauth_relay_url",
  clientId: "gh_resume_oauth_client_id",
  token: "gh_resume_access_token",
  login: "gh_resume_login",
  scopes: "gh_resume_scopes",
};

let authToken = localStorage.getItem(STORAGE.token) || "";
let authLogin = localStorage.getItem(STORAGE.login) || "";
let authScopes = (localStorage.getItem(STORAGE.scopes) || "").split(",").filter(Boolean);

printButton.addEventListener("click", () => window.print());
loginButton.addEventListener("click", handleDeviceLogin);
logoutButton.addEventListener("click", handleLogout);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = usernameInput.value.trim();
  if (!username) {
    setStatus("Enter a GitHub username.", true);
    return;
  }
  await generateResume(username);
});

bootstrapAuth();

async function bootstrapAuth() {
  relayUrlInput.value = localStorage.getItem(STORAGE.relayUrl) || "";
  relayUrlInput.addEventListener("change", () => {
    const val = relayUrlInput.value.trim();
    if (!val) {
      localStorage.removeItem(STORAGE.relayUrl);
      return;
    }
    localStorage.setItem(STORAGE.relayUrl, normalizeRelayUrl(val));
  });

  clientIdInput.value = localStorage.getItem(STORAGE.clientId) || "";
  clientIdInput.addEventListener("change", () => {
    const val = clientIdInput.value.trim();
    if (!val) {
      localStorage.removeItem(STORAGE.clientId);
      return;
    }
    localStorage.setItem(STORAGE.clientId, val);
  });

  if (!authToken) {
    renderAuthState();
    return;
  }

  const me = await fetchJson("/user");
  if (!me.ok || !me.data || !me.data.login) {
    clearAuth();
    renderAuthState();
    return;
  }

  authLogin = me.data.login;
  localStorage.setItem(STORAGE.login, authLogin);
  usernameInput.value = authLogin;
  renderAuthState();
}

async function handleDeviceLogin() {
  const relayBase = getRelayBase();
  if (!relayBase) {
    setAuthMeta("Add your OAuth Relay URL first.", true);
    return;
  }

  const clientId = clientIdInput.value.trim();
  if (!clientId) {
    setAuthMeta("Add your OAuth Client ID first.", true);
    return;
  }

  localStorage.setItem(STORAGE.relayUrl, relayBase);
  localStorage.setItem(STORAGE.clientId, clientId);
  setAuthMeta("Requesting device code...");

  try {
    const deviceStart = await fetch(`${relayBase}/oauth/device/code`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        scope: OAUTH_SCOPES,
      }),
    });

    const deviceData = await deviceStart.json();
    if (!deviceStart.ok || !deviceData.device_code) {
      throw new Error(deviceData.error_description || "Could not start GitHub sign-in flow.");
    }

    const verifyUrl = deviceData.verification_uri || "https://github.com/login/device";
    const code = deviceData.user_code;
    let interval = Number(deviceData.interval || 5);
    const expiresAt = Date.now() + Number(deviceData.expires_in || 900) * 1000;

    verifyLinkEl.href = verifyUrl;
    verifyLinkEl.textContent = verifyUrl.replace(/^https?:\/\//, "");
    userCodeEl.textContent = code;
    devicePanelEl.classList.remove("hidden");
    deviceStatusEl.textContent = "Waiting for approval...";
    setAuthMeta("Complete GitHub authorization in the opened page.");

    window.open(verifyUrl, "_blank", "noopener,noreferrer");

    while (Date.now() < expiresAt) {
      await sleep(interval * 1000);

      const tokenRes = await fetch(`${relayBase}/oauth/device/token`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: clientId,
          device_code: deviceData.device_code,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }),
      });

      const tokenData = await tokenRes.json();
      if (tokenData.access_token) {
        authToken = tokenData.access_token;
        authScopes = String(tokenData.scope || "").split(",").filter(Boolean);
        localStorage.setItem(STORAGE.token, authToken);
        localStorage.setItem(STORAGE.scopes, authScopes.join(","));

        const me = await fetchJson("/user");
        if (!me.ok || !me.data || !me.data.login) {
          throw new Error("Authorized, but failed to fetch user profile.");
        }

        authLogin = me.data.login;
        localStorage.setItem(STORAGE.login, authLogin);
        usernameInput.value = authLogin;
        deviceStatusEl.textContent = "Authorization complete.";
        setAuthMeta(`Signed in as @${authLogin}.`);
        renderAuthState();
        return;
      }

      if (tokenData.error === "authorization_pending") {
        deviceStatusEl.textContent = "Waiting for approval...";
        continue;
      }
      if (tokenData.error === "slow_down") {
        interval += 5;
        deviceStatusEl.textContent = "GitHub asked to slow down polling...";
        continue;
      }
      if (tokenData.error === "access_denied") {
        throw new Error("Authorization was denied.");
      }
      if (tokenData.error === "expired_token") {
        throw new Error("Device code expired. Start sign-in again.");
      }

      throw new Error(tokenData.error_description || "GitHub authorization failed.");
    }

    throw new Error("Login timed out. Start sign-in again.");
  } catch (error) {
    setAuthMeta(error.message, true);
  }
}

function getRelayBase() {
  const raw = relayUrlInput.value.trim() || localStorage.getItem(STORAGE.relayUrl) || "";
  if (!raw) return "";
  return normalizeRelayUrl(raw);
}

function normalizeRelayUrl(url) {
  return String(url).trim().replace(/\/+$/, "");
}

function handleLogout() {
  clearAuth();
  renderAuthState();
  setAuthMeta("Signed out.");
}

function clearAuth() {
  authToken = "";
  authLogin = "";
  authScopes = [];
  localStorage.removeItem(STORAGE.token);
  localStorage.removeItem(STORAGE.login);
  localStorage.removeItem(STORAGE.scopes);
}

function renderAuthState() {
  const hasAuth = Boolean(authToken && authLogin);
  logoutButton.classList.toggle("hidden", !hasAuth);
  devicePanelEl.classList.toggle("hidden", !hasAuth && userCodeEl.textContent === "-");
  if (hasAuth) {
    setAuthMeta(`Signed in as @${authLogin}${authScopes.length ? ` (scopes: ${authScopes.join(", ")})` : ""}.`);
  } else {
    setAuthMeta("Not signed in. Public mode uses GitHub unauthenticated limits (60 requests/hour per IP).");
  }
}

async function generateResume(username) {
  setLoading(true);
  resumeEl.classList.add("hidden");
  printButton.classList.add("hidden");
  clearLists();

  try {
    const isSelfRequested = Boolean(authLogin) && authLogin.toLowerCase() === username.toLowerCase();

    const userPath = isSelfRequested ? "/user" : `/users/${encodeURIComponent(username)}`;
    const reposPath = isSelfRequested
      ? "/user/repos?per_page=100&sort=updated"
      : `/users/${encodeURIComponent(username)}/repos?per_page=100`;
    const orgsPath = isSelfRequested
      ? "/user/orgs?per_page=100"
      : `/users/${encodeURIComponent(username)}/orgs?per_page=100`;
    const eventsPath = `/users/${encodeURIComponent(username)}/events/public?per_page=100`;

    const [userResponse, reposResponse, orgsResponse, eventsResponse] = await Promise.all([
      fetchJson(userPath),
      fetchJson(reposPath),
      fetchJson(orgsPath),
      fetchJson(eventsPath),
    ]);

    if (userResponse.status === 404) {
      throw new Error("User not found.");
    }

    const hasForbidden = [userResponse, reposResponse, orgsResponse, eventsResponse].some(
      (entry) => entry.status === 403 || entry.status === 429
    );
    if (hasForbidden) {
      throw new Error("GitHub API rate limit reached. Sign in to increase limits, then retry.");
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
      fetchJson(`/search/issues?q=author:${encodeURIComponent(username)}+type:pr+is:merged&per_page=1`),
    ]);

    const lifetimeCommitEstimate = await estimateLifetimeCommits(user.login, repos);
    const authoredPrs = authoredPrSearch.ok && authoredPrSearch.data ? authoredPrSearch.data.total_count : null;
    const mergedPrs = mergedPrSearch.ok && mergedPrSearch.data ? mergedPrSearch.data.total_count : null;
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
      isSelfRequested,
    });

    setStatus(`Advanced resume generated for @${user.login}.`);
    resumeEl.classList.remove("hidden");
    printButton.classList.remove("hidden");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    setLoading(false);
  }
}

async function fetchJson(path) {
  const headers = {
    Accept: "application/vnd.github+json",
  };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(`${GITHUB_API}${path}`, { headers });
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
      fetchJson(
        `/repos/${encodeURIComponent(login)}/${encodeURIComponent(repo.name)}/contributors?per_page=100`
      )
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
    isSelfRequested,
  } = payload;

  avatarEl.src = user.avatar_url;
  nameEl.textContent = user.name || user.login;
  handleEl.textContent = `@${user.login}`;
  bioEl.textContent = user.bio || "No public bio.";
  metaEl.textContent = [user.location, user.blog].filter(Boolean).join(" • ");

  const accountAge = getGithubYears(user.created_at);
  const totalStars = repos.reduce((sum, repo) => sum + (repo.stargazers_count || 0), 0);

  repoCountEl.textContent = formatNumber(repos.length);
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

  if (isSelfRequested && authToken) {
    dataScopeEl.textContent =
      "Authenticated mode: this report may include private repositories and organizations you granted access to, depending on approved scopes.";
  } else {
    dataScopeEl.textContent =
      "Public mode: this report uses public GitHub API data only. Private organizations, private repos, private commits, and line-level code volume are not exposed.";
  }
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
    const recentPush = Date.now() - new Date(entry.repo.pushed_at).getTime() <= 180 * 24 * 60 * 60 * 1000;

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
      `${entry.repo.name}: ${score}/100 ${
        badges.length ? `(${badges.join(" • ")})` : "(No maturity signals found)"
      }`
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
    .reduce(
      (sum, event) =>
        sum + ((event.payload && event.payload.commits && event.payload.commits.length) || 0),
      0
    );

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
    stackRows: stackRows.length
      ? stackRows
      : ["No framework/tool signals detected from sampled repositories."],
    maturityRows: maturityRows.length
      ? maturityRows
      : ["No owned public repositories available for maturity analysis."],
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

function summarizeEvents(events) {
  const recentCommits = events
    .filter((event) => event.type === "PushEvent")
    .reduce(
      (sum, event) => sum + ((event.payload && event.payload.commits && event.payload.commits.length) || 0),
      0
    );

  const pushEvents = events.filter((event) => event.type === "PushEvent").length;

  const recentEvents = events.slice(0, 8).map((event) => {
    const repoName = event.repo ? event.repo.name : "unknown-repo";
    const createdAt = prettyDate(event.created_at);

    if (event.type === "PushEvent") {
      const commitCount =
        (event.payload && event.payload.commits && event.payload.commits.length) || 0;
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
    rows.push(`Community impact: ${formatNumber(totalStars)} stars across repositories`);
  }
  if (languageCount >= 3) {
    rows.push(`Polyglot profile: active across ${languageCount} primary languages`);
  }
  if (mergedPrs !== null && mergedPrs > 0) {
    rows.push(`${formatNumber(mergedPrs)} merged pull requests authored`);
  }
  if (orgCount > 0) {
    rows.push(`Visible member of ${formatNumber(orgCount)} organization${orgCount > 1 ? "s" : ""}`);
  }
  if (archivedRepos > 0) {
    rows.push(`${formatNumber(archivedRepos)} archived repo${archivedRepos > 1 ? "s" : ""}`);
  }

  if (rows.length === 0) {
    rows.push("No standout achievements detected from current API signals yet.");
  }

  return rows;
}

function renderTopRepos(repos) {
  if (repos.length === 0) {
    topReposEl.appendChild(createSimpleItem("No repositories found."));
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
    languagesEl.appendChild(createSimpleItem("No languages detected."));
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
    languageBytesListEl.appendChild(
      createSimpleItem("No language byte data available from sampled repositories.")
    );
    return;
  }
  const total = rows.reduce((sum, row) => sum + row[1], 0);
  rows.forEach(([language, bytes]) => {
    const percent = total > 0 ? ((bytes / total) * 100).toFixed(1) : "0.0";
    languageBytesListEl.appendChild(
      createSimpleItem(`${language}: ${percent}% (${formatNumber(bytes)} bytes)`)
    );
  });
}

function renderRecentActivity(lines) {
  if (!lines.length) {
    recentActivityEl.appendChild(createSimpleItem("No recent public activity available."));
    return;
  }

  lines.forEach((line) => {
    recentActivityEl.appendChild(createSimpleItem(line));
  });
}

function renderPlainList(listEl, rows) {
  if (!rows.length) {
    listEl.appendChild(createSimpleItem("No data available."));
    return;
  }

  rows.forEach((row) => {
    listEl.appendChild(createSimpleItem(row));
  });
}

function createSimpleItem(message) {
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
  loginButton.disabled = loading;
  generateButton.textContent = loading ? "Generating..." : "Generate Resume";
  if (loading) {
    setStatus("Collecting profile, repositories, organizations, PRs, and activity...");
  }
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#b00020" : "";
}

function setAuthMeta(message, isError = false) {
  authMetaEl.textContent = message;
  authMetaEl.style.color = isError ? "#b00020" : "";
}

function formatNumber(value) {
  return Intl.NumberFormat().format(value || 0);
}

function getGithubYears(createdAt) {
  if (!createdAt) return "0";
  const createdDate = new Date(createdAt);
  const now = new Date();
  const years = Math.max(
    0,
    Math.floor((now - createdDate) / (365.25 * 24 * 60 * 60 * 1000))
  );
  return String(years);
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

function prettyDate(isoValue) {
  if (!isoValue) return "Unknown date";
  return new Date(isoValue).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
