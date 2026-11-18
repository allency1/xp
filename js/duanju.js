/**
 * xptv_duanju.js — 短剧one XPTV 源
 * 站点: https://duanju.one
 * 编写日期: 2026-11-12
 *
 * 站点为 Laravel 服务端渲染（无公开 JSON API），脚本解析 HTML（createCheerio）。
 *
 * 页面结构（均已实测）：
 *   卡片     a.drama-card → /drama/{slug}；封面 storage/covers/*.webp（明文，可直接显示）
 *   列表     /?page=N（24条/页）；/?filter=free|vip|completed（可翻页）；/tag/{slug}（单页）
 *   上新     /updates（今天）、/updates/yesterday（昨天）、/updates/week?page=N（近7天，20条/页）
 *            标记为 article.update-card
 *   排行     /rankings（TOP20，a.ranking-link）
 *   搜索     /?q={关键词}（单页）
 *   详情     /drama/{slug} → 分集 a[aria-label="第 N 集，免费|需权益"]
 *   取流     /drama/{slug}/ep/{n} 的 <video data-public-media-url="/player/public-media/{集ID}">，
 *            再请求 {该地址}/grant 得到 JSON 里的 src（cdn.duanju.one/…mp4?verify=…，1 小时有效）。
 *            2026-11-18 之前地址是直接写在 <video src> 里的，脚本两种都认 *
 * 注意：
 *   - cdn.duanju.one 的 MP4 必须带 Referer: https://duanju.one/（否则 403），脚本已在 headers 里带
 *   - 付费集（"需权益"）页面无 video 源，脚本把集名标为 "第N集(需权益)"，取流返回空地址
 *   - /?page=1 会 301，脚本页码为 1 时省略 page 参数
 *   - 站点挂了 Cloudflare：若请求被质询，日志会打印「被 Cloudflare 质询拦截」
 */

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const SITE = 'https://duanju.one'

const cheerio = createCheerio()

let appConfig = {
    ver: 20261112,
    title: '短剧one',
    site: SITE,
    tabs: [
        { name: '剧场', ext: { mode: 'home' } },
        { name: '今日上新', ext: { mode: 'updates', period: '' } },
        { name: '昨日上新', ext: { mode: 'updates', period: 'yesterday' } },
        { name: '近7天', ext: { mode: 'updates', period: 'week' } },
        { name: '排行', ext: { mode: 'rank' } },
        { name: '免费', ext: { mode: 'filter', filter: 'free' } },
        { name: '付费', ext: { mode: 'filter', filter: 'vip' } },
        { name: '完结', ext: { mode: 'filter', filter: 'completed' } },
        { name: '小编推荐', ext: { mode: 'tag', tag: 'Editor-Choice' } },
        { name: '幻想', ext: { mode: 'tag', tag: 'Fantasy' } },
        { name: '古装', ext: { mode: 'tag', tag: 'Historical' } },
        { name: '仙侠', ext: { mode: 'tag', tag: 'Xianxia' } },
        { name: '校园', ext: { mode: 'tag', tag: 'school' } },
        { name: '家庭', ext: { mode: 'tag', tag: 'Home' } },
        { name: '职场', ext: { mode: 'tag', tag: 'Workplace' } },
        { name: '剧情', ext: { mode: 'tag', tag: 'story' } },
        { name: 'NTR', ext: { mode: 'tag', tag: 'ntr' } },
        { name: '凌辱', ext: { mode: 'tag', tag: 'Humiliation' } },
        { name: '露出', ext: { mode: 'tag', tag: 'exposure-exhibitionism' } },
        { name: 'SM调教', ext: { mode: 'tag', tag: 'sm-ai-dramer' } },
        { name: '女同', ext: { mode: 'tag', tag: 'lesbian' } },
        { name: '暗黑', ext: { mode: 'tag', tag: 'dark-content' } },
        { name: '户外', ext: { mode: 'tag', tag: 'outdoor' } },
        { name: 'GB向', ext: { mode: 'tag', tag: 'girl-dom' } },
    ],
}

async function getConfig(ext) {
    if (ext) {
        try {
            const cfg = argsify(ext)
            if (cfg && cfg.site) appConfig.site = String(cfg.site).replace(/\/+$/, '')
        } catch (e) {}
    }
    return jsonify(appConfig)
}

function base() {
    return appConfig.site
}

function absUrl(u) {
    u = String(u || '')
    if (!u) return ''
    if (u.indexOf('//') === 0) return 'https:' + u
    if (u.charAt(0) === '/') return base() + u
    return u
}

function clean(txt) {
    return String(txt == null ? '' : txt).replace(/\s+/g, ' ').trim()
}

function pageHeaders() {
    return {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Referer': base() + '/',
    }
}

async function fetchHtml(url) {
    const resp = await $fetch.get(url, { headers: pageHeaders(), timeout: 20000 })
    const d = resp && resp.data
    const h = typeof d === 'string' ? d : (d == null ? '' : JSON.stringify(d))
    // 被 Cloudflare 质询时拿到的是 "Just a moment..." 页，解析必然为空；明确打日志方便排查
    if (h.indexOf('<title>Just a moment') >= 0) {
        $print('短剧one 被 Cloudflare 质询拦截: ' + url)
    }
    return h
}

function slugOf(href) {
    const m = String(href || '').match(/\/drama\/([^\/?#"'\s]+)/)
    return m ? m[1] : ''
}

// slug 取自页面 href（可能已百分号编码），规整后再拼 URL，避免二次编码
function encSlug(s) {
    s = String(s || '')
    try { return encodeURIComponent(decodeURIComponent(s)) } catch (e) { return s }
}

function toCard(slug, title, pic, parts) {
    return {
        vod_id: slug,
        vod_name: title,
        vod_pic: absUrl(pic),
        vod_remarks: parts.filter(Boolean).join(' · '),
        ext: { id: slug },
    }
}

// ---------- 各类列表页解析 ----------

// 标准卡片：a.drama-card（首页 / 筛选 / 标签 / 搜索）
function parseCards(htmlStr) {
    const $ = cheerio.load(htmlStr)
    const cards = []
    const seen = {}
    // 首页顶部有「近期佳作推荐」轮播（.featured-section），内容与下方列表重复，
    // 混进来会导致翻页后影片重复，所以优先只取主列表 .drama-grid
    let nodes = $('.drama-grid a.drama-card')
    if (!nodes.length) nodes = $('a.drama-card')
    nodes.each(function (_, el) {
        const a = $(el)
        const slug = slugOf(a.attr('href'))
        if (!slug || seen[slug]) return
        const title = clean(a.find('h2').first().text())
        if (!title) return
        seen[slug] = true
        const pic = a.find('img').first().attr('src') || ''
        const badge = clean(a.find('.badge').first().text())
        const eps = clean(a.find('.episode-count').first().text()).replace(/\s+/g, '')
        const time = clean(a.find('p').last().text()).replace(/^更新于\s*/, '')
        cards.push(toCard(slug, title, pic, [badge, eps, time]))
    })
    return cards
}

// 排行页：li.ranking-item > a.ranking-link
function parseRanks(htmlStr) {
    const $ = cheerio.load(htmlStr)
    const cards = []
    const seen = {}
    $('a.ranking-link').each(function (_, el) {
        const a = $(el)
        const slug = slugOf(a.attr('href'))
        if (!slug || seen[slug]) return
        const title = clean(a.find('h3').first().text())
        if (!title) return
        seen[slug] = true
        const pic = a.find('img').first().attr('src') || ''
        let pos = clean(a.find('.ranking-position').first().text())
        if (pos) pos = 'TOP' + pos.replace(/^0+/, '')
        const meta = []
        a.find('.ranking-meta span').each(function (i, s) { const t = clean($(s).text()); if (t) meta.push(t.replace(/\s+/g, '')) })
        const plays = clean(a.find('.ranking-play-count b').first().text())
        cards.push(toCard(slug, title, pic, [pos, meta.join(' '), plays ? plays + '播放' : '']))
    })
    return cards
}

// 上新页：article.update-card
function parseUpdates(htmlStr) {
    const $ = cheerio.load(htmlStr)
    const cards = []
    const seen = {}
    $('article.update-card').each(function (_, el) {
        const card = $(el)
        const href = card.find('.update-card-title a').first().attr('href') || card.find('a.update-cover').first().attr('href') || ''
        const slug = slugOf(href)
        if (!slug || seen[slug]) return
        const title = clean(card.find('.update-card-title h3').first().text())
        if (!title) return
        seen[slug] = true
        const pic = card.find('.update-cover img').first().attr('src') || ''
        const badge = clean(card.find('.update-access-badge').first().text())
        const range = clean(card.find('.update-range b').first().text())
        const time = clean(card.find('.update-time').first().text()).replace(/\s*更新\s*/, ' ').replace(/\s+/g, ' ').trim()
        cards.push(toCard(slug, title, pic, [badge, range, time]))
    })
    return cards
}

// ---------- XPTV 入口 ----------

async function getCards(ext) {
    ext = argsify(ext)
    const page = Math.max(1, parseInt(ext.page, 10) || 1)
    const mode = ext.mode || 'home'
    let url = ''
    let singlePage = false

    if (mode === 'updates') {
        const period = String(ext.period || '')
        if (period === 'week') {
            url = base() + '/updates/week' + (page > 1 ? '?page=' + page : '')
        } else {
            url = base() + '/updates' + (period ? '/' + encodeURIComponent(period) : '')
            singlePage = true
        }
    } else if (mode === 'rank') {
        url = base() + '/rankings'
        singlePage = true
    } else if (mode === 'tag') {
        url = base() + '/tag/' + encodeURIComponent(ext.tag || '')
        singlePage = true
    } else if (mode === 'filter') {
        url = base() + '/?filter=' + encodeURIComponent(ext.filter || 'free')
        if (page > 1) url += '&page=' + page
    } else {
        url = page > 1 ? base() + '/?page=' + page : base() + '/'
    }

    // 今日/昨日上新、排行、标签只有单页
    if (singlePage && page > 1) return jsonify({ list: [], page: page })

    let cards = []
    try {
        const h = await fetchHtml(url)
        if (mode === 'rank') cards = parseRanks(h)
        else if (mode === 'updates') cards = parseUpdates(h)
        else cards = parseCards(h)
    } catch (e) {
        $print('短剧one getCards 失败: ' + e)
    }

    $print('短剧one ' + mode + ' 第' + page + '页 → ' + cards.length + ' 条')
    return jsonify({ list: cards, page: page })
}

async function getTracks(ext) {
    ext = argsify(ext)
    const slug = String(ext.id || ext.vod_id || '')
    const tracks = []

    if (slug) {
        try {
            const h = await fetchHtml(base() + '/drama/' + encSlug(slug))
            const $ = cheerio.load(h)
            const seen = {}
            const list = []
            $('a[aria-label]').each(function (_, el) {
                const a = $(el)
                const href = a.attr('href') || ''
                if (href.indexOf('/ep/') < 0) return
                // aria-label 形如 "第 3 集，免费" / "第 3 集，需权益"
                const m = clean(a.attr('aria-label')).match(/^第\s*(\d+)\s*集(?:\s*[，,]\s*(.+))?$/)
                if (!m) return
                const n = parseInt(m[1], 10)
                if (!n || seen[n]) return
                seen[n] = true
                const state = clean(m[2])
                list.push({ n: n, state: state && state !== '免费' ? state : '' })
            })
            list.sort(function (a, b) { return a.n - b.n })
            for (let i = 0; i < list.length; i++) {
                tracks.push({
                    name: '第' + list[i].n + '集' + (list[i].state ? '(' + list[i].state + ')' : ''),
                    pan: '',
                    ext: { id: slug, ep: String(list[i].n) },
                })
            }
        } catch (e) {
            $print('短剧one getTracks 失败: ' + e)
        }
    }

    if (!tracks.length) {
        tracks.push({ name: '第1集', pan: '', ext: { id: slug, ep: '1' } })
    }

    $print('短剧one ' + slug + ' → ' + tracks.length + ' 集')
    return jsonify({ list: [{ title: '默认分组', tracks: tracks }] })
}

// 取一集的播放地址。站点 2026-11 改过一次：
//   旧  <video src="https://cdn.duanju.one/…mp4?v=…">，地址直接写在页面里
//   新  <video data-public-media-url="/player/public-media/{集ID}">，页面里没有地址；
//       请求 {那个地址}/grant 返回 JSON {"src": "https://cdn.duanju.one/…mp4?verify=…", "expires_in": 3600}
// 两种都认。付费集两样都没有。
async function resolveEpisode(pageHtml) {
    const tag = (pageHtml.match(/<video[^>]*data-series-player[^>]*>/i) || pageHtml.match(/<video[^>]*>/i) || [''])[0]
    const attr = function (name) {
        const m = tag.match(new RegExp('\\s' + name + '="([^"]*)"', 'i'))
        return m ? m[1].replace(/&amp;/g, '&') : ''
    }

    const media = attr('data-public-media-url')
    if (media) {
        // fresh=1 让站点现签一个地址，不用它缓存里可能快过期的那个
        const grantUrl = absUrl(media).replace(/\/+$/, '') + '/grant?fresh=1'
        const resp = await $fetch.get(grantUrl, {
            headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Referer': base() + '/' },
            timeout: 15000,
        })
        let d = resp && resp.data
        if (typeof d === 'string') {
            try { d = JSON.parse(d) } catch (e) { d = null }
        }
        if (d && d.src) return String(d.src)
        $print('短剧one 取播放授权失败: ' + grantUrl)
    }

    const direct = attr('src') || (pageHtml.match(/<source[^>]*\ssrc="([^"]+)"/i) || [])[1] || ''
    return direct ? absUrl(direct.replace(/&amp;/g, '&').replace(/\\u0026/gi, '&')) : ''
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    const slug = String(ext.id || ext.vod_id || '')
    const ep = String(parseInt(ext.ep, 10) || 1)
    let playurl = ''

    if (slug) {
        try {
            const h = await fetchHtml(base() + '/drama/' + encSlug(slug) + '/ep/' + ep)
            playurl = await resolveEpisode(h)
            if (!playurl) {
                $print('短剧one 未取到播放地址（付费集或页面结构变化）: ' + slug + ' ep' + ep)
            }
        } catch (e) {
            $print('短剧one getPlayinfo 失败: ' + e)
        }
    }

    $print('短剧one 播放地址: ' + playurl.slice(0, 120))
    return jsonify({
        urls: [playurl],
        headers: [{ 'User-Agent': UA, 'Referer': base() + '/' }],
    })
}

async function search(ext) {
    ext = argsify(ext)
    const text = String(ext.text || ext.wd || '').trim()
    const page = Math.max(1, parseInt(ext.page, 10) || 1)
    let cards = []

    // 站内搜索只有单页
    if (!text || page > 1) return jsonify({ list: cards })

    try {
        cards = parseCards(await fetchHtml(base() + '/?q=' + encodeURIComponent(text)))
    } catch (e) {
        $print('短剧one search 失败: ' + e)
    }

    $print('短剧one 搜索「' + text + '」→ ' + cards.length + ' 条')
    return jsonify({ list: cards })
}
