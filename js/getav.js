// ============================================================================
// XPTV 视频源：GetAV (getav.net)
// ----------------------------------------------------------------------------
// 关键事实（2026-06 实测）：
//   - 站点为 Next.js，数据走 JSON API（域名 getav.net），全部媒体走 CDN
//     static.worldstatic.com（封面 avif / m3u8 index.txt / 预览 mp4）。
//   - 之前“封面显示 object / 打不开”的根因：把 localImg、localM3u8Path 都拼到了
//     getav.net 上 → 404。正确做法是把这些相对路径拼到 static.worldstatic.com。
//   - 播放：index.txt 是自包含的 AES-128 媒体播放列表，分片与密钥都是相对路径
//     （同在 worldstatic），无需 Referer 即可取，XPTV 可直接播。
// 需要代理的域名：getav.net、worldstatic.com（小火箭 DOMAIN-SUFFIX）。
// ============================================================================

var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
var SITE = 'https://getav.net'
var CDN = 'https://static.worldstatic.com'

function headers() {
    return {
        'User-Agent': UA,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Referer': SITE + '/zh',
        'Cookie': 'age_verified=1; lang=zh'
    }
}

// ------- 基础工具（全部不使用可选链 ?.，XPTV 引擎可能不支持） -------

function str(v) {
    if (v === null || v === undefined) return ''
    if (typeof v === 'string') return v
    if (typeof v === 'number' || typeof v === 'boolean') return String(v)
    return ''
}

function isArray(v) {
    return Object.prototype.toString.call(v) === '[object Array]'
}

// 清理 JSON 里被转义的 URL：\/ → /，& → &
function cleanUrl(u) {
    return str(u).replace(/\\\//g, '/').replace(/\\u0026/g, '&').replace(/&amp;/g, '&').trim()
}

// 把任意路径拼成 CDN 绝对地址。已是 http(s) 的原样返回。
function cdnUrl(path) {
    var p = cleanUrl(path)
    if (!p || p === '[object Object]' || p === 'null' || p === 'undefined') return ''
    if (p.indexOf('http://') === 0) return p.replace('http://', 'https://')
    if (p.indexOf('https://') === 0) return p
    if (p.indexOf('//') === 0) return 'https:' + p
    if (p.charAt(0) !== '/') p = '/' + p
    return CDN + p
}

// 封面：localImg/img 是 /images/cover/XXX.avif（相对，仅 worldstatic 有）。
// 列表优先用更小的 thumb 变体，取不到则退回原图；始终返回字符串。
function coverUrl(m) {
    var raw = cleanUrl(m && (m.localImg || m.img || m.coverUrl || m.cover))
    if (!raw) return ''
    var thumb = raw.replace(/\/images\/cover\/([^\/]+)\.avif/i, '/images/cover/thumb/$1_thumb.avif')
    return cdnUrl(thumb)
}

// 时长 "02:29:36.000" → "02:29:36"
function remark(m) {
    if (!m) return ''
    var d = str(m.durationFormatted).replace(/\.\d+$/, '')
    if (d) return d
    if (m.reason) return str(m.reason)
    if (m.date) return str(m.date).slice(0, 10)
    return ''
}

// ------- JSON 解析 + 在多种返回结构里定位影片数组 -------

function toJson(data) {
    if (!data) return null
    if (typeof data === 'object') return data
    if (typeof data !== 'string') return null
    var t = data.trim()
    if (!t || t.charAt(0) === '<') return null   // HTML（多半是拦截页/404）
    try { return JSON.parse(t) } catch (e) { return null }
}

function isMovie(m) {
    return m && typeof m === 'object' && (m.id || m.code) && (m.title || m.name || m.code)
}

function pickArray(obj) {
    if (!obj || typeof obj !== 'object') return null
    var keys = ['movies', 'items', 'list', 'results', 'videos', 'docs', 'data']
    for (var i = 0; i < keys.length; i++) {
        var v = obj[keys[i]]
        if (isArray(v)) {
            var f = []
            for (var j = 0; j < v.length; j++) if (isMovie(v[j])) f.push(v[j])
            if (f.length) return f
        }
    }
    return null
}

// 兼容三种结构：{movies:[]}、{data:{movies:[]}}、search 的 {data:{...}}
function findMovies(json) {
    if (!json) return []
    if (isArray(json)) {
        var f = []
        for (var i = 0; i < json.length; i++) if (isMovie(json[i])) f.push(json[i])
        return f
    }
    var direct = pickArray(json)
    if (direct) return direct
    if (json.data && typeof json.data === 'object') {
        var nested = pickArray(json.data)
        if (nested) return nested
    }
    // 兜底：深搜第一组影片数组
    var found = []
    function walk(o, depth) {
        if (found.length || depth > 4 || !o || typeof o !== 'object') return
        if (isArray(o)) {
            var cnt = 0
            for (var k = 0; k < o.length; k++) if (isMovie(o[k])) cnt++
            if (cnt && cnt === o.length) { found = o; return }
            for (var x = 0; x < o.length; x++) walk(o[x], depth + 1)
            return
        }
        for (var key in o) { if (o.hasOwnProperty(key)) walk(o[key], depth + 1) }
    }
    walk(json, 0)
    var ff = []
    for (var n = 0; n < found.length; n++) if (isMovie(found[n])) ff.push(found[n])
    return ff
}

function movieToCard(m) {
    if (!isMovie(m)) return null
    var id = str(m.id || m.code)
    var title = str(m.title || m.name || m.code)
    if (!id || !title) return null
    var slug = str(m.slug || id).toLowerCase()
    return {
        vod_id: id,
        vod_name: title,
        vod_pic: coverUrl(m),
        vod_remarks: remark(m),
        ext: {
            id: id,
            url: SITE + '/zh/videos/' + slug,
            m3u8: cdnUrl(m.localM3u8Path),
            m3u8Cn: cdnUrl(m.localM3u8PathCn),
            m3u8Uc: cdnUrl(m.localM3u8PathUc),
            m3u84k: cdnUrl(m.localM3u8Path4k),
            preview: cdnUrl(m.previewVideoUrl)
        }
    }
}

function errorCard(title, msg) {
    return { vod_id: 'msg', vod_name: title, vod_pic: '', vod_remarks: str(msg), ext: { url: SITE + '/zh' } }
}

// ------- 列表 API 地址 -------

function listUrl(ext, page) {
    var type = ext.type || 'movies'
    if (type === 'rec') {
        var rec = ext.rec || 'trending'
        var u = SITE + '/api/recommendations/' + rec + '?limit=40&locale=zh'
        if (rec === 'realtime') u += '&refresh=false&compact=true'
        if (rec === 'watching-now') u += '&source=home-rail-v2'
        return u
    }
    return SITE + '/api/movies?locale=zh&limit=40&page=' + page
}

// ------- 入口函数 -------

async function getConfig() {
    return jsonify({
        ver: 1,
        title: 'GetAV',
        site: SITE,
        tabs: [
            { name: '最新', ext: { type: 'movies', page: 1 }, ui: 1 },
            { name: '热门', ext: { type: 'rec', rec: 'trending', page: 1 }, ui: 1 },
            { name: '实时', ext: { type: 'rec', rec: 'realtime', page: 1 }, ui: 1 },
            { name: '正在看', ext: { type: 'rec', rec: 'watching-now', page: 1 }, ui: 1 }
        ]
    })
}

async function getCards(ext) {
    ext = argsify(ext)
    var page = ext.page || 1
    var isRec = (ext.type || 'movies') === 'rec'

    // 推荐类接口无分页：第 2 页起返回空，避免重复
    if (isRec && page > 1) return jsonify({ list: [], page: page })

    var url = listUrl(ext, page)
    try {
        var res = await $fetch.get(url, { headers: headers(), timeout: 20000 })
        var json = toJson(res.data)
        if (!json) {
            return jsonify({ list: [errorCard('返回非 JSON（可能被墙/拦截页）', '请确认已代理 getav.net')], page: page })
        }
        var movies = findMovies(json)
        var cards = []
        var seen = {}
        for (var i = 0; i < movies.length; i++) {
            var c = movieToCard(movies[i])
            if (!c || seen[c.vod_id]) continue
            seen[c.vod_id] = true
            cards.push(c)
        }
        if (!cards.length && page === 1) {
            return jsonify({ list: [errorCard('未解析到影片', 'API 结构可能已变')], page: page })
        }
        return jsonify({ list: cards, page: page })
    } catch (e) {
        return jsonify({ list: [errorCard('请求失败', str(e && e.message ? e.message : e))], page: page })
    }
}

// 详情页/接口兜底：当卡片没带 m3u8 时，抓出 worldstatic 的 index.txt
async function extractPlay(pageUrl, id) {
    var tries = []
    if (id) tries.push(SITE + '/api/movies/' + str(id).toLowerCase() + '?locale=zh')
    if (pageUrl) tries.push(pageUrl)
    for (var i = 0; i < tries.length; i++) {
        try {
            var res = await $fetch.get(tries[i], { headers: headers(), timeout: 20000 })
            var data = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
            data = data.replace(/\\\//g, '/').replace(/\\u0026/g, '&')
            var m = data.match(/https:\/\/static\.worldstatic\.com\/cdn\/assets\/deliveries\/v2\/[^"'\s\\]+?index\.txt[^"'\s\\]*/)
            if (m && m[0]) return m[0]
            var m2 = data.match(/"localM3u8Path"\s*:\s*"([^"]+)"/)
            if (m2 && m2[1]) return cdnUrl(m2[1])
        } catch (e) {}
    }
    return ''
}

async function getTracks(ext) {
    ext = argsify(ext)
    var tracks = []
    function add(name, u) { if (u) tracks.push({ name: name, pan: '', ext: { url: ext.url, playUrl: u } }) }

    add('标准', ext.m3u8)
    add('4K', ext.m3u84k)
    add('中文字幕', ext.m3u8Cn)
    add('无码', ext.m3u8Uc)

    if (!tracks.length) {
        var u = await extractPlay(ext.url, ext.id)
        if (u) add('播放', u)
        else if (ext.preview) add('预览', ext.preview)
    }
    if (!tracks.length) tracks.push({ name: '播放', pan: '', ext: { url: ext.url } })

    return jsonify({ list: [{ title: 'GetAV', tracks: tracks }] })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    var playUrl = cdnUrl(ext.playUrl)
    if (!playUrl) playUrl = await extractPlay(ext.url, ext.id)
    if (!playUrl) playUrl = cdnUrl(ext.preview)
    return jsonify({
        urls: playUrl ? [playUrl] : [],
        headers: [{ 'User-Agent': UA, 'Referer': SITE + '/', 'Origin': SITE }]
    })
}

async function search(ext) {
    ext = argsify(ext)
    var keyword = str(ext.text || ext.wd || '')
    var page = ext.page || 1
    if (!keyword || page > 1) return jsonify({ list: [], page: page })

    var url = SITE + '/api/search?q=' + encodeURIComponent(keyword) + '&locale=zh&limit=40'
    try {
        var res = await $fetch.get(url, { headers: headers(), timeout: 20000 })
        var json = toJson(res.data)
        var movies = findMovies(json)
        var cards = []
        var seen = {}
        for (var i = 0; i < movies.length; i++) {
            var c = movieToCard(movies[i])
            if (!c || seen[c.vod_id]) continue
            seen[c.vod_id] = true
            cards.push(c)
        }
        return jsonify({ list: cards, page: page })
    } catch (e) {
        return jsonify({ list: [], page: page })
    }
}
