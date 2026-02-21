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

const repoCountEl = document.getElementById("repo-count");
const followersEl = document.getElementById("followers");
const followingEl = document.getElementById("following");

const topReposEl = document.getElementById("top-repos");
const languagesEl = document.getElementById("languages");

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
    const [userResponse, reposResponse] = await Promise.all([
      fetch(`${GITHUB_API}/users/${encodeURIComponent(username)}`),
      fetch(`${GITHUB_API}/users/${encodeURIComponent(username)}/repos?per_page=100`),
    ]);

    if (userResponse.status === 404) {
      throw new Error("User not found.");
    }

    if (userResponse.status === 403 || reposResponse.status === 403) {
      throw new Error(
        "GitHub API rate limit reached. Please wait a bit and try again."
      );
    }

    if (!userResponse.ok || !reposResponse.ok) {
      throw new Error("Could not fetch GitHub data. Please try again.");
    }

    const user = await userResponse.json();
    const repos = await reposResponse.json();

    renderUser(user, repos);
    setStatus(`Resume generated for @${user.login}.`);
    resumeEl.classList.remove("hidden");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    setLoading(false);
  }
});

function renderUser(user, repos) {
  avatarEl.src = user.avatar_url;
  nameEl.textContent = user.name || user.login;
  handleEl.textContent = `@${user.login}`;
  bioEl.textContent = user.bio || "No public bio.";
  metaEl.textContent = [user.location, user.blog].filter(Boolean).join(" • ");

  repoCountEl.textContent = Intl.NumberFormat().format(user.public_repos);
  followersEl.textContent = Intl.NumberFormat().format(user.followers);
  followingEl.textContent = Intl.NumberFormat().format(user.following);

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

function createEmptyItem(message) {
  const item = document.createElement("li");
  item.textContent = message;
  return item;
}

function clearLists() {
  topReposEl.innerHTML = "";
  languagesEl.innerHTML = "";
}

function setLoading(loading) {
  generateButton.disabled = loading;
  generateButton.textContent = loading ? "Generating..." : "Generate Resume";
  if (loading) {
    setStatus("Fetching public profile and repositories...");
  }
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#b00020" : "";
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
