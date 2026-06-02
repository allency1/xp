var cheerio = createCheerio()

var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
var SITE = 'https://getav.net'

var SONE666_1080 = 'https://static.worldstatic.com/cdn/assets/deliveries/v2/EBdu--uvICmyZ2lyksZbNyqg4TloFGpk1VoQMZXKq44TfjIDZsp1MiodxutDvRXjB97_UXSeSiyXQavzkxmsEDC55KzcLRRDc3A-TWSfN3xw_KGBr4RHBDN-r7Ac70e5OuoVypsRJHQv8KZXNHsewm1cVN6ifwZ-38-shAr7zserRhYyDnyWTzumk0WASmFsNq3a3j4fyZ8iAFD0YFrYtO-3U1ij_aQDL24DNCJLdolYGjxfuraqVuw4_C8/index.txt?t=f65c18fe0a&e=1829088000'
var SONE666_720 = 'https://static.worldstatic.com/cdn/assets/deliveries/v2/5Yf5y8xu0l_Kx9CbWT0wTAjxeQQl-H-WfG7n6nZVsBnvMElwGtmF0TN3mSDkxQsAwB3MwEAtthYXxLm1XoAvAIyTqUlBANhl5PhPfL1sK5dFVrIq2m8HxGsrp8D4LJOIAFaOsnZsvEzHo3sszF5aIQm-oyjeTwPLILNVhlBq8wedzmg_B4oMFvZr6fduuiNr-7Z_Ehgtp7lA5CvnIbAuu8XHB-xxMVhW5OP7HbHYrVZojoUqBV95kpvtEKKTUw/index.txt?t=eb2151b4b7&e=1829088000'
var SONE666_480 = 'https://static.worldstatic.com/cdn/assets/deliveries/v2/Y6OvZhOD7Xoe8gR7gj2gR_gOrsODCa0DWBCTFTCXNl74pCz80FRvGi-YiHVOSCv1u2I_qb_l67FaTF6sqthXNo6RvNNRIJuiNR8jQ_cqxp-M6Ve1-9j-8ZN3nHUfOCHvOiLkry4bWsXUZpRkl3L_qqu2fCHwyfVXND5S4wfKZ2wZLuCcEkZ5rUzV5geXRAQQ5AweQSzdNjHPwgMRsGtwOIx0hDUyMAu-7Zw9DNI0uEmNmcwcf0qX-m0CXcujuA/index.txt?t=aca832507c&e=1829088000'

function headers(referer) {
    return {
        'User-Agent': UA,
        'Accept': 'application/json,text/html,*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': referer || SITE + '/zh',
        'Cookie': 'age_verified=1; mobile_redirect=0; lang=zh; geo=CN'
    }
}

function str(v) {
    if (v === null || v === undefined) return ''
    if (typeof v === 'string') return v
    if (typeof v === 'number' || typeof v === 'boolean') return String(v)
    return ''
}

function absUrl(url, base) {
    url = str(url).trim()
    if (!url || url === '[object Object]' || url === 'undefined' || url === 'null') return ''
    url = url.replace(/&amp;/g, '&').replace(/\\u0026/g, '&').replace(/\\\//g, '/')
    if (url.indexOf('//') === 0) return 'https:' + url
    if (url.indexOf('/') === 0) return (base || SITE) + url
    if (url.indexOf('http://') === 0) return url.replace('http://', 'https://')
    if (url.indexOf('https://') === 0) return url
    return (base || SITE) + '/' + url.replace(/^\.?\//, '')
}

function imgUrl(v) {
    var u = absUrl(v, SITE)
    if (!u) return ''
    if (u.indexOf('data:') === 0 || u.indexOf('blob:') === 0 || u.indexOf('javascript:') === 0) return ''
    if (/favicon|logo|placeholder|loading/i.test(u)) return ''
    return u
}

function pick(obj, keys) {
    if (!obj || typeof obj !== 'object') return ''
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i]
        var val = obj[key]
        if (typeof val === 'string' || typeof val === 'number') {
            val = str(val)
            if (val) return val
        }
    }
    return ''
}

function findImg(obj, depth) {
    if (!obj || depth > 2) return ''
    if (typeof obj === 'string') {
        if (/\.(jpg|jpeg|png|webp|avif)(\?|$)/i.test(obj) || obj.indexOf('/images/') >= 0 || obj.indexOf('/cover/') >= 0) {
            return imgUrl(obj)
        }
        return ''
    }
    if (typeof obj !== 'object') return ''
    if (Object.prototype.toString.call(obj) === '[object Array]') {
        for (var i = 0; i < obj.length; i++) {
            var a = findImg(obj[i], depth + 1)
            if (a) return a
        }
        return ''
    }

    var directKeys = ['localImg', 'coverUrl', 'cover', 'thumbnailUrl', 'thumbnail', 'thumb', 'poster', 'imageUrl', 'image', 'img', 'url', 'src', 'avif', 'webp', 'jpg', 'jpeg', 'png', 'small', 'medium', 'large']
    for (var j = 0; j < directKeys.length; j++) {
        var k = directKeys[j]
        var val = obj[k]
        if (typeof val === 'string') {
            var u = findImg(val, depth + 1)
            if (u) return u
        } else if (val && typeof val === 'object') {
            var nested = findImg(val, depth + 1)
            if (nested) return nested
        }
    }
    return ''
}

function movieToCard(m) {
    if (!m || typeof m !== 'object') return null

    var id = pick(m, ['id', 'movieId', 'code', 'number', 'sku', 'slug', '_id'])
    var title = pick(m, ['title', 'titleZh', 'title_zh', 'name', 'displayTitle', 'code'])
    if (!id || !title) return null

    var slug = pick(m, ['slug', 'slugId', 'urlSlug'])
    var detail = SITE + '/zh/videos/' + (slug || String(id).toLowerCase())
    var play = absUrl(pick(m, ['localM3u8Path', 'm3u8', 'm3u8Url', 'hlsUrl', 'playUrl', 'videoUrl']), SITE)
    var preview = absUrl(pick(m, ['previewVideoUrl', 'previewUrl', 'preview', 'trailerUrl']), 'https://static.worldstatic.com')

    return {
        vod_id: String(id),
        vod_name: title,
        vod_pic: findImg(m, 0),
        vod_remarks: pick(m, ['duration', 'durationText', 'runtime', 'code', 'date', 'publishedAt']),
        ext: {
            id: String(id),
            url: detail,
            playUrl: play,
            previewUrl: preview
        }
    }
}

function jsonParse(data) {
    if (!data) return null
    if (typeof data === 'object') return data
    if (typeof data !== 'string') return null
    var text = data.trim()
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

function movieArray(json) {
    if (!json) return []
    if (Object.prototype.toString.call(json) === '[object Array]') return json
    var keys = ['movies', 'items', 'list', 'data', 'results', 'videos', 'docs']
    for (var i = 0; i < keys.length; i++) {
        var v = json[keys[i]]
        if (Object.prototype.toString.call(v) === '[object Array]') return v
        if (v && typeof v === 'object') {
            var nested = movieArray(v)
            if (nested.length) return nested
        }
    }
    return []
}

function cardsFromApi(json) {
    var movies = movieArray(json)
    var cards = []
    var seen = {}
    for (var i = 0; i < movies.length; i++) {
        var card = movieToCard(movies[i])
        if (!card || seen[card.vod_id]) continue
        seen[card.vod_id] = true
        cards.push(card)
    }
    return cards
}

function cardImgFromHtml($, box) {
    var img = box.find('img').first()
    if (!img.length) return ''
    var attrs = ['data-lazy-src', 'data-src', 'data-original', 'data-srcset', 'srcset', 'src']
    for (var i = 0; i < attrs.length; i++) {
        var attr = attrs[i]
        var val = img.attr(attr) || ''
        if (!val) continue
        if (attr.indexOf('srcset') >= 0) val = val.split(',')[0].trim().split(/\s+/)[0]
        val = imgUrl(val)
        if (val) return val
    }
    return ''
}

function cardsFromHtml(data) {
    var $ = cheerio.load(data || '')
    var cards = []
    var seen = {}

    $('a[href*="/videos/"]').each(function (_, a) {
        var link = $(a)
        var href = link.attr('href') || ''
        var m = href.match(/\/videos\/([^/?#]+)/)
        if (!m || !m[1]) return

        var id = String(m[1]).toUpperCase()
        if (seen[id]) return

        var box = link.closest('div')
        var title = (box.find('h3').first().attr('title') || box.find('h3').first().text() || link.attr('title') || box.find('img').first().attr('alt') || '').trim()
        if (!title) return

        seen[id] = true
        cards.push({
            vod_id: id,
            vod_name: title,
            vod_pic: cardImgFromHtml($, box),
            vod_remarks: box.find('[class*="duration"], [class*="bottom-2"]').first().text().trim(),
            ext: {
                id: id,
                url: absUrl(href, SITE),
                playUrl: '',
                previewUrl: ''
            }
        })
    })
    return cards
}

function debugCards(title, remarks) {
    return [
        {
            vod_id: 'debug-status',
            vod_name: title,
            vod_pic: '',
            vod_remarks: remarks || '',
            ext: { url: SITE + '/zh', playUrl: '', previewUrl: '' }
        },
        {
            vod_id: 'debug-sone-666',
            vod_name: 'SONE-666 1080P/720P/480P',
            vod_pic: '',
            vod_remarks: 'Full index.txt lines from captured URLs',
            ext: {
                id: 'SONE-666',
                url: SITE + '/zh/videos/sone-666',
                playUrl: '',
                previewUrl: ''
            }
        }
    ]
}

function statusCards(title, remarks) {
    return [{
        vod_id: 'status',
        vod_name: title,
        vod_pic: '',
        vod_remarks: remarks || '',
        ext: { url: SITE + '/zh', playUrl: '', previewUrl: '' }
    }]
}

function apiUrl(type) {
    if (type === 'watching') return SITE + '/api/recommendations/watching-now?limit=40&locale=zh&source=home-rail-v2'
    if (type === 'realtime') return SITE + '/api/recommendations/realtime?limit=40&refresh=false&compact=true&locale=zh'
    return SITE + '/api/recommendations/trending?limit=40&locale=zh'
}

async function getLocalInfo() {
    return jsonify({
        ver: 1,
        name: 'GetAV',
        api: 'csp_getav',
        type: 3
    })
}

async function getConfig() {
    return jsonify({
        ver: 1,
        title: 'GetAV',
        site: SITE,
        tabs: [
            { name: 'Manual', ext: { type: 'manual', page: 1 }, ui: 1 },
            { name: 'Latest', ext: { type: 'trending', page: 1, url: SITE + '/zh/latest' }, ui: 1 },
            { name: 'Watching', ext: { type: 'watching', page: 1, url: SITE + '/zh' }, ui: 1 },
            { name: 'Realtime', ext: { type: 'realtime', page: 1, url: SITE + '/zh/hot' }, ui: 1 },
            { name: 'Debug', ext: { type: 'debug', page: 1 }, ui: 1 }
        ]
    })
}

async function getCards(ext) {
    ext = argsify(ext)
    var type = ext.type || 'trending'
    var page = ext.page || 1
    var apiError = ''

    if (page > 1) {
        return jsonify({ list: [], page: page })
    }

    if (type === 'debug') {
        return jsonify({ list: debugCards('Debug: script loaded', 'No network request in this tab'), page: page })
    }

    if (type === 'manual') {
        return jsonify({ list: [debugCards('', '')[1]], page: page })
    }

    try {
        var res = await $fetch.get(apiUrl(type), {
            headers: headers(SITE + '/zh'),
            timeout: 20000
        })
        var text = res.data
        var blocked = typeof text === 'string' && /Just a moment|challenge-platform|cf_chl|Enable JavaScript and cookies|Cloudflare/i.test(text)
        if (!blocked) {
            var json = jsonParse(text)
            var apiCards = cardsFromApi(json)
            if (apiCards.length) return jsonify({ list: apiCards, page: page })
        }
    } catch (e) {
        apiError = e && e.message ? e.message : String(e)
    }

    try {
        var url = ext.url || SITE + '/zh/latest'
        var res2 = await $fetch.get(url, {
            headers: headers(SITE + '/zh'),
            timeout: 20000
        })
        var html = res2.data || ''
        if (typeof html === 'string' && /Just a moment|challenge-platform|cf_chl|Enable JavaScript and cookies|Cloudflare/i.test(html)) {
            if (typeof $utils !== 'undefined' && $utils.openSafari) $utils.openSafari(SITE + '/zh', UA)
            return jsonify({ list: statusCards('Cloudflare blocked', 'Verify getav.net in Safari and proxy getav.net/static.worldstatic.com'), page: page })
        }

        var htmlCards = cardsFromHtml(html)
        if (htmlCards.length) return jsonify({ list: htmlCards, page: page })
        return jsonify({ list: statusCards('No cards parsed', 'HTML size=' + String(html).length + (apiError ? '; API=' + apiError : '')), page: page })
    } catch (err) {
        var msg2 = err && err.message ? err.message : String(err)
        return jsonify({ list: statusCards('HTML request failed', msg2 + (apiError ? '; API=' + apiError : '')), page: page })
    }
}

async function getTracks(ext) {
    ext = argsify(ext)
    var tracks = []
    var url = ext.url || SITE + '/zh'
    var id = ext.id || ''

    if (id === 'SONE-666' || url.indexOf('/sone-666') >= 0) {
        tracks.push({ name: '1080P', pan: '', ext: { url: url, playUrl: SONE666_1080 } })
        tracks.push({ name: '720P', pan: '', ext: { url: url, playUrl: SONE666_720 } })
        tracks.push({ name: '480P', pan: '', ext: { url: url, playUrl: SONE666_480 } })
        return jsonify({ list: [{ title: 'GetAV', tracks: tracks }] })
    }

    if (ext.playUrl) {
        tracks.push({ name: 'Play', pan: '', ext: { url: url, playUrl: ext.playUrl } })
    } else if (ext.previewUrl) {
        tracks.push({ name: 'Preview', pan: '', ext: { url: url, playUrl: ext.previewUrl } })
    } else {
        tracks.push({ name: 'Play', pan: '', ext: { url: url } })
    }
    return jsonify({ list: [{ title: 'GetAV', tracks: tracks }] })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    var pageUrl = ext.url || SITE + '/zh'
    var playUrl = absUrl(ext.playUrl || '', SITE)

    if (!playUrl && pageUrl) {
        try {
            var res = await $fetch.get(pageUrl, {
                headers: headers(pageUrl),
                timeout: 20000
            })
            var data = String(res.data || '')
            var m1 = data.match(/"(https:\/\/static\.worldstatic\.com\/cdn\/assets\/deliveries\/v2\/[^"]+\/index\.txt[^"]*)"/)
            if (m1 && m1[1]) playUrl = absUrl(m1[1], SITE)

            if (!playUrl) {
                var m2 = data.match(/"localM3u8Path"\s*:\s*"([^"]+)"/)
                if (m2 && m2[1]) playUrl = absUrl(m2[1], SITE)
            }

            if (!playUrl) {
                var m3 = data.match(/"previewVideoUrl"\s*:\s*"([^"]+)"/)
                if (m3 && m3[1]) playUrl = absUrl(m3[1], 'https://static.worldstatic.com')
            }

            if (!playUrl) {
                var m4 = data.match(/https?:\/\/[^\s"'<>]+(?:\.m3u8|\.mp4|index\.txt)[^\s"'<>]*/i)
                if (m4 && m4[0]) playUrl = absUrl(m4[0], SITE)
            }
        } catch (e) {}
    }

    return jsonify({
        urls: playUrl ? [playUrl] : [],
        headers: [{
            'User-Agent': UA,
            'Referer': pageUrl,
            'Origin': SITE
        }]
    })
}

async function search(ext) {
    ext = argsify(ext)
    var keyword = ext.text || ext.wd || ''
    var page = ext.page || 1
    if (!keyword) return jsonify({ list: [], page: page })

    var q = encodeURIComponent(keyword)
    var urls = [
        SITE + '/api/search?q=' + q + '&locale=zh&limit=40',
        SITE + '/api/search?query=' + q + '&locale=zh&limit=40',
        SITE + '/zh/search?q=' + q
    ]

    for (var i = 0; i < urls.length; i++) {
        try {
            var res = await $fetch.get(urls[i], {
                headers: headers(SITE + '/zh'),
                timeout: 20000
            })
            var data = res.data || ''
            var json = jsonParse(data)
            if (json) {
                var apiCards = cardsFromApi(json)
                if (apiCards.length) return jsonify({ list: apiCards, page: page })
            } else {
                var htmlCards = cardsFromHtml(data)
                if (htmlCards.length) return jsonify({ list: htmlCards, page: page })
            }
        } catch (e) {}
    }
    return jsonify({ list: statusCards('Search failed', keyword), page: page })
}
