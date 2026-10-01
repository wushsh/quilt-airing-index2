/* 晒被气象指数分析与推荐系统 V1.0 — 浏览器直连 Open-Meteo */
(function (global) {
  const OPEN_METEO = "https://api.open-meteo.com/v1/forecast";
  const META = "https://api.open-meteo.com/data/{model}/static/meta.json";
  const HOURLY = [
    "temperature_2m",
    "dew_point_2m",
    "relative_humidity_2m",
    "precipitation",
    "precipitation_probability",
    "weather_code",
    "cloud_cover",
    "cloud_cover_low",
    "cloud_cover_mid",
    "cloud_cover_high",
    "shortwave_radiation",
    "wind_speed_10m",
    "wind_gusts_10m",
    "visibility",
  ].join(",");

  function pct01(v) {
    if (v == null) return 0;
    const x = Number(v);
    return x > 1.5 ? Math.max(0, Math.min(1, x / 100)) : Math.max(0, Math.min(1, x));
  }

  function num(series, i) {
    if (!series || i >= series.length || series[i] == null) return null;
    return Number(series[i]);
  }

  /** Parse Open-Meteo Asia/Shanghai local ISO as wall-clock Date (no UTC shift). */
  function parseLocal(stamp) {
    const m = String(stamp).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!m) return new Date(stamp);
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0);
  }

  function fromPayload(payload) {
    const h = payload.hourly || {};
    const times = h.time || [];
    const rows = [];
    for (let i = 0; i < times.length; i++) {
      const t = num(h.temperature_2m, i);
      if (t == null) continue;
      let td = num(h.dew_point_2m, i);
      if (td == null) {
        const rh = num(h.relative_humidity_2m, i) || 70;
        td = t - (100 - rh) / 5;
      }
      const wind = num(h.wind_speed_10m, i) || 1.5;
      rows.push({
        valid_time: parseLocal(times[i]),
        temperature_2m: t,
        dewpoint_2m: td,
        wind_speed_10m: wind,
        wind_gust_10m: num(h.wind_gusts_10m, i) || wind * 1.4,
        precipitation: num(h.precipitation, i) || 0,
        precipitation_probability: num(h.precipitation_probability, i),
        total_cloud: pct01(num(h.cloud_cover, i)),
        low_cloud: pct01(num(h.cloud_cover_low, i)),
        mid_cloud: pct01(num(h.cloud_cover_mid, i)),
        high_cloud: pct01(num(h.cloud_cover_high, i)),
        shortwave_radiation: num(h.shortwave_radiation, i),
        visibility: num(h.visibility, i),
        weather_code: Math.round(num(h.weather_code, i) || 0),
      });
    }
    return rows;
  }

  async function fetchMetaInit(model) {
    try {
      const url = META.replace("{model}", model || "ecmwf_ifs025");
      const meta = await (await fetch(url)).json();
      const t = meta.last_run_initialisation_time;
      if (!t) return null;
      const utc = new Date(Number(t) * 1000);
      if (Number.isNaN(utc.getTime())) return null;
      // Beijing = UTC+8
      const bj = new Date(utc.getTime() + 8 * 3600000);
      const y = bj.getUTCFullYear();
      const mo = String(bj.getUTCMonth() + 1).padStart(2, "0");
      const d = String(bj.getUTCDate()).padStart(2, "0");
      const h = String(bj.getUTCHours()).padStart(2, "0");
      const mi = String(bj.getUTCMinutes()).padStart(2, "0");
      return `${y}-${mo}-${d} ${h}:${mi}`;
    } catch (_) {
      return null;
    }
  }

  function inferInitBeijing() {
    const now = new Date();
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
    const available = new Date(utcMs - 7 * 3600000);
    const hour = available.getUTCHours();
    let cycle = 0;
    for (const h of [18, 12, 6, 0]) {
      if (hour >= h) { cycle = h; break; }
    }
    available.setUTCHours(cycle, 0, 0, 0);
    const bj = new Date(available.getTime() + 8 * 3600000);
    const y = bj.getUTCFullYear();
    const mo = String(bj.getUTCMonth() + 1).padStart(2, "0");
    const d = String(bj.getUTCDate()).padStart(2, "0");
    const h = String(bj.getUTCHours()).padStart(2, "0");
    return `${y}-${mo}-${d} ${h}:00`;
  }

  async function loadHours(lat, lon) {
    let lastError = "";
    for (const model of ["ecmwf_ifs025", "ecmwf_ifs", ""]) {
      const q = new URLSearchParams({
        latitude: lat.toFixed(4),
        longitude: lon.toFixed(4),
        hourly: HOURLY,
        forecast_days: "7",
        timezone: "Asia/Shanghai",
        wind_speed_unit: "ms",
      });
      if (model) q.set("models", model);
      try {
        const payload = await (await fetch(`${OPEN_METEO}?${q}`)).json();
        if (!payload.hourly) {
          lastError = payload.reason || payload.error || "no hourly";
          continue;
        }
        const rows = fromPayload(payload);
        if (!rows.length) {
          lastError = "empty";
          continue;
        }
        let label = model
          ? `ECMWF ${model}（经 Open-Meteo）`
          : "Open-Meteo 默认模式";
        let beijing = model ? await fetchMetaInit(model) : null;
        if (!beijing) beijing = inferInitBeijing();
        return {
          rows,
          source: label,
          mode: "live",
          model_init_beijing: beijing,
        };
      } catch (err) {
        lastError = String(err.message || err);
      }
    }
    throw new Error(lastError || "预报接口无数据");
  }

  global.QAIForecast = { loadHours };
})(window);
