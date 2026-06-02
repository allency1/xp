const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

let appConfig = {
    ver: 1,
    title: 'GetAV',
    site: 'https://getav.net',
}

function getAgeVerificationCookies() {
    const timestamp = Date.now()
    return {
        age_verified_at: timestamp.toString(),
        age_verification_policy: '1:HK:18',
    }
}

function getCookieString() {
    const ageCookies = getAgeVerificationCookies()
    return `age_verified_at=${ageCookies.age_verified_at}; age_verification_policy=${ageCookies.age_verification_policy}`
}

function getHeaders(referer) {
    return {
        'User-Agent': UA,
        'Referer': referer || appConfig.site,
        'Cookie': getCookieString(),
    }
}

function safeString(value) {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    if (Array.isArray(value)) {
        for (const item of value) {
            const text = safeString(item)
            if (text) return text
        }
        return ''
    }
    if (typeof value === 'object') {
        const keys = ['url', 'src', 'href', 'poster', 'imageUrl', 'thumbnailUrl', 'coverUrl', 'previewUrl', 'image', 'thumbnail', 'thumb', 'cover', 'preview', 'path']
        for (const key of keys) {
            if (Object.prototype.hasOwnProperty.call(value, key)) {
                const text = safeString(value[key])
                if (text) return text
            }
        }
    }
    return ''
}

function decodeHtmlEntities(text) {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
}

function pickFromSrcset(srcset) {
    const text = safeString(srcset)
    if (!text) return ''

    const candidates = text
        .split(',')
        .map(item => item.trim().split(/\s+/)[0])
        .filter(Boolean)

    return candidates.length ? candidates[candidates.length - 1] : ''
}

function normalizeImageUrl(value, depth) {
    depth = depth || 0
    let url = safeString(value).trim()
    if (!url) return ''

    url = decodeHtmlEntities(url)
        .replace(/\\u0026/g, '&')
        .replace(/\\\//g, '/')
        .trim()

    const styleMatch = url.match(/^url\((['"]?)(.*?)\1\)$/i)
    if (styleMatch) url = styleMatch[2].trim()

    if (!url || url === '[object Object]' || url === 'undefined' || url === 'null') return ''
    if (/^(data|blob):/i.test(url)) return ''

    const srcsetUrl = pickFromSrcset(url)
    if (srcsetUrl && srcsetUrl !== url && url.includes(',')) {
        url = srcsetUrl
    }

    if (depth < 3) {
        try {
            const parsed = new URL(url, appConfig.site)
            const realUrl = parsed.searchParams.get('url')
            if (parsed.pathname.includes('/_next/image') && realUrl) {
                return normalizeImageUrl(realUrl, depth + 1)
            }
        } catch (e) {
            const match = url.match(/[?&]url=([^&]+)/)
            if (match && match[1]) {
                try {
                    return normalizeImageUrl(decodeURIComponent(match[1]), depth + 1)
                } catch (_) {
                    return normalizeImageUrl(match[1], depth + 1)
                }
            }
        }
    }

    if (url.startsWith('//')) return 'https:' + url
    if (url.startsWith('/')) return appConfig.site + url
    if (/^https?:\/\//i.test(url)) return url

    return appConfig.site + '/' + url.replace(/^\.?\//, '')
}

function extractCover($, $parent) {
    const imageAttrs = ['data-src', 'data-original', 'data-lazy-src', 'data-url', 'data-poster', 'poster', 'src']
    const srcsetAttrs = ['data-srcset', 'srcset']
    const images = $parent.find('img').toArray()

    for (const img of images) {
        const $img = $(img)
        const values = []

        for (const attr of imageAttrs) values.push($img.attr(attr))
        for (const attr of srcsetAttrs) values.push(pickFromSrcset($img.attr(attr)))

        for (const value of values) {
            const cover = normalizeImageUrl(value)
            if (!cover) continue
            if (/logo|favicon|avatar|icon\.|\/icons?\//i.test(cover)) continue
            return cover
        }
    }

    const style = $parent.attr('style') || $parent.find('[style*="background"]').first().attr('style') || ''
    const bgMatch = style.match(/background(?:-image)?:\s*url\((['"]?)(.*?)\1\)/i)
    return bgMatch ? normalizeImageUrl(bgMatch[2]) : ''
}

function getVideoId(href) {
    const match = safeString(href).match(/\/videos\/([^/?#]+)/)
    return match ? match[1] : ''
}

function uniqueCards(cards) {
    const result = []
    const seen = new Set()

    for (const card of cards) {
        const key = card.vod_id || card.ext.url
        if (!key || seen.has(key)) continue
        seen.add(key)
        result.push(card)
    }

    return result
}

function isBlockedPage(data, $) {
    const pageTitle = $('title').text()
    if (/Just a moment|Checking|Attention Required/i.test(pageTitle)) return true
    if (/cf_chl|challenge-platform|challenge-error-text|Enable JavaScript and cookies/i.test(data)) return true

    const hasVideoLinks = $('a[href*="/videos/"]').length > 0
    const looksLikeAgeGate = data.length < 80000 && /18|adult|age|verify|verification|confirm|\u5e74\u9f84|\u5e74\u9f61|\u9a8c\u8bc1|\u9a57\u8b49|\u786e\u8ba4|\u78ba\u8a8d/i.test(data)
    return !hasVideoLinks && looksLikeAgeGate
}

function buildCard($, $container, href) {
    const vodId = getVideoId(href)
    if (!vodId) return null

    const $link = $container.find(`a[href="${href}"]`).first()
    const $h3 = $container.find('h3[title], h3').first()
    const title = ($h3.attr('title') || $h3.text() || $link.attr('title') || $container.find('img').first().attr('alt') || $link.text() || '').trim()
    if (!title) return null

    const fullUrl = href.startsWith('http') ? href : appConfig.site + href
    const remarks = $container.find('div[class*="absolute"][class*="bottom-2"], span[class*="duration"], .duration').first().text().trim()

    return {
        vod_id: vodId,
        vod_name: title,
        vod_pic: extractCover($, $container),
        vod_remarks: remarks,
        ext: { url: fullUrl },
    }
}

function parseCardsFromHtml(data) {
    const $ = cheerio.load(data)
    const cards = []

    $('div.group, div[class*="group"]').each((_, element) => {
        const $container = $(element)
        const href = $container.find('a[href*="/zh/videos/"], a[href*="/videos/"]').first().attr('href') || ''
        const card = buildCard($, $container, href)
        if (card) cards.push(card)
    })

    if (cards.length === 0) {
        $('a[href*="/zh/videos/"], a[href*="/videos/"]').each((_, element) => {
            const $link = $(element)
            const href = $link.attr('href') || ''
            const $container = $link.closest('div')
            const card = buildCard($, $container.length ? $container : $link.parent(), href)
            if (card) cards.push(card)
        })
    }

    return {
        cards: uniqueCards(cards),
        blocked: isBlockedPage(data, $),
    }
}

async function fetchPage(url, referer) {
    const response = await $fetch.get(url, {
        headers: getHeaders(referer),
        timeout: 15000,
    })
    return response.data
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
    try {
        const data = await fetchPage(appConfig.site + '/zh', appConfig.site)
        const $ = cheerio.load(data)
        if (isBlockedPage(data, $)) {
            $print('GetAV needs browser verification, opening Safari.')
            $utils.openSafari(appConfig.site + '/zh', UA)
        }
    } catch (e) {
        $print('GetAV init check failed: ' + e)
    }

    let config = appConfig
    config.tabs = [
        { name: '\u6700\u65b0', ext: { url: appConfig.site + '/zh/latest', page: 1 }, ui: 1 },
        { name: '\u70ed\u95e8', ext: { url: appConfig.site + '/zh/hot', page: 1 }, ui: 1 },
        { name: '\u6f14\u5458', ext: { url: appConfig.site + '/zh/stars', page: 1 }, ui: 1 },
    ]
    return jsonify(config)
}

async function getCards(ext) {
    ext = argsify(ext)
    let page = ext.page || 1
    let url = ext.url || appConfig.site + '/zh/hot'

    if (page > 1) {
        url = url + (url.includes('?') ? '&' : '?') + 'page=' + page
    }

    $print('GetAV list: ' + url)

    try {
        const data = await fetchPage(url, appConfig.site)
        const parsed = parseCardsFromHtml(data)

        if (parsed.blocked && parsed.cards.length === 0) {
            $print('GetAV blocked by verification, opening Safari.')
            $utils.openSafari(url, UA)
            return jsonify({ list: [] })
        }

        $print('GetAV parsed cards: ' + parsed.cards.length)
        return jsonify({ list: parsed.cards })
    } catch (e) {
        $print('GetAV request failed: ' + e)
        return jsonify({ list: [] })
    }
}

async function getTracks(ext) {
    ext = argsify(ext)
    let url = ext.url

    if (!url) {
        $print('GetAV missing video url.')
        return jsonify({ list: [] })
    }

    return jsonify({
        list: [
            {
                title: 'GetAV',
                tracks: [
                    {
                        name: '\u64ad\u653e',
                        pan: '',
                        ext: { url },
                    },
                ],
            },
        ],
    })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    const url = ext.url
    let playurl = ''

    $print('GetAV play parse: ' + url)

    try {
        const data = await fetchPage(url, url)

        const nextDataMatch = data.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/)
        if (nextDataMatch) {
            try {
                const nextData = JSON.parse(nextDataMatch[1])

                const findVideoUrl = (obj) => {
                    if (typeof obj !== 'object' || obj === null) return null

                    for (const key in obj) {
                        const value = obj[key]
                        if (typeof value === 'string') {
                            if (value.includes('.m3u8')) return value
                        } else if (typeof value === 'object') {
                            const found = findVideoUrl(value)
                            if (found) return found
                        }
                    }
                    return null
                }

                const foundUrl = findVideoUrl(nextData)
                if (foundUrl) {
                    playurl = foundUrl.startsWith('http') ? foundUrl : appConfig.site + foundUrl
                }
            } catch (e) {
                $print('GetAV __NEXT_DATA__ parse failed: ' + e)
            }
        }

        if (!playurl) {
            const m3u8Match = data.match(/"localM3u8Path":"([^"]+)"/)
            if (m3u8Match && m3u8Match[1]) {
                playurl = appConfig.site + m3u8Match[1]
            }
        }

        if (!playurl) {
            const previewMatch = data.match(/"previewVideoUrl":"([^"]+)"/)
            if (previewMatch && previewMatch[1]) {
                playurl = previewMatch[1].startsWith('http') ? previewMatch[1] : 'https://static.worldstatic.com' + previewMatch[1]
            }
        }

        if (!playurl) {
            const m3u8DirectMatch = data.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/)
            const mp4Match = data.match(/(https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*)/)

            if (m3u8DirectMatch) {
                playurl = m3u8DirectMatch[1]
            } else if (mp4Match) {
                playurl = mp4Match[1]
            }
        }
    } catch (error) {
        $print('GetAV play request failed: ' + error)
    }

    return jsonify({
        urls: playurl ? [playurl] : [],
        headers: {
            'User-Agent': UA,
            'Referer': url,
            'Origin': appConfig.site,
        },
    })
}

async function search(ext) {
    ext = argsify(ext)
    const text = encodeURIComponent(ext.text || ext.wd || '')
    const page = ext.page || 1
    let url = `${appConfig.site}/zh/search?q=${text}`

    if (page > 1) {
        url += `&page=${page}`
    }

    $print('GetAV search: ' + url)

    try {
        const data = await fetchPage(url, appConfig.site)
        const parsed = parseCardsFromHtml(data)

        if (parsed.blocked && parsed.cards.length === 0) {
            $print('GetAV blocked by verification, opening Safari.')
            $utils.openSafari(url, UA)
            return jsonify({ list: [] })
        }

        $print('GetAV search cards: ' + parsed.cards.length)
        return jsonify({ list: parsed.cards })
    } catch (e) {
        $print('GetAV search failed: ' + e)
        return jsonify({ list: [] })
    }
}
