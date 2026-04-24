const sourceStatus = document.getElementById("sourceStatus");
console.log("app.js loaded");

const sourceSelect = document.getElementById("source");
const modeSelect = document.getElementById("mode");
const keywordsInput = document.getElementById("keywords");
const widthInput = document.getElementById("width");
const heightInput = document.getElementById("height");
const countInput = document.getElementById("count");
const formatSelect = document.getElementById("format");
const orientationSelect = document.getElementById("orientation");
const categoryInput = document.getElementById("categoryInput");
const resultsContainer = document.getElementById("resultsContainer");
const historyContainer = document.getElementById("historyContainer");
const resultsSummary = document.getElementById("resultsSummary");
const activeSources = document.getElementById("activeSources");

const SOURCE_MAP = {
  "All Sources": ["Pixabay", "Pexels", "Openverse"],
  "Pixabay": ["Pixabay"],
  "Pexels": ["Pexels"],
  "Openverse": ["Openverse"]
};

function parseKeywords(value) {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getActiveSourceList() {
  return SOURCE_MAP[sourceSelect.value] || ["Pixabay"];
}

function renderSources() {
  const allOptions = ["Pixabay", "Pexels", "All Sources"];

  activeSources.innerHTML = allOptions
    .map((source) => {
      const active = sourceSelect.value === source ? "active-pill" : "";
      return `
        <button
          class="source-pill ${active}"
          type="button"
          onclick="changeSource('${source}')"
        >
          ${source}
        </button>
      `;
    })
    .join("");
}

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem("imageToolHistory") || "[]");
  } catch {
    return [];
  }
}

function saveHistory(item) {
  const history = getHistory();
  history.unshift(item);
  localStorage.setItem("imageToolHistory", JSON.stringify(history.slice(0, 8)));
  renderHistory();
}

function renderHistory() {
  const history = getHistory();

  if (!history.length) {
    historyContainer.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <h3>No history yet</h3>
        <p>Your recent searches will appear here.</p>
      </div>
    `;
    return;
  }

  historyContainer.innerHTML = history
    .map(
      (item, index) => `
        <div class="history-card">
          <h4>${item.keywords.join(", ")}</h4>
          <p class="muted">${item.action} • ${item.mode} • ${item.source}</p>
          <p class="muted">${item.width} × ${item.height} • ${item.format} • ${item.count} per keyword</p>
          <p class="muted small">${item.createdAt}</p>
          <button class="btn-secondary small" type="button" onclick="runHistory(${index})">Run Again</button>
        </div>
      `
    )
    .join("");
}

window.runHistory = function (index) {
  const history = getHistory();
  const item = history[index];
  if (!item) return;

  keywordsInput.value = item.keywords.join(", ");
  widthInput.value = item.width;
  heightInput.value = item.height;
  countInput.value = item.count;
  formatSelect.value = item.format;
  sourceSelect.value = item.source;
  modeSelect.value = item.mode;
  orientationSelect.value = item.orientation;
  categoryInput.value = item.category || "";

  fetchImages("Repeat");
};

function improveKeyword(keyword) {
  const keywordMap = {
    office: "modern office interior workspace high quality",
    cat: "cute cat portrait close up high quality",
    mountain: "mountain lake landscape scenic high quality",
    business: "business meeting corporate office high quality",
    food: "healthy food photography plated meal high quality",
    car: "modern luxury car studio shot high quality",
    dog: "cute dog portrait high quality",
    home: "modern home interior design high quality",
    laptop: "laptop workspace desk setup high quality"
  };

  return keywordMap[keyword.toLowerCase()] || `${keyword} high quality professional photo`;
}

async function fetchImages(action = "Fetch") {
  const keywords = parseKeywords(keywordsInput.value);
  const width = Number(widthInput.value) || 1024;
  const height = Number(heightInput.value) || 768;
  const count = Math.max(1, Math.min(12, Number(countInput.value) || 6));
  const format = formatSelect.value;
  const mode = modeSelect.value;
  const category = categoryInput.value;
  const orientation = orientationSelect.value;

  renderSources();

  if (!keywords.length) {
    resultsContainer.innerHTML = `
      <div class="empty-state">
        <h3>No keywords entered</h3>
        <p>Add one or more keywords to continue.</p>
      </div>
    `;
    resultsSummary.textContent = "Add keywords to start.";
    return;
  }

  if (mode === "Generate Images") {
  resultsContainer.innerHTML = `
    <div class="empty-state">
      <h3>Generating...</h3>
      <p>Creating images with Gemini.</p>
    </div>
  `;

  try {
    const groups = await Promise.all(
      keywords.map(async (keyword) => {
        const res = await fetch("/api/generate-image", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            prompt: keyword,
            width,
            height,
            count: Math.min(count, 2)
          })
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Generation failed");
        }

        return {
          keyword,
          images: data.images || []
        };
      })
    );

    resultsContainer.innerHTML = groups
      .map(
        (group) => `
          <section class="keyword-group">
            <div class="keyword-head">
              <h3>Keyword: ${group.keyword}</h3>
              <span class="muted">${group.images.length} generated image${group.images.length !== 1 ? "s" : ""} • ${width} × ${height} • ${format}</span>
            </div>
            <div class="gallery">
              ${
                group.images.length
                  ? group.images
                      .map(
                        (img, index) => `
                          <div class="card">
                            <div class="thumb" style="background-image:url('data:${img.mimeType};base64,${img.data}')">
                              <span>${width} × ${height}</span>
                            </div>
                            <div class="meta">
                              <p>Source: Gemini • Generated image ${index + 1}</p>
                              <div class="mini-actions">
                                <a
                                  href="data:${img.mimeType};base64,${img.data}"
                                  download="${group.keyword.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}.${img.mimeType.includes("webp") ? "webp" : img.mimeType.includes("png") ? "png" : "jpg"}"
                                  class="btn-primary"
                                  style="text-decoration:none; display:inline-block; text-align:center; padding:12px 14px; border-radius:10px;"
                                >
                                  Download
                                </a>
                              </div>
                            </div>
                          </div>
                        `
                      )
                      .join("")
                  : `
                    <div class="card">
                      <div class="thumb alt"><span>No generated image returned</span></div>
                      <div class="meta">
                        <p>Source: Gemini</p>
                      </div>
                    </div>
                  `
              }
            </div>
          </section>
        `
      )
      .join("");

    resultsSummary.textContent = `${action} ran in Generate mode for ${keywords.length} keyword${keywords.length > 1 ? "s" : ""}.`;

    saveHistory({
      action,
      keywords,
      width,
      height,
      count,
      format,
      source: "Gemini",
      mode,
      orientation,
      category,
      createdAt: new Date().toLocaleString()
    });
  } catch (error) {
    resultsContainer.innerHTML = `
      <div class="empty-state">
        <h3>Generation failed</h3>
        <p>${error.message}</p>
      </div>
    `;
    console.error(error);
  }

  return;
}

  resultsContainer.innerHTML = `
    <div class="empty-state">
      <h3>Loading...</h3>
      <p>Fetching images from API.</p>
    </div>
  `;

  try {
    const groups = await Promise.all(
      keywords.map(async (rawKeyword) => {
        const keyword = improveKeyword(rawKeyword);

        let endpoint = "/api/search/pixabay";

if (sourceSelect.value === "Pexels") {
  endpoint = "/api/search/pexels";
} else if (sourceSelect.value === "All Sources") {
  endpoint = "/api/search/all";
}

const res = await fetch(
  `${endpoint}?keyword=${encodeURIComponent(keyword)}&category=${encodeURIComponent(category)}&min_width=${width}&min_height=${height}&per_page=${count}&orientation=${encodeURIComponent(orientation)}`
);

const data = await res.json();

if (!res.ok) {
  throw new Error(data.error || "Failed to fetch images");
}

return {
  keyword: rawKeyword,
  images: data.images || [],
  status: data.status || null
};
      })
    );

    resultsContainer.innerHTML = groups
      .map(
        (group) => `
          <section class="keyword-group">
            <div class="keyword-head">
              <h3>Keyword: ${group.keyword}</h3>
              <span class="muted">${group.images.length} result${group.images.length !== 1 ? "s" : ""} • ${width} × ${height} • ${format}</span>
            </div>
            <div class="gallery">
              ${
                (group.images.length)
  ? group.images
      .map(
        (img) => `
          <div class="card">
<div class="thumb" id="preview-${img.id}">
  <img
    src="/api/image-proxy?url=${encodeURIComponent(img.preview || img.thumb || img.download)}"
    alt="${img.tags || group.keyword}"
    style="width:100%; height:100%; object-fit:cover; display:block;"
    onerror="this.onerror=null; this.src='/api/image-proxy?url=${encodeURIComponent(img.thumb || img.download)}';"
  />
  <span>${img.width} × ${img.height}</span>
</div>
            <div class="meta">
              <p>Source: ${img.source} • ${img.tags}</p>
              <div class="mini-actions">
                <button
                  class="btn-secondary"
                  type="button"
                  onclick="previewImage('${img.download}', '${img.preview || img.thumb || img.download}', '${width}', '${height}', '${format.toLowerCase()}', 'preview-${img.id}')"
                >
                  Convert
                </button>

                <a
                  href="/api/convert?imageUrl=${encodeURIComponent(img.download)}&previewUrl=${encodeURIComponent(img.preview || img.thumb || img.download)}&width=${width}&height=${height}&format=${format.toLowerCase()}&filename=${encodeURIComponent(group.keyword)}"
                  class="btn-primary"
                  style="text-decoration:none; display:inline-block; text-align:center; padding:12px 14px; border-radius:10px;"
                >
                  Download
                </a>
              </div>
            </div>
          </div>
        `
      )
      .join("")
                  : `
                    <div class="card">
                      <div class="thumb alt"><span>No relevant images found<br>Try Generate mode</span></div>
                      <div class="meta">
                        <p>Source: Pixabay</p>
                        <div class="mini-actions">
                          <button class="btn-secondary" type="button">Edit Prompt</button>
                          <button class="btn-primary" type="button">Generate</button>
                        </div>
                      </div>
                    </div>
                  `
              }
            </div>
          </section>
        `
      )
      .join("");

    const selectedSource = sourceSelect.value;
    const sourceNote =
      selectedSource === "Pixabay"
        ? "Pixabay"
        : `${selectedSource} (currently using Pixabay backend)`;

    resultsSummary.textContent = `${action} ran for ${keywords.length} keyword${keywords.length > 1 ? "s" : ""} using ${sourceNote}.`;
if (sourceSelect.value === "All Sources") {
  const firstGroupWithStatus = groups.find((g) => g.status);

  if (firstGroupWithStatus && firstGroupWithStatus.status) {
    const s = firstGroupWithStatus.status;
    sourceStatus.textContent =
      `Pixabay: ${s.pixabay.ok ? `${s.pixabay.count} images` : `failed (${s.pixabay.error})`} | ` +
      `Pexels: ${s.pexels.ok ? `${s.pexels.count} images` : `failed (${s.pexels.error})`}`;
  } else {
    sourceStatus.textContent = "";
  }
} else {
  sourceStatus.textContent = "";
}
    saveHistory({
      action,
      keywords,
      width,
      height,
      count,
      format,
      source: sourceSelect.value,
      mode,
      orientation,
      category,
      createdAt: new Date().toLocaleString()
    });
  } catch (error) {
    resultsContainer.innerHTML = `
      <div class="empty-state">
        <h3>Something went wrong</h3>
        <p>Could not fetch images. Check your server and API key.</p>
      </div>
    `;
    console.error(error);
  }
}

const fetchBtn = document.getElementById("fetchBtn");
const generateBtn = document.getElementById("generateBtn");
const resetBtn = document.getElementById("resetBtn");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");

if (fetchBtn) {
  fetchBtn.addEventListener("click", () => {
    console.log("Fetch button clicked");
    fetchImages("Fetch");
  });
}

if (generateBtn) {
  generateBtn.addEventListener("click", () => {
    modeSelect.value = "Generate Images";
    fetchImages("Generate");
  });
}

if (resetBtn) {
  resetBtn.addEventListener("click", () => {
    keywordsInput.value = "";
    widthInput.value = 1024;
    heightInput.value = 768;
    countInput.value = 6;
    formatSelect.value = "JPG";
    sourceSelect.value = "Pixabay";
    modeSelect.value = "Fetch Images";
    orientationSelect.value = "all";
    categoryInput.value = "";
    renderSources();

    resultsContainer.innerHTML = `
      <div class="empty-state">
        <h3>Form reset</h3>
        <p>Enter keywords and click Fetch to load images again.</p>
      </div>
    `;
    resultsSummary.textContent = "Form reset. Ready for a new search.";
  });
}

if (clearHistoryBtn) {
  clearHistoryBtn.addEventListener("click", () => {
    localStorage.removeItem("imageToolHistory");
    renderHistory();
  });
}

if (sourceSelect) {
  sourceSelect.addEventListener("change", () => {
    
    window.changeSource = function (source) {
  sourceSelect.value = source;
  renderSources();

  if (keywordsInput.value.trim()) {
    fetchImages("Fetch");
  }
};
    renderSources();
    if (keywordsInput.value.trim()) {
      fetchImages("Fetch");
    }
  });
}

if (categoryInput) {
  categoryInput.addEventListener("change", () => {
    if (keywordsInput.value.trim()) {
      fetchImages("Fetch");
    }
  });
}

if (orientationSelect) {
  orientationSelect.addEventListener("change", () => {
    if (keywordsInput.value.trim()) {
      fetchImages("Fetch");
    }
  });
}

if (modeSelect) {
  modeSelect.addEventListener("change", () => {
    if (keywordsInput.value.trim()) {
      fetchImages(modeSelect.value === "Generate Images" ? "Generate" : "Fetch");
    }
  });
}

if (clearHistoryBtn) {
  clearHistoryBtn.addEventListener("click", () => {
    localStorage.removeItem("imageToolHistory");
    renderHistory();
  });
}
window.changeSource = function (source) {
  sourceSelect.value = source;
  renderSources();

  if (keywordsInput.value.trim()) {
    fetchImages("Fetch");
  }
};
renderSources();
renderHistory();

window.previewImage = async function (imageUrl, previewUrl, width, height, format, elementId) {
  try {
    const imgElement = document.getElementById(elementId);
    if (!imgElement) return;

    const url = `/api/preview-convert?imageUrl=${encodeURIComponent(imageUrl)}&previewUrl=${encodeURIComponent(previewUrl)}&width=${width}&height=${height}&format=${format}`;

    imgElement.innerHTML = `
      <img
        src="${url}"
        alt="Converted preview"
        style="width:100%; height:100%; object-fit:cover; display:block;"
      />
      <span>${width} × ${height}</span>
    `;
  } catch (error) {
    console.error("Preview failed", error);
  }
};
const downloadAllBtn = document.getElementById("downloadAllBtn");

if (downloadAllBtn) {
  downloadAllBtn.addEventListener("click", () => {
    const links = document.querySelectorAll('.mini-actions a.btn-primary');

    if (!links.length) {
      alert("No images to download");
      return;
    }

    links.forEach((link, index) => {
      setTimeout(() => {
        link.click();
      }, index * 300); // delay to avoid browser blocking
    });
  });
}