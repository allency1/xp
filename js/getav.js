const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

let appConfig = {
    ver: 1,
    title: 'GetAV',
    site: 'https://getav.net',
    tabs: [
        { name: '热门', ext: { api: '/api/recommendations/trending' } },
        { name: '正在观看', ext: { api: '/api/recommendations/watching-now' } },
    ],
}

async function getConfig(ext) {
    if (ext) {
        try {
            const cfg = argsify(ext)
            if (cfg.site) appConfig.site = cfg.site.replace(/\/$/, '')
        } catch (e) {}
    }
    return jsonify(appConfig)
}

function absUrl(u) {
    if (!u) return ''
    if (u.startsWith('http')) return u
    if (u.startsWith('//')) return 'https:' + u
    if (u.startsWith('/')) return appConfig.site + u
    return u
}

async function getCards(ext) {
    ext = argsify(ext)
    const page = ext.page || 1
    const api = ext.api || '/api/recommendations/trending'
    const limit = 40
    const url = `${appConfig.site}${api}?limit=${limit}&locale=zh`

    $print('GetAV API: ' + url)

    let data
    try {
        const resp = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Accept': 'application/json',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
            },
            timeout: 20000,
        })
        data = resp.data
    } catch (e) {
        $print('请求失败: ' + e)
        return jsonify({ list: [] })
    }

    if (!data.success || !data.movies) {
        $print('API 返回格式错误')
        return jsonify({ list: [] })
    }

    const cards = data.movies.map(movie => ({
        vod_id: movie.id,
        vod_name: movie.title,
        vod_pic: movie.localImg ? absUrl(movie.localImg) : '',
        vod_remarks: movie.durationFormatted || '',
        ext: {
            url: `/zh/videos/${movie.id.toLowerCase()}`,
            id: movie.id,
            previewUrl: movie.previewVideoUrl,
            m3u8: movie.localM3u8Path
        },
    }))

    $print('解析到 ' + cards.length + ' 个视频')
    return jsonify({ list: cards })
}

async function getTracks(ext) {
    ext = argsify(ext)
    const id = ext.id
    if (!id) return jsonify({ list: [{ title: 'GetAV', tracks: [] }] })

    $print('GetAV 视频: ' + id)

    const tracks = []

    // 如果有 m3u8 路径，添加播放源
    if (ext.m3u8) {
        tracks.push({
            name: '播放',
            pan: '',
            ext: {
                m3u8: ext.m3u8,
                id: id
            },
        })
    }

    // 如果有预览视频，也添加
    if (ext.previewUrl) {
        tracks.push({
            name: '预览',
            pan: '',
            ext: {
                previewUrl: ext.previewUrl,
                id: id
            },
        })
    }

    // 如果都没有，尝试从详情页获取
    if (tracks.length === 0) {
        tracks.push({
            name: '播放',
            pan: '',
            ext: { id: id },
        })
    }

    return jsonify({ list: [{ title: 'GetAV', tracks }] })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    let playurl = ''

    // 如果有 m3u8 路径，直接使用
    if (ext.m3u8) {
        playurl = absUrl(ext.m3u8)
        $print('播放地址 (m3u8): ' + playurl)
    }
    // 如果有预览视频 URL
    else if (ext.previewUrl) {
        playurl = 'https://static.worldstatic.com' + ext.previewUrl
        $print('预览视频: ' + playurl)
    }
    // 否则尝试从详情页获取
    else if (ext.id) {
        const pageUrl = `${appConfig.site}/zh/videos/${ext.id.toLowerCase()}`
        $print('从详情页获取: ' + pageUrl)

        try {
            const resp = await $fetch.get(pageUrl, {
                headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9' },
                timeout: 20000,
            })
            const html = resp.data

            // 尝试从 HTML 中提取 m3u8 路径
            const m3u8Match = html.match(/"localM3u8Path"\s*:\s*"([^"]+)"/)
            if (m3u8Match && m3u8Match[1]) {
                playurl = absUrl(m3u8Match[1])
                $print('找到 m3u8: ' + playurl)
            } else {
                // 尝试预览视频
                const previewMatch = html.match(/"previewVideoUrl"\s*:\s*"([^"]+)"/)
                if (previewMatch && previewMatch[1]) {
                    playurl = 'https://static.worldstatic.com' + previewMatch[1]
                    $print('使用预览视频: ' + playurl)
                }
            }
        } catch (e) {
            $print('获取详情页失败: ' + e)
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
    const text = (ext.text || '').trim()
    if (!text) return jsonify({ list: [] })

    const keyword = encodeURIComponent(text)
    const url = `${appConfig.site}/api/search?q=${keyword}&limit=40&locale=zh`

    $print('GetAV 搜索: ' + text)

    let data
    try {
        const resp = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Accept': 'application/json',
                'Accept-Language': 'zh-CN,zh;q=0.9'
            },
            timeout: 20000,
        })
        data = resp.data
    } catch (e) {
        $print('搜索失败: ' + e)
        return jsonify({ list: [] })
    }

    if (!data.success || !data.movies) {
        $print('搜索无结果')
        return jsonify({ list: [] })
    }

    const cards = data.movies.map(movie => ({
        vod_id: movie.id,
        vod_name: movie.title,
        vod_pic: movie.localImg ? absUrl(movie.localImg) : '',
        vod_remarks: movie.durationFormatted || '',
        ext: {
            id: movie.id,
            previewUrl: movie.previewVideoUrl,
            m3u8: movie.localM3u8Path
        },
    }))

    $print('搜索到 ' + cards.length + ' 个结果')
    return jsonify({ list: cards })
}
