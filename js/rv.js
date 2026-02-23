const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0'

let appConfig = {
    ver: 1,
    title: '肉视频',
    site: 'https://rou.video',
    tabs: [
        { name: '国产AV',   ext: { url: 'https://rou.video/t/國產AV' } },
        { name: '探花',     ext: { url: 'https://rou.video/t/探花' } },
        { name: '自拍流出', ext: { url: 'https://rou.video/t/自拍流出' } },
        { name: 'OnlyFans', ext: { url: 'https://rou.video/t/OnlyFans' } },
        { name: '日本AV',   ext: { url: 'https://rou.video/t/日本' } },
        { name: '91',       ext: { url: 'https://rou.video/t/91' } },
    ],
}

async function getConfig() {
    return jsonify(appConfig)
}

async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let { page = 1, url } = ext

    if (page > 1) {
        url += `?order=createdAt&page=${page}`
    }

    const { data } = await $fetch.get(url, {
        headers: { 'User-Agent': UA },
    })

    const $ = cheerio.load(data)

    $('.grid.grid-cols-2.mb-6 > div').each((_, element) => {
        if ($(element).find('.relative').length == 0) return
        const href = $(element).find('.relative a').attr('href')
        const title = $(element).find('img:last').attr('alt')
        const cover = $(element).find('img').attr('src')
        const subTitle = $(element).find('.relative a > div:eq(1)').text()
        const hdinfo = $(element).find('.relative a > div:first').text()
        if (!href) return
        cards.push({
            vod_id: href,
            vod_name: title,
            vod_pic: cover,
            vod_remarks: subTitle || hdinfo,
            ext: { url: appConfig.site + href },
        })
    })

    return jsonify({ list: cards })
}

async function getTracks(ext) {
    ext = argsify(ext)
    const url = ext.url
    if (!url) return jsonify({ list: [{ title: '默认分组', tracks: [] }] })

    return jsonify({
        list: [{
            title: '默认分组',
            tracks: [{
                name: '播放',
                pan: '',
                ext: { url: url },
            }],
        }],
    })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    const url = ext.url

    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
            'Referer': appConfig.site + '/',
        },
        timeout: 15000,
    })

    const m = data.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
    if (!m) return jsonify({ urls: [] })

    const nextData = JSON.parse(m[1])
    const ev = nextData.props && nextData.props.pageProps && nextData.props.pageProps.ev
    if (!ev || !ev.d || ev.k === undefined) return jsonify({ urls: [] })

    const raw = atob(ev.d)
    const k = ev.k
    let str = ''
    for (let i = 0; i < raw.length; i++) {
        str += String.fromCharCode((raw.charCodeAt(i) - k + 256) % 256)
    }
    const obj = JSON.parse(str)
    const playUrl = obj.videoUrl || ''
    if (!playUrl) return jsonify({ urls: [] })

    return jsonify({
        urls: [playUrl],
        headers: { 'User-Agent': UA, 'Referer': appConfig.site + '/' },
    })
}

async function search(ext) {
    ext = argsify(ext)
    let cards = []
    const text = encodeURIComponent(ext.text || '')
    const page = ext.page || 1
    const url = `${appConfig.site}/search?q=${text}&t=&page=${page}`

    const { data } = await $fetch.get(url, {
        headers: { 'User-Agent': UA },
    })

    const $ = cheerio.load(data)

    $('.grid.grid-cols-2.mb-6 > div').each((_, element) => {
        if ($(element).find('.relative').length == 0) return
        const href = $(element).find('.relative a').attr('href')
        const title = $(element).find('img:last').attr('alt')
        const cover = $(element).find('img').attr('src')
        const subTitle = $(element).find('.relative a > div:eq(1)').text()
        const hdinfo = $(element).find('.relative a > div:first').text()
        if (!href) return
        cards.push({
            vod_id: href,
            vod_name: title,
            vod_pic: cover,
            vod_remarks: subTitle || hdinfo,
            ext: { url: appConfig.site + href },
        })
    })

    return jsonify({ list: cards })
}
