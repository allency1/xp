const cheerio = createCheerio()
const CryptoJS = createCryptoJS()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

let appConfig = {
    ver: 1,
    title: '麻豆社',
    site: 'https://hongkongdollvideo.com',
}

async function getConfig() {
    let config = appConfig
    config.tabs = await getTabs()
    return jsonify(config)
}

async function getTabs() {
    let list = []
    let ignore = ['中国AV视频', '亚洲成人视频']

    const { data } = await $fetch.get(appConfig.site, {
        headers: { 'User-Agent': UA },
    })
    const $ = cheerio.load(data)

    $('.scrollbar a').each((_, e) => {
        const name = $(e).text().trim()
        const href = $(e).attr('href') || ''
        if (!name || !href.includes(appConfig.site)) return
        if (ignore.some(s => name.includes(s))) return
        list.push({
            name,
            ext: { url: encodeURI(href) },
        })
    })

    return list
}

async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let { page = 1, url } = ext

    if (page > 1) {
        url = url.replace(/\/?$/, '') + '?page=' + page
    }

    const { data } = await $fetch.get(url, {
        headers: { 'User-Agent': UA },
    })
    const $ = cheerio.load(data)

    $('.video-item').each((_, element) => {
        const href = $(element).find('a').first().attr('href') || ''
        const title = $(element).find('a').first().attr('title') || $(element).find('img').attr('alt') || ''
        const cover = $(element).find('img').attr('data-src') || $(element).find('img').attr('src') || ''
        const subTitle = $(element).find('.duration, .duratio').text().trim()
        if (!href) return
        cards.push({
            vod_id: href,
            vod_name: title,
            vod_pic: cover,
            vod_remarks: subTitle,
            ext: { url: href },
        })
    })

    return jsonify({ list: cards })
}

async function getTracks(ext) {
    ext = argsify(ext)
    let tracks = []
    let url = ext.url

    const { data } = await $fetch.get(url, {
        headers: { 'User-Agent': UA },
    })
    const $ = cheerio.load(data)

    // Extract __PAGE__PARAMS__
    let param = ''
    $('script').each((_, el) => {
        const text = $(el).html() || ''
        if (text.includes('__PAGE__PARAMS__')) {
            const m = text.match(/var __PAGE__PARAMS__\s*=\s*"([0-9a-f]+)"/)
            if (m) param = m[1]
        }
    })

    if (!param) {
        return jsonify({ list: [{ title: '默认分组', tracks: [] }] })
    }

    const playUrl = decode(param)

    tracks.push({
        name: '播放',
        pan: '',
        ext: { url: playUrl },
    })

    return jsonify({
        list: [{ title: '默认分组', tracks }],
    })

    function decode(hexStr) {
        // Step 1: xorDec with last 32 chars as key → pageConfig JSON
        const key32 = hexStr.slice(-32)
        const payload = hexStr.slice(0, -32)
        const pageConfig = JSON.parse(xorDec(payload, key32))

        // Step 2: extract token from embedUrl, get last 10 chars
        const embedUrl = pageConfig.player.embedUrl
        const token = embedUrl.split('token=')[1] || ''
        const last10 = token.slice(-10)

        // Step 3: key = md5(last10).slice(8,24) reversed
        const md5hash = CryptoJS.MD5(last10).toString()
        const tokenKey = md5hash.slice(8, 24).split('').reverse().join('')

        // Step 4: xorDec token payload with tokenKey → JSON with stream
        const tokenPayload = token.slice(0, -10)
        const tokenJson = xorDec(tokenPayload, tokenKey)
        const tokenData = JSON.parse(tokenJson)

        return tokenData.stream || ''
    }

    function xorDec(hexStr, key) {
        let result = ''
        const keyLen = key.length
        for (let i = 0; i < hexStr.length; i += 2) {
            const byte = parseInt(hexStr.substr(i, 2), 16)
            const k = key[(i / 2) % keyLen]
            result += String.fromCharCode(byte ^ k.charCodeAt(0))
        }
        return result
    }
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    const url = ext.url
    return jsonify({ urls: [url] })
}

async function search(ext) {
    ext = argsify(ext)
    let cards = []
    let text = encodeURIComponent(ext.text || '')
    let page = ext.page || 1
    let url = `${appConfig.site}/search/${text}/`
    if (page > 1) url += '?page=' + page

    const { data } = await $fetch.get(url, {
        headers: { 'User-Agent': UA },
    })
    const $ = cheerio.load(data)

    $('.video-item').each((_, element) => {
        const href = $(element).find('a').first().attr('href') || ''
        const title = $(element).find('a').first().attr('title') || $(element).find('img').attr('alt') || ''
        const cover = $(element).find('img').attr('data-src') || $(element).find('img').attr('src') || ''
        const subTitle = $(element).find('.duration, .duratio').text().trim()
        if (!href) return
        cards.push({
            vod_id: href,
            vod_name: title,
            vod_pic: cover,
            vod_remarks: subTitle,
            ext: { url: href },
        })
    })

    return jsonify({ list: cards })
}
