/* 晒被气象指数分析与推荐系统 V1.0 — 天文与可晾窗口 */
(function (global) {
  function dayOfYear(d) {
    const start = Date.UTC(d.getFullYear(), 0, 0);
    const now = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.floor((now - start) / 86400000);
  }

  function declEqtime(d, tzHours, lon) {
    const n = dayOfYear(d);
    const gamma = (2 * Math.PI / 365) * (n - 1 + (12 - tzHours - lon / 15) / 24);
    const eqtime = 229.18 * (
      0.000075
      + 0.001868 * Math.cos(gamma)
      - 0.032077 * Math.sin(gamma)
      - 0.014615 * Math.cos(2 * gamma)
      - 0.040849 * Math.sin(2 * gamma)
    );
    const decl = (
      0.006918
      - 0.399912 * Math.cos(gamma)
      + 0.070257 * Math.sin(gamma)
      - 0.006758 * Math.cos(2 * gamma)
      + 0.000907 * Math.sin(2 * gamma)
      - 0.002697 * Math.cos(3 * gamma)
      + 0.00148 * Math.sin(3 * gamma)
    );
    return { decl, eqtime };
  }

  function addMinutes(dt, minutes) {
    return new Date(dt.getTime() + minutes * 60000);
  }

  function sunriseSunset(lat, lon, d, tzHours) {
    tzHours = tzHours == null ? 8 : tzHours;
    const { decl, eqtime } = declEqtime(d, tzHours, lon);
    const latR = (lat * Math.PI) / 180;
    const zenith = (90.833 * Math.PI) / 180;
    let cosHa = (Math.cos(zenith) / (Math.cos(latR) * Math.cos(decl))) - Math.tan(latR) * Math.tan(decl);
    cosHa = Math.max(-1, Math.min(1, cosHa));
    const ha = (Math.acos(cosHa) * 180) / Math.PI;
    const sunriseMinUtc = 720 - 4 * (lon + ha) - eqtime;
    const sunsetMinUtc = 720 - 4 * (lon - ha) - eqtime;
    const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
    // midnight already in local (browser); we treat dates as Beijing wall clock
    const sunrise = addMinutes(midnight, sunriseMinUtc + tzHours * 60);
    const sunset = addMinutes(midnight, sunsetMinUtc + tzHours * 60);
    return { sunrise, sunset };
  }

  function solarCosZenith(lat, lon, when, tzHours) {
    tzHours = tzHours == null ? 8 : tzHours;
    const d = new Date(when.getFullYear(), when.getMonth(), when.getDate());
    const { decl, eqtime } = declEqtime(d, tzHours, lon);
    const trueSolarMin =
      when.getHours() * 60
      + when.getMinutes()
      + when.getSeconds() / 60
      + 4 * lon
      - tzHours * 60
      + eqtime;
    const ha = ((trueSolarMin / 4) - 180) * Math.PI / 180;
    const latR = (lat * Math.PI) / 180;
    const cosZ = Math.sin(latR) * Math.sin(decl) + Math.cos(latR) * Math.cos(decl) * Math.cos(ha);
    return Math.max(0, Math.min(1, cosZ));
  }

  function effectiveWindow(sunrise, sunset) {
    const start = addMinutes(sunrise, 30);
    const end = addMinutes(sunset, -60);
    if (end <= start) {
      const mid = new Date((sunrise.getTime() + sunset.getTime()) / 2);
      return { start: mid, end: mid };
    }
    return { start, end };
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function fmtHM(dt) {
    return `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
  }

  function fmtYMDHM(dt) {
    return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())} ${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
  }

  function fmtYMD(dt) {
    return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
  }

  global.QAIAstro = {
    sunriseSunset,
    solarCosZenith,
    effectiveWindow,
    fmtHM,
    fmtYMDHM,
    fmtYMD,
    pad2,
    addMinutes,
  };
})(window);
