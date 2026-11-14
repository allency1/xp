/**
 * xptv_one.js — ONE一个 XPTV 源
 * 由「one一个.yingxia.t3.js」（映匣 / TVBox T3 源）转写，2026-11-14
 *
 * 接口（均已实测）：POST {host}/v2.5/{path}
 *   请求体  查询串做 AES-128-CBC 后的 Base64（bootstrap 为空）
 *   请求头  platform / uuid / timestamp / token / app-version / sign / user-key / ip
 *           sign = md5( md5( [ip, platform, timestamp, user-key, uuid].join('.') ) + 盐 )
 *   响应    成功时是 AES 密文（Base64），出错时是明文 JSON
 *   bootstrap           游客 token + 各类域名
 *   article/discovery   model_id=6（长视频）/3（短视频），published_at=某月 1 号，只返回那一个月的内容
 *   article/search      搜索（结果里没有播放字段）
 *   article/detail      详情；video_download 是 MP4 相对路径，拼到任一视频域名即可播，不需要请求头
 *
 * 和原脚本不一样的地方：
 *   1. 加解密改用 XPTV 自带的 CryptoJS（已和原脚本自带的实现逐项比对，结果一致）。
 *   2. 翻页：原脚本地区分类的相邻两页会重叠；本月内容翻完后也不会接上个月。
 *      这里记下每一页该从哪个月的第几页接着取，并且跨页去重。
 *   3. 原脚本一条线路是一个“播放源”，这里对应成一个分组（线路1、线路2…），每组一个「正片」。
 *      各线路是同一个文件放在不同 CDN 上，某条卡就换一条。
 *   4. 两处自适应，都是为了对付“在这台设备上就是连不上”的情况：
 *      - user-key 请求头原脚本发的是空值。若运行时不发送空值请求头，服务器会报“缺少用户码参数”，
 *        这时自动改用非空值重试（非空值需要一起参与签名，已实测可用）。
 *      - 设备时间比服务器慢几分钟以上，服务器会报“请求已经过期”，这时按响应的 Date 头校正后重试。
 *
 * 没转的：HLS 线路（m3u8 本身是站点私有加密，原脚本同样跳过）。
 */

const CryptoJS = createCryptoJS()

const APP_KEY = 'l*bv%Ziq000Biaog'
const APP_IV = '8597506002939249'
const SIGN_SALT = 'm4n2hjPeYWkD6tFpqKF^3HO^h24P@idT'
const APP_VERSION = '1.6.0'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const SEED_HOSTS = [
    'https://api.2b37894.com',
    'https://api.35a46dd.com',
    'https://api.43b8477.com',
    'https://api.5ce3771.com',
    'https://api.61c76a0.com',
    'https://api.632d809.com',
    'https://api.3459381.com',
    'https://api.em1oifd0.com',
    'https://api.j7y675.com',
]

// 图片：ENC_HOSTS 上的是密文图，PLAIN_HOSTS 上同一路径是明文图
const PLAIN_HOSTS = ['https://imgpw807.s7n7ue8.com', 'https://imgpw807.2u7qzt7.com', 'https://img807.hkq57tt.com']
const ENC_HOSTS = ['gdliren123.com', 'u3wwetf.com', 'm6qzbb4.com', 'bdsy56.com', 'gzjsqx.com', 'k8b3rsp.com']
const BAD_HOSTS = ['imgsu807.hkq57tt.com']
const FALLBACK_VIDEO_HOSTS = ['https://46e9nz.mfpt8g.com', 'https://f86xxm.upmf83.com']

const PAGE_SIZE = 24
// 地区分类是从全部内容里按标题筛出来的，一批多取一些，少发几次请求
const REGION_BATCH = 96

let appConfig = {
    ver: 20261114,
    title: 'ONE一个',
    site: SEED_HOSTS[0],
    tabs: [
        { name: '最新视频', ui: 1, ext: { type: 'newest' } },
        { name: '热门视频', ui: 1, ext: { type: 'hot' } },
        { name: '日本', ui: 1, ext: { type: 'jp' } },
        { name: '国产', ui: 1, ext: { type: 'cn' } },
        { name: '欧美', ui: 1, ext: { type: 'us' } },
        { name: 'ONE 直播', ui: 1, ext: { type: 'live' } },
    ],
}

async function getConfig() {
    return jsonify(appConfig)
}

/* ------------------------------------------------------------------ */
/* 会话 / 签名 / 加解密                                                 */
/* ------------------------------------------------------------------ */

const S = {
    uuid: makeUuid(), host: '', token: '',
    api: [], image: [], resource: [], fimg: [], video: [], video_hls: [], audio: [], vplay: [], vdl: [],
}
let USER_KEY = ''   // 见文件头第 4 点
let CLOCK = 0       // 服务器时间 - 本机时间（秒）

function makeUuid() {
    let s = ''
    for (let i = 0; i < 32; i++) s += '0123456789abcdef'.charAt(Math.floor(Math.random() * 16))
    return s.slice(0, 8) + '-' + s.slice(8, 12) + '-4' + s.slice(13, 16) + '-a' + s.slice(17, 20) + '-' + s.slice(20, 32)
}

function md5(s) {
    return CryptoJS.MD5(s).toString()
}

function aesOptions() {
    return { iv: CryptoJS.enc.Utf8.parse(APP_IV), mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
}

function encrypt(text) {
    return CryptoJS.AES.encrypt(CryptoJS.enc.Utf8.parse(text), CryptoJS.enc.Utf8.parse(APP_KEY), aesOptions()).toString()
}

function decrypt(b64) {
    return CryptoJS.AES.decrypt(b64, CryptoJS.enc.Utf8.parse(APP_KEY), aesOptions()).toString(CryptoJS.enc.Utf8)
}

function encQuery(params) {
    const parts = []
    Object.keys(params || {}).forEach(function (k) {
        const v = params[k]
        if (v === undefined || v === null || v === '') return
        parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)))
    })
    return parts.join('&')
}

function buildHeaders(withToken) {
    const ts = Math.floor(Date.now() / 1000) + CLOCK
    const h = {
        'platform': '3',
        'uuid': S.uuid,
        'timestamp': String(ts),
        'app-version': APP_VERSION,
        'sign': md5(md5(['0.0.0.0', '3', ts, USER_KEY, S.uuid].join('.')) + SIGN_SALT),
        'user-key': USER_KEY,
        'ip': '0.0.0.0',
        'User-Agent': UA,
        'Accept': '*/*',
        'Content-Type': 'application/x-www-form-urlencoded',
    }
    // bootstrap 不需要 token（实测不带这个头也行）
    if (withToken) h['token'] = S.token
    return h
}

// 响应可能是：已解析好的对象 / 明文 JSON / AES 密文
function parsePayload(data) {
    if (data == null) return null
    if (typeof data === 'object') return data.code !== undefined ? data : null
    const str = String(data).trim()
    if (!str) return null
    try {
        if (str.charAt(0) === '{') return JSON.parse(str)
        const plain = decrypt(str)
        return plain ? JSON.parse(plain) : null
    } catch (e) {
        return null
    }
}

function headerOf(resp, name) {
    const hs = resp && resp.headers
    if (!hs || typeof hs !== 'object') return ''
    for (const k in hs) {
        if (String(k).toLowerCase() === name) {
            const v = hs[k]
            return String((Array.isArray(v) ? v[0] : v) || '')
        }
    }
    return ''
}

// 按响应的 Date 头校正时间；校不了（没有这个头，或已经校过）返回 false
function syncClock(resp) {
    const t = Date.parse(headerOf(resp, 'date'))
    if (!t) return false
    const offset = Math.round(t / 1000 - Date.now() / 1000)
    if (Math.abs(offset - CLOCK) < 30) return false
    CLOCK = offset
    $print('ONE 设备时间和服务器相差 ' + offset + ' 秒，已按服务器时间签名')
    return true
}

// 向一个主机发一次请求，返回解析后的 JSON（{code, message, data}）；解析不了返回 null
async function send(host, path, params) {
    const qs = encQuery(params)
    const body = qs ? encrypt(qs) : ''
    for (let i = 0; i < 3; i++) {
        const resp = await $fetch.post(host + '/v2.5/' + path, body, { headers: buildHeaders(path !== 'bootstrap'), timeout: 10000 })
        const json = parsePayload(resp && resp.data)
        if (json && Number(json.code) === 401) {
            const msg = String(json.message || '')
            if (msg.indexOf('用户码') >= 0 && USER_KEY === '') {
                USER_KEY = '0'
                $print('ONE 服务器没收到 user-key（运行时不发送空值请求头），改用非空值重试')
                continue
            }
            if (msg.indexOf('过期') >= 0 && syncClock(resp)) continue
        }
        return json
    }
    return null
}

function hostCandidates() {
    const list = []
    const add = function (h) {
        if (h && list.indexOf(h) < 0) list.push(h)
    }
    add(S.host)
    S.api.forEach(add)
    SEED_HOSTS.forEach(add)
    return list
}

// 依次换主机，直到有一个给出能解析的回应。应用层报错（code 不是 200）也算“主机是通的”，不再换
async function across(path, params, maxHosts) {
    const hosts = hostCandidates().slice(0, maxHosts)
    for (let i = 0; i < hosts.length; i++) {
        try {
            const json = await send(hosts[i], path, params)
            if (json) {
                S.host = hosts[i]
                return json
            }
            $print('ONE ' + hosts[i] + ' 的 ' + path + ' 回应无法解析，换下一个主机')
        } catch (e) {
            $print('ONE ' + hosts[i] + ' 的 ' + path + ' 请求失败: ' + e)
        }
    }
    return null
}

function applyDomains(d) {
    if (!d) return
    const map = {
        api: 'api', image: 'image', resource: 'resource', flutter_img: 'fimg', video: 'video',
        video_hls: 'video_hls', audio: 'audio', flutter_video_play: 'vplay', flutter_video_download: 'vdl',
    }
    Object.keys(map).forEach(function (k) {
        if (Array.isArray(d[k]) && d[k].length) S[map[k]] = d[k].slice()
    })
}

async function doBootstrap() {
    const json = await across('bootstrap', null, 6)
    if (json && Number(json.code) === 200 && json.data) {
        S.token = (json.data.user && json.data.user.token) || ''
        applyDomains(json.data.domain)
        if (S.token) return true
    }
    $print('ONE 初始化失败: ' + (json ? json.code + ' ' + (json.message || '') : '所有主机都连不上'))
    return false
}

// 列表页会同时发两个请求，初始化只跑一次，大家等同一个结果
let booting = null

function bootstrap(force) {
    if (!force && S.token && S.host) return Promise.resolve(true)
    if (!booting) {
        booting = doBootstrap().then(
            function (ok) { booting = null; return ok },
            function (e) { booting = null; throw e }
        )
    }
    return booting
}

// 成功返回 data；失败返回 null
async function callApi(path, params) {
    if (!(await bootstrap(false))) return null
    for (let attempt = 0; attempt < 2; attempt++) {
        const json = S.token ? await across(path, params, 3) : null
        if (json && Number(json.code) === 200) return json.data
        if (json && Number(json.code) !== 401) {
            $print('ONE ' + path + ' 返回 ' + json.code + ' ' + (json.message || ''))
            return null
        }
        // token 失效；或者所有主机都失败（token 失效时服务器回 HTTP 401，有的运行时会直接抛错）
        if (attempt === 0) {
            $print('ONE ' + path + ' 失败' + (json ? '（' + (json.message || json.code) + '）' : '') + '，重新初始化后再试')
            await bootstrap(true)
        }
    }
    return null
}

/* ------------------------------------------------------------------ */
/* 图片 / 视频地址                                                      */
/* ------------------------------------------------------------------ */

function clean(s) {
    return String(s === null || s === undefined ? '' : s)
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim()
}

function pick() {
    for (let i = 0; i < arguments.length; i++) {
        const v = arguments[i]
        if (v !== undefined && v !== null && String(v).trim() !== '') return v
    }
    return ''
}

function uniqueHosts(lists) {
    const out = []
    lists.forEach(function (arr) {
        (arr || []).forEach(function (raw) {
            const h = String(raw || '').replace(/\/+$/, '')
            if (!h || out.indexOf(h) >= 0) return
            for (let i = 0; i < BAD_HOSTS.length; i++) if (h.indexOf(BAD_HOSTS[i]) >= 0) return
            out.push(h)
        })
    })
    return out
}

function pathOf(url) {
    const m = String(url || '').match(/^https?:\/\/[^\/]+(\/.*)$/)
    return m ? m[1] : String(url || '')
}

// 同一路径固定落在同一个图片域名上（便于缓存），不同路径分散到各域名
function pickImgHost(p) {
    const hosts = uniqueHosts([S.fimg, S.resource, PLAIN_HOSTS])
    let h = 0
    for (let i = 0; i < p.length; i++) h = (h * 31 + p.charCodeAt(i)) >>> 0
    return hosts[h % hosts.length]
}

function isEncImage(url) {
    for (let i = 0; i < ENC_HOSTS.length; i++) if (url.indexOf(ENC_HOSTS[i]) >= 0) return true
    for (let i = 0; i < S.image.length; i++) if (url.indexOf(String(S.image[i]).replace(/\/+$/, '') + '/') === 0) return true
    return false
}

function absImage(path) {
    if (!path) return ''
    const p = String(path)
    if (/^https?:\/\//.test(p)) return isEncImage(p) ? pickImgHost(pathOf(p)) + pathOf(p) : p
    return pickImgHost(p) + (p.charAt(0) === '/' ? '' : '/') + p
}

// 优先静态图；只有 GIF 时转成 JPG（动图封面一张就一两兆）
function bestImage(a) {
    if (!a) return ''
    const cands = [a.thumbnail, a.thumb, a.video_cover, a.cover, a.thumb_tiny]
        .concat(a.multi_pic_thumbnail || [])
        .concat(a.thumbnail_list || [])
    let gif = ''
    for (let i = 0; i < cands.length; i++) {
        const u = absImage(cands[i])
        if (!u) continue
        if (/\.gif(\?|$)/i.test(u)) {
            if (!gif) gif = u
            continue
        }
        return u
    }
    return gif ? 'https://wsrv.nl/?url=' + encodeURIComponent(gif) + '&output=jpg&w=520' : ''
}

function absVideo(path, kind) {
    const p = String(path)
    if (/^https?:\/\//.test(p)) return p
    let hosts = kind === 'hls' ? S.video_hls : kind === 'audio' ? S.audio : S.video
    if (!hosts || !hosts.length) hosts = FALLBACK_VIDEO_HOSTS
    return String(hosts[0]).replace(/\/+$/, '') + (p.charAt(0) === '/' ? '' : '/') + p
}

// 一个条目的所有可播线路：[{ name, url }]
function playLines(a) {
    const lines = []
    const seen = {}
    let hosts = uniqueHosts([S.video, S.vdl, S.vplay, S.audio])
    if (!hosts.length) hosts = FALLBACK_VIDEO_HOSTS

    function add(name, url) {
        // /encry/ 下的文件是私有加密的，播放器放不了
        if (!url || seen[url] || /\/encry\//i.test(url)) return
        seen[url] = true
        lines.push({ name: name, url: url })
    }

    function addMp4(path, label) {
        if (!path) return
        const p = String(path)
        const tag = /h265/i.test(p) ? '(H265)' : ''
        if (/^https?:\/\//.test(p)) return add(label + '1' + tag, p)
        for (let i = 0; i < hosts.length && i < 4; i++) {
            add(label + (i + 1) + tag, hosts[i] + (p.charAt(0) === '/' ? '' : '/') + p)
        }
    }

    addMp4(a.video_download, '线路')
    if (a.video_file && String(a.video_file) !== String(a.video_download || '')) addMp4(a.video_file, '直连')
    if (a.video_hls) add('HLS', absVideo(a.video_hls, 'hls'))
    if (a.video_hls_h265) add('HLS-H265', absVideo(a.video_hls_h265, 'hls'))
    if (a.audio_file) add('音频', absVideo(a.audio_file, 'audio'))
    if (a.preview_video) add('预览片段', absVideo(a.preview_video))
    return lines
}

/* ------------------------------------------------------------------ */
/* 列表                                                                */
/* ------------------------------------------------------------------ */

// 去掉标题开头的 [ONE直播▶️] 标签（标签前面偶尔带一两个表情）
function stripLiveTag(title) {
    const t = String(title || '')
    const m = t.match(/^([^\[\]]{0,4})\[ONE\s*直播[^\]]*\]\s*/i)
    if (!m) return { title: t, live: false }
    return { title: (m[1] + t.slice(m[0].length)).trim(), live: true }
}

// 接口没有地区字段，按标题里的关键词归类（规则照搬原脚本）
const STRONG_US = /(p站|onlyfans|fansly|faphouse|pjgirls|deeper|tushy|vixen|blacked|brazzers|realitykings|bangbros|teamskeet|mylf|chaturbate|cb站|推特|fansone|manyvids)/i
const STRONG_CN = /(ai短剧|短剧|探花|门事件|绿播|微密圈|抖音|快手|b站|91|抖阴|杏吧|麻豆|天美|糖心|精东|国语|华语|国产精品)/i

function classifyPart(a) {
    const title = String(pick(a.title, a.video_name, '') || '')
    if (title.indexOf('[ONE直播') >= 0 || (/直播回放/.test(title) && /one直播/i.test(title))) return 'live'
    if (STRONG_US.test(title)) return 'us'
    if (STRONG_CN.test(title)) return 'cn'
    if (/[\u3040-\u30ff]/.test(title) || /\b[a-z]{2,5}[-_]\d{2,5}\b/i.test(title)) return 'jp'
    const low = (title + ' ' + String(a.author || '')).toLowerCase()
    if (/(欧美|美国|英国|德国|法国|俄罗斯|乌克兰|巴西|拉美|拉丁|大洋马|洋妞|老外|外国|bbc|bwc|韩国|韩系|latina|ebony|russian|blonde)/i.test(low)) return 'us'
    if (/(无码|有码|人妻|女优|痴女|素人|日系|日本|fc2|heyzo|jav|myfans|s1|sod|moodyz|prestige|ideapocket|ipx|ssni|加勒比|一本道|中文字幕|熟女|女教师|痴汉|电车|东京)/i.test(title)) return 'jp'
    return 'cn'
}

function toCard(a) {
    const id = String(a.id)
    const info = stripLiveTag(clean(pick(a.title, a.video_name, 'ONE #' + id)))
    const remarks = []
    if (info.live) remarks.push('直播回放')
    if (a.length) remarks.push(clean(a.length))
    if (a.published_at) remarks.push(String(a.published_at).slice(5, 10))
    return {
        vod_id: id,
        vod_name: info.title,
        vod_pic: bestImage(a),
        vod_remarks: remarks.join(' · '),
        ext: { id: id },
    }
}

function monthStart(offset) {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - offset)
    const m = d.getMonth() + 1
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : '' + m) + '-01'
}

// 每个分类的翻页状态。discovery 接口一次只给一个月的内容，所以要记下
// “第 N 页该从哪个月的第几页接着取”；seen 记每个条目第一次出现在第几页，用来跨页去重。
// 回到第 1 页时清零。
const FEEDS = {}

async function loadFeed(type, page) {
    const region = type === 'jp' || type === 'cn' || type === 'us' ? type : ''
    const sort = type === 'hot' ? 'like_number' : 'published_at'

    let st = FEEDS[type]
    if (page <= 1 || !st) st = FEEDS[type] = { starts: {}, seen: {}, shortEnd: {} }
    // 没有记录（比如脚本被重新加载过）时退回原脚本的做法：本月第 N 页
    const start = st.starts[page] || { off: 0, page: page }
    const cur = { off: start.off, page: start.page }

    // 其余分类取到一批就够，多出来的两次机会留给“这个月取完了，接上个月”。
    // 地区分类要筛掉大部分条目：一页最多连取 5 批凑 20 条；欧美的内容很少，5 批里可能一条都没有，
    // 这时再多取几批，尽量不交一页空的出去（空页会被当成“到底了”）
    const size = region ? REGION_BATCH : PAGE_SIZE
    const want = region ? 20 : 1
    const rows = []
    let failed = false

    for (let loop = 0; rows.length < want && (loop < (region ? 5 : 3) || (region && !rows.length && loop < 10)); loop++) {
        const month = monthStart(cur.off)
        const ask = function (model) {
            return callApi('article/discovery', { model_id: model, published_at: month, page: cur.page, size: size, sort: sort })
        }
        // 短视频（model 3）每月只有十几条，取完以后就不再为它多发一次请求
        const shortDone = st.shortEnd[month] && cur.page > st.shortEnd[month]
        const got = await Promise.all([ask(6), shortDone ? [] : ask(3)])
        if (!Array.isArray(got[0]) && !Array.isArray(got[1])) {
            failed = true
            break
        }
        const longs = Array.isArray(got[0]) ? got[0] : []
        const shorts = Array.isArray(got[1]) ? got[1] : []
        if (!shortDone && Array.isArray(got[1]) && shorts.length < size) st.shortEnd[month] = cur.page

        if (!longs.length && !shorts.length) {
            cur.off++
            cur.page = 1
            continue
        }
        longs.concat(shorts).forEach(function (item) {
            if (!item || !item.id) return
            const id = String(item.id)
            if (st.seen[id] !== undefined && st.seen[id] < page) return
            if (region && classifyPart(item) !== region) return
            if (st.seen[id] === page && rows.some(function (r) { return String(r.id) === id })) return
            st.seen[id] = page
            rows.push(item)
        })
        cur.page++
    }

    // 接口失败时不记下一页的起点，重试这一页还会从同一个位置开始
    if (!failed) st.starts[page + 1] = cur

    if (sort === 'like_number') {
        rows.sort(function (x, y) { return (Number(y.like_number) || 0) - (Number(x.like_number) || 0) })
    } else {
        rows.sort(function (x, y) {
            const dx = String(x.published_at || ''), dy = String(y.published_at || '')
            return dx < dy ? 1 : dx > dy ? -1 : 0
        })
    }
    return rows
}

async function searchRows(keyword, page) {
    const rows = await callApi('article/search', { keyword: keyword, model_id: 0, series_category: 0, page: page, size: PAGE_SIZE })
    return Array.isArray(rows) ? rows : []
}

async function getCards(ext) {
    ext = argsify(ext)
    const page = Math.max(1, parseInt(ext.page, 10) || 1)
    const type = String(ext.type || 'newest')
    let rows = []

    try {
        rows = type === 'live' ? await searchRows('ONE直播', page) : await loadFeed(type, page)
    } catch (e) {
        $print('ONE getCards 失败: ' + e)
    }

    $print('ONE ' + type + ' 第' + page + '页 → ' + rows.length + ' 条')
    return jsonify({ list: rows.map(toCard), page: page })
}

async function search(ext) {
    ext = argsify(ext)
    const text = String(ext.text || ext.wd || '').trim()
    const page = Math.max(1, parseInt(ext.page, 10) || 1)
    let rows = []

    if (text) {
        try {
            rows = await searchRows(text, page)
        } catch (e) {
            $print('ONE search 失败: ' + e)
        }
        $print('ONE 搜索「' + text + '」第' + page + '页 → ' + rows.length + ' 条')
    }
    return jsonify({ list: rows.map(toCard), page: page })
}

/* ------------------------------------------------------------------ */
/* 详情 / 播放                                                         */
/* ------------------------------------------------------------------ */

async function getTracks(ext) {
    ext = argsify(ext)
    const id = String(ext.id || ext.vod_id || '')
    const groups = []

    if (id) {
        try {
            const a = await callApi('article/detail', { id: id })
            if (a && typeof a === 'object') {
                if (Array.isArray(a.collection_list) && a.collection_list.length) {
                    groups.push({
                        title: 'ONE合集',
                        tracks: a.collection_list.map(function (ep, i) {
                            return {
                                name: clean(ep.video_name || ep.title) || '第' + (i + 1) + '集',
                                pan: '',
                                ext: { id: String(ep.id) },
                            }
                        }),
                    })
                } else {
                    playLines(a).forEach(function (line) {
                        groups.push({ title: line.name, tracks: [{ name: '正片', pan: '', ext: { url: line.url } }] })
                    })
                }
            }
        } catch (e) {
            $print('ONE getTracks 失败: ' + e)
        }
    }

    if (!groups.length) $print('ONE ' + id + ' 没有取到可播线路')
    else $print('ONE ' + id + ' → ' + groups.map(function (g) { return g.title }).join(' / '))
    return jsonify({ list: groups })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    let url = String(ext.url || '')

    // 合集里的一集只有编号，播放时再取地址
    if (!url && ext.id) {
        try {
            const a = await callApi('article/detail', { id: String(ext.id) })
            const lines = a && typeof a === 'object' ? playLines(a) : []
            if (lines.length) url = lines[0].url
        } catch (e) {
            $print('ONE getPlayinfo 失败: ' + e)
        }
    }

    $print('ONE 播放地址: ' + url.slice(0, 120))
    return jsonify({ urls: [url], headers: [{ 'User-Agent': UA }] })
}
