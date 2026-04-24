const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

let appConfig = {
    ver: 1,
    title: 'GetAV',
    site: 'https://getav.net',
    tabs: [
        { name: '热门', ext: { api: 'trending' } },
        { name: '正在观看', ext: { api: 'watching-now' } },
    ],
}

async function getConfig(ext) {
    return jsonify(appConfig)
}

async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let api = ext.api || 'trending'

    // 直接调用 API 而不是访问网页
    let url = `https://getav.net/api/recommendations/${api}?limit=40&locale=zh`

    try {
        const response = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Accept': 'application/json',
                'Origin': 'https://getav.net',
                'Referer': 'https://getav.net/zh',
            },
            timeout: 15000,
        })

        let data = response.data

        // 如果是字符串，解析 JSON
        if (typeof data === 'string') {
            data = JSON.parse(data)
        }

        // 检查 API 返回
        if (!data || !data.success || !data.movies) {
            cards.push({
                vod_id: 'error',
                vod_name: 'API返回异常: ' + JSON.stringify(data).substring(0, 100),
                vod_pic: '',
                vod_remarks: '数据错误',
                ext: { url: url, id: 'error' },
            })
            return jsonify({ list: cards })
        }

        // 转换 API 数据为视频卡片
        data.movies.forEach((movie, index) => {
            if (index >= 40) return // 限制数量

            cards.push({
                vod_id: movie.id,
                vod_name: movie.title,
                vod_pic: movie.localImg ? appConfig.site + movie.localImg : '',
                vod_remarks: movie.durationFormatted || '',
                ext: {
                    url: appConfig.site + '/zh/videos/' + movie.id.toLowerCase(),
                    id: movie.id,
                    m3u8: movie.localM3u8Path,
                    preview: movie.previewVideoUrl,
                },
            })
        })

    } catch (e) {
        let errorMsg = 'Unknown'
        if (e && e.message) errorMsg = e.message
        else if (e) errorMsg = String(e)

        cards.push({
            vod_id: 'error',
            vod_name: 'API请求失败: ' + errorMsg,
            vod_pic: '',
            vod_remarks: url,
            ext: { url: url, id: 'error' },
        })
    }

    return jsonify({ list: cards })
}

async function getTracks(ext) {
    ext = argsify(ext)
    let tracks = []

    // 如果有 m3u8，直接添加
    if (ext.m3u8) {
        tracks.push({
            name: '播放',
            pan: '',
            ext: { url: appConfig.site + ext.m3u8 },
        })
    }

    // 如果有预览视频
    if (ext.preview) {
        tracks.push({
            name: '预览',
            pan: '',
            ext: { url: 'https://static.worldstatic.com' + ext.preview },
        })
    }

    // 如果都没有，从详情页获取
    if (tracks.length === 0 && ext.url) {
        tracks.push({
            name: '播放',
            pan: '',
            ext: { url: ext.url, id: ext.id },
        })
    }

    return jsonify({
        list: [{
            title: 'GetAV',
            tracks: tracks,
        }],
    })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    let playurl = ext.url || ''

    // 如果 URL 不是 m3u8，尝试从详情页提取
    if (playurl && !playurl.includes('.m3u8') && !playurl.includes('.mp4')) {
        try {
            const { data } = await $fetch.get(playurl, {
                headers: {
                    'User-Agent': UA,
                    'Accept': 'text/html',
                    'Referer': appConfig.site + '/',
                },
                timeout: 15000,
            })

            const m3u8Match = data.match(/"localM3u8Path":"([^"]+)"/)
            if (m3u8Match && m3u8Match[1]) {
                playurl = appConfig.site + m3u8Match[1]
            } else {
                const previewMatch = data.match(/"previewVideoUrl":"([^"]+)"/)
                if (previewMatch && previewMatch[1]) {
                    playurl = 'https://static.worldstatic.com' + previewMatch[1]
                }
            }
        } catch (e) {
            // 提取失败，使用原 URL
        }
    }

    return jsonify({
        urls: [playurl],
        headers: {
            'User-Agent': UA,
            'Referer': appConfig.site + '/',
        },
    })
}

async function search(ext) {
    ext = argsify(ext)
    let cards = []
    const keyword = ext.text || ''

    if (!keyword) {
        return jsonify({ list: [] })
    }

    let url = `https://getav.net/api/search?q=${encodeURIComponent(keyword)}&limit=40&locale=zh`

    try {
        const response = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Accept': 'application/json',
                'Origin': 'https://getav.net',
                'Referer': 'https://getav.net/zh',
            },
            timeout: 15000,
        })

        let data = response.data
        if (typeof data === 'string') {
            data = JSON.parse(data)
        }

        if (data && data.success && data.movies) {
            data.movies.forEach((movie) => {
                cards.push({
                    vod_id: movie.id,
                    vod_name: movie.title,
                    vod_pic: movie.localImg ? appConfig.site + movie.localImg : '',
                    vod_remarks: movie.durationFormatted || '',
                    ext: {
                        url: appConfig.site + '/zh/videos/' + movie.id.toLowerCase(),
                        id: movie.id,
                        m3u8: movie.localM3u8Path,
                        preview: movie.previewVideoUrl,
                    },
                })
            })
        }
    } catch (e) {
        // 搜索失败
    }

    return jsonify({ list: cards })
}
