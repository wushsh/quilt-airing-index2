/* 晒被气象指数分析与推荐系统 V1.0 — 实时闪电（Blitzortung，不参与指数） */
(function (global) {
  const WS_URLS = [
    "wss://ws1.blitzortung.org/",
    "wss://ws7.blitzortung.org/",
    "wss://ws8.blitzortung.org/",
  ];
  const RADIUS_KM = 280;
  const KEEP_SEC = 90;
  /** 全球模式下图上最多保留的闪击数，避免卡顿 */
  const MAX_MARKERS_GLOBAL = 250;
  const MAX_MARKERS_OTHER = 400;

  /**
   * 范围：bbox = [minLat, minLon, maxLat, maxLon]（大致矩形，非精确省界）
   * nearby 用圆心半径；global 不裁剪。
   */
  const REGIONS = [
    { id: "nearby", label: "附近（约280km）", kind: "radius" },
    { id: "global", label: "全球", kind: "global" },
    { id: "china", label: "全国", kind: "bbox", bbox: [18.0, 73.0, 53.6, 135.1], view: [[18, 73], [54, 135]] },
    { id: "beijing", label: "北京", kind: "bbox", bbox: [39.4, 115.4, 41.1, 117.5], view: [[39.4, 115.4], [41.1, 117.5]] },
    { id: "tianjin", label: "天津", kind: "bbox", bbox: [38.5, 116.7, 40.3, 118.1], view: [[38.5, 116.7], [40.3, 118.1]] },
    { id: "hebei", label: "河北", kind: "bbox", bbox: [36.0, 113.4, 42.6, 119.9], view: [[36.0, 113.4], [42.6, 119.9]] },
    { id: "shanxi", label: "山西", kind: "bbox", bbox: [34.6, 110.2, 40.7, 114.6], view: [[34.6, 110.2], [40.7, 114.6]] },
    { id: "neimenggu", label: "内蒙古", kind: "bbox", bbox: [37.4, 97.2, 53.3, 126.1], view: [[37.4, 97.2], [53.3, 126.1]] },
    { id: "liaoning", label: "辽宁", kind: "bbox", bbox: [38.7, 118.8, 43.5, 125.8], view: [[38.7, 118.8], [43.5, 125.8]] },
    { id: "jilin", label: "吉林", kind: "bbox", bbox: [40.8, 121.6, 46.3, 131.3], view: [[40.8, 121.6], [46.3, 131.3]] },
    { id: "heilongjiang", label: "黑龙江", kind: "bbox", bbox: [43.4, 121.1, 53.6, 135.1], view: [[43.4, 121.1], [53.6, 135.1]] },
    { id: "shanghai", label: "上海", kind: "bbox", bbox: [30.7, 120.8, 31.9, 122.0], view: [[30.7, 120.8], [31.9, 122.0]] },
    { id: "jiangsu", label: "江苏", kind: "bbox", bbox: [30.7, 116.3, 35.1, 121.9], view: [[30.7, 116.3], [35.1, 121.9]] },
    { id: "zhejiang", label: "浙江", kind: "bbox", bbox: [27.0, 118.0, 31.2, 123.0], view: [[27.0, 118.0], [31.2, 123.0]] },
    { id: "anhui", label: "安徽", kind: "bbox", bbox: [29.4, 114.9, 34.7, 119.7], view: [[29.4, 114.9], [34.7, 119.7]] },
    { id: "fujian", label: "福建", kind: "bbox", bbox: [23.5, 115.8, 28.3, 120.7], view: [[23.5, 115.8], [28.3, 120.7]] },
    { id: "jiangxi", label: "江西", kind: "bbox", bbox: [24.5, 113.6, 30.1, 118.5], view: [[24.5, 113.6], [30.1, 118.5]] },
    { id: "shandong", label: "山东", kind: "bbox", bbox: [34.4, 114.8, 38.4, 122.7], view: [[34.4, 114.8], [38.4, 122.7]] },
    { id: "henan", label: "河南", kind: "bbox", bbox: [31.4, 110.3, 36.4, 116.7], view: [[31.4, 110.3], [36.4, 116.7]] },
    { id: "hubei", label: "湖北", kind: "bbox", bbox: [29.0, 108.3, 33.3, 116.1], view: [[29.0, 108.3], [33.3, 116.1]] },
    { id: "hunan", label: "湖南", kind: "bbox", bbox: [24.6, 108.8, 30.1, 114.3], view: [[24.6, 108.8], [30.1, 114.3]] },
    { id: "guangdong", label: "广东", kind: "bbox", bbox: [20.2, 109.6, 25.5, 117.3], view: [[20.2, 109.6], [25.5, 117.3]] },
    { id: "guangxi", label: "广西", kind: "bbox", bbox: [20.9, 104.4, 26.4, 112.1], view: [[20.9, 104.4], [26.4, 112.1]] },
    { id: "hainan", label: "海南", kind: "bbox", bbox: [18.1, 108.6, 20.2, 111.1], view: [[18.1, 108.6], [20.2, 111.1]] },
    { id: "chongqing", label: "重庆", kind: "bbox", bbox: [28.1, 105.3, 32.2, 110.2], view: [[28.1, 105.3], [32.2, 110.2]] },
    { id: "sichuan", label: "四川", kind: "bbox", bbox: [26.0, 97.3, 34.3, 108.5], view: [[26.0, 97.3], [34.3, 108.5]] },
    { id: "guizhou", label: "贵州", kind: "bbox", bbox: [24.6, 103.6, 29.2, 109.6], view: [[24.6, 103.6], [29.2, 109.6]] },
    { id: "yunnan", label: "云南", kind: "bbox", bbox: [21.1, 97.5, 29.2, 106.2], view: [[21.1, 97.5], [29.2, 106.2]] },
    { id: "xizang", label: "西藏", kind: "bbox", bbox: [27.4, 78.4, 36.5, 99.1], view: [[27.4, 78.4], [36.5, 99.1]] },
    { id: "shaanxi", label: "陕西", kind: "bbox", bbox: [31.7, 105.5, 39.6, 111.3], view: [[31.7, 105.5], [39.6, 111.3]] },
    { id: "gansu", label: "甘肃", kind: "bbox", bbox: [32.6, 92.3, 42.8, 108.7], view: [[32.6, 92.3], [42.8, 108.7]] },
    { id: "qinghai", label: "青海", kind: "bbox", bbox: [31.6, 89.4, 39.2, 103.0], view: [[31.6, 89.4], [39.2, 103.0]] },
    { id: "ningxia", label: "宁夏", kind: "bbox", bbox: [35.2, 104.2, 39.4, 107.7], view: [[35.2, 104.2], [39.4, 107.7]] },
    { id: "xinjiang", label: "新疆", kind: "bbox", bbox: [34.3, 73.5, 49.2, 96.4], view: [[34.3, 73.5], [49.2, 96.4]] },
    { id: "taiwan", label: "台湾", kind: "bbox", bbox: [21.9, 119.3, 25.3, 122.0], view: [[21.9, 119.3], [25.3, 122.0]] },
    { id: "xianggang", label: "香港", kind: "bbox", bbox: [22.1, 113.8, 22.6, 114.4], view: [[22.1, 113.8], [22.6, 114.4]] },
    { id: "aomen", label: "澳门", kind: "bbox", bbox: [22.1, 113.5, 22.2, 113.6], view: [[22.1, 113.5], [22.2, 113.6]] },
  ];

  const REGION_MAP = Object.fromEntries(REGIONS.map((r) => [r.id, r]));

  function decodeLzw(raw) {
    const d = String(raw).split("");
    let c = d[0];
    let f = c;
    const g = [c];
    let o = 256;
    const e = {};
    for (let i = 1; i < d.length; i++) {
      let a = d[i].charCodeAt(0);
      a = a < 256 ? d[i] : e[a] || f + c;
      g.push(a);
      c = a.charAt(0);
      e[o] = f + c;
      o += 1;
      f = a;
    }
    return g.join("");
  }

  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toR = Math.PI / 180;
    const dLat = (lat2 - lat1) * toR;
    const dLon = (lon2 - lon1) * toR;
    const a =
      Math.sin(dLat / 2) ** 2
      + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function inBbox(lat, lon, bbox) {
    const [minLat, minLon, maxLat, maxLon] = bbox;
    return lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;
  }

  function boltIcon(size) {
    const s = size || 28;
    // 用 ⚡ 字符，避免 SVG 被缓存旧脚本/样式盖成圆点
    return L.divIcon({
      className: "lightning-bolt leaflet-div-icon",
      html: '<span class="lightning-bolt__glyph" aria-hidden="true">⚡</span>',
      iconSize: [s, s],
      iconAnchor: [s / 2, s / 2],
    });
  }

  function LightningOverlay() {
    this.map = null;
    this.layer = null;
    this.ws = null;
    this.wsIdx = 0;
    this.enabled = false;
    this.regionId = "nearby";
    this.center = { lat: 30.019, lon: 122.107 };
    this.strikes = [];
    this._reconnectTimer = null;
    this._pruneTimer = null;
    this.onStatus = null;
  }

  LightningOverlay.prototype.region = function () {
    return REGION_MAP[this.regionId] || REGION_MAP.nearby;
  };

  LightningOverlay.prototype.attach = function (map, lat, lon) {
    this.map = map;
    this.setCenter(lat, lon);
    if (!this.layer) this.layer = L.layerGroup().addTo(map);
  };

  LightningOverlay.prototype.setCenter = function (lat, lon) {
    this.center = { lat: Number(lat), lon: Number(lon) };
  };

  LightningOverlay.prototype.setRegion = function (id, opts) {
    const next = REGION_MAP[id] ? id : "nearby";
    const changed = next !== this.regionId;
    this.regionId = next;
    if (changed) this.clearMarkers();
    const region = this.region();
    if (opts && opts.fit !== false && this.map) {
      if (region.kind === "bbox" && region.view) {
        try {
          this.map.fitBounds(region.view, { padding: [24, 24], maxZoom: 9 });
        } catch (_) { /* ignore */ }
      } else if (region.kind === "global") {
        try {
          this.map.setView([20, 105], 3);
        } catch (_) { /* ignore */ }
      } else if (region.kind === "radius") {
        try {
          this.map.setView([this.center.lat, this.center.lon], 8);
        } catch (_) { /* ignore */ }
      }
    }
    if (this.enabled) this._setStatus("ok", { nearby: this.strikes.length });
  };

  LightningOverlay.prototype.accepts = function (lat, lon) {
    const region = this.region();
    if (region.kind === "global") return true;
    if (region.kind === "bbox") return inBbox(lat, lon, region.bbox);
    const dist = haversineKm(this.center.lat, this.center.lon, lat, lon);
    return dist <= RADIUS_KM;
  };

  LightningOverlay.prototype.setEnabled = function (on) {
    this.enabled = !!on;
    if (this.enabled) {
      this._ensureTimers();
      this.connect();
      this._setStatus("connecting");
    } else {
      this.disconnect();
      this.clearMarkers();
      this._setStatus("off");
    }
  };

  LightningOverlay.prototype._ensureTimers = function () {
    if (this._pruneTimer) return;
    this._pruneTimer = setInterval(() => this.prune(), 2000);
  };

  LightningOverlay.prototype._setStatus = function (state, extra) {
    if (typeof this.onStatus === "function") {
      const region = this.region();
      this.onStatus(state, Object.assign({ regionLabel: region.label, regionId: region.id }, extra || {}));
    }
  };

  LightningOverlay.prototype.connect = function () {
    if (!this.enabled) return;
    this.disconnect(false);
    const url = WS_URLS[this.wsIdx % WS_URLS.length];
    let ws;
    try {
      ws = new WebSocket(url);
    } catch (_) {
      this._scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.binaryType = "arraybuffer";
    ws.onopen = () => {
      this._setStatus("ok");
      try {
        ws.send(JSON.stringify({ a: 111 }));
      } catch (_) { /* ignore */ }
    };
    ws.onmessage = (ev) => {
      try {
        let text = ev.data;
        if (text instanceof ArrayBuffer) text = new TextDecoder("utf-8").decode(text);
        const s = JSON.parse(decodeLzw(text));
        if (s && typeof s.lat === "number" && typeof s.lon === "number") {
          this.addStrike(s.lat, s.lon);
        }
      } catch (_) { /* ignore */ }
    };
    ws.onerror = () => {
      try { ws.close(); } catch (_) { /* ignore */ }
    };
    ws.onclose = () => {
      if (this.enabled) {
        this._setStatus("err");
        this._scheduleReconnect();
      }
    };
  };

  LightningOverlay.prototype._scheduleReconnect = function () {
    clearTimeout(this._reconnectTimer);
    this.wsIdx += 1;
    this._reconnectTimer = setTimeout(() => this.connect(), 2500);
  };

  LightningOverlay.prototype.disconnect = function (clearTimers) {
    clearTimeout(this._reconnectTimer);
    if (clearTimers !== false && this._pruneTimer) {
      clearInterval(this._pruneTimer);
      this._pruneTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.onclose = null;
        this.ws.close();
      } catch (_) { /* ignore */ }
      this.ws = null;
    }
  };

  LightningOverlay.prototype.clearMarkers = function () {
    for (const s of this.strikes) {
      if (s.marker && this.layer) this.layer.removeLayer(s.marker);
    }
    this.strikes = [];
    this._setStatus(this.enabled ? "ok" : "off", { nearby: 0 });
  };

  LightningOverlay.prototype._cap = function () {
    const max = this.region().kind === "global" ? MAX_MARKERS_GLOBAL : MAX_MARKERS_OTHER;
    while (this.strikes.length > max) {
      const old = this.strikes.shift();
      if (old && old.marker && this.layer) this.layer.removeLayer(old.marker);
    }
  };

  LightningOverlay.prototype.addStrike = function (lat, lon) {
    if (!this.enabled || !this.map || !this.layer) return;
    if (!this.accepts(lat, lon)) return;
    let dist = null;
    if (this.region().kind === "radius") {
      dist = haversineKm(this.center.lat, this.center.lon, lat, lon);
    }
    const marker = L.marker([lat, lon], {
      icon: boltIcon(32),
      interactive: false,
      keyboard: false,
      zIndexOffset: 400,
    });
    marker.addTo(this.layer);
    const el = marker.getElement();
    if (el) el.classList.add("lightning-bolt--flash");
    this.strikes.push({ lat, lon, t: Date.now(), marker, dist });
    this._cap();
    setTimeout(() => {
      try {
        const node = marker.getElement();
        if (node) {
          node.classList.remove("lightning-bolt--flash");
          node.classList.add("lightning-bolt--fade");
        }
      } catch (_) { /* ignore */ }
    }, 450);
    const extra = { nearby: this.strikes.length };
    if (dist != null) extra.lastKm = Math.round(dist);
    this._setStatus("ok", extra);
  };

  LightningOverlay.prototype.prune = function () {
    const now = Date.now();
    const keep = [];
    for (const s of this.strikes) {
      const age = (now - s.t) / 1000;
      if (age > KEEP_SEC || !this.accepts(s.lat, s.lon)) {
        if (s.marker && this.layer) this.layer.removeLayer(s.marker);
        continue;
      }
      if (s.marker && age > 25) {
        try {
          const node = s.marker.getElement();
          if (node) {
            node.classList.add("lightning-bolt--fade");
            node.style.opacity = String(Math.max(0.2, 1 - age / KEEP_SEC));
          }
        } catch (_) { /* ignore */ }
      }
      keep.push(s);
    }
    this.strikes = keep;
    if (this.enabled) this._setStatus("ok", { nearby: keep.length });
  };

  LightningOverlay.prototype.destroy = function () {
    this.setEnabled(false);
    if (this.layer && this.map) this.map.removeLayer(this.layer);
    this.layer = null;
    this.map = null;
  };

  global.QAILightning = {
    RADIUS_KM,
    KEEP_SEC,
    REGIONS,
    create: () => new LightningOverlay(),
  };
})(window);
