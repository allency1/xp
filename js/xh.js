const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

let appConfig = {
    ver: 1,
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

async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let { page = 1, href } = ext

    let url = appConfig.site + href
    if (page > 1) {
        url = url + `/${page}`
    }

    try {
        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
            },
        })

        const $ = cheerio.load(data)

        $('.thumb-list__item').each((_, element) => {
            const idAttr = $(element).attr("data-video-id")
            const id = idAttr ? idAttr.toString() : undefined
            if (id == undefined) { return }
            const href = $(element).find('a.video-thumb__image-container').attr('href')
            const title = $(element).find('.thumb-image-container__image').attr('alt')
            const cover = $(element).find('a.video-thumb__image-container>img').attr("src")
            const subTitle = $(element).find('.video-thumb-views').text().trim() || ''
            const duration = $(element).find('.thumb-image-container__duration').text().trim() || ''
            cards.push({
                vod_id: id,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: subTitle,
                vod_duration: duration,
                vod_pubdate: '',
                ext: {
                    url: href,
                },
            })
        })

        // 如果没解析到任何视频，显示调试信息
        if (cards.length === 0) {
            cards.push({
                vod_id: 'debug',
                vod_name: '调试: 未找到视频元素',
                vod_pic: '',
                vod_remarks: '页面大小: ' + (data ? data.length : 0) + ' 字节',
                ext: { url: url },
            })
        }

    } catch (error) {
        let errMsg = 'Unknown'
        if (error && error.message) errMsg = error.message
        else if (error) errMsg = String(error)

        cards.push({
            vod_id: 'error',
            vod_name: '请求失败: ' + errMsg,
            vod_pic: '',
            vod_remarks: '可能被墙，需加代理规则',
            ext: { url: url },
        })
    }

    return jsonify({
        list: cards,
    })
}

async function getTracks(ext) {
    ext = argsify(ext)
    let tracks = []
    let url = ext.url
    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
        },
    })
    const $ = cheerio.load(data)
    url = $('link[rel="preload"][as="fetch"]').attr('href')
    let  res = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
        },
    })
    let resolution=res.data.match(/\d+p(\.[a-zA-Z0-9]+)+\.m3u8/g);
    resolution.forEach(item => {
        tracks.push({
            name: item.match(/^\d+p/)[0],
            pan: '',
            ext: {
                url: url.replace(/[^/]+$/, item),
                // referer: url,
            },
        })
    });

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
        Referer: ext.referer + '/',
    }

    return jsonify({ urls: [url], headers: [headers] })
}

async function search(ext) {
    ext = argsify(ext)
    let cards = []

    let text = encodeURIComponent(ext.text)
    let page = ext.page || 1
    let url = `${appConfig.site}/search/${text}?page=${page}`

    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
        },
    })

    const $ = cheerio.load(data)

    $('.thumb-list__item').each((_, element) => {
        const idAttr = $(element).attr("data-video-id")
        const id = idAttr ? idAttr.toString() : undefined
        if (id == undefined) { return }
        const href = $(element).find('a.video-thumb__image-container').attr('href')
        const title = $(element).find('.thumb-image-container__image').attr('alt')
        const cover = $(element).find('a.video-thumb__image-container>img').attr("src")
        const subTitle = $(element).find('.video-thumb-views').text().trim() || ''
        const duration = $(element).find('.thumb-image-container__duration').text().trim() || ''
        cards.push({
            vod_id: href,
            vod_name: title,
            vod_pic: cover,
            vod_remarks: subTitle,
            vod_duration: duration,
            vod_pubdate: '',
            ext: {
                url: href,
            },
        })
    })
    return jsonify({
        list: cards,
    })
}
