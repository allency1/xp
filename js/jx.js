/**
 * jx.js — 123AV（123av.com）XPTV 源
 * 重写: 2026-11-23（原来的混淆版备份在 jx.orig.js）
 *
 * 站点换了模板，原脚本的列表解析和取流方式都失效了：
 *   列表   每个影片现在是 div.card：a.card__cover 的 href（/cn/v/{番号}）、img.card__img（封面）、
 *          a.card__link（标题）、.card__dur（时长）。每页 12 条，第 N 页加 ?page=N
 *   搜索   /cn/search?keyword={词}&page=N
 *   详情   播放器信息在 x-data="player(JSON.parse('[{number,name,url}…]'), …)" 里，
 *          url 是第三方播放器页面 https://{域名}/e/{编号}（域名会换），多段的影片有多项
 *   取流   https://{同一域名}/stream?id={编号} 返回 JSON：{ media: { stream: "…/video.m3u8" } }
 *          m3u8 和分片必须带 Referer（播放器页面的域名），不带是 403
 *          分片是普通 TS，但文件名后缀是伪装的（.css / .svg 之类）。新版 ffmpeg 默认会因为后缀拒绝
 *          （要加 -extension_picky 0 才认），基于它的播放器内核可能放不了；系统自带内核一般不看后缀
 */

const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const SITE = 'https://123av.com'

function tab(name, path) {
    return { name: name, ui: 1, ext: { url: SITE + path } }
}

let appConfig = {
    ver: 20261123,
    title: 'javxx',
    site: SITE,
    tabs: [
        tab('热门', '/cn/hot'),
        tab('最新', '/cn/new'),
        tab('最近', '/cn/recent'),
        tab('今日趋势', '/cn/all?sort=today'),
        tab('本周趋势', '/cn/all?sort=week'),
        tab('本月趋势', '/cn/all?sort=month'),
        tab('有码', '/cn/censored'),
        tab('无码', '/cn/uncensored'),
        tab('无码泄露', '/cn/uncensored-leaked'),
        tab('SIRO', '/cn/tags/siro'),
        tab('LUXU', '/cn/tags/259luxu'),
        tab('200GANA', '/cn/tags/200gana'),
        tab('PRESTIGE', '/cn/tags/prestige-premium'),
        tab('FC2', '/cn/makers/fc2'),
        tab('HEYZO', '/cn/makers/heyzo'),
        tab('1pondo', '/cn/makers/1pondo'),
        tab('Caribbeancom', '/cn/makers/caribbeancom'),
    ],
}

async function getConfig() {
    return jsonify(appConfig)
}

function clean(t) {
    return String(t == null ? '' : t).replace(/\s+/g, ' ').trim()
}

function originOf(u) {
    const m = String(u == null ? '' : u).match(/^(https?:\/\/[^\/?#]+)/i)
    return m ? m[1] : ''
}

function absUrl(u) {
    u = String(u == null ? '' : u).trim()
    if (!u) return ''
    if (/^https?:\/\//i.test(u)) return u
    if (u.indexOf('//') === 0) return 'https:' + u
    return SITE + (u.charAt(0) === '/' ? '' : '/') + u
}

async function getText(url, referer) {
    const resp = await $fetch.get(url, {
        headers: { 'User-Agent': UA, 'Referer': referer || SITE + '/' },
        timeout: 15000,
    })
    const d = resp && resp.data
    return typeof d === 'string' ? d : (d == null ? '' : JSON.stringify(d))
}

/* ------------------------------------------------------------------ */
/* 列表 / 搜索                                                         */
/* ------------------------------------------------------------------ */

function parseCards(html) {
    const $ = cheerio.load(html)
    const cards = []
    const seen = {}

    $('div.card').each((_, el) => {
        const card = $(el)
        const href = card.find('a.card__cover').first().attr('href') || card.find('a.card__link').first().attr('href') || ''
        const path = href.replace(/^https?:\/\/[^\/]+/i, '').split('?')[0]
        if (!/\/v\/[^\/]+$/.test(path) || seen[path]) return
        const title = clean(card.find('.card__link').first().text()) || clean(card.find('.card__title').first().text())
        if (!title) return
        seen[path] = true

        const img = card.find('img.card__img, img').first()
        const duration = clean(card.find('.card__dur').first().text())
        cards.push({
            vod_id: path,
            vod_name: title,
            vod_pic: absUrl(img.attr('src') || img.attr('data-src')),
            vod_remarks: duration,
            vod_duration: duration,
            ext: { url: path },
        })
    })

    return cards
}

async function getCards(ext) {
    ext = argsify(ext)
    const page = Math.max(1, parseInt(ext.page, 10) || 1)
    let url = String(ext.url || SITE + '/cn/new')
    let cards = []

    if (page > 1) url += (url.indexOf('?') >= 0 ? '&' : '?') + 'page=' + page

    try {
        cards = parseCards(await getText(url))
    } catch (e) {
        $print('javxx 列表请求失败: ' + e)
    }

    $print('javxx ' + url.replace(SITE, '') + ' → ' + cards.length + ' 条')
    return jsonify({ list: cards })
}

async function search(ext) {
    ext = argsify(ext)
    const text = String(ext.text || ext.keyword || ext.wd || '').trim()
    const page = Math.max(1, parseInt(ext.page, 10) || 1)
    let cards = []

    if (!text) return jsonify({ list: cards })

    try {
        cards = parseCards(await getText(SITE + '/cn/search?keyword=' + encodeURIComponent(text) + '&page=' + page))
    } catch (e) {
        $print('javxx 搜索请求失败: ' + e)
    }

    $print('javxx 搜索「' + text + '」第' + page + '页 → ' + cards.length + ' 条')
    return jsonify({ list: cards })
}

/* ------------------------------------------------------------------ */
/* 详情 / 播放                                                         */
/* ------------------------------------------------------------------ */

// 从 x-data="player(JSON.parse('…'), …)" 里取出各段的播放器页面地址
function parseParts(html) {
    const $ = cheerio.load(html)
    let attr = ''
    $('[x-data]').each((_, el) => {
        const v = $(el).attr('x-data') || ''
        if (!attr && v.indexOf('player(') === 0) attr = v
    })

    const m = attr.match(/JSON\.parse\('((?:[^'\\]|\\.)*)'\)/)
    if (!m) return []

    try {
        // 括号里是一个 JS 字符串字面量，内容是 JSON：先把字面量还原成字符串，再解析
        const text = JSON.parse('"' + m[1].replace(/\\'/g, "'").replace(/"/g, '\\"') + '"')
        const list = JSON.parse(text)
        return (Array.isArray(list) ? list : []).filter((p) => p && /^https?:\/\//i.test(p.url || ''))
    } catch (e) {
        $print('javxx 播放信息解析失败: ' + e)
        return []
    }
}

async function getTracks(ext) {
    ext = argsify(ext)
    const path = String(ext.url || ext.vod_id || '')
    const tracks = []

    if (path) {
        try {
            const parts = parseParts(await getText(absUrl(path)))
            parts.forEach((p, i) => {
                tracks.push({
                    name: parts.length > 1 ? '第' + (i + 1) + '段' : '播放',
                    pan: '',
                    ext: { embed: String(p.url) },
                })
            })
        } catch (e) {
            $print('javxx 详情请求失败: ' + e)
        }
    }

    if (!tracks.length) $print('javxx ' + path + ' 没有找到播放信息')
    return jsonify({ list: [{ title: '默认分组', tracks: tracks }] })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    const embed = String(ext.embed || '')
    const origin = originOf(embed)
    let playUrl = ''

    const id = (embed.match(/\/e\/([A-Za-z0-9_]+)/) || [])[1]
    if (origin && id) {
        try {
            const data = JSON.parse(await getText(origin + '/stream?id=' + encodeURIComponent(id), embed))
            playUrl = String((data && data.media && data.media.stream) || '')
            if (!playUrl) $print('javxx 播放接口没有给出地址: ' + JSON.stringify(data).slice(0, 120))
        } catch (e) {
            $print('javxx 取播放地址失败: ' + e)
        }
    }

    $print('javxx 播放地址: ' + playUrl.slice(0, 120))
    return jsonify({
        urls: [playUrl],
        // 不带 Referer 的话 m3u8 和分片都是 403
        headers: [{ 'User-Agent': UA, 'Referer': origin + '/', 'Origin': origin }],
    })
}
