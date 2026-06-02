const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const SITE = 'https://getav.net'

const HEADERS = {
    'User-Agent': UA,
    'Accept': 'application/json, text/html, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer': SITE + '/zh',
    'Cookie': 'age_verified=1; mobile_redirect=0; lang=zh; geo=CN',
}

const TABS = [
    { name: '\u6700\u65b0', ext: { api: 'trending', page: 1 }, ui: 1 },
    { name: '\u6b63\u5728\u89c2\u770b', ext: { api: 'watching', page: 1 }, ui: 1 },
    { name: '\u5b9e\u65f6\u70ed\u95e8', ext: { api: 'realtime', page: 1 }, ui: 1 },
]

function safeString(value) {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
            const text = safeString(value[i])
            if (text) return text
        }
        return ''
    }
    if (typeof value === 'object') {
        const keys = ['url', 'src', 'href', 'path', 'localImg', 'image', 'img', 'thumbnail', 'thumb', 'cover', 'poster', 'preview', 'previewUrl', 'previewVideoUrl']
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i]
            if (Object.prototype.hasOwnProperty.call(value, key)) {
                const text = safeString(value[key])
                if (text) return text
            }
        }
    }
    return ''
}

function normalizeUrl(url, base) {
    url = safeString(url).trim()
    if (!url || url === '[object Object]' || url === 'undefined' || url === 'null') return ''
    url = url.replace(/&amp;/g, '&').replace(/\\u0026/g, '&').replace(/\\\//g, '/')

    if (url.indexOf(',') > -1 && url.indexOf(' ') > -1) {
        url = url.split(',')[0].trim().split(/\s+/)[0]
    }

    if (url.indexOf('/_next/image') > -1 && url.indexOf('url=') > -1) {
        const match = url.match(/[?&]url=([^&]+)/)
        if (match && match[1]) {
            try {
                url = decodeURIComponent(match[1])
            } catch (e) {
                url = match[1]
            }
        }
    }

    if (url.startsWith('//')) return 'https:' + url
    if (url.startsWith('/')) return (base || SITE) + url
    if (url.startsWith('http://')) return url.replace('http://', 'https://')
    if (url.startsWith('https://')) return url
    return (base || SITE) + '/' + url.replace(/^\.?\//, '')
}

function normalizeImage(url) {
    url = normalizeUrl(url, SITE)
    if (!url || url.startsWith('data:') || url.startsWith('blob:')) return ''
    if (url.indexOf('javascript:') === 0) return ''
    if (/loading|placeholder|favicon|logo/i.test(url)) return ''
    return url
}

function parseJson(data) {
    if (!data) return null
    if (typeof data === 'object') return data
    if (typeof data !== 'string') return null
    const text = data.trim()
    if (!text || text.charAt(0) === '<') return null
    try {
        return JSON.parse(text)
    } catch (e) {
        try {
            return argsify(text)
        } catch (err) {
            return null
        }
    }
}

function apiUrl(type, page) {
    const limit = 40
    if (type === 'watching') return SITE + '/api/recommendations/watching-now?limit=' + limit + '&locale=zh&source=home-rail-v2'
    if (type === 'realtime') return SITE + '/api/recommendations/realtime?limit=' + limit + '&refresh=false&compact=true&locale=zh'
    return SITE + '/api/recommendations/trending?limit=' + limit + '&locale=zh'
}

function getMovieArray(json) {
    if (!json) return []
    if (Array.isArray(json)) return json
    const keys = ['movies', 'items', 'list', 'data', 'results', 'videos', 'docs']
    for (let i = 0; i < keys.length; i++) {
        const value = json[keys[i]]
        if (Array.isArray(value)) return value
        if (value && typeof value === 'object') {
            const nested = getMovieArray(value)
            if (nested.length) return nested
        }
    }
    return []
}

function pickField(obj, keys) {
    if (!obj || typeof obj !== 'object') return ''
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i]
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const value = safeString(obj[key])
            if (value) return value
        }
    }
    return ''
}

function findImageInObject(obj, depth) {
    if (!obj || depth > 3) return ''
    if (typeof obj === 'string') {
        if (/\.(jpg|jpeg|png|webp|avif)(\?|$)/i.test(obj) || obj.indexOf('/images/') > -1 || obj.indexOf('/cover/') > -1) {
            return normalizeImage(obj)
        }
        return ''
    }
    if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
            const found = findImageInObject(obj[i], depth + 1)
            if (found) return found
        }
        return ''
    }
    if (typeof obj === 'object') {
        const direct = pickField(obj, ['localImg', 'coverUrl', 'cover', 'thumbnailUrl', 'thumbnail', 'thumb', 'poster', 'imageUrl', 'image', 'img', 'url', 'src', 'avif', 'webp', 'jpg', 'jpeg', 'png', 'small', 'medium', 'large'])
        const directImg = normalizeImage(direct)
        if (directImg) return directImg

        for (const key in obj) {
            if (!Object.prototype.hasOwnProperty.call(obj, key)) continue
            if (/img|image|thumb|cover|poster|preview/i.test(key)) {
                const found = findImageInObject(obj[key], depth + 1)
                if (found) return found
            }
        }

        for (const key in obj) {
            if (!Object.prototype.hasOwnProperty.call(obj, key)) continue
            const found = findImageInObject(obj[key], depth + 1)
            if (found) return found
        }
    }
    return ''
}

function movieToCard(movie) {
    if (!movie || typeof movie !== 'object') return null

    const id = pickField(movie, ['id', 'movieId', 'code', 'number', 'sku', 'slug', '_id'])
    const slug = pickField(movie, ['slug', 'slugId', 'urlSlug'])
    const title = pickField(movie, ['title', 'titleZh', 'title_zh', 'name', 'displayTitle', 'code'])
    if (!id || !title) return null

    const detailSlug = slug || String(id).toLowerCase()
    const detailUrl = normalizeUrl('/zh/videos/' + detailSlug, SITE)
    const cover = findImageInObject(movie, 0)
    const playUrl = normalizeUrl(pickField(movie, ['localM3u8Path', 'm3u8', 'm3u8Url', 'hlsUrl', 'playUrl', 'videoUrl', 'url']), SITE)
    const previewUrl = normalizeUrl(pickField(movie, ['previewVideoUrl', 'previewUrl', 'preview', 'trailerUrl']), 'https://static.worldstatic.com')
    const remarks = pickField(movie, ['duration', 'durationText', 'runtime', 'code', 'date', 'publishedAt'])

    return {
        vod_id: id,
        vod_name: title,
        vod_pic: cover,
        vod_remarks: remarks,
        ext: {
            id: id,
            url: detailUrl,
            playUrl: playUrl,
            previewUrl: previewUrl,
        },
    }
}

function uniqueCards(cards) {
    const list = []
    const seen = {}
    for (let i = 0; i < cards.length; i++) {
        const card = cards[i]
        if (!card || !card.vod_id) continue
        const key = String(card.vod_id)
        if (seen[key]) continue
        seen[key] = true
        list.push(card)
    }
    return list
}

function extractImg($, $el) {
    const $img = $el.find('img').first()
    if (!$img.length) return ''

    const attrs = ['data-lazy-src', 'data-src', 'data-original', 'data-lazy', 'data-bg', 'data-srcset', 'data-thumb', 'data-poster', 'data-image', 'data-lazy-srcset', 'srcset', 'src']
    for (let i = 0; i < attrs.length; i++) {
        const attr = attrs[i]
        let val = $img.attr(attr) || ''
        if (!val || val === 'javascript:;' || val.startsWith('data:') || val.length < 8) continue
        if (attr.indexOf('srcset') > -1) val = val.split(',')[0].trim().split(/\s+/)[0]
        val = normalizeImage(val)
        if (val) return val
    }

    const $bg = $el.find('[style*="background"]').first()
    const style = $bg.length ? ($bg.attr('style') || '') : ''
    const match = style.match(/url\(['"]?([^'")\s]+)/)
    return match && match[1] ? normalizeImage(match[1]) : ''
}

function parseCardsFromHtml(data) {
    const $ = cheerio.load(data || '')
    const cards = []
    const selector = 'div[class*="group"], article, li, div'

    $(selector).each(function (_, el) {
        const $el = $(el)
        const $link = $el.find('a[href*="/zh/videos/"], a[href*="/videos/"]').first()
        const href = $link.attr('href') || ''
        if (!href) return

        const match = href.match(/\/videos\/([^/?#]+)/)
        const id = match && match[1] ? match[1].toUpperCase() : ''
        if (!id) return

        const $h = $el.find('h3[title], h3, h2, a[title]').first()
        const title = ($h.attr('title') || $h.text() || $link.attr('title') || $el.find('img').first().attr('alt') || '').trim()
        if (!title) return

        cards.push({
            vod_id: id,
            vod_name: title,
            vod_pic: extractImg($, $el),
            vod_remarks: $el.find('.duration, [class*="duration"], [class*="bottom-2"]').first().text().trim(),
            ext: {
                id: id,
                url: normalizeUrl(href, SITE),
                playUrl: '',
                previewUrl: '',
            },
        })
    })

    return uniqueCards(cards)
}

function isBlocked(data) {
    if (!data) return false
    const text = typeof data === 'string' ? data : JSON.stringify(data)
    return /Just a moment|challenge-platform|cf_chl|Enable JavaScript and cookies|Cloudflare/i.test(text)
}

async function fetchText(url, referer) {
    const headers = {
        'User-Agent': UA,
        'Accept': 'application/json, text/html, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': referer || SITE + '/zh',
        'Cookie': 'age_verified=1; mobile_redirect=0; lang=zh; geo=CN',
    }
    const response = await $fetch.get(url, { headers: headers, timeout: 20000 })
    return response.data
}

async function fetchApiCards(url) {
    const data = await fetchText(url, SITE + '/zh')
    if (isBlocked(data)) return []

    const json = parseJson(data)
    const movies = getMovieArray(json)
    const cards = []
    for (let i = 0; i < movies.length; i++) {
        const card = movieToCard(movies[i])
        if (card) cards.push(card)
    }
    return uniqueCards(cards)
}

async function getLocalInfo() {
    return jsonify({
        ver: 1,
        name: 'GetAV',
        api: 'csp_getav',
        type: 3,
    })
}

async function getConfig() {
    return jsonify({
        ver: 1,
        title: 'GetAV',
        site: SITE,
        tabs: TABS,
    })
}

async function getCards(ext) {
    ext = argsify(ext)
    const page = ext.page || 1
    const type = ext.api || 'trending'
    const fallbackUrl = ext.url || SITE + '/zh/latest'

    try {
        let cards = await fetchApiCards(apiUrl(type, page))
        if (cards.length) return jsonify({ list: cards, page: page })

        const html = await fetchText(fallbackUrl, SITE + '/zh')
        if (isBlocked(html)) {
            if (typeof $utils !== 'undefined' && $utils.openSafari) $utils.openSafari(SITE + '/zh', UA)
            return jsonify({ list: [], page: page })
        }

        cards = parseCardsFromHtml(html)
        return jsonify({ list: cards, page: page })
    } catch (e) {
        $print('GetAV getCards failed: ' + safeString(e && e.message ? e.message : e))
        return jsonify({ list: [], page: page })
    }
}

async function getTracks(ext) {
    ext = argsify(ext)
    const tracks = []
    const url = ext.url || ''
    const playUrl = normalizeUrl(ext.playUrl || '', SITE)
    const previewUrl = normalizeUrl(ext.previewUrl || '', 'https://static.worldstatic.com')

    if (playUrl) {
        tracks.push({ name: '\u64ad\u653e', pan: '', ext: { url: url, playUrl: playUrl } })
    } else if (previewUrl) {
        tracks.push({ name: '\u9884\u89c8', pan: '', ext: { url: url, playUrl: previewUrl } })
    } else if (url) {
        tracks.push({ name: '\u64ad\u653e', pan: '', ext: { url: url } })
    }

    return jsonify({
        list: [
            {
                title: 'GetAV',
                tracks: tracks,
            },
        ],
    })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    const pageUrl = ext.url || SITE + '/zh'
    let playUrl = normalizeUrl(ext.playUrl || '', SITE)

    try {
        if (!playUrl && pageUrl) {
            const data = await fetchText(pageUrl, pageUrl)

            const indexTxtMatch = String(data).match(/"(https:\/\/static\.worldstatic\.com\/cdn\/assets\/deliveries\/v2\/[^"]+\/index\.txt[^"]*)"/)
            if (indexTxtMatch && indexTxtMatch[1]) playUrl = normalizeUrl(indexTxtMatch[1], SITE)

            if (!playUrl) {
                const localMatch = String(data).match(/"localM3u8Path"\s*:\s*"([^"]+)"/)
                if (localMatch && localMatch[1]) playUrl = normalizeUrl(localMatch[1], SITE)
            }

            if (!playUrl) {
                const previewMatch = String(data).match(/"previewVideoUrl"\s*:\s*"([^"]+)"/)
                if (previewMatch && previewMatch[1]) playUrl = normalizeUrl(previewMatch[1], 'https://static.worldstatic.com')
            }

            if (!playUrl) {
                const directMatch = String(data).match(/https?:\/\/[^\s"'<>]+(?:\.m3u8|\.mp4|index\.txt)[^\s"'<>]*/i)
                if (directMatch && directMatch[0]) playUrl = normalizeUrl(directMatch[0], SITE)
            }
        }
    } catch (e) {
        $print('GetAV getPlayinfo failed: ' + safeString(e && e.message ? e.message : e))
    }

    return jsonify({
        urls: playUrl ? [playUrl] : [],
        headers: [
            {
                'User-Agent': UA,
                'Referer': pageUrl,
                'Origin': SITE,
            },
        ],
    })
}

async function search(ext) {
    ext = argsify(ext)
    const keyword = ext.text || ext.wd || ''
    const page = ext.page || 1
    if (!keyword) return jsonify({ list: [], page: page })

    const q = encodeURIComponent(keyword)
    const urls = [
        SITE + '/api/search?q=' + q + '&locale=zh&limit=40',
        SITE + '/api/search?query=' + q + '&locale=zh&limit=40',
        SITE + '/zh/search?q=' + q,
    ]

    try {
        for (let i = 0; i < urls.length; i++) {
            const data = await fetchText(urls[i], SITE + '/zh')
            if (isBlocked(data)) continue

            const json = parseJson(data)
            if (json) {
                const movies = getMovieArray(json)
                const cards = []
                for (let j = 0; j < movies.length; j++) {
                    const card = movieToCard(movies[j])
                    if (card) cards.push(card)
                }
                if (cards.length) return jsonify({ list: uniqueCards(cards), page: page })
            } else {
                const cards = parseCardsFromHtml(data)
                if (cards.length) return jsonify({ list: cards, page: page })
            }
        }
    } catch (e) {
        $print('GetAV search failed: ' + safeString(e && e.message ? e.message : e))
    }

    return jsonify({ list: [], page: page })
}
