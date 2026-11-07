const $ = (id) => document.getElementById(id);
const form = $("download-form");
const urlInput = $("video-url");
const errorBox = $("error-message");
const previewArea = $("preview-area");
const video = $("video-preview");
const youtubePreview = $("youtube-preview");
const downloadButton = $("download-btn");
const previewButton = $("preview-btn");
const progressWrap = $("progress-wrap");
const historyList = $("history-list");
const HISTORY_KEY = "framedrop-download-history";

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
  $("url-box").classList.add("has-error");
}
function clearError() {
  errorBox.hidden = true;
  errorBox.textContent = "";
  $("url-box").classList.remove("has-error");
}
function parseUrl(value) {
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error("Please enter a complete, valid URL."); }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP and HTTPS video links are supported.");
  if (url.username || url.password) throw new Error("URLs containing credentials are not supported.");
  return url;
}
function getYouTubeVideoId(url) {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] || null;
  if (host !== "youtube.com" && host !== "m.youtube.com" && host !== "youtube-nocookie.com") return null;
  if (url.pathname === "/watch") return url.searchParams.get("v");
  const match = url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/);
  return match?.[1] || null;
}
function clearPreview() {
  video.pause();
  video.removeAttribute("src");
  video.load();
  youtubePreview.removeAttribute("src");
  youtubePreview.hidden = true;
  $("youtube-open-link").hidden = true;
  video.hidden = false;
  $("preview-caption").textContent = "Preview is loaded directly from the URL you provided. Some hosts may block browser playback.";
}
function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { return []; }
}
function saveHistory(item) {
  const entries = [item, ...getHistory()].slice(0, 8);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
  renderHistory();
}
function renderHistory() {
  const entries = getHistory();
  if (!entries.length) {
    historyList.innerHTML = `<div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 24 24"><path d="M12 3v12m-5-5 5 5 5-5M4 17v3h16v-3"/></svg></div><strong>Your library is waiting</strong><span>Videos you download will show up here.</span></div>`;
    return;
  }
  historyList.replaceChildren(...entries.map(entry => {
    const item = document.createElement("div");
    item.className = "history-item";
    const icon = document.createElement("div");
    icon.className = "history-file";
    icon.innerHTML = `<svg viewBox="0 0 20 20"><path d="M4 2h8l4 4v12H4zM12 2v5h4M7 12h6m-6 3h6"/></svg>`;
    const info = document.createElement("div");
    info.className = "history-info";
    const name = document.createElement("strong");
    name.textContent = entry.name;
    const meta = document.createElement("span");
    meta.textContent = `${entry.format} · ${new Date(entry.date).toLocaleString()}`;
    info.append(name, meta);
    const done = document.createElement("span");
    done.className = "history-done";
    done.textContent = "SAVED";
    item.append(icon, info, done);
    return item;
  }));
}
function setBusy(busy) {
  downloadButton.disabled = busy;
  previewButton.disabled = busy;
  downloadButton.querySelector("span").textContent = busy ? "Downloading…" : "Download video";
}
function setProgress(percent, label) {
  progressWrap.hidden = false;
  $("progress-fill").style.width = `${percent}%`;
  $("progress-value").textContent = `${Math.round(percent)}%`;
  $("progress-label").textContent = label;
}
function filenameFromDisposition(header, fallback) {
  const match = header?.match(/filename="?([^";]+)"?/i);
  return match ? match[1] : fallback;
}

urlInput.addEventListener("input", () => {
  $("clear-btn").hidden = !urlInput.value;
  clearError();
});
$("clear-btn").addEventListener("click", () => {
  urlInput.value = "";
  $("clear-btn").hidden = true;
  clearPreview();
  previewArea.hidden = true;
  clearError();
  urlInput.focus();
});

previewButton.addEventListener("click", () => {
  clearError();
  try {
    const url = parseUrl(urlInput.value);
    const youtubeId = getYouTubeVideoId(url);
    if (youtubeId) {
      if (!/^[\w-]{11}$/.test(youtubeId)) throw new Error("That YouTube link does not contain a valid video ID.");
      video.pause();
      video.removeAttribute("src");
      video.load();
      video.hidden = true;
      youtubePreview.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeId)}`;
      youtubePreview.hidden = false;
      const youtubeLink = $("youtube-open-link");
      youtubeLink.href = `https://www.youtube.com/watch?v=${encodeURIComponent(youtubeId)}`;
      youtubeLink.hidden = false;
      $("preview-caption").textContent = "If the preview cannot play, the video may be unavailable or may not allow embedding.";
    } else {
      youtubePreview.removeAttribute("src");
      youtubePreview.hidden = true;
      $("youtube-open-link").hidden = true;
      video.hidden = false;
      video.src = url.href;
      video.load();
      $("preview-caption").textContent = "Preview is loaded directly from the URL you provided. Some hosts may block browser playback.";
    }
    previewArea.hidden = false;
    previewArea.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) { showError(error.message); }
});
$("close-preview").addEventListener("click", () => {
  clearPreview();
  previewArea.hidden = true;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();
  let source;
  try { source = parseUrl(urlInput.value).href; }
  catch (error) { showError(error.message); return; }
  if (getYouTubeVideoId(new URL(source))) {
    showError("YouTube previews are supported, but downloads are limited to direct video-file URLs.");
    return;
  }

  const format = $("format").value;
  if (format === "mp4" && !/\.mp4(?:$|[?#])/i.test(source)) {
    showError("MP4 is only available when the source itself is an MP4 file. Choose Original for this URL.");
    return;
  }

  setBusy(true);
  setProgress(0, "Connecting to video source…");
  $("progress-note").textContent = "The server checks the source and streams the original file. No conversion is performed.";
  try {
    const response = await fetch("/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: source })
    });
    if (!response.ok) {
      let message = "Download failed. Check the link and try again.";
      try { message = (await response.json()).error || message; } catch {}
      throw new Error(message);
    }

    const total = Number(response.headers.get("content-length") || 0);
    const filename = filenameFromDisposition(response.headers.get("content-disposition"), "video");
    if (!response.body) throw new Error("Your browser does not support streamed downloads.");
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (total) setProgress(Math.min(99, received / total * 100), "Downloading video…");
      else {
        const pulse = Math.min(92, 8 + Math.log10(received + 1) * 18);
        setProgress(pulse, "Downloading video…");
        $("progress-note").textContent = `${(received / 1024 / 1024).toFixed(1)} MB received`;
      }
    }
    const blob = new Blob(chunks, { type: response.headers.get("content-type") || "application/octet-stream" });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    setProgress(100, "Download ready");
    $("progress-note").textContent = `${(received / 1024 / 1024).toFixed(2)} MB · Your browser has been asked to save the file.`;
    saveHistory({ name: filename, format: format === "mp4" ? "MP4" : "Original", date: new Date().toISOString() });
  } catch (error) {
    progressWrap.hidden = true;
    showError(error.message || "Something went wrong while downloading.");
  } finally {
    setBusy(false);
  }
});

$("clear-history").addEventListener("click", () => {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
});
renderHistory();
