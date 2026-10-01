/* 晒被气象指数分析与推荐系统 V1.0 — 雷达（不参与指数） */
(function (global) {
  const RAINVIEWER = "https://api.rainviewer.com/public/weather-maps.json";

  function frame(host, item) {
    const ts = Number(item.time);
    const local = new Date(ts * 1000);
    // show as Beijing-ish local wall if browser is +8; else still HH:MM local device
    const hh = String(local.getHours()).padStart(2, "0");
    const mm = String(local.getMinutes()).padStart(2, "0");
    return {
      time: ts,
      local_time: `${hh}:${mm}`,
      path: String(item.path),
      tile_template: `${host}${item.path}/256/{z}/{x}/{y}/2/1_1.png`,
    };
  }

  async function fetchRadar(lat, lon) {
    try {
      const payload = await (await fetch(RAINVIEWER)).json();
      const host = String(payload.host || "https://tilecache.rainviewer.com").replace(/\/$/, "");
      const radar = payload.radar || {};
      const past = (radar.past || []).map((x) => frame(host, x));
      const nowcast = (radar.nowcast || []).map((x) => frame(host, x));
      const frames = past.concat(nowcast);
      if (!frames.length) return { ok: false, error: "雷达目录为空" };
      const latest = past.length ? past[past.length - 1] : frames[frames.length - 1];
      return {
        ok: true,
        note: "雷达仅供判断附近是否有雨；闪电另见⚡符号（社区网，可能漏测），均不参与晒被指数。",
        attribution: "RainViewer · 闪电 Blitzortung",
        lat,
        lon,
        frames,
        latest_index: Math.max(0, past.length - 1),
        latest_local_time: latest.local_time,
      };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  }

  /** GitHub Pages 无法代理高德；优先 Esri，失败再试 OSM。 */
  function basemapLayers() {
    return [
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 16,
        attribution: "Esri",
      }),
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 16,
        attribution: "© OpenStreetMap",
        subdomains: "abc",
      }),
    ];
  }

  global.QAIRadar = { fetchRadar, basemapLayers };
})(window);
