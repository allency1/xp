const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

let appConfig = {
    ver: 1,
    title: 'XVideos',
    site: 'https://www.xvideos.com',
}

async function getConfig() {
    let config = appConfig
    config.tabs = [
        { name: '首页', ext: { url: appConfig.site }, ui: 1 },
        { name: '最佳', ext: { url: appConfig.site + '/best' }, ui: 1 },
        { name: '最新', ext: { url: appConfig.site + '/new' }, ui: 1 },
    ]
    return jsonify(config)
}

async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let page = ext.page || 1
    let url = ext.url || appConfig.site

    // 添加页码
    if (page > 1) {
        url = url + (url.includes('?') ? '&' : '?') + 'p=' + (page - 1)
    }

    try {
        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': appConfig.site + '/',
            },
            timeout: 15000,
        })

        const $ = cheerio.load(data)

        // 查找所有 thumb-block
        $('div.thumb-block').each((_, element) => {
            const $el = $(element)
            const $link = $el.find('a[href*="/video"]').first()
            const href = $link.attr('href')

            if (!href || !href.includes('/video')) return

            // 提取视频ID
            const match = href.match(/\/video[^\/]*\/(\d+)/)
            const vod_id = match ? match[1] : ''

            if (!vod_id) return

            // 标题
            const $title = $el.find('p.title a')
            const title = $title.attr('title') || $title.text().trim()

            // 封面 - 从 data-src 提取
            const $img = $el.find('img')
            let cover = $img.attr('data-src') || $img.attr('src') || ''

            // 时长
            const $duration = $el.find('span.duration')
            const duration = $duration.text().trim()

            const fullUrl = href.startsWith('http') ? href : appConfig.site + href

            cards.push({
                vod_id: vod_id,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: duration,
                ext: {
                    url: fullUrl,
                },
            })
        })

    } catch (e) {
        // 错误处理
    }

    return jsonify({ list: cards })
}

async function getTracks(ext) {
    ext = argsify(ext)
    const url = ext.url
    if (!url) return jsonify({ list: [{ title: '默认', tracks: [] }] })

    return jsonify({
        list: [{
            title: 'XVideos',
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
    let playurl = ''

    try {
        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': appConfig.site + '/',
            },
            timeout: 15000,
        })

        // 方法1: 提取 HLS (m3u8) - 优先
        const hlsMatch = data.match(/setVideoHLS\(['"]([^'"]+)['"]\)/)
        if (hlsMatch && hlsMatch[1]) {
            playurl = hlsMatch[1]
        }

        // 方法2: 如果没有 HLS，提取 MP4 (High)
        if (!playurl) {
            const mp4HighMatch = data.match(/setVideoUrlHigh\(['"]([^'"]+)['"]\)/)
            if (mp4HighMatch && mp4HighMatch[1]) {
                playurl = mp4HighMatch[1]
            }
        }

        // 方法3: 如果还没有，提取 MP4 (Low)
        if (!playurl) {
            const mp4LowMatch = data.match(/setVideoUrlLow\(['"]([^'"]+)['"]\)/)
            if (mp4LowMatch && mp4LowMatch[1]) {
                playurl = mp4LowMatch[1]
            }
        }

        // 方法4: 直接搜索 m3u8
        if (!playurl) {
            const m3u8Match = data.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/)
            if (m3u8Match && m3u8Match[0]) {
                playurl = m3u8Match[0]
            }
        }

    } catch (e) {
        // 错误处理
    }

    return jsonify({
        urls: [playurl],
        headers: {
            'User-Agent': UA,
            'Referer': url,
        },
    })
}

async function search(ext) {
    ext = argsify(ext)
    let cards = []
    const text = ext.text || ''
    const page = ext.page || 1

    if (!text) return jsonify({ list: [] })

    let url = `${appConfig.site}/?k=${encodeURIComponent(text)}`
    if (page > 1) {
        url += `&p=${page - 1}`
    }

    try {
        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': appConfig.site + '/',
            },
            timeout: 15000,
        })

        const $ = cheerio.load(data)

        // 使用相同的解析逻辑
        $('div.thumb-block').each((_, element) => {
            const $el = $(element)
            const $link = $el.find('a[href*="/video"]').first()
            const href = $link.attr('href')

            if (!href || !href.includes('/video')) return

            const match = href.match(/\/video[^\/]*\/(\d+)/)
            const vod_id = match ? match[1] : ''

            if (!vod_id) return

            const $title = $el.find('p.title a')
            const title = $title.attr('title') || $title.text().trim()

            const $img = $el.find('img')
            let cover = $img.attr('data-src') || $img.attr('src') || ''

            const $duration = $el.find('span.duration')
            const duration = $duration.text().trim()

            const fullUrl = href.startsWith('http') ? href : appConfig.site + href

            cards.push({
                vod_id: vod_id,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: duration,
                ext: {
                    url: fullUrl,
                },
            })
        })

    } catch (e) {
        // 错误处理
    }

    return jsonify({ list: cards })
}
