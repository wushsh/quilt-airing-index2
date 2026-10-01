/* 晒被气象指数分析与推荐系统 V1.0 — 纯网页版（GitHub Pages） */
const $ = (id) => document.getElementById(id);
const HISTORY_KEY = "qai_web_history_v1";

const CITIES = [
  { id: "zhoushan", name: "舟山", lat: 30.019, lon: 122.107 },
  { id: "ningbo", name: "宁波", lat: 29.868, lon: 121.544 },
  { id: "hangzhou", name: "杭州", lat: 30.274, lon: 120.155 },
  { id: "shanghai", name: "上海", lat: 31.23, lon: 121.473 },
  { id: "nanjing", name: "南京", lat: 32.061, lon: 118.778 },
  { id: "beijing", name: "北京", lat: 39.904, lon: 116.407 },
];

let payload = null;
let selectedDate = null;
let cities = [];
let radarMap = null;
let radarLayer = null;
let radarMarker = null;
let radarFrames = [];
let radarIndex = 0;
let radarTimer = null;
let lightning = null;

function updateLightningStatus(state, extra) {
  const el = $("lightning-status");
  if (!el) return;
  const n = extra && extra.nearby != null ? extra.nearby : null;
  const scope = extra && extra.regionLabel ? ` · ${extra.regionLabel}` : "";
  const nearTxt = n == null ? "" : ` · 图上${n}次`;
  if (state === "off") el.textContent = "闪电：已关";
  else if (state === "connecting") el.textContent = "闪电：连接中…" + scope;
  else if (state === "err") el.textContent = "闪电：重连中…" + scope + nearTxt;
  else if (state === "ok") {
    const km = extra && extra.lastKm != null ? ` · 最近${extra.lastKm}km` : "";
    el.textContent = "闪电：已连接" + scope + nearTxt + km;
  } else el.textContent = "闪电：—";
}

function fillLightningRegions() {
  const sel = $("lightning-region");
  if (!sel || !window.QAILightning) return;
  sel.innerHTML = "";
  for (const r of QAILightning.REGIONS) {
    const o = document.createElement("option");
    o.value = r.id;
    o.textContent = r.label;
    if (r.id === "nearby") o.selected = true;
    sel.appendChild(o);
  }
}

function near(a, b) {
  return Math.abs(Number(a) - Number(b)) < 0.00015;
}

function fillCoords(lat, lon) {
  $("lat").value = Number(lat).toFixed(4);
  $("lon").value = Number(lon).toFixed(4);
}

function syncCityFromCoords() {
  const lat = Number($("lat").value);
  const lon = Number($("lon").value);
  const match = cities.find((c) => c.id !== "custom" && near(c.lat, lat) && near(c.lon, lon));
  for (const opt of $("city").options) {
    const v = JSON.parse(opt.value);
    if (match && v.id === match.id) {
      $("city").value = opt.value;
      return;
    }
    if (!match && v.id === "custom") {
      $("city").value = opt.value;
      return;
    }
  }
}

function loadOptions() {
  const bedding = QAIEngine.BEDDING;
  const sites = QAIEngine.SITES;
  cities = [{ id: "custom", name: "自行填写", lat: null, lon: null }, ...CITIES];
  for (const c of cities) {
    const o = document.createElement("option");
    o.value = JSON.stringify({ id: c.id, name: c.name, lat: c.lat, lon: c.lon });
    o.textContent = c.name;
    $("city").appendChild(o);
  }
  fillCoords(CITIES[0].lat, CITIES[0].lon);
  syncCityFromCoords();
  for (const [id, b] of Object.entries(bedding)) {
    const o = document.createElement("option");
    o.value = id;
    o.textContent = `${b.label}（${b.hours}小时）`;
    if (id === "cotton") o.selected = true;
    $("bedding").appendChild(o);
  }
  for (const [id, s] of Object.entries(sites)) {
    const o = document.createElement("option");
    o.value = id;
    o.textContent = s.label;
    if (id === "terrace") o.selected = true;
    $("site").appendChild(o);
  }
  $("city").onchange = () => {
    const c = JSON.parse($("city").value);
    if (c.id !== "custom" && c.lat != null) fillCoords(c.lat, c.lon);
  };
  $("lat").onchange = syncCityFromCoords;
  $("lon").onchange = syncCityFromCoords;
}

function placeName() {
  const c = JSON.parse($("city").value);
  const lat = Number($("lat").value);
  const lon = Number($("lon").value);
  if (c.id !== "custom") return c.name;
  return `自定义 ${lat.toFixed(4)},${lon.toFixed(4)}`;
}

async function loadRadar() {
  const lat = Number($("lat").value);
  const lon = Number($("lon").value);
  $("radar-panel").classList.remove("hidden");
  try {
    const radar = await QAIRadar.fetchRadar(lat, lon);
    if (!radar.ok) throw new Error(radar.error || "雷达失败");
    renderRadar(radar, lat, lon);
  } catch (err) {
    $("radar-time").textContent = "雷达暂不可用";
    $("radar-note").textContent = String(err.message || err);
  }
}

function ensureRadarMap(lat, lon) {
  const label = placeName();
  if (!radarMap) {
    radarMap = L.map("radar-map", { zoomControl: true, attributionControl: true }).setView([lat, lon], 9);
    const layers = QAIRadar.basemapLayers();
    layers[0].addTo(radarMap);
    radarMarker = L.circleMarker([lat, lon], {
      radius: 8,
      color: "#1f3b5a",
      weight: 3,
      fillColor: "#fff",
      fillOpacity: 1,
    }).addTo(radarMap);
    lightning = QAILightning.create();
    lightning.onStatus = updateLightningStatus;
    lightning.attach(radarMap, lat, lon);
    fillLightningRegions();
    const box = $("lightning-on");
    const regionSel = $("lightning-region");
    if (regionSel) {
      regionSel.onchange = () => {
        if (lightning) lightning.setRegion(regionSel.value, { fit: true });
      };
      if (lightning) lightning.setRegion(regionSel.value, { fit: false });
    }
    if (box) {
      box.onchange = () => lightning.setEnabled(box.checked);
      lightning.setEnabled(box.checked);
    }
  } else {
    radarMap.setView([lat, lon], radarMap.getZoom() || 9);
    if (radarMarker) radarMarker.setLatLng([lat, lon]);
    if (lightning) lightning.setCenter(lat, lon);
  }
  if (radarMarker) {
    radarMarker.unbindTooltip();
    radarMarker.bindTooltip(label, {
      permanent: true,
      direction: "right",
      offset: [12, 0],
      className: "radar-label",
    });
  }
  $("radar-place").textContent = label;
  setTimeout(() => radarMap.invalidateSize(), 80);
}

function showRadarFrame(i) {
  if (!radarFrames.length || !radarMap) return;
  radarIndex = (i + radarFrames.length) % radarFrames.length;
  const frame = radarFrames[radarIndex];
  if (radarLayer) radarMap.removeLayer(radarLayer);
  radarLayer = L.tileLayer(frame.tile_template, {
    opacity: 0.72,
    maxNativeZoom: 7,
    maxZoom: 12,
  }).addTo(radarMap);
  $("radar-time").textContent = frame.local_time;
}

function stopRadarPlay() {
  if (radarTimer) {
    clearInterval(radarTimer);
    radarTimer = null;
  }
  $("radar-play").textContent = "播放";
}

function renderRadar(radar, lat, lon) {
  radarFrames = radar.frames || [];
  $("radar-note").textContent = `${radar.note || ""}　${radar.attribution || ""}`;
  ensureRadarMap(lat, lon);
  showRadarFrame(radar.latest_index ?? radarFrames.length - 1);
}

$("radar-prev").onclick = () => {
  stopRadarPlay();
  showRadarFrame(radarIndex - 1);
};
$("radar-next").onclick = () => {
  stopRadarPlay();
  showRadarFrame(radarIndex + 1);
};
$("radar-play").onclick = () => {
  if (radarTimer) {
    stopRadarPlay();
    return;
  }
  $("radar-play").textContent = "暂停";
  radarTimer = setInterval(() => showRadarFrame(radarIndex + 1), 450);
};

function readHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch (_) {
    return [];
  }
}

function saveHistory(item) {
  const rows = readHistory();
  rows.unshift(item);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(rows.slice(0, 80)));
}

function loadHistory() {
  const rows = readHistory();
  if (!rows.length) {
    $("history").textContent = "暂无记录（保存在本机浏览器）";
    return;
  }
  $("history").innerHTML = `<table><thead><tr>
    <th>时间</th><th>地点</th><th>指数</th><th>等级</th><th>时段</th><th>被子</th>
  </tr></thead><tbody>${rows.slice(0, 12).map((r) => `<tr>
    <td>${r.created_at || ""}</td>
    <td>${r.city || ""}</td>
    <td>${r.index ?? ""}</td>
    <td>${r.grade || ""}</td>
    <td>${r.period || ""}</td>
    <td>${r.bedding || ""}</td>
  </tr>`).join("")}</tbody></table>`;
}

function exportCsv() {
  if (!payload) return;
  const lines = [[
    "日期", "时间", "指数", "等级", "气温℃", "湿度%", "VPD hPa", "风速m/s", "阵风m/s",
    "雨量mm", "低云量%", "辐射W/m2", "趋势", "主要原因",
  ].join(",")];
  for (const day of payload.days || []) {
    for (const h of day.hours || []) {
      lines.push([
        day.date,
        h.valid_time,
        h.hourly_index,
        `${h.risk_roman}级 ${h.grade_tone || ""}`.trim(),
        h.temperature_2m,
        h.relative_humidity,
        h.vpd_hpa,
        h.wind_speed_10m,
        h.wind_gust_10m,
        h.precipitation,
        h.low_cloud_pct,
        h.shortwave_radiation ?? "",
        h.trend,
        `"${String(h.reason || "").replace(/"/g, '""')}"`,
      ].join(","));
    }
  }
  const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `qai_${placeName()}_${(payload.today && payload.today.date) || "export"}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function compute() {
  $("error").classList.add("hidden");
  const keep = selectedDate;
  const lat = Number($("lat").value);
  const lon = Number($("lon").value);
  const bedding = $("bedding").value;
  const site = $("site").value;
  loadRadar();
  try {
    const got = await QAIForecast.loadHours(lat, lon);
    payload = QAIEngine.computeForecast(lat, lon, got.rows, bedding, site, placeName(), got.source);
    payload.mode = got.mode;
    payload.model_init_beijing = got.model_init_beijing;
    const dates = (payload.days || []).map((d) => d.date);
    if (keep && dates.includes(keep)) selectedDate = keep;
    else selectedDate = payload.today && payload.today.date;
    const today = payload.today || {};
    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    saveHistory({
      created_at: stamp,
      city: payload.city,
      date: today.date,
      index: today.index,
      grade: today.grade && today.grade.roman,
      period: today.recommended_period,
      bedding: payload.bedding && payload.bedding.label,
    });
    render();
    loadHistory();
  } catch (err) {
    $("error").textContent = String(err.message || err);
    $("error").classList.remove("hidden");
  }
}

function fmtNum(v, digits) {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

function clockLabel(validTime, hour) {
  if (validTime && validTime.length >= 16) return validTime.slice(5, 16);
  return `${String(hour).padStart(2, "0")}:00`;
}

function renderHourlyTable(hours, picked) {
  $("hourly-body").innerHTML = hours.map((h) => {
    const level = h.risk_level || "I";
    const pick = picked.has(h.hour) ? "pick" : "";
    const out = h.in_window === false ? "out" : "";
    const tone = h.grade_tone || { I: "红色", II: "橙色", III: "黄色", IV: "绿色" }[level] || "";
    const grade = `${h.risk_roman || "Ⅰ"}级 ${tone}`.trim();
    const ssr = h.shortwave_radiation == null ? "—" : String(Math.round(Number(h.shortwave_radiation)));
    const cloud = h.low_cloud_pct == null ? "—" : String(Math.round(Number(h.low_cloud_pct)));
    return `<tr class="${out || level} ${pick}">
      <td>${clockLabel(h.valid_time, h.hour)}</td>
      <td>${fmtNum(h.hourly_index, 1)}</td>
      <td>${grade}</td>
      <td>${fmtNum(h.temperature_2m, 1)}</td>
      <td>${fmtNum(h.relative_humidity, 0)}</td>
      <td>${fmtNum(h.vpd_hpa, 2)}</td>
      <td>${fmtNum(h.wind_speed_10m, 1)}</td>
      <td>${fmtNum(h.wind_gust_10m, 1)}</td>
      <td>${fmtNum(h.precipitation, 1)}</td>
      <td>${cloud}</td>
      <td>${ssr}</td>
      <td>${h.trend || "—"}</td>
      <td class="reason">${h.reason || "—"}</td>
    </tr>`;
  }).join("");
}

function padHours(hours) {
  const byHour = new Map();
  for (const h of hours) byHour.set(Number(h.hour), h);
  const out = [];
  for (let hour = 0; hour < 24; hour += 1) {
    out.push(byHour.get(hour) || { hour, hourly_index: 0, risk_level: "I", valid_time: "", in_window: false });
  }
  return out;
}

function showModelInit(data) {
  const el = $("model-init");
  if (!el) return;
  const raw = data && data.model_init_beijing;
  if (raw && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(String(raw))) {
    el.textContent = `模式起报 ${raw}（北京时）`;
    return;
  }
  el.textContent = "起报时间暂缺";
}

function render() {
  if (!payload) return;
  $("board").classList.remove("hidden");
  showModelInit(payload);
  const day = (payload.days || []).find((d) => d.date === selectedDate) || payload.today;
  if (!day) return;
  $("hero").className = `hero tone-${day.grade.key}`;
  $("score").textContent = Math.round(day.index);
  $("grade").textContent = `${day.grade.roman}级，${day.grade.meaning}`;
  $("period").textContent = day.recommended_period || "—";
  $("window-note").textContent = day.window_note || "";
  $("open-period").textContent = `可晾窗口 ${day.open_period}　日出 ${day.sunrise}　日落 ${day.sunset}`;
  $("duration").textContent = `${day.suggested_hours}小时`;
  $("bedding-line").textContent = payload.bedding.label;
  $("tips").innerHTML = (day.tips || []).map((t) => `<li>${t}</li>`).join("");
  $("prohibit").classList.toggle("hidden", !day.prohibit);
  $("prohibit").textContent = day.prohibit ? (day.tips[0] || "禁止晾晒") : "";

  $("days").innerHTML = payload.days.map((d) => {
    const active = d.date === day.date ? "active" : "";
    return `<button type="button" class="day ${active}" data-date="${d.date}">
      <div class="d">${d.date.slice(5)}</div>
      <div class="s" style="color:var(--${d.grade.key})">${Math.round(d.index)}</div>
      <div class="r">${d.grade.roman}级</div>
    </button>`;
  }).join("");
  for (const btn of $("days").querySelectorAll(".day")) {
    btn.onclick = () => {
      selectedDate = btn.getAttribute("data-date");
      render();
    };
  }

  $("day-title").textContent = day.date;
  $("table-day-title").textContent = day.date;
  const hours = padHours(day.hours || []);
  const picked = new Set(day.recommended_hours || []);
  $("bars").innerHTML = hours.map((h) => {
    const hgt = Math.max(4, Number(h.hourly_index) || 0);
    const label = h.hour % 3 === 0 ? `<span>${String(h.hour).padStart(2, "0")}</span>` : "";
    const pick = picked.has(h.hour) ? "pick" : "";
    return `<div class="bar ${h.risk_level || "I"} ${pick}" style="height:${hgt}%">${label}</div>`;
  }).join("");
  renderHourlyTable(hours, picked);

  const f = day.factor_means || {};
  $("factors").innerHTML = [["日照", f.sun], ["干爽", f.dry], ["气温", f.temp], ["风速", f.wind]]
    .map(([name, v]) => {
      const pct = Math.round((v || 0) * 100);
      return `<div class="factor">${name} ${pct}%<div class="track"><div class="fill" style="width:${pct}%"></div></div></div>`;
    }).join("");
}

$("btn-run").onclick = compute;
$("btn-export").onclick = (ev) => {
  ev.preventDefault();
  exportCsv();
};
loadOptions();
loadHistory();
compute();
