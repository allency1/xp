const cheerio = createCheerio()

const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

let appConfig = {
    ver: 20260224,
    title: 'avtoday',
    site: 'https://avtoday.io',
}

// 生成年龄验证 Cookie
function getAgeVerificationCookie() {
    return 'age_verified=1'
}

// 拼接绝对地址，并去掉站点自身多打的双斜杠（如 //catalog）
function absUrl(u) {
    if (!u) return ''
    if (u.indexOf('http') === 0) return u.replace(/([^:])\/\/+/g, '$1/')
    if (u.charAt(0) === '/') return appConfig.site + u
    return appConfig.site + '/' + u
}

// Cloudflare "Just a moment..." 拦截 → 弹浏览器让用户验证（参考 hanime.js）
function isCfChallenge($) {
    const t = $('title').text() || ''
    return t.indexOf('Just a moment') !== -1 || t.indexOf('请稍候') !== -1
}

async function getConfig() {
    let config = appConfig
    config.tabs = await getTabs()
    return jsonify(config)
}

async function getTabs() {
    let list = []
    let ignore = []
    function isIgnoreClassName(className) {
        return ignore.some((element) => className.includes(element))
    }

    const { data } = await $fetch.get(appConfig.site + '/catalog', {
        headers: {
            'User-Agent': UA,
            'Cookie': getAgeVerificationCookie(),
        },
    })
    const $ = cheerio.load(data)
    if (isCfChallenge($)) {
        $utils.openSafari(appConfig.site, UA)
        return list
    }

    let allClass = $('.swiper-wrapper > .swiper-slide')
    allClass.each((_, e) => {
        const name = $(e).find('.btn-categories__title').text()
        const info = $(e).find('.btn-categories__info').text().split(' ')[0]
        const href = $(e).find('a.btn-categories').attr('href')
        const isIgnore = isIgnoreClassName(name)
        if (isIgnore) return
        // 跳过站外广告分类（如 ai-services123.top）
        if (!href || (href.indexOf('avtoday.io') === -1 && href.charAt(0) !== '/')) return

        list.push({
            name: `${name} (${info})`,
            ext: {
                url: absUrl(href),
            },
            ui: 1,
        })
    })

    return list
}

async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let { page = 1, url } = ext
    url = absUrl(url)

    if (page > 1) {
        url = url + `?page=${page}`
    }

    // 分类名常含中文（如 /catalog/無碼.html），iOS 的 $fetch 不会自动百分号编码，
    // 直接拿带中文的 URL 会构造失败、请求发不出去 → 空白。必须 encodeURI。
    const { data } = await $fetch.get(encodeURI(url), {
        headers: {
            'User-Agent': UA,
            'Cookie': getAgeVerificationCookie(),
        },
    })
    const $ = cheerio.load(data)
    if (isCfChallenge($)) {
        $utils.openSafari(appConfig.site, UA)
        return jsonify({ list: [] })
    }

    $('.thumbnail').each((_, element) => {
        const href = $(element).find('.video-title a').attr('href')
        // 跳过直播/广告嵌入卡：列表首尾各有一张 href=/live 的 .thumbnail，没有 .video-title a，
        // 之前未跳过 → 下面读 style 时为 undefined → style.match 抛异常 → 整个列表崩成空白
        if (!href || href.indexOf('/video/') === -1) return
        const title = $(element).find('.video-title a').text().trim()
        if (title.indexOf('[廣告]') !== -1) return
        const subTitle = $(element).find('.video-tag').text().trim() || ''
        const duration = $(element).find('.video-duration').text().trim() || ''
        const pubdate = $(element).find('.video-date').text().trim() || ''

        // 封面 preview-video 的 background:url(...)；style 可能缺失，必须防空
        const style = $(element).find('.preview-video').attr('style') || ''
        const cm = style.match(/url\(['"]?(.*?)['"]?\)/)
        const cover = cm ? absUrl(cm[1]) : ''

        cards.push({
            vod_id: href,
            vod_name: title,
            vod_pic: cover,
            vod_remarks: subTitle,
            vod_duration: duration,
            vod_pubdate: pubdate,
            ext: {
                url: absUrl(href),
            },
        })
    })

    return jsonify({
        list: cards,
    })
}

async function getTracks(ext) {
    ext = argsify(ext)
    let tracks = []
    let url = ext.url

    let code = (url.split('/video/')[1] || '').replace(/\.html.*$/i, '')
    let playerUrl = `${appConfig.site}/player?s=${code}`

    const { data } = await $fetch.get(playerUrl, {
        headers: {
            'User-Agent': UA,
            'Cookie': getAgeVerificationCookie(),
            Referer: url,
        },
    })
    const m = data.match(/m3u8_url\s*=\s*['"]([^'"]+)['"]/)
    let playUrl = m ? m[1] : ''
    tracks.push({
        name: '播放',
        pan: '',
        ext: {
            url: playUrl,
            playerUrl,
        },
    })

    return jsonify({
        list: [
            {
                title: '默认分组',
                tracks,
            },
        ],
    })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    const url = ext.url
    const headers = {
        'User-Agent': UA,
        Referer: appConfig.site + '/',
        'Cookie': getAgeVerificationCookie(),
    }

    return jsonify({ urls: [url], headers: headers })
}

async function search(ext) {
    ext = argsify(ext)
    let cards = []

    let text = encodeURIComponent(ext.text)
    let page = ext.page || 1
    let url = `${appConfig.site}/search?s=${text}&page=${page}`

    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
            'Cookie': getAgeVerificationCookie(),
        },
    })

    const $ = cheerio.load(data)
    if (isCfChallenge($)) {
        $utils.openSafari(appConfig.site, UA)
        return jsonify({ list: [] })
    }

    $('.thumbnail').each((_, element) => {
        const href = $(element).find('.video-title a').attr('href')
        // 跳过直播/广告嵌入卡：列表首尾各有一张 href=/live 的 .thumbnail，没有 .video-title a，
        // 之前未跳过 → 下面读 style 时为 undefined → style.match 抛异常 → 整个列表崩成空白
        if (!href || href.indexOf('/video/') === -1) return
        const title = $(element).find('.video-title a').text().trim()
        if (title.indexOf('[廣告]') !== -1) return
        const subTitle = $(element).find('.video-tag').text().trim() || ''
        const duration = $(element).find('.video-duration').text().trim() || ''
        const pubdate = $(element).find('.video-date').text().trim() || ''

        // 封面 preview-video 的 background:url(...)；style 可能缺失，必须防空
        const style = $(element).find('.preview-video').attr('style') || ''
        const cm = style.match(/url\(['"]?(.*?)['"]?\)/)
        const cover = cm ? absUrl(cm[1]) : ''

        cards.push({
            vod_id: href,
            vod_name: title,
            vod_pic: cover,
            vod_remarks: subTitle,
            vod_duration: duration,
            vod_pubdate: pubdate,
            ext: {
                url: absUrl(href),
            },
        })
    })

    return jsonify({
        list: cards,
    })
}
