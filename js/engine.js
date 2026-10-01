/* 晒被气象指数分析与推荐系统 V1.0 — 指数引擎（与桌面版同规则） */
(function (global) {
  const A = global.QAIAstro;
  const ALGORITHM_VERSION = "QAI-1.0.0";

  const BEDDING = {
    sheet: { label: "薄被 / 床单", hours: 3 },
    cotton: { label: "普通棉被", hours: 4 },
    thick: { label: "厚棉被 / 羽绒被", hours: 5 },
    damp: { label: "潮湿被褥", hours: 6 },
  };

  const SITES = {
    roof: { label: "露天屋顶", sun: 1.0, wind: 1.1, cover: false },
    terrace: { label: "露台", sun: 1.0, wind: 1.0, cover: false },
    south: { label: "南向阳台", sun: 0.9, wind: 0.7, cover: true },
    east: { label: "东向阳台", sun: 0.85, wind: 0.7, cover: true },
    west: { label: "西向阳台", sun: 0.85, wind: 0.7, cover: true },
    north: { label: "北向阳台", sun: 0.65, wind: 0.65, cover: true },
    yard: { label: "庭院", sun: 0.95, wind: 0.85, cover: false },
  };

  const GRADE_BANDS = [
    [29, "Ⅰ", "不建议晾晒", "I"],
    [49, "Ⅱ", "不太适宜，谨慎晾晒", "II"],
    [74, "Ⅲ", "基本适宜，注意时段", "III"],
    [100, "Ⅳ", "适宜晾晒", "IV"],
  ];
  const GRADE_TONE = { I: "红色", II: "橙色", III: "黄色", IV: "绿色" };
  const GRADE_RANK = { IV: 4, III: 3, II: 2, I: 1 };
  const STORM = new Set([95, 96, 99]);
  const SNOW = new Set([66, 67, 71, 73, 75, 77, 85, 86]);
  const FOG = new Set([45, 48]);

  function clip(x, lo, hi) {
    return Math.max(lo, Math.min(hi, x));
  }

  function magnusE(tC) {
    return 6.112 * Math.exp((17.62 * tC) / (243.12 + tC));
  }

  function humidityMetrics(tC, tdC) {
    const es = magnusE(tC);
    const e = magnusE(tdC);
    let rh = es > 1e-6 ? (100 * e) / es : 100;
    rh = clip(rh, 0, 100);
    return { rh, vpd: es * (1 - rh / 100), dep: tC - tdC };
  }

  function scoreSun(ssr, lcc, mcc, hcc, tcc, cosZ) {
    if (ssr != null && ssr >= 0) return clip(ssr / 500, 0, 1);
    const cEff = lcc > 0 || hcc > 0 || mcc > 0 ? 0.7 * lcc + 0.2 * mcc + 0.1 * hcc : tcc;
    return clip((1 - cEff) * Math.max(cosZ, 0), 0, 1);
  }

  function scoreDry(vpd) { return clip(vpd / 15, 0, 1); }
  function scoreTemp(t) { return clip((t - 5) / 20, 0, 1); }
  function scoreWind(w) {
    if (w < 3) return clip(w / 3, 0, 1);
    if (w <= 4) return 1;
    if (w < 10) return clip(1 - (w - 4) / 6, 0, 1);
    return 0;
  }

  function rainFactor(precip, popPct, covered) {
    const pop = popPct == null ? 0 : popPct;
    if (precip >= 1) return covered ? 0.35 : 0;
    if (precip >= 0.1) return covered ? 0.55 : 0.4;
    if (pop >= 40) return covered ? 0.55 : 0.4;
    if (pop >= 20 || precip > 0) return covered ? 0.85 : 0.8;
    return 1;
  }

  function gradeOf(score) {
    for (const [upper, roman, meaning, key] of GRADE_BANDS) {
      if (score <= upper) return { key, roman, meaning };
    }
    return { key: "IV", roman: "Ⅳ", meaning: "适宜晾晒" };
  }

  function hourReason(inWindow, flags, index, sSun, sDry, sT, sW, pRain, windMs, precip) {
    if (!inWindow) return "不在可晾窗口";
    const uniq = [];
    for (const f of flags) if (!uniq.includes(f)) uniq.push(f);
    if (uniq.length) return uniq.join("、");
    const parts = [];
    if (pRain < 0.85) parts.push(precip >= 0.1 ? "有降水" : "降水概率偏高");
    if (sSun < 0.35) parts.push("日照偏弱");
    if (sDry < 0.35) parts.push("湿度偏高，蒸发慢");
    if (sT < 0.35) parts.push("气温偏低");
    if (windMs < 1) parts.push("通风不足");
    else if (sW < 0.35) parts.push("风力不宜");
    if (parts.length) return parts.join("、");
    if (index >= 50) return "光照、湿度和通风条件较好";
    return "综合条件一般";
  }

  function trendLabel(nowKey, futureKey) {
    const delta = (GRADE_RANK[nowKey] || 3) - (GRADE_RANK[futureKey] || 3);
    if (delta >= 2) return "明显转差";
    if (delta === 1) return "转差";
    if (delta <= -1) return "好转";
    return "稳定";
  }

  function evaluateHour(row, lat, lon, windowStart, windowEnd, site, tzHours) {
    const t = row.temperature_2m;
    const td = row.dewpoint_2m;
    const { rh, vpd, dep } = humidityMetrics(t, td);
    const w = Math.max(0, row.wind_speed_10m * site.wind);
    const gust = Math.max(row.wind_gust_10m, w);
    let ssr = row.shortwave_radiation;
    if (ssr != null) ssr = ssr * site.sun;
    const cosZ = A.solarCosZenith(lat, lon, row.valid_time, tzHours);
    let sSun = scoreSun(ssr, row.low_cloud, row.mid_cloud, row.high_cloud, row.total_cloud, cosZ);
    if (row.shortwave_radiation == null) sSun *= site.sun;
    const sDry = scoreDry(vpd);
    const sT = scoreTemp(t);
    const sW = scoreWind(w);
    const covered = !!site.cover;
    const pRain = rainFactor(row.precipitation, row.precipitation_probability, covered);
    const code = Number(row.weather_code || 0);
    const flags = [];
    let pStorm = 1;
    let prohibit = false;
    if (STORM.has(code)) { pStorm = 0; prohibit = true; flags.push("雷暴"); }
    if (SNOW.has(code)) { pStorm = 0; prohibit = true; flags.push("降雪或冻雨"); }
    let pFog = 1;
    const vis = row.visibility;
    if (FOG.has(code) || (vis != null && vis < 1000)) {
      pFog = 0.25;
      flags.push("低能见度或雾");
    } else if (rh >= 95 && w < 2) {
      pFog = 0.4;
      flags.push("近地面潮湿");
    }

    const inWindow = row.valid_time >= windowStart && row.valid_time < windowEnd;
    let index = 0;
    if (inWindow) {
      index = 100 * (0.38 * sSun + 0.32 * sDry + 0.15 * sT + 0.15 * sW) * pRain * pStorm * pFog;
      if (row.precipitation >= 1 && !covered) {
        index = 0; prohibit = true; flags.push("明显降水");
      } else if (row.precipitation >= 1 && covered) {
        flags.push("有雨，有遮蔽仍偏湿");
      }
      if (rh >= 95 && dep < 1) { index = Math.min(index, 20); flags.push("接近露点，易返潮"); }
      if (gust >= 17) { index = 0; prohibit = true; flags.push("阵风过大"); }
      else if (gust >= 12) { index = Math.min(index, 20); flags.push("阵风偏大，需固定被单"); }
      index = clip(index, 0, 100);
    }

    const g = gradeOf(index);
    const pop = row.precipitation_probability;
    return {
      valid_time: A.fmtYMDHM(row.valid_time),
      hour: row.valid_time.getHours(),
      in_window: inWindow,
      temperature_2m: Math.round(t * 10) / 10,
      relative_humidity: Math.round(rh),
      dewpoint_depression: Math.round(dep * 10) / 10,
      vpd_hpa: Math.round(vpd * 100) / 100,
      wind_speed_10m: Math.round(w * 10) / 10,
      wind_gust_10m: Math.round(gust * 10) / 10,
      precipitation: Math.round(row.precipitation * 100) / 100,
      solar_score: Math.round(sSun * 1000) / 1000,
      humidity_score: Math.round(sDry * 1000) / 1000,
      temperature_score: Math.round(sT * 1000) / 1000,
      wind_score: Math.round(sW * 1000) / 1000,
      rain_factor: Math.round(pRain * 100) / 100,
      hourly_index: Math.round(index * 10) / 10,
      risk_level: g.key,
      risk_roman: g.roman,
      grade_tone: GRADE_TONE[g.key] || "",
      trend: "稳定",
      prohibit,
      shortwave_radiation: row.shortwave_radiation == null ? null : Math.round(row.shortwave_radiation),
      low_cloud_pct: Math.round(row.low_cloud * 100),
      precipitation_probability: pop == null ? null : Math.round(pop),
      reason: hourReason(inWindow, flags, index, sSun, sDry, sT, sW, pRain, w, row.precipitation),
      flags,
    };
  }

  function applyTrends(hours) {
    for (let i = 0; i < hours.length; i++) {
      const future = hours.slice(i + 1, i + 4);
      if (!future.length) { hours[i].trend = "稳定"; continue; }
      const worst = future.reduce((a, b) => (GRADE_RANK[a.risk_level] < GRADE_RANK[b.risk_level] ? a : b));
      hours[i].trend = trendLabel(hours[i].risk_level, worst.risk_level);
    }
  }

  function monthDay(dateStr) {
    const parts = dateStr.split("-");
    return `${Number(parts[1])}月${Number(parts[2])}日`;
  }

  function afterWindowReason(ref, later) {
    if (!later.length) return null;
    const rain = later.find((h) => h.precipitation >= 1 || h.flags.includes("雷暴") || h.flags.includes("降雪或冻雨"));
    if (rain) {
      if (rain.flags.includes("雷暴")) return `${A.pad2(rain.hour)}时前后有雷暴`;
      if (rain.flags.includes("降雪或冻雨")) return `${A.pad2(rain.hour)}时前后有降雪或冻雨`;
      return `${A.pad2(rain.hour)}时前后有明显降水`;
    }
    const worst = later.reduce((a, b) => (a.hourly_index < b.hourly_index ? a : b));
    const bits = [];
    if (worst.relative_humidity - ref.relative_humidity >= 8 || worst.relative_humidity >= 80) {
      bits.push(`湿度升至约${Math.round(worst.relative_humidity)}%`);
    }
    if (ref.solar_score - worst.solar_score >= 0.12) bits.push("日照转弱");
    if (worst.wind_gust_10m >= 12 && worst.wind_gust_10m >= ref.wind_gust_10m + 1) bits.push("阵风加大");
    if (later.some((h) => h.flags.includes("近地面潮湿") || h.flags.includes("低能见度或雾"))) bits.push("近地面转湿");
    if (GRADE_RANK[ref.risk_level] - GRADE_RANK[worst.risk_level] >= 1) {
      bits.push(`指数由${ref.risk_roman}级转为${worst.risk_roman}级`);
    }
    return bits.length ? bits.join("，") : null;
  }

  function tips(best, dayHours, n, dateStr, sunset) {
    const dayn = monthDay(dateStr);
    if (!best.length) return [`${dayn}有效晾晒时段不足，不建议晒被。`];
    const start = best[0].hour;
    const end = best[best.length - 1].hour + 1;
    const last = best[best.length - 1];
    const leftover = dayHours.filter((h) => h.hour >= end && h.in_window);
    const reason = afterWindowReason(last, leftover.slice(0, 3));
    const out = [];
    if (reason) {
      out.push(reason.includes("时前后")
        ? `${dayn}请在${A.pad2(end)}:00前收被，${reason}。`
        : `${dayn}请在${A.pad2(end)}:00前收被，${A.pad2(end)}时后${reason}。`);
    } else if (leftover.length) {
      out.push(`${dayn}当天最好的连续${n}小时是${A.pad2(start)}:00—${A.pad2(end)}:00，请在${A.pad2(end)}:00前收被。`);
    } else {
      out.push(`${dayn}请在${A.pad2(end)}:00前收被，日落约${A.fmtHM(sunset)}，之后日照不足、容易返潮。`);
    }
    const flags = best.flatMap((h) => h.flags);
    if (flags.includes("阵风偏大，需固定被单")) out.push(`${dayn}推荐时段内阵风偏大，请固定被单，不要只夹一角。`);
    const sun = best.reduce((s, h) => s + h.solar_score, 0) / best.length;
    const dry = best.reduce((s, h) => s + h.humidity_score, 0) / best.length;
    if (sun < 0.35) out.push(`${dayn}推荐的${A.pad2(start)}:00—${A.pad2(end)}:00 日照仍偏弱，厚被可能晒不透。`);
    if (dry < 0.35) out.push(`${dayn}空气偏湿，蒸发慢，潮湿被褥建议改日。`);
    if (best.some((h) => h.precipitation >= 0.1)) out.push(`${dayn}推荐时段内可能有零星降水，无遮挡请改时段。`);
    return [...new Set(out)];
  }

  function summarizeDay(dateStr, hours, sunrise, sunset, windowStart, windowEnd, nHours) {
    applyTrends(hours);
    const inWin = hours.filter((h) => h.in_window);
    const positive = inWin.filter((h) => h.hourly_index > 0);
    let bestKey = null;
    let bestMean = -1;
    let bestChunk = [];
    const need = Math.max(1, nHours);
    if (hours.length >= need) {
      for (let i = 0; i <= hours.length - need; i++) {
        const chunk = hours.slice(i, i + need);
        if (!chunk.some((h) => h.in_window)) continue;
        const scores = chunk.map((h) => h.hourly_index);
        const mean = scores.reduce((a, b) => a + b, 0) / need;
        const peak = Math.max(...scores);
        const lastS = scores[scores.length - 1];
        const firstS = scores[0];
        const quality = mean - 0.45 * Math.max(0, peak - lastS) - 0.25 * Math.max(0, firstS - lastS);
        const key = [quality, -chunk[0].hour];
        if (!bestKey || key[0] > bestKey[0] || (key[0] === bestKey[0] && key[1] > bestKey[1])) {
          bestKey = key;
          bestMean = mean;
          bestChunk = chunk;
        }
      }
    }
    let dayIndex = Math.round(Math.max(bestMean, 0) * 10) / 10;
    if (positive.length < 2) dayIndex = Math.min(dayIndex, 49);

    let prohibit = false;
    const prohibitReasons = [];
    const scan = bestChunk.length ? bestChunk : inWin;
    for (const h of scan) {
      if (h.prohibit) {
        prohibit = true;
        prohibitReasons.push(...h.flags);
      }
    }
    if (windowEnd - windowStart < 2 * 3600000) {
      dayIndex = Math.min(dayIndex, 49);
      prohibitReasons.push("有效日照过短");
    }

    let grade;
    if (prohibit) {
      dayIndex = Math.min(dayIndex, 29);
      grade = gradeOf(dayIndex);
    } else {
      grade = gradeOf(dayIndex);
    }

    let windowLabel = "—";
    let windowNote = "";
    let recHours = [];
    if (bestChunk.length && dayIndex > 0) {
      const firstH = bestChunk[0].hour;
      const lastH = bestChunk[bestChunk.length - 1].hour;
      const collect = lastH + 1;
      recHours = bestChunk.map((h) => h.hour);
      windowLabel = `${A.pad2(firstH)}时—${A.pad2(lastH)}时`;
      windowNote = `${recHours.map((h) => `${h}时`).join("、")}连续晾，${A.pad2(collect)}:00前收被`;
    }

    let tipList = tips(bestChunk, hours, nHours, dateStr, sunset);
    if (prohibit) {
      const uniq = [...new Set(prohibitReasons)];
      tipList = [`禁止晾晒：${uniq.join("、") || "安全条件不满足"}`, ...tipList];
    }

    const avg = (key) => (bestChunk.length
      ? Math.round((bestChunk.reduce((s, h) => s + h[key], 0) / bestChunk.length) * 1000) / 1000
      : 0);

    return {
      date: dateStr,
      index: dayIndex,
      grade,
      prohibit,
      recommended_period: windowLabel,
      window_note: windowNote,
      recommended_hours: recHours,
      open_period: `${A.fmtHM(windowStart)}—${A.fmtHM(windowEnd)}`,
      suggested_hours: nHours,
      sunrise: A.fmtHM(sunrise),
      sunset: A.fmtHM(sunset),
      tips: tipList,
      hours,
      best_hours: bestChunk,
      factor_means: { sun: avg("solar_score"), dry: avg("humidity_score"), temp: avg("temperature_score"), wind: avg("wind_score") },
    };
  }

  function computeForecast(lat, lon, rows, beddingId, siteId, city, source) {
    const bedding = BEDDING[beddingId] || BEDDING.cotton;
    const site = SITES[siteId] || SITES.terrace;
    const nHours = bedding.hours;
    const byDate = {};
    for (const row of rows) {
      const key = A.fmtYMD(row.valid_time);
      (byDate[key] || (byDate[key] = [])).push(row);
    }
    const days = [];
    for (const dateStr of Object.keys(byDate).sort()) {
      const dayRows = byDate[dateStr].slice().sort((a, b) => a.valid_time - b.valid_time);
      const d0 = dayRows[0].valid_time;
      const dayDate = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate());
      const { sunrise, sunset } = A.sunriseSunset(lat, lon, dayDate, 8);
      const { start: w0, end: w1 } = A.effectiveWindow(sunrise, sunset);
      const results = dayRows.map((r) => evaluateHour(r, lat, lon, w0, w1, site, 8));
      days.push(summarizeDay(dateStr, results, sunrise, sunset, w0, w1, nHours));
    }
    return {
      algorithm_version: ALGORITHM_VERSION,
      city,
      latitude: lat,
      longitude: lon,
      bedding: { id: beddingId, ...bedding },
      site: { id: siteId, label: site.label },
      source,
      today: days[0] || null,
      days,
    };
  }

  global.QAIEngine = {
    ALGORITHM_VERSION,
    BEDDING,
    SITES,
    computeForecast,
  };
})(window);
