/**
 * rex.js — 黄果 ForwardWidget
 * 给 Forward 播放器用
 * API: https://huangguoai.com
 * 图床封面是 AES 密文，Forward 无法直接显示。
 * 有封面代理就走代理；否则用标题海报，保证列表有图。
 *
 * Forward：设置 → Widget → 导入此 js
 */
WidgetMetadata = {
  id: "forward.huangguoai.rex",
  title: "黄果",
  version: "1.4.3",
  requiredVersion: "0.0.1",
  description: "黄果短剧 Forward 播放源：分类/搜索/分集；封面走代理或标题海报",
  author: "rex",
  site: "https://huangguoai.com",
  detailCacheDuration: 60,
  globalParams: [
    {
      name: "apiBase",
      title: "API 地址",
      type: "input",
      value: "https://huangguoai.com"
    },
    {
      name: "coverProxy",
      title: "封面解密代理（可空）",
      type: "input",
      value: ""
    },
    {
      name: "coverToken",
      title: "封面代理 Token",
      type: "input",
      value: "hg8f3a2c91b7e04d6a"
    }
  ],
  modules: [
    {
      id: "loadList",
      title: "分类",
      functionName: "loadList",
      cacheDuration: 300,
      params: [
        { name: "page", title: "页码", type: "page" },
        {
          name: "tid",
          title: "分类",
          type: "enumeration",
          value: "hot",
          enumOptions: [
            { title: "热门", value: "hot" },
            { title: "最新", value: "new" },
            { title: "排行榜", value: "rank" },
            { title: "AI成人短剧", value: "ai-duanju" },
            { title: "AI成人漫剧", value: "ai-manju" },
            { title: "AI换脸", value: "ai-huanlian" },
            { title: "AI魔改", value: "ai-mogai" },
            { title: "都市", value: "tag:dushi" },
            { title: "现代", value: "tag:xiandai" },
            { title: "校园", value: "tag:xiaoyuan" },
            { title: "熟女", value: "tag:shunv" },
            { title: "豪门", value: "tag:haomen" },
            { title: "后宫", value: "tag:hougong" },
            { title: "古风", value: "tag:gufeng" },
            { title: "奇幻", value: "tag:qihuan" },
            { title: "职场", value: "tag:zhichang" },
            { title: "娱乐圈", value: "tag:yulequan" },
            { title: "甜宠", value: "tag:tianchong" },
            { title: "年下", value: "tag:nianxia" }
          ]
        }
      ]
    },
    {
      id: "loadResource",
      title: "播放资源",
      functionName: "loadResource",
      type: "stream",
      cacheDuration: 0,
      params: []
    }
  ],
  search: {
    title: "搜索",
    functionName: "search",
    params: [
      { name: "keyword", title: "关键词", type: "input" },
      { name: "page", title: "页码", type: "page" }
    ]
  }
};

var CATE_IDS = {
  "ai-duanju": 1,
  "ai-manju": 1,
  "ai-huanlian": 1,
  "ai-mogai": 1
};

function t(v) {
  return String(v == null ? "" : v).trim();
}
function decodeAmp(s) {
  return t(s).replace(/\\u0026/gi, "&").replace(/&amp;/g, "&");
}
function cfg(params) {
  params = params || {};
  return {
    apiBase: t(params.apiBase || "https://huangguoai.com").replace(/\/+$/, ""),
    coverProxy: t(params.coverProxy || "https://ai.wulii.de5.net").replace(/\/+$/, ""),
    coverToken: t(params.coverToken || "hg8f3a2c91b7e04d6a")
  };
}
function qs(obj) {
  var parts = [];
  Object.keys(obj || {}).forEach(function (k) {
    if (obj[k] == null || obj[k] === "") return;
    parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(obj[k])));
  });
  return parts.length ? "?" + parts.join("&") : "";
}
function playHeaders() {
  return {
    Accept: "application/json, text/plain, */*",
    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    Referer: "https://huangguoai.com/",
    Origin: "https://huangguoai.com"
  };
}
async function httpJson(url) {
  var res = await Widget.http.get(url, { headers: playHeaders() });
  var d = res && res.data;
  if (typeof d === "string") {
    try {
      d = JSON.parse(d);
    } catch (e) {}
  }
  return d;
}
function absCover(base, cover) {
  cover = t(cover);
  if (!cover) return "";
  if (/^https?:\/\//i.test(cover)) return cover;
  if (cover.indexOf("//") === 0) return "https:" + cover;
  return base + (cover[0] === "/" ? "" : "/") + cover;
}
function titlePoster(title) {
  var label = t(title) || "黄果";
  if (label.length > 18) label = label.slice(0, 18);
  return (
    "https://placehold.co/480x720/111111/FFD21C/png?font=source-sans-pro&text=" +
    encodeURIComponent(label)
  );
}
function proxiedCover(c, encUrl) {
  encUrl = t(encUrl);
  if (!encUrl) return "";
  if (!c.coverProxy) return "";
  var q = { url: encUrl };
  if (c.coverToken) q.token = c.coverToken;
  return c.coverProxy + qs(q);
}
function pickCover(c, encUrl, title) {
  return proxiedCover(c, encUrl) || titlePoster(title);
}

function itemId(it) {
  return t(it && (it.id != null ? it.id : it.video_id != null ? it.video_id : it.vod_id));
}
function toItem(c, it) {
  if (!it) return null;
  var id = itemId(it);
  if (!id) return null;
  var title = t(it.title || it.vod_name || it.name);
  var enc = absCover(c.apiBase, it.cover || it.vod_pic || it.pic || "");
  var cover = pickCover(c, enc, title);
  var ep = it.episode_count || it.total_episodes || "";
  var remark = "";
  if (it.is_finished) remark = "全" + (ep || "") + "集";
  else if (ep) remark = "更新至" + ep + "集";
  return {
    id: "hgai:" + id,
    type: "url",
    title: title || id,
    coverUrl: cover,
    posterPath: cover,
    backdropPath: cover,
    description: remark,
    mediaType: "tv",
    link: "hgai:" + id
  };
}

async function fetchList(c, tid, page) {
  page = Number(page || 1) || 1;
  tid = t(tid) || "hot";
  var data;
  var items = [];

  if (tid === "rank" || tid === "ranks") {
    try {
      data = await httpJson(c.apiBase + "/api/ranks/hot" + qs({ page: page }));
      items = (data && data.data && data.data.items) || [];
    } catch (e) {}
  } else if (CATE_IDS[tid]) {
    try {
      data = await httpJson(
        c.apiBase +
          "/api/videos/category/" +
          encodeURIComponent(tid) +
          qs({ page: page, size: 24, sort: "hot" })
      );
      items = (data && data.data && data.data.items) || [];
    } catch (e) {}
  } else if (String(tid).indexOf("tag:") === 0) {
    data = await httpJson(
      c.apiBase +
        "/api/videos" +
        qs({ page: page, page_size: 24, size: 24, sort: "hot", tag: tid.slice(4) })
    );
    items = (data && data.data && data.data.items) || [];
  }

  if (!items.length) {
    var sort = tid === "new" ? "new" : "hot";
    data = await httpJson(
      c.apiBase + "/api/videos" + qs({ page: page, page_size: 24, size: 24, sort: sort })
    );
    items = (data && data.data && data.data.items) || [];
  }

  var out = [];
  for (var i = 0; i < items.length; i++) {
    var item = toItem(c, items[i]);
    if (item) out.push(item);
  }
  return out;
}

async function loadList(params) {
  params = params || {};
  var c = cfg(params);
  return await fetchList(c, t(params.tid) || "hot", Number(params.page || 1) || 1);
}

async function search(params) {
  params = params || {};
  var c = cfg(params);
  var kw = t(params.keyword);
  if (!kw) return [];
  var page = Number(params.page || 1) || 1;
  try {
    var data = await httpJson(c.apiBase + "/api/search" + qs({ q: kw, page: page }));
    var items =
      (data && data.data && data.data.items) ||
      (data && data.data && data.data.list) ||
      [];
    if (items.length) {
      var out = [];
      for (var i = 0; i < items.length; i++) {
        var item = toItem(c, items[i]);
        if (item) out.push(item);
      }
      return out;
    }
  } catch (e) {}
  var all = await fetchList(c, "hot", page);
  return all.filter(function (x) {
    return String(x.title || "").indexOf(kw) >= 0;
  });
}

function parseLink(link) {
  var s = t(link);
  var m = s.match(/huangguoai\.com\/(?:detail|video)\/(\d+)/i);
  if (m) {
    var epm = s.match(/ep-(\d+)/i) || s.match(/[?&]ep=(\d+)/i);
    return { id: m[1], ep: epm ? epm[1] : "" };
  }
  s = s.replace(/^huangguoai:/, "hgai:");
  if (s.indexOf("hgai:") === 0) s = s.slice(5);
  if (/^\d+$/.test(s)) return { id: s, ep: "" };
  var parts = s.split(":");
  return { id: t(parts[0]), ep: t(parts[1] || "") };
}

function epTitle(ep, index) {
  var n = ep && (ep.ep_num || ep.episode) != null ? ep.ep_num || ep.episode : index + 1;
  var raw = t(ep && ep.title).split("\n")[0];
  if (!raw || /^第\s*\d+\s*集$/.test(raw)) return "第" + n + "集";
  if (raw.indexOf("第") === 0) return raw;
  return "第" + n + "集 " + raw;
}

async function loadDetail(link, params) {
  var p = parseLink(link);
  if (!p.id) return null;
  var c = cfg(params || {});
  var data = await httpJson(c.apiBase + "/api/videos/" + encodeURIComponent(p.id));
  var d = (data && data.data) || {};
  var enc = absCover(c.apiBase, d.cover || "");
  var cover = pickCover(c, enc, t(d.title || p.id));
  var eps = Array.isArray(d.episodes) ? d.episodes : [];
  var episodeItems = [];
  if (eps.length) {
    for (var i = 0; i < eps.length; i++) {
      var ep = eps[i];
      var n = ep.ep_num || ep.episode || i + 1;
      var epLink = "hgai:" + p.id + ":" + n;
      episodeItems.push({
        id: epLink,
        type: "url",
        title: epTitle(ep, i),
        mediaType: "tv",
        seasonNumber: 1,
        episodeNumber: Number(n) || i + 1,
        link: epLink,
        videoUrl: "",
        playerType: "app"
      });
    }
  } else {
    episodeItems.push({
      id: "hgai:" + p.id + ":1",
      type: "url",
      title: "第1集",
      mediaType: "tv",
      seasonNumber: 1,
      episodeNumber: 1,
      link: "hgai:" + p.id + ":1",
      videoUrl: "",
      playerType: "app"
    });
  }
  return {
    id: "hgai:" + p.id,
    type: "url",
    title: t(d.title || p.id),
    coverUrl: cover,
    posterPath: cover,
    backdropPath: cover,
    description: t(d.description || ""),
    mediaType: "tv",
    link: "hgai:" + p.id,
    episodeItems: episodeItems
  };
}

async function loadResource(params) {
  params = params || {};
  var c = cfg(params);
  var p = parseLink(t(params.link || params.id || params.url || ""));
  if (!p.id) return [];
  var ep = p.ep || t(params.episode) || "1";
  var data = await httpJson(
    c.apiBase + "/api/videos/" + encodeURIComponent(p.id) + "/play" + qs({ ep: ep })
  );
  var raw =
    (data && data.data && (data.data.video_url || data.data.preview_url)) ||
    (data && data.video_url) ||
    "";
  var url = decodeAmp(raw);
  if (!url) return [];
  return [
    {
      name: "黄果",
      description: "第" + ep + "集",
      url: url,
      playerType: "app",
      customHeaders: {
        "User-Agent": playHeaders()["User-Agent"],
        Referer: "https://huangguoai.com/",
        Origin: "https://huangguoai.com",
        "X-Forward-Skip-Redirect-Probe": "1"
      }
    }
  ];
}
