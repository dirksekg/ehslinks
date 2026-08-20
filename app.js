"use strict";

const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTETtBtIzAsbflRKGKoFKhjTpjirr07wbkfgzYiBZ4ygHdZD_FzcnK2SYHenYarHEDWDXAu7sJ5y7Fx/pub?output=csv";
const USAGE_KEY = "ehs-homepage-link-usage-v1";
const TILE_CACHE_KEY = "ehs-homepage-tiles-v1";

const grid = document.getElementById("tileGrid");
const statusMessage = document.getElementById("statusMessage");
const usagePanel = document.getElementById("usagePanel");
const usageList = document.getElementById("usageList");
const usageToggle = document.getElementById("usageToggle");
const closeUsageButton = document.getElementById("closeUsage");
const resetAllButton = document.getElementById("resetAll");

let tiles = [];
let usage = readStored(USAGE_KEY, {});
let confirmingResetAll = false;

function parseCsv(csv) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    const nextCharacter = csv[index + 1];

    if (character === '"' && quoted && nextCharacter === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && nextCharacter === "\n") index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function readStored(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The homepage remains usable when browser storage is unavailable.
  }
}

function createFallback(text) {
  const fallback = document.createElement("span");
  fallback.className = "tile-fallback";
  fallback.setAttribute("aria-hidden", "true");
  fallback.textContent = text.charAt(0).toUpperCase();
  return fallback;
}

function renderTiles() {
  grid.replaceChildren();

  for (const tile of tiles) {
    const link = document.createElement("a");
    link.className = "tile";
    link.href = tile.url;

    if (tile.image) {
      const image = document.createElement("img");
      image.src = tile.image;
      image.alt = "";
      image.addEventListener("error", () => image.replaceWith(createFallback(tile.text)), { once: true });
      link.append(image);
    } else {
      link.append(createFallback(tile.text));
    }

    const label = document.createElement("span");
    label.textContent = tile.text;
    link.append(label);
    link.addEventListener("click", () => recordVisit(tile.url));
    grid.append(link);
  }

  statusMessage.hidden = true;
  renderUsageList();
}

function recordVisit(url) {
  usage = readStored(USAGE_KEY, usage);
  usage[url] = (usage[url] || 0) + 1;
  writeStored(USAGE_KEY, usage);
}

function resetOne(url) {
  delete usage[url];
  writeStored(USAGE_KEY, usage);
  renderUsageList();
}

function renderUsageList() {
  usageList.replaceChildren();

  for (const tile of tiles) {
    const count = usage[tile.url] || 0;
    const row = document.createElement("div");
    row.className = "usage-row";

    const name = document.createElement("span");
    name.className = "usage-name";
    name.textContent = tile.text;

    const countElement = document.createElement("span");
    countElement.className = "usage-count";
    countElement.textContent = String(count);
    countElement.setAttribute("aria-label", `${count} clicks`);

    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.textContent = "Reset";
    resetButton.disabled = count === 0;
    resetButton.addEventListener("click", () => resetOne(tile.url));

    row.append(name, countElement, resetButton);
    usageList.append(row);
  }

  resetAllButton.disabled = !Object.values(usage).some((count) => count > 0);
}

function setUsageOpen(open) {
  usagePanel.hidden = !open;
  usageToggle.setAttribute("aria-expanded", String(open));
  confirmingResetAll = false;
  resetAllButton.textContent = "Reset all counts";
  resetAllButton.classList.remove("confirming");
  if (open) {
    usage = readStored(USAGE_KEY, {});
    renderUsageList();
  }
}

usageToggle.addEventListener("click", () => setUsageOpen(usagePanel.hidden));
closeUsageButton.addEventListener("click", () => setUsageOpen(false));

resetAllButton.addEventListener("click", () => {
  if (!confirmingResetAll) {
    confirmingResetAll = true;
    resetAllButton.textContent = "Confirm reset all";
    resetAllButton.classList.add("confirming");
    return;
  }

  usage = {};
  writeStored(USAGE_KEY, usage);
  confirmingResetAll = false;
  resetAllButton.textContent = "Reset all counts";
  resetAllButton.classList.remove("confirming");
  renderUsageList();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !usagePanel.hidden) setUsageOpen(false);
});

async function loadTiles() {
  const cachedTiles = readStored(TILE_CACHE_KEY, []);
  if (cachedTiles.length) {
    tiles = cachedTiles;
    renderTiles();
  }

  try {
    const response = await fetch(SHEET_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Sheet request failed: ${response.status}`);

    const [, ...rows] = parseCsv(await response.text());
    const freshTiles = rows
      .map(([text = "", url = "", image = ""]) => ({ text, url, image }))
      .filter((tile) => tile.text && tile.url);

    tiles = freshTiles;
    writeStored(TILE_CACHE_KEY, freshTiles);
    renderTiles();
  } catch (error) {
    console.error("Unable to load homepage links", error);
    if (!cachedTiles.length) {
      statusMessage.classList.add("error");
      statusMessage.setAttribute("role", "alert");
      statusMessage.textContent = "Unable to load your links. Check that the Google Sheet is still published, then refresh.";
    }
  }
}

loadTiles();
