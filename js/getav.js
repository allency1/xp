const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

let appConfig = {
    ver: 1,
    title: 'GetAV',
    site: 'https://getav.net',
}

async function getConfig() {
    let config = appConfig
    config.tabs = await getTabs()
    return jsonify(config)
}

async function getTabs() {
    let list = [
        {
            name: '热门',
            ext: {
                api: '/api/recommendations/trending',
            },
        },
        {
            name: '正在观看',
            ext: {
                api: '/api/recommendations/watching-now',
            },
        },
    ]
    return list
}

async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let { page = 1, api } = ext

    if (!api) {
        api = '/api/recommendations/trending'
    }

    const url = appConfig.site + api + '?limit=40&locale=zh'

    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
            'Accept': 'application/json',
            'Accept-Language': 'zh-CN,zh;q=0.9',
        },
    })

    let jsonData
    if (typeof data === 'string') {
        jsonData = JSON.parse(data)
    } else {
        jsonData = data
    }

    if (!jsonData || !jsonData.success || !jsonData.movies) {
        return jsonify({ list: cards })
    }

    jsonData.movies.forEach((movie) => {
        cards.push({
            vod_id: movie.id,
            vod_name: movie.title,
            vod_pic: movie.localImg ? appConfig.site + movie.localImg : '',
            vod_remarks: movie.durationFormatted || '',
            ext: {
                id: movie.id,
                m3u8: movie.localM3u8Path,
                previewUrl: movie.previewVideoUrl,
            },
        })
    })

    return jsonify({ list: cards })
}

async function getTracks(ext) {
    ext = argsify(ext)
    let tracks = []
    const { id, m3u8, previewUrl } = ext

    if (!id) {
        return jsonify({
            list: [
                {
                    title: '默认线路',
                    tracks: [],
                },
            ],
        })
    }

    if (m3u8) {
        tracks.push({
            name: '播放',
            pan: '',
            ext: {
                url: appConfig.site + m3u8,
            },
        })
    }

    if (previewUrl) {
        tracks.push({
            name: '预览',
            pan: '',
            ext: {
                url: 'https://static.worldstatic.com' + previewUrl,
            },
        })
    }

    if (tracks.length === 0) {
        const detailUrl = appConfig.site + '/zh/videos/' + id.toLowerCase()

        const { data } = await $fetch.get(detailUrl, {
            headers: {
                'User-Agent': UA,
                'Accept': 'text/html',
            },
        })

        const m3u8Match = data.match(/"localM3u8Path"\s*:\s*"([^"]+)"/)
        if (m3u8Match && m3u8Match[1]) {
            tracks.push({
                name: '播放',
                pan: '',
                ext: {
                    url: appConfig.site + m3u8Match[1],
                },
            })
        } else {
            const previewMatch = data.match(/"previewVideoUrl"\s*:\s*"([^"]+)"/)
            if (previewMatch && previewMatch[1]) {
                tracks.push({
                    name: '预览',
                    pan: '',
                    ext: {
                        url: 'https://static.worldstatic.com' + previewMatch[1],
                    },
                })
            }
        }
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
    const { url } = ext

    return jsonify({
        urls: url ? [url] : [],
        headers: [
            {
                'User-Agent': UA,
                'Referer': appConfig.site + '/',
            },
        ],
    })
}

async function search(ext) {
    ext = argsify(ext)
    const { text, wd, page = 1 } = ext
    const keyword = text || wd || ''

    if (!keyword) {
        return jsonify({ list: [], page, keyword })
    }

    const url = appConfig.site + '/api/search?q=' + encodeURIComponent(keyword) + '&limit=40&locale=zh'

    let cards = []

    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
            'Accept': 'application/json',
        },
    })

    let jsonData
    if (typeof data === 'string') {
        jsonData = JSON.parse(data)
    } else {
        jsonData = data
    }

    if (jsonData && jsonData.success && jsonData.movies) {
        jsonData.movies.forEach((movie) => {
            cards.push({
                vod_id: movie.id,
                vod_name: movie.title,
                vod_pic: movie.localImg ? appConfig.site + movie.localImg : '',
                vod_remarks: movie.durationFormatted || '',
                ext: {
                    id: movie.id,
                    m3u8: movie.localM3u8Path,
                    previewUrl: movie.previewVideoUrl,
                },
            })
        })
    }

    return jsonify({ list: cards, page, keyword })
}
