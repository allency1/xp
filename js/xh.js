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
        url = url + '/' + page
    }

    const response = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
            'Cookie': 'age_confirmed=1',
        },
    })

    const data = response.data || response
    const $ = cheerio.load(data)

    $('.thumb-list__item').each((index, element) => {
        const videoId = $(element).attr("data-video-id")
        const id = videoId && videoId.toString()
        if (!id) return

        const href = $(element).find('a.video-thumb__image-container').attr('href')
        if (!href) return

        // 多种选择器获取标题
        let title = $(element).find('.thumb-image-container__image').attr('alt')
        if (!title) title = $(element).find('img').attr('alt')
        if (!title) title = $(element).find('.video-thumb-info__name').text().trim()
        if (!title) title = $(element).find('a').attr('aria-label')
        if (!title) title = 'Video ' + id

        // 多种选择器获取封面
        let cover = $(element).find('a.video-thumb__image-container>img').attr("src")
        if (!cover) cover = $(element).find('img').attr('src')
        if (!cover) cover = $(element).find('img').attr('data-src')
        if (!cover) cover = $(element).find('img').attr('data-lazy')

        const subTitle = $(element).find('.video-thumb-views').text().trim() || ''
        const duration = $(element).find('.thumb-image-container__duration').text().trim() || ''

        cards.push({
            vod_id: id,
            vod_name: title,
            vod_pic: cover || '',
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
    let url = appConfig.site + '/search/' + text + '?page=' + page

    const response = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
            'Cookie': 'age_confirmed=1',
        },
    })

    const data = response.data || response
    const $ = cheerio.load(data)

    $('.thumb-list__item').each((_, element) => {
        const videoId = $(element).attr("data-video-id")
        const id = videoId && videoId.toString()
        if (!id) return

        const href = $(element).find('a.video-thumb__image-container').attr('href')
        if (!href) return

        // 多种选择器获取标题
        let title = $(element).find('.thumb-image-container__image').attr('alt')
        if (!title) title = $(element).find('img').attr('alt')
        if (!title) title = $(element).find('.video-thumb-info__name').text().trim()
        if (!title) title = $(element).find('a').attr('aria-label')
        if (!title) title = 'Video ' + id

        // 多种选择器获取封面
        let cover = $(element).find('a.video-thumb__image-container>img').attr("src")
        if (!cover) cover = $(element).find('img').attr('src')
        if (!cover) cover = $(element).find('img').attr('data-src')
        if (!cover) cover = $(element).find('img').attr('data-lazy')

        const subTitle = $(element).find('.video-thumb-views').text().trim() || ''
        const duration = $(element).find('.thumb-image-container__duration').text().trim() || ''

        cards.push({
            vod_id: id,
            vod_name: title,
            vod_pic: cover || '',
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
