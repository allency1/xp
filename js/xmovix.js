/**
 * xptv_xmovix.js — XmoviX（hd.xmovix.net）XPTV 源
 * 编写: 2026-11-19
 *
 * 页面结构（均已实测；站点是 DLE 程序）：
 *   列表   /en/movies/、/en/movies/{分类}/、/en/watch/country/{国家}/ …，第 N 页在后面加 page/N/，每页 24 条
 *          每个影片是 div.short：a.short-poster 的 href、img 的 data-src（封面）、a.th-title（标题）、.short-label（HD / Full HD）
 *          卡片链接的域名不固定（hd. / m. / 不带前缀），所以只取路径
 *   排行   /en/top.html，单页 100 条，li.top100-item
 *   搜索   /index.php?do=search&subaction=search&lang=en&story={词}，第 N 页加 &search_start=N
 *   详情   播放器是点了才插入的 iframe，地址写在 .fplayer 里的几段脚本里（s2.src = "…"），一般有 3 个播放源
 *   取流   播放源是三种第三方播放器页面。它们的域名经常换，所以按页面内容认，不按域名认：
 *          StreamHG 类（filmcdm.top、morencius.com）  打包脚本里的 links.hls2 / hls3 / hls4（m3u8）
 *          DoodStream 类（playmogo.com）              请求页面里的 /pass_md5/… 得到地址前半段，再拼随机串和 token（MP4，必须带 Referer）
 *          VOE（voe.sx，会先跳到一个随机域名）         页面里一段混淆过的 JSON，解出 source（m3u8）
 *
 * 播放地址都带时效和来源 IP 的签名，所以选集里只记播放器页面地址，点播放时才去取。
 */

const cheerio = createCheerio()
const CryptoJS = createCryptoJS()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const SITE = 'https://hd.xmovix.net'
const PAGE_SIZE = 24

function tab(name, path, extra) {
    return { name: name, ext: Object.assign({ path: path }, extra || {}) }
}

const YEAR = new Date().getFullYear()

let appConfig = {
    ver: 20261119,
    title: 'XmoviX',
    site: SITE,
    tabs: [
        tab('最新影片', '/en/movies/'),
        tab(YEAR + '新片', '/en/watch/year/' + YEAR + '/'),
        tab('场景', '/en/porno-video/'),
        tab('Top100', '/en/top.html', { top: 1 }),
        tab('1080P', '/en/movies/hd-1080p/'),
        tab('720P', '/en/movies/hd-720p/'),
        tab('恶搞', '/en/movies/porno-parodies/'),
        tab('复古', '/en/movies/vintage/'),
        tab('俄语译制', '/en/movies/s-perevodom/'),
        // 厂牌
        tab('Private', '/en/movies/private/'),
        tab('Marc Dorcel', '/en/movies/marc_dorcel/'),
        tab('Mario Salieri', '/en/movies/mario-salieri/'),
        tab('Digital Playground', '/en/movies/digital-playground/'),
        tab('Wicked Pictures', '/en/movies/wicked-pictures/'),
        tab('Pure Taboo', '/en/movies/pure-taboo/'),
        tab('New Sensations', '/en/movies/new-sensations/'),
        tab('Hustler', '/en/movies/hustler/'),
        tab('Daring', '/en/movies/daring/'),
        tab('Brasileirinhas', '/en/movies/brasileirinhas/'),
        // 国家
        tab('美国', '/en/watch/country/usa/'),
        tab('法国', '/en/watch/country/france/'),
        tab('德国', '/en/watch/country/germany/'),
        tab('意大利', '/en/watch/country/italy/'),
        tab('西班牙', '/en/watch/country/spain/'),
        tab('俄罗斯', '/en/watch/country/russia/'),
        tab('巴西', '/en/watch/country/brazil/'),
        tab('瑞典', '/en/watch/country/sweden/'),
        tab('欧洲', '/en/watch/country/europe/'),
    ],
}

async function getConfig() {
    return jsonify(appConfig)
}

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */

function clean(t) {
    return String(t == null ? '' : t).replace(/\s+/g, ' ').trim()
}

function originOf(u) {
    const m = String(u == null ? '' : u).match(/^(https?:\/\/[^\/?#]+)/i)
    return m ? m[1] : ''
}

function absUrl(u, base) {
    u = String(u == null ? '' : u).trim()
    if (!u) return ''
    if (/^https?:\/\//i.test(u)) return u
    if (u.indexOf('//') === 0) return 'https:' + u
    return (originOf(base) || SITE) + (u.charAt(0) === '/' ? '' : '/') + u
}

// 老片的封面地址写的是 http://，App 一般不加载明文 http 的图，统一成 https（实测 https 可用）
function coverUrl(u) {
    return absUrl(u).replace(/^http:\/\//i, 'https://')
}

// 影片链接 → 站内路径；不是影片详情页的链接返回空
function toPath(href) {
    const p = String(href == null ? '' : href).trim().replace(/^https?:\/\/[^\/]+/i, '').split('#')[0].split('?')[0]
    return /^\/.+\/\d+-[^\/]+\.html$/.test(p) ? p : ''
}

async function getText(url, referer) {
    const resp = await $fetch.get(url, {
        headers: { 'User-Agent': UA, 'Referer': referer || SITE + '/en/', 'Accept-Language': 'en-US,en;q=0.9' },
        timeout: 15000,
    })
    const d = resp && resp.data
    const text = typeof d === 'string' ? d : (d == null ? '' : JSON.stringify(d))
    if (text.indexOf('<title>Just a moment') >= 0) $print('XmoviX 被 Cloudflare 质询拦截: ' + url)
    return text
}

/* ------------------------------------------------------------------ */
/* 列表 / 搜索                                                         */
/* ------------------------------------------------------------------ */

function parseCards(html) {
    const $ = cheerio.load(html)
    const cards = []
    const seen = {}

    $('div.short').each((_, el) => {
        const box = $(el)
        const path = toPath(box.find('a.short-poster').first().attr('href') || box.find('a.th-title').first().attr('href'))
        if (!path || seen[path]) return
        const img = box.find('img').first()
        const title = clean(box.find('a.th-title').first().text()) || clean(img.attr('alt'))
        if (!title) return
        seen[path] = true
        cards.push({
            vod_id: path,
            vod_name: title,
            vod_pic: coverUrl(img.attr('data-src') || img.attr('src')),
            vod_remarks: clean(box.find('.short-label').first().text()),
            ext: { url: path },
        })
    })

    return cards
}

function parseTop(html) {
    const $ = cheerio.load(html)
    const cards = []
    const seen = {}

    $('li.top100-item').each((_, el) => {
        const item = $(el)
        const path = toPath(item.find('a').first().attr('href'))
        if (!path || seen[path]) return
        const img = item.find('img').first()
        const title = clean(item.find('.top100-name').first().text()) || clean(img.attr('alt'))
        if (!title) return
        seen[path] = true
        cards.push({
            vod_id: path,
            vod_name: title,
            vod_pic: coverUrl(img.attr('data-src') || img.attr('src')),
            vod_remarks: 'TOP ' + (cards.length + 1),
            ext: { url: path },
        })
    })

    return cards
}

async function getCards(ext) {
    ext = argsify(ext)
    const page = Math.max(1, parseInt(ext.page, 10) || 1)
    const path = String(ext.path || '/en/movies/')
    let cards = []

    try {
        if (ext.top) {
            // 排行榜只有一页
            if (page === 1) cards = parseTop(await getText(SITE + path))
        } else {
            cards = parseCards(await getText(SITE + path + (page > 1 ? 'page/' + page + '/' : '')))
        }
    } catch (e) {
        $print('XmoviX 列表请求失败: ' + e)
    }

    $print('XmoviX ' + path + ' 第' + page + '页 → ' + cards.length + ' 条')
    return jsonify({ list: cards, page: page })
}

// 站内搜索只认英文关键词（片名、演员、厂牌）
async function search(ext) {
    ext = argsify(ext)
    const text = String(ext.text || ext.wd || '').trim()
    const page = Math.max(1, parseInt(ext.page, 10) || 1)
    let cards = []

    if (!text) return jsonify({ list: cards, page: page })

    try {
        let url = SITE + '/index.php?do=search&subaction=search&lang=en&story=' + encodeURIComponent(text)
        if (page > 1) url += '&search_start=' + page + '&full_search=0&result_from=' + ((page - 1) * PAGE_SIZE + 1)
        cards = parseCards(await getText(url))
    } catch (e) {
        $print('XmoviX 搜索请求失败: ' + e)
    }

    $print('XmoviX 搜索「' + text + '」第' + page + '页 → ' + cards.length + ' 条')
    return jsonify({ list: cards, page: page })
}

/* ------------------------------------------------------------------ */
/* 详情：找出各个播放源                                                 */
/* ------------------------------------------------------------------ */

const HOST_LABELS = [
    [/filmcdm|morencius|streamhg/i, 'StreamHG'],
    [/playmogo|dood|d000d|ds2play/i, 'Dood'],
    [/(^|\.)voe\./i, 'VOE'],
    [/filmcdn/i, 'filmcdn(不可播)'],
]

function hostLabel(url) {
    const host = originOf(url).replace(/^https?:\/\//i, '')
    for (let i = 0; i < HOST_LABELS.length; i++) {
        if (HOST_LABELS[i][0].test(host)) return HOST_LABELS[i][1]
    }
    return host
}

// 每个播放源是一段这样的脚本：
//   $(document).one('click', '#video2_container', function () { var s2 = document.createElement("iframe"); … s2.src = "https://…"; … })
// 返回的顺序和站点页面上 Player 1 / 2 / 3 的顺序一致
function parseSources(html) {
    const $ = cheerio.load(html)

    const order = []
    $('.fplay').each((_, el) => {
        const id = $(el).find('[id$="_container"]').first().attr('id')
        if (id) order.push(id)
    })

    let code = ''
    $('.fplayer script').each((_, el) => {
        code += ($(el).html() || '') + '\n'
    })
    if (!code) code = html

    const found = []
    const seen = {}
    code.split(/\.one\(\s*['"]click['"]\s*,/).slice(1).forEach((part, i) => {
        const id = (part.match(/^\s*['"]#([\w-]+)['"]/) || [])[1] || ''
        const src = (part.match(/\.src\s*=\s*["']([^"']+)["']/) || [])[1] || ''
        // 页面里偶尔有一条只填了编号、没填完整地址的，跳过
        // 老片上还有只剩域名、编号是空的（如 https://filmcdm.top/e/），同样跳过
        if (!/^https?:\/\/[^\/]+\/.*[^\/]$/i.test(src) || seen[src]) return
        seen[src] = true
        const pos = order.indexOf(id)
        found.push({ src: src, pos: pos < 0 ? 1000 + i : pos })
    })

    found.sort((a, b) => a.pos - b.pos)
    return found.map((f) => f.src)
}

async function getTracks(ext) {
    ext = argsify(ext)
    const path = toPath(ext.url || ext.vod_id || ext.id)
    const tracks = []

    if (path) {
        try {
            parseSources(await getText(SITE + path)).forEach((src, i) => {
                tracks.push({ name: '线路' + (i + 1) + ' ' + hostLabel(src), pan: '', ext: { url: src } })
            })
        } catch (e) {
            $print('XmoviX 详情请求失败: ' + e)
        }
    }

    if (!tracks.length) $print('XmoviX ' + path + ' 没有找到播放源')
    else $print('XmoviX ' + path + ' → ' + tracks.map((t) => t.name).join(' / '))
    return jsonify({ list: [{ title: '播放源', tracks: tracks }] })
}

/* ------------------------------------------------------------------ */
/* 取流：三种播放器页面                                                 */
/* ------------------------------------------------------------------ */

// eval(function(p,a,c,k,e,d){…}('代码',进制,词数,'词|词|…'.split('|')…)) 这种打包脚本的还原
function unpack(html) {
    const start = html.indexOf('eval(function(p,a,c,k,e,d)')
    if (start < 0) return ''
    const end = html.indexOf('</script>', start)
    const packed = end < 0 ? html.slice(start) : html.slice(start, end)
    const m = packed.match(/\}\('([\s\S]*)',\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'\)/)
    if (!m) return ''

    const code = m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\')
    const radix = parseInt(m[2], 10)
    const count = parseInt(m[3], 10)
    const words = m[4].split('|')
    const encode = (n) => (n < radix ? '' : encode(Math.floor(n / radix))) + ((n = n % radix) > 35 ? String.fromCharCode(n + 29) : n.toString(36))

    const dict = {}
    for (let i = count - 1; i >= 0; i--) dict[encode(i)] = words[i] || encode(i)
    return code.replace(/\b\w+\b/g, (w) => (dict[w] !== undefined ? dict[w] : w))
}

// StreamHG 类：解包后有 var links={"hls2":"…","hls3":"…","hls4":"…"}
// hls2 是普通的 m3u8（TS 分片）；hls3 同内容但后缀是 .txt。
// hls4 的分片是伪装成 PNG 图片的（实测播放器识别不出），所以不用它
async function fromPacked(html, pageUrl) {
    const code = unpack(html)
    if (!code) return null

    const cands = []
    const m = code.match(/\blinks\s*=\s*(\{[^}]*\})/)
    if (m) {
        try {
            const links = JSON.parse(m[1])
            ;['hls2', 'hls3'].forEach((k) => {
                if (links[k]) cands.push(absUrl(links[k], pageUrl))
            })
        } catch (e) {}
    }
    if (!cands.length) {
        const f = code.match(/sources\s*:\s*\[\s*\{\s*file\s*:\s*["']([^"']+)["']/)
        if (f) cands.push(absUrl(f[1], pageUrl))
    }
    if (!cands.length) return null

    const headers = { 'Referer': originOf(pageUrl) + '/' }
    // 挨个试，用第一个确实返回了播放列表的
    for (let i = 0; i < cands.length; i++) {
        try {
            if ((await getText(cands[i], headers.Referer)).indexOf('#EXTM3U') === 0) return { url: cands[i], headers: headers }
        } catch (e) {}
    }
    // 这个播放器的服务器有时会出错（实测见过 502 / 403），换一条线路即可
    $print('XmoviX 这条线路的服务器没有返回播放列表，请换一条线路')
    return { url: '', headers: headers }
}

// DoodStream 类
async function fromDood(html, pageUrl) {
    const pass = html.match(/\/pass_md5\/[^'"\s]+/)
    if (!pass) return null

    const token = (html.match(/[?&]token=([a-z0-9]+)/i) || [])[1] || pass[0].split('/').pop()
    const head = clean(await getText(originOf(pageUrl) + pass[0], pageUrl))
    if (!/^https?:\/\//i.test(head)) {
        $print('XmoviX Dood 没有给出地址: ' + head.slice(0, 60))
        return null
    }

    const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let rand = ''
    for (let i = 0; i < 10; i++) rand += abc.charAt(Math.floor(Math.random() * abc.length))

    return {
        url: head + rand + '?token=' + token + '&expiry=' + Date.now(),
        // 不带 Referer 取不到视频
        headers: { 'Referer': originOf(pageUrl) + '/' },
    }
}

// VOE：<script type="application/json">["混淆串"]</script>
// 还原步骤：ROT13 → 去掉夹在里面的干扰符号 → base64 → 每个字符码减 3 → 倒序 → base64 → JSON
function fromVoe(html, pageUrl) {
    const re = /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi
    let m
    while ((m = re.exec(html)) !== null) {
        try {
            let raw = JSON.parse(m[1])
            if (Array.isArray(raw)) raw = raw[0]
            if (typeof raw !== 'string' || raw.length < 100) continue

            const rot = raw.replace(/[a-zA-Z]/g, (c) => {
                const base = c <= 'Z' ? 65 : 97
                return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base)
            })
            const mid = CryptoJS.enc.Base64.parse(rot.replace(/[^A-Za-z0-9+\/=]/g, '')).toString(CryptoJS.enc.Latin1)
            let b64 = ''
            for (let i = mid.length - 1; i >= 0; i--) b64 += String.fromCharCode(mid.charCodeAt(i) - 3)
            const info = JSON.parse(CryptoJS.enc.Base64.parse(b64).toString(CryptoJS.enc.Utf8))

            const url = info && (info.source || info.direct_access_url)
            if (url) return { url: String(url), headers: { 'Referer': originOf(pageUrl) + '/' } }
        } catch (e) {}
    }
    return null
}

async function resolveEmbed(embedUrl) {
    let url = embedUrl
    let html = ''
    for (let hop = 0; hop < 3; hop++) {
        html = await getText(url, SITE + '/')
        // VOE 的第一跳只是一小段脚本，把页面转到当期域名
        const jump = html.length < 3000 && html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/)
        if (!jump) break
        url = absUrl(jump[1], url)
    }

    const res = (await fromDood(html, url)) || fromVoe(html, url) || (await fromPacked(html, url))
    // 老片上有两种播放器（vsembed.com、s2.filmcdn.top）要在浏览器里跑脚本才给地址，这里取不了
    if (!res) $print('XmoviX 不认识的播放器页面: ' + url + '（' + html.length + ' 字节）')
    return res
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    const embed = String(ext.url || '')
    let res = null

    if (/^https?:\/\//i.test(embed)) {
        try {
            res = await resolveEmbed(embed)
        } catch (e) {
            $print('XmoviX 取播放地址失败: ' + e)
        }
    }

    const url = res ? res.url : ''
    $print('XmoviX 播放地址: ' + url.slice(0, 140))
    return jsonify({
        urls: [url],
        headers: [Object.assign({ 'User-Agent': UA }, res ? res.headers : {})],
    })
}
