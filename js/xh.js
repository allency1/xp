/**
 * xh.js — xhamster（中文站）XPTV 源
 * 站点: https://zh.xhamster.com
 * 修订: 2026-11-12
 *
 * 本次修复的问题（原脚本“能出列表、点开不能播/没线路”）：
 *   1. getPlayinfo 里 Referer 拼的是 ext.referer + '/'，但 getTracks 里 referer 被注释掉了，
 *      实际发出去的是 "undefined/" —— 播放器拿着这个假 Referer 请求 CDN，必然 403/黑屏。
 *   2. getTracks 强依赖 <link rel="preload" as="fetch">，站点没这条时 url 为 undefined，
 *      $fetch.get(undefined) 直接抛 TypeError，线路列表为空。
 *   3. res.data 若已被运行时解析成对象，res.data.match 不是函数 -> 抛 TypeError。
 *   4. match 结果可能为 null，null.forEach 抛 TypeError；且只认 \d+p.xxx.m3u8 这一种命名，
 *      一旦主播放列表改了命名，就一条线路都没有。
 *   5. 卡片里存的 ext.url 是页面原始 href，可能是相对路径，getTracks 直接拿去请求会失败。
 *   6. 全程无 try/catch、无日志，出错静默成“无线路”，很难定位。
 *
 * 现在的取流顺序（每一步失败都只记日志，不会抛错）：
 *   A. 详情页的 <link rel="preload" as="fetch"> 指向的主播放列表（原方案，保留）
 *   B. 详情页 HTML 正文里直接出现的 m3u8 / mp4 地址
 *   C. 用 A/B 里的文件名，按同一目录拼出兄弟清晰度（720p.h264.mp4.m3u8 这种命名）
 *   之后对 m3u8 做一次轻量校验（返回里必须含 #EXTM3U），校验不到才退回未校验列表。
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const cheerio = createCheerio()

let appConfig = {
    ver: 20261113,
    title: 'xhamster_兔',
    site: 'https://zh.xhamster.com',
    tabs: [
        {
            name: 'newest',
            ext: {
                href: '/newest',
            },
            ui: 1,
        },
        {
            name: 'weekly best',
            ext: {
                href: '/best/weekly',
            },
            ui: 1,
        },
        {
            name: '4k',
            ext: {
                href: '/4k',
            },
            ui: 1,
        },
    ],
}

async function getConfig() {
    return jsonify(appConfig)
}

/* ------------------------------------------------------------------ */
/* 工具函数                                                            */
/* ------------------------------------------------------------------ */

function base() {
    return String(appConfig.site || 'https://zh.xhamster.com').replace(/\/+$/, '')
}

function origin(u) {
    const m = String(u == null ? '' : u).match(/^(https?:\/\/[^\/?#]+)/i)
    return m ? m[1] : base()
}

// 把 href 补成绝对地址；refBase 用来解析相对路径
function abs(href, refBase) {
    let u = String(href == null ? '' : href).trim()
    if (!u) return ''
    if (/^https?:\/\//i.test(u)) return u
    if (u.indexOf('//') === 0) return 'https:' + u
    if (u.charAt(0) === '/') return origin(refBase) + u
    const b = String(refBase || base() + '/').split('?')[0].split('#')[0]
    const dir = b.charAt(b.length - 1) === '/' ? b : b.replace(/[^\/]*$/, '')
    return dir + u
}

// $fetch 的 data 可能是字符串，也可能已被解析成对象
function toText(data) {
    if (data == null) return ''
    if (typeof data === 'string') return data
    try {
        return JSON.stringify(data)
    } catch (e) {
        return String(data)
    }
}

function pageHeaders(referer) {
    const h = {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Cookie': 'age_confirmed=1',
    }
    h['Referer'] = abs(referer) || base() + '/'
    return h
}

async function getText(url, referer, timeout) {
    const resp = await $fetch.get(url, { headers: pageHeaders(referer), timeout: timeout || 20000 })
    const d = resp && resp.data !== undefined ? resp.data : resp
    return toText(d)
}

function pickText($el, selectors) {
    for (let i = 0; i < selectors.length; i++) {
        const t = $el.find(selectors[i]).first().text()
        if (t && t.trim()) return t.trim()
    }
    return ''
}

function pickAttr($el, selector, attrs) {
    for (let i = 0; i < attrs.length; i++) {
        const v = $el.find(selector).first().attr(attrs[i])
        if (v && String(v).trim() && String(v).indexOf('data:') !== 0) return String(v).trim()
    }
    return ''
}

/* ------------------------------------------------------------------ */
/* 列表 / 搜索                                                         */
/* ------------------------------------------------------------------ */

function parseCards(html) {
    const cards = []
    const seen = {}
    if (!html) return cards

    let $ = null
    try {
        $ = cheerio.load(html)
    } catch (e) {
        $print('xhamster 解析失败: ' + e)
        return cards
    }

    let items = $('.thumb-list__item')
    if (!items || items.length === 0) items = $('li.thumb-list-mobile-item')
    if (!items || items.length === 0) items = $('div[data-video-id]')
    if ((!items || items.length === 0) && html.indexOf('age_confirmed') >= 0) {
        $print('xhamster 页面要求年龄确认，可能被拦截')
    }

    items.each((index, element) => {
        const $el = $(element)

        let id = $el.attr('data-video-id') || $el.find('[data-video-id]').first().attr('data-video-id') || ''
        let href = $el.find('a.video-thumb__image-container').first().attr('href') ||
            $el.find('a.thumb-image-container').first().attr('href') ||
            $el.find('a[href*="/videos/"]').first().attr('href') || ''
        if (!id && href) {
            // 现在是 /videos/<标题slug>-<hash>，取最后一段
            const seg = String(href).split('?')[0].replace(/\/+$/, '').split('/').pop()
            id = seg || ''
        }
        id = String(id || '').trim()
        if (!id || seen[id]) return
        if (!href) return
        seen[id] = 1

        let title = pickAttr($el, '.thumb-image-container__image', ['alt'])
        if (!title) title = pickAttr($el, 'img', ['alt'])
        if (!title) title = pickText($el, ['.video-thumb-info__name', '.video-thumb__name', 'a[aria-label]'])
        if (!title) title = pickAttr($el, 'a', ['aria-label'])
        if (!title) title = 'Video ' + id

        let cover = pickAttr($el, 'a.video-thumb__image-container > img', ['src', 'data-src', 'data-lazy', 'data-original'])
        if (!cover) cover = pickAttr($el, 'img', ['src', 'data-src', 'data-lazy', 'data-original', 'data-image'])
        if (!cover) {
            const srcset = pickAttr($el, 'img', ['srcset', 'data-srcset'])
            if (srcset) cover = srcset.split(',')[0].replace(/\s+\d+[wx]$/, '')
        }
        cover = abs(cover)

        const views = pickText($el, ['.video-thumb-views', '.video-thumb-info__views', '[data-role="video-views"]'])
        const duration = pickText($el, ['.thumb-image-container__duration', '.video-thumb__duration', '[data-role="duration"]'])
        const uploader = pickText($el, ['.video-thumb-info__name + a', '.video-thumb-uploader__name'])

        cards.push({
            vod_id: id,
            vod_name: title,
            vod_pic: cover || '',
            vod_remarks: views || uploader || '',
            vod_duration: duration,
            vod_pubdate: '',
            ext: {
                url: abs(href),
            },
        })
    })

    return cards
}

async function getCards(ext) {
    ext = argsify(ext)
    const page = Number(ext.page || 1) || 1
    let href = String(ext.href || '/newest').trim()
    if (href.charAt(0) !== '/') href = '/' + href

    let cards = []

    // xhamster 的翻页是 /栏目/页码
    const first = page > 1 ? base() + href + '/' + page : base() + href
    try {
        cards = parseCards(await getText(first))
    } catch (e) {
        $print('xhamster 列表请求失败: ' + first + ' :: ' + e)
    }

    // 兜底：部分栏目只认 ?page=N
    if (!cards.length && page > 1) {
        const alt = base() + href + '?page=' + page
        if (alt !== first) {
            try {
                cards = parseCards(await getText(alt))
            } catch (e) {
                $print('xhamster 列表请求失败(备用): ' + alt + ' :: ' + e)
            }
        }
    }

    $print('xhamster cards=' + cards.length + ' href=' + href + ' page=' + page)
    return jsonify({ list: cards })
}

async function search(ext) {
    ext = argsify(ext)
    const page = Number(ext.page || 1) || 1
    let text = ''
    try {
        text = encodeURIComponent(String(ext.text == null ? '' : ext.text).trim())
    } catch (e) {
        text = String(ext.text || '')
    }

    let cards = []
    const url = base() + '/search/' + text + '?page=' + page
    try {
        cards = parseCards(await getText(url))
    } catch (e) {
        $print('xhamster 搜索失败: ' + url + ' :: ' + e)
    }

    $print('xhamster search cards=' + cards.length + ' text=' + text + ' page=' + page)
    return jsonify({ list: cards })
}

/* ------------------------------------------------------------------ */
/* 详情 -> 线路                                                        */
/* ------------------------------------------------------------------ */

function dirOf(url) {
    const b = String(url || '').split('?')[0].split('#')[0]
    return b.replace(/[^\/]*$/, '')
}

function qualityOf(name) {
    const m = String(name || '').match(/(\d{2,4})p/i)
    return m ? parseInt(m[1], 10) : 0
}

// 从任意文本（HTML / m3u8 / JSON）里抽出可用播放地址
function variantsFrom(body, refUrl, pageUrl) {
    const out = []
    if (!body) return out

    // 页面里的 JSON 会把斜杠转义成 \/
    const text = String(body).replace(/\\\//g, '/')
    const dir = dirOf(refUrl || pageUrl)

    const push = (url, name, kind) => {
        url = abs(url)
        if (!url) return
        if (url.indexOf('undefined') >= 0) return
        const q = qualityOf(name || url)
        out.push({
            name: (name || (q ? q + 'p' : 'auto')).replace(/\.m3u8$/i, ''),
            url: url,
            kind: kind,
            q: q,
        })
    }

    // 1) 文本里直接出现的绝对 m3u8 地址
    const absHls = /\bhttps?:\/\/[^\s"'<>\\)]+?\.m3u8[^\s"'<>\\)]*/gi
    let m
    while ((m = absHls.exec(text)) !== null) {
        push(m[0], m[0].match(/(\d{2,4}p)/i) ? m[0].match(/(\d{2,4}p)/i)[1] : '', 'hls')
    }

    // 2) 光有文件名（720p.h264.mp4.m3u8）：按同一目录拼兄弟清晰度
    const nameHls = /\d{2,4}p(?:\.[A-Za-z0-9]+)+\.m3u8/gi
    while ((m = nameHls.exec(text)) !== null) {
        push(dir + m[0], m[0].match(/^\d{2,4}p/)[0], 'hls')
    }

    // 3) 兜底 mp4（同样支持兄弟清晰度命名；(?![\w.]) 防止从 720p.h264.mp4.m3u8 里误拼出 mp4）
    const nameMp4 = /\d{2,4}p(?:\.[A-Za-z0-9]+)+?\.mp4(?![\w.])/gi
    while ((m = nameMp4.exec(text)) !== null) {
        push(dir + m[0], m[0].match(/^\d{2,4}p/)[0], 'mp4')
    }
    const absMp4 = /\bhttps?:\/\/[^\s"'<>\\)]+?\.mp4(?![\w.])[^\s"'<>\\)]*/gi
    while ((m = absMp4.exec(text)) !== null) {
        push(m[0], m[0].match(/(\d{2,4}p)/i) ? m[0].match(/(\d{2,4}p)/i)[1] : '', 'mp4')
    }

    return out
}

function dedupeSort(list) {
    const out = []
    const seen = {}
    for (let i = 0; i < list.length; i++) {
        const t = list[i]
        if (!t || !t.url || seen[t.url]) continue
        seen[t.url] = 1
        out.push(t)
    }
    out.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'hls' ? -1 : 1
        return b.q - a.q
    })
    // 去掉明显重复的清晰度（同名只留第一条）
    const final = []
    const byName = {}
    for (let i = 0; i < out.length; i++) {
        const key = out[i].kind + '|' + out[i].name
        if (byName[key]) continue
        byName[key] = 1
        final.push(out[i])
    }
    return final.slice(0, 10)
}

// m3u8 轻量校验：真拿得到 #EXTM3U 才算可用
async function verifyHls(url, referer) {
    try {
        const body = await getText(url, referer, 12000)
        return String(body).indexOf('#EXTM3U') >= 0 || String(body).indexOf('#EXT-X') >= 0
    } catch (e) {
        return false
    }
}

async function getTracks(ext) {
    ext = argsify(ext)
    const pageUrl = abs(ext.url)

    if (!pageUrl) {
        $print('xhamster getTracks: 缺少 ext.url')
        return jsonify({ list: [{ title: '默认分组', tracks: [] }] })
    }

    let html = ''
    try {
        html = await getText(pageUrl)
    } catch (e) {
        $print('xhamster 详情页请求失败: ' + pageUrl + ' :: ' + e)
    }
    if (html && html.indexOf('Just a moment') >= 0) {
        $print('xhamster 被 Cloudflare 质询拦截: ' + pageUrl)
    }

    let candidates = []

    // 策略 A：<link rel="preload" as="fetch">（实测指向 .../031/552/905/_TPL_.h264.mp4.m3u8 主列表）
    try {
        const $ = html ? cheerio.load(html) : null
        const pres = []
        if ($) {
            $('link[rel="preload"][as="fetch"]').each((i, el) => {
                const h = $(el).attr('href')
                if (h) pres.push(abs(h, pageUrl))
            })
        }
        for (let i = 0; i < pres.length; i++) {
            const masterUrl = pres[i]
            const dir = masterUrl.replace(/[^\/]*$/, '')
            // A0：主列表本身（多码率自适应，交给播放器挑）
            candidates.push({ name: '自动(主列表)', url: masterUrl, kind: 'hls', q: 0 })
            // A1：路径里的 multi= 已经列出全部清晰度，直接拼兄弟地址（最稳）
            const mm = masterUrl.match(/multi=([^\/?#]+)/)
            if (mm) {
                const parts = mm[1].split(',')
                for (let k = 0; k < parts.length; k++) {
                    const q = String(parts[k]).split(':').pop()
                    if (!/^\d{2,4}p$/.test(q)) continue
                    candidates.push({
                        name: q,
                        url: dir + q + '.h264.mp4.m3u8',
                        kind: 'hls',
                        q: qualityOf(q),
                    })
                }
            }
            // A2：再拉一次主列表，按内容解析（兼容命名变化）
            try {
                const body = await getText(masterUrl, pageUrl, 15000)
                candidates = candidates.concat(variantsFrom(body, masterUrl, pageUrl))
            } catch (e) {
                $print('xhamster 主列表请求失败: ' + masterUrl + ' :: ' + e)
            }
        }
        if (pres.length) {
            $print('xhamster preload 链接=' + pres.length)
        } else {
            $print('xhamster 页面无 preload 链接')
            if (html && /要观看视频|验证您的年龄|ageVerification/.test(html)) {
                $print('xhamster 该节点所在地区要求年龄验证，站点不下发播放地址：换一个不强制年龄验证的节点即可')
            }
        }
    } catch (e) {
        $print('xhamster 解析 preload 失败: ' + e)
    }

    // 策略 B：详情页 HTML 正文里直接能拿到的地址
    if (html) {
        candidates = candidates.concat(variantsFrom(html, pageUrl, pageUrl))
    }

    let tracks = dedupeSort(candidates)
    $print('xhamster 候选线路=' + tracks.length)

    // 校验 m3u8（最多 6 条），避免拼错目录导致“有线路但播不了”
    if (tracks.length) {
        const hls = []
        const other = []
        for (let i = 0; i < tracks.length; i++) {
            if (tracks[i].kind === 'hls') hls.push(tracks[i])
            else other.push(tracks[i])
        }
        const ok = []
        const checked = hls.slice(0, 6)
        for (let i = 0; i < checked.length; i++) {
            if (await verifyHls(checked[i].url, pageUrl)) ok.push(checked[i])
        }
        if (ok.length) {
            tracks = ok
        } else if (hls.length) {
            tracks = checked
            $print('xhamster 线路校验全部失败，仍返回候选（可能是 CDN 需要特定请求头）')
        }
        tracks = tracks.concat(other)
    }

    if (!tracks.length) {
        $print('xhamster 未找到播放源: ' + pageUrl)
    }

    return jsonify({
        list: [
            {
                title: '默认分组',
                tracks: tracks.map((t) => ({
                    name: t.name,
                    pan: '',
                    ext: {
                        url: t.url,
                        // 关键修复：把详情页地址作为 referer 传给 getPlayinfo
                        referer: pageUrl,
                    },
                })),
            },
        ],
    })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)

    let url = abs(ext.url)
    if (!url) {
        $print('xhamster getPlayinfo: 缺少地址')
        return jsonify({ urls: [], headers: [] })
    }

    // 关键修复：referer 必须是一个真实地址，绝不能是 "undefined/"
    let referer = ''
    try {
        referer = abs(ext.referer)
    } catch (e) {
        referer = ''
    }
    if (!referer || referer.indexOf('undefined') >= 0) referer = origin(url) + '/'

    const headers = {
        'User-Agent': UA,
        'Referer': referer,
        'Accept': '*/*',
    }

    $print('xhamster play url=' + url + ' referer=' + referer)
    return jsonify({ urls: [url], headers: [headers] })
}
