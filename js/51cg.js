/**
 * xptv_51cg.js — 51吃瓜 XPTV 源
 * 由「51吃瓜潇洒.py」（TVBox/Fongmi 的 Python 爬虫）转写，2026-11-13
 *
 * 页面结构（均已实测；站点是 Typecho + Mirages 主题）：
 *   站点   入口域名 boom/battle/budget.ennpaywf.cc 会 302 到当期镜像（如 boom.jbtmhqck.cc），路径原样保留
 *   列表   一篇文章一个 <article>；<article class="ad-item"> 是推广卡片，跳过
 *          首页 /、/page/N/；分类 /category/{slug}/、/category/{slug}/N/；搜索 /search/{词}/、/search/{词}/N/
 *   封面   .blog-background 的 x-bg-loader-url / z-bg-loader-url，图片本身是 AES-128-CBC 密文
 *   详情   /archives/{id}/，每个 .dplayer 的 data-config（JSON）里 video.url 就是 HLS 地址（标准 AES-128，无需请求头）
 *   榜单   「吃瓜榜单」里的文章没有播放器，正文是「TOP N 标题」小节 + 指向原文章的链接
 *
 * 和 Python 版不一样的地方（XPTV 没有对应能力，只能换做法）：
 *   1. XPTV 没有本机代理（localProxy），封面改走远程解密代理 IMG_PROXY（明文图它会原样透传）。
 *      代理只接受 24 小时内的签名，所以收藏/历史里存下的封面隔天会失效，重新进列表即恢复。
 *   2. XPTV 没有“文件夹”卡片。榜单/合集文章（自己没有播放器，正文是一串指向原文章的链接）
 *      点开后每个条目是一集，播放时再去原文章取第一个视频。
 *   3. 页面里的播放地址带签名、会过期。选集里记下了文章路径，超过 10 分钟再播会先回文章页换新地址。
 *
 * 换站点：在 XPTV 的自定义配置里填 {"site":"https://xxx"}，会排在内置入口域名之前优先使用。
 */

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

// 入口域名，按顺序尝试；哪个能打开就一直用哪个，中途打不开再换下一个
const MIRRORS = [
    'https://boom.ennpaywf.cc',
    'https://battle.ennpaywf.cc',
    'https://budget.ennpaywf.cc',
    'https://51cg1.com',
]

// 封面解密代理（和黄果源共用；IMG_PROXY 置空则直接给原图地址，密文图将无法显示）
const IMG_PROXY = 'https://huangguo.498246.xyz/img'
const IMG_PROXY_SECRET = '6482883d232408ab8658992a0bfc32574649c37e049847a9ab84dde61c6cfe35'

// 选集里的播放地址在这么多秒内直接用，超过就回文章页重新取
const FRESH_SECONDS = 600

const cheerio = createCheerio()

let HOST = ''     // 本次会话里已确认能打开的站点
let CUSTOM = ''   // 用户自定义站点
let CJS = null
let proxyWarned = false

function tab(name, path) {
    return { name: name, ui: 1, ext: { path: path } }
}

let appConfig = {
    ver: 20261113,
    title: '51吃瓜',
    site: MIRRORS[0],
    tabs: [
        tab('最新', '/'),
        tab('今日吃瓜', '/category/wpcz/'),
        tab('AI成人短剧', '/category/cbdj/'),
        tab('每日大赛', '/category/mrds/'),
        tab('网黄合集', '/category/whhj/'),
        tab('吃瓜榜单', '/category/mrdg/'),
        tab('瓜友点播', '/category/qghj/'),
        tab('热门大瓜', '/category/rdsj/'),
        tab('必看大瓜', '/category/bkdg/'),
        tab('成人视频', '/category/ysyl/'),
        tab('伦理道德', '/category/lldd/'),
        tab('国产视频', '/category/gcjq/'),
        tab('探花精选', '/category/thjx/'),
        tab('学生校园', '/category/xsxy/'),
        tab('网红黑料', '/category/whhl/'),
        tab('骚男骚女', '/category/snsn/'),
        tab('明星爆料', '/category/whmx/'),
        tab('海外吃瓜', '/category/hwcg/'),
        tab('人人吃瓜', '/category/rrcg/'),
        tab('领导干部', '/category/ldcg/'),
        tab('软萌甜妹', '/category/jpll/'),
        tab('竞技吃瓜', '/category/sjb/'),
        tab('吃瓜看戏', '/category/qubk/'),
        tab('擦边撩骚', '/category/dcbq/'),
        tab('性爱技巧', '/category/zzs/'),
        tab('吃瓜新闻', '/category/cgxw/'),
        tab('原创博主', '/category/yczq/'),
        tab('51原创短剧', '/category/51djc/'),
        tab('往期活动', '/category/51hd/'),
    ],
}

async function getConfig(ext) {
    CUSTOM = readCustomSite(ext)
    if (CUSTOM) appConfig.site = CUSTOM
    return jsonify(appConfig)
}

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */

function clean(t) {
    return String(t == null ? '' : t).replace(/\s+/g, ' ').trim()
}

function toText(d) {
    if (d == null) return ''
    if (typeof d === 'string') return d
    try { return JSON.stringify(d) } catch (e) { return String(d) }
}

function normHost(h) {
    h = String(h == null ? '' : h).trim().replace(/\/+$/, '')
    if (!h) return ''
    if (!/^https?:\/\//i.test(h)) h = 'https://' + h
    return h
}

function originOf(u) {
    const m = String(u == null ? '' : u).match(/^(https?:\/\/[^\/?#]+)/i)
    return m ? m[1] : ''
}

// 自定义站点：getConfig 的入参或全局 $config_str 里的 {"site": "..."}
function readCustomSite(ext) {
    const sources = []
    if (ext) sources.push(ext)
    try {
        if (typeof $config_str !== 'undefined' && $config_str) sources.push($config_str)
    } catch (e) {}
    for (let i = 0; i < sources.length; i++) {
        try {
            const cfg = argsify(sources[i])
            if (cfg && typeof cfg === 'object' && cfg.site) return normHost(cfg.site)
        } catch (e) {}
    }
    return ''
}

function curHost() {
    return HOST || CUSTOM || MIRRORS[0]
}

function hostList() {
    const list = []
    const push = function (h) {
        h = normHost(h)
        if (h && list.indexOf(h) < 0) list.push(h)
    }
    push(HOST)
    push(CUSTOM)
    MIRRORS.forEach(push)
    return list
}

// 把 href 规整成站内路径。带域名的地址只认文章链接，外站推广一律丢弃
function toPath(href) {
    let h = String(href == null ? '' : href).trim()
    if (!h || /^(#|javascript:|mailto:|tel:|data:)/i.test(h)) return ''
    if (h.indexOf('//') === 0) h = 'https:' + h
    if (/^https?:\/\//i.test(h)) {
        h = h.replace(/^https?:\/\/[^\/?#]+/i, '')
        if (h.indexOf('/archives/') !== 0) return ''
    }
    h = h.split('#')[0].split('?')[0]
    if (h.charAt(0) !== '/') h = '/' + h
    return h.replace(/\/{2,}/g, '/')
}

/* ------------------------------------------------------------------ */
/* 取页面（自动换入口域名）                                              */
/* ------------------------------------------------------------------ */

function siteHeaders(host) {
    return {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Referer': host + '/',
    }
}

// 站点自己的页面（含它的 404 页）都带主题名 Mirages；跳转页、拦截页、空响应则没有
function isSitePage(html) {
    return html.indexOf('<article') >= 0 || html.indexOf('Mirages') >= 0 || html.indexOf('dplayer') >= 0
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

async function getPage(host, path) {
    const resp = await $fetch.get(host + path, { headers: siteHeaders(host), timeout: 15000 })
    let html = toText(resp && resp.data)
    if (!isSitePage(html)) {
        // 入口域名靠 302 跳到当期镜像；运行时如果没有自动跟随，就照 Location 手动跟一次
        const loc = headerOf(resp, 'location')
        if (/^https?:\/\//i.test(loc)) {
            const r2 = await $fetch.get(loc, { headers: siteHeaders(originOf(loc)), timeout: 15000 })
            html = toText(r2 && r2.data)
        }
    }
    return html
}

async function fetchSite(path) {
    const hosts = hostList()
    let fallback = ''
    for (let i = 0; i < hosts.length; i++) {
        const h = hosts[i]
        try {
            const html = await getPage(h, path)
            if (isSitePage(html)) {
                if (HOST !== h) {
                    HOST = h
                    $print('51吃瓜 使用站点: ' + h)
                }
                return html
            }
            if (html && !fallback) fallback = html
            $print('51吃瓜 ' + h + path + ' 返回的不是站点页面，换下一个入口')
        } catch (e) {
            $print('51吃瓜 ' + h + path + ' 请求失败: ' + e)
        }
    }
    return fallback
}

/* ------------------------------------------------------------------ */
/* 封面                                                                */
/* ------------------------------------------------------------------ */

// 站点外观图（logo/头像/图标/占位图）不是封面
function isChromeImg(u) {
    const low = String(u == null ? '' : u).toLowerCase()
    const bad = ['logo', 'avatar', 'icon', 'sprite', 'loading', 'placeholder', 'blank.gif', 'default.jpg', '/usr/themes/', 'favicon']
    for (let i = 0; i < bad.length; i++) {
        if (low.indexOf(bad[i]) >= 0) return true
    }
    return false
}

function absImg(raw) {
    const u = String(raw == null ? '' : raw).replace(/\\\//g, '/').replace(/&amp;/g, '&').trim()
    if (!u || u.indexOf('data:') === 0) return ''
    if (u.indexOf('//') === 0) return 'https:' + u
    if (/^https?:\/\//i.test(u)) return u
    return curHost() + (u.charAt(0) === '/' ? '' : '/') + u
}

// 走解密代理：sig = HMAC-SHA256(url + "\n" + exp, secret)
function proxyPic(raw) {
    const u = absImg(raw)
    if (!u || !IMG_PROXY || !IMG_PROXY_SECRET) return u
    try {
        if (!CJS) CJS = (typeof CryptoJS !== 'undefined' && CryptoJS) ? CryptoJS : createCryptoJS()
        // 过期时间按 6 小时取整（有效期 12~18 小时，代理上限 24 小时）：
        // 同一张图的地址在 6 小时内不变，App 的图片缓存才能命中
        const exp = (Math.floor(Date.now() / 1000 / 21600) + 3) * 21600
        const sig = CJS.HmacSHA256(u + '\n' + exp, IMG_PROXY_SECRET).toString(CJS.enc.Hex)
        return IMG_PROXY + '?url=' + encodeURIComponent(u) + '&exp=' + exp + '&sig=' + sig
    } catch (e) {
        if (!proxyWarned) {
            proxyWarned = true
            $print('51吃瓜 封面代理签名失败，封面将无法显示: ' + e)
        }
        return u
    }
}

// 优先级照 Python 版：主题加载器属性 > loadBanner 脚本 > data-xkrkllgl > 懒加载属性/src > background-image
function extractCover($, unit) {
    let raw = ''

    const loaderAttrs = ['x-bg-loader-url', 'z-bg-loader-url', 'z-image-loader-url']
    for (let i = 0; i < loaderAttrs.length && !raw; i++) {
        const attr = loaderAttrs[i]
        unit.find('[' + attr + ']').each(function (_, el) {
            if (raw) return
            const v = $(el).attr(attr)
            if (v && !isChromeImg(v)) raw = v
        })
    }

    const inner = raw ? '' : String(unit.html() || '')

    if (!raw) {
        const m = inner.match(/loadBanner\w*\(\s*['"]([^'"]+)['"]/)
        if (m) raw = m[1]
    }

    if (!raw) {
        const imgAttrs = ['data-xkrkllgl', 'data-src', 'data-original', 'data-lazy-src', 'data-url', 'src']
        for (let i = 0; i < imgAttrs.length && !raw; i++) {
            unit.find('img').each(function (_, el) {
                if (raw) return
                const v = $(el).attr(imgAttrs[i])
                if (v && v.indexOf('data:') !== 0 && !isChromeImg(v)) raw = v
            })
        }
    }

    if (!raw) {
        const m = inner.match(/background(?:-image)?\s*:\s*url\(\s*(?:&quot;|['"])?([^'")&\s]+)/)
        if (m && !isChromeImg(m[1])) raw = m[1]
    }

    return raw ? proxyPic(raw) : ''
}

/* ------------------------------------------------------------------ */
/* 列表                                                                */
/* ------------------------------------------------------------------ */

// 只有角标文字的卡片不是文章
const BADGE_ONLY = ['热门', '熱門', '热播', '推薦', '推荐', '置顶', '广告', 'HOT', 'NEW']

function fmtDate(t) {
    t = clean(t)
    const m = t.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/)
    if (m) return m[1] + '-' + (m[2].length < 2 ? '0' : '') + m[2] + '-' + (m[3].length < 2 ? '0' : '') + m[3]
    return t.replace(/[•·\s]+$/, '')
}

function parseList(html) {
    const $ = cheerio.load(html)
    const cards = []
    const seen = {}

    $('article').each(function (_, el) {
        const unit = $(el)
        // 列表里的推广卡片
        if (unit.hasClass('ad-item') || unit.find('.post-card-ads, .tjtagmanager, a[data-ad_slot_key]').length) return

        let href = unit.find('h2 a').first().attr('href') || ''
        if (!href) {
            unit.find('a').each(function (i, a) {
                if (href) return
                const h = $(a).attr('href')
                if (h && (clean($(a).text()) || $(a).find('img').length)) href = h
            })
        }
        const path = toPath(href)
        if (!path || path === '/' || seen[path]) return

        const name = clean(unit.find('h2').first().text()) || clean(unit.find('h1, h3').first().text())
        if (!name || BADGE_ONLY.indexOf(name) >= 0) return
        // <script> 的文本不是标题
        if (name.indexOf('loadBanner') >= 0 || name.indexOf('function(') >= 0 || name.indexOf('://') >= 0) return
        seen[path] = true

        let remarks = fmtDate(
            unit.find('span[itemprop="datePublished"]').first().text() ||
            unit.find('time').first().text() ||
            unit.find('time').first().attr('datetime') ||
            unit.find('.post-meta, .entry-meta, .meta, .date').first().text()
        )
        const badge = clean(unit.find('.wraps').first().text())
        if (badge) remarks = remarks ? remarks + ' ' + badge : badge

        cards.push({
            vod_id: path,
            vod_name: name,
            vod_pic: extractCover($, unit),
            vod_remarks: remarks,
            ext: { url: path },
        })
    })

    return cards
}

// 分页写法有两种（/分类/2/ 和 /分类/page/2/），第一种取不到再试第二种
function pagePaths(basePath, page) {
    if (basePath === '/') return page > 1 ? ['/page/' + page + '/'] : ['/']
    return page > 1 ? [basePath + page + '/', basePath + 'page/' + page + '/'] : [basePath]
}

// 翻页去重。站点更新很快：翻页期间有新文章发布，整个列表会后移一位，
// 上一页末尾那篇会在下一页开头再出现一次。这里记下每篇文章第一次出现在第几页，
// 更靠后的页再遇到就丢掉；同一页重新请求不受影响，回到第 1 页时清零。
const FIRST_PAGE = {}

function dropRepeats(key, page, cards) {
    if (page <= 1 || !FIRST_PAGE[key]) FIRST_PAGE[key] = {}
    const firstPage = FIRST_PAGE[key]
    const out = []
    for (let i = 0; i < cards.length; i++) {
        const id = cards[i].vod_id
        if (firstPage[id] !== undefined && firstPage[id] < page) continue
        if (firstPage[id] === undefined) firstPage[id] = page
        out.push(cards[i])
    }
    return out
}

async function loadCards(basePath, page) {
    const paths = pagePaths(basePath, page)
    for (let i = 0; i < paths.length; i++) {
        const cards = parseList(await fetchSite(paths[i]))
        if (cards.length) return dropRepeats(basePath, page, cards)
    }
    return []
}

async function getCards(ext) {
    ext = argsify(ext)
    const page = Math.max(1, parseInt(ext.page, 10) || 1)
    let basePath = toPath(ext.path || '/') || '/'
    if (basePath.charAt(basePath.length - 1) !== '/') basePath += '/'

    let cards = []
    try {
        cards = await loadCards(basePath, page)
    } catch (e) {
        $print('51吃瓜 getCards 失败: ' + e)
    }

    $print('51吃瓜 ' + basePath + ' 第' + page + '页 → ' + cards.length + ' 条')
    return jsonify({ list: cards, page: page })
}

async function search(ext) {
    ext = argsify(ext)
    const text = String(ext.text || ext.wd || '').trim()
    const page = Math.max(1, parseInt(ext.page, 10) || 1)
    if (!text) return jsonify({ list: [], page: page })

    let cards = []
    try {
        cards = await loadCards('/search/' + encodeURIComponent(text) + '/', page)
    } catch (e) {
        $print('51吃瓜 search 失败: ' + e)
    }

    $print('51吃瓜 搜索「' + text + '」第' + page + '页 → ' + cards.length + ' 条')
    return jsonify({ list: cards, page: page })
}

/* ------------------------------------------------------------------ */
/* 详情 / 播放                                                         */
/* ------------------------------------------------------------------ */

// 文章里所有播放器的视频地址，按出现顺序
function parseVideos($) {
    const list = []
    $('.dplayer').each(function (_, el) {
        const raw = $(el).attr('data-config')
        if (!raw) return
        try {
            const cfg = JSON.parse(raw)
            const u = cfg && cfg.video && cfg.video.url
            if (u) list.push(String(u))
        } catch (e) {}
    })
    return list
}

function shorten(name, max) {
    return name.length > max ? name.slice(0, max) + '…' : name
}

// 没有播放器的文章有两种：
//   榜单  正文是「TOP N 标题」小节，每节第一条链接指向原文章
//   合集  正文是一串指向原文章的链接（每篇一个图片链接 + 一个文字链接）
function parseLinkList($, selfPath) {
    let body = $('.post-content[itemprop="articleBody"]').first()
    if (!body.length) body = $('.post-content, .entry-content').first()
    if (!body.length) body = $('article').first()

    // 正文容器的尾部还塞着站点自己的东西：分类导航表格、上一篇/下一篇、版权声明、标签、
    // 「重磅热瓜」推荐区、官方公告。它们也带文章链接，先去掉，免得混进条目里
    body.find('.txt-apps, .post-near, .content-copyright, .tags, .hot-news-section, .content-tabs').remove()
    body.find('h2.section-title').each(function (_, el) {
        const head = $(el)
        head.nextAll().remove()
        head.remove()
    })
    body.find('table').each(function (_, el) {
        if ($(el).find('a[href*="/category/"]').length) $(el).remove()
    })

    const items = []
    const seen = {}
    body.find('h2').each(function (_, el) {
        const head = $(el)
        const name = clean(head.text())
        if (!/^(TOP|NO\.?|第)\s*\d+/i.test(name)) return
        let link = ''
        let node = head.next()
        for (let guard = 0; node.length && guard < 20 && !node.is('h2'); guard++) {
            let a = node.find('a[href*="/archives/"]').first()
            if (!a.length && node.is('a')) a = node
            if (a.length) link = toPath(a.attr('href'))
            if (link) break
            node = node.next()
        }
        if (!link || link === selfPath || seen[link]) return
        seen[link] = true
        items.push({ name: name, path: link })
    })
    if (items.length) return { title: '榜单', items: items }

    const names = {}
    const order = []
    body.find('a[href*="/archives/"]').each(function (_, el) {
        const a = $(el)
        const path = toPath(a.attr('href'))
        if (!path || path === selfPath) return
        if (names[path] === undefined) {
            names[path] = ''
            order.push(path)
        }
        // 图片链接没有文字，标题取同一篇文章的文字链接
        if (!names[path]) names[path] = clean(a.text()).replace(/\s*[｜|]\s*点击查看详情.*$/, '')
    })
    for (let i = 0; i < order.length; i++) {
        items.push({ name: shorten(names[order[i]], 40) || '视频' + (i + 1), path: order[i] })
    }
    return { title: '合集', items: items }
}

async function getTracks(ext) {
    ext = argsify(ext)
    const path = toPath(ext.url || ext.id || ext.vod_id || '')
    let title = '51吃瓜'
    const tracks = []

    if (path) {
        try {
            const $ = cheerio.load(await fetchSite(path))
            const videos = parseVideos($)
            const now = Math.floor(Date.now() / 1000)
            if (videos.length) {
                for (let i = 0; i < videos.length; i++) {
                    tracks.push({
                        name: '视频' + (i + 1),
                        pan: '',
                        ext: { url: videos[i], page: path, idx: i, t: now },
                    })
                }
            } else {
                const list = parseLinkList($, path)
                if (list.items.length) title = list.title
                for (let i = 0; i < list.items.length; i++) {
                    tracks.push({ name: list.items[i].name, pan: '', ext: { page: list.items[i].path, idx: 0 } })
                }
            }
        } catch (e) {
            $print('51吃瓜 getTracks 失败: ' + e)
        }
    }

    if (!tracks.length) $print('51吃瓜 ' + path + ' 没有找到视频（纯图文文章，或页面结构变了）')
    else $print('51吃瓜 ' + path + ' → ' + title + ' ' + tracks.length + ' 条')
    return jsonify({ list: [{ title: title, tracks: tracks }] })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    let url = String(ext.url || '')
    const page = toPath(ext.page || '')
    const idx = parseInt(ext.idx, 10) || 0
    const age = Math.floor(Date.now() / 1000) - (parseInt(ext.t, 10) || 0)

    // 榜单条目没有现成地址；现成地址放久了签名会过期。两种情况都回文章页取
    if (page && (!url || age > FRESH_SECONDS)) {
        try {
            const videos = parseVideos(cheerio.load(await fetchSite(page)))
            if (videos.length) url = videos[idx] || videos[0]
            else $print('51吃瓜 ' + page + ' 里没有找到视频')
        } catch (e) {
            $print('51吃瓜 getPlayinfo 失败: ' + e)
        }
    }

    $print('51吃瓜 播放地址: ' + url.slice(0, 120))
    return jsonify({
        urls: [url],
        headers: [{ 'User-Agent': UA, 'Referer': curHost() + '/' }],
    })
}
