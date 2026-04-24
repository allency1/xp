const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

let appConfig = {
    ver: 1,
    title: 'GetAV',
    site: 'https://getav.net',
    tabs: [
        { name: '热门', ext: { url: 'https://getav.net/zh/hot' } },
    ],
}

async function getConfig(ext) {
    return jsonify(appConfig)
}

async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let url = ext.url || 'https://getav.net/zh/hot'

    try {
        // 使用与 belt.js 完全相同的方式
        const response = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': appConfig.site,
            },
            timeout: 15000,
        })

        const data = response.data

        // 保存 HTML 片段用于调试
        const htmlPreview = data.substring(0, 500)

        const $ = cheerio.load(data)

        // 查找视频卡片
        $('.site-catalog-grid > div > .group').each((index, el) => {
            if (index >= 20) return false // 只取前20个

            const $el = $(el)
            const $link = $el.find('a[href^="/zh/videos/"]').first()
            const href = $link.attr('href')

            if (!href) return

            const videoId = href.replace('/zh/videos/', '')
            const title = $el.find('h3[title]').attr('title') || $el.find('h3').text().trim() || videoId
            const cover = $el.find('img').first().attr('src') || ''
            const duration = $el.find('.absolute.bottom-2.right-2').text().trim()

            cards.push({
                vod_id: videoId,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: duration,
                ext: {
                    url: appConfig.site + href,
                    id: videoId,
                },
            })
        })

        // 如果没找到，显示调试信息
        if (cards.length === 0) {
            cards.push({
                vod_id: 'debug',
                vod_name: 'HTML长度: ' + data.length + ' | 前500字符: ' + htmlPreview,
                vod_pic: '',
                vod_remarks: '调试',
                ext: { url: url, id: 'debug' },
            })
        }

    } catch (e) {
        // 显示详细错误信息
        let errorMsg = 'Unknown error'
        if (e.message) errorMsg = e.message
        else if (e.toString) errorMsg = e.toString()
        else errorMsg = JSON.stringify(e)

        cards.push({
            vod_id: 'error',
            vod_name: '错误: ' + errorMsg,
            vod_pic: '',
            vod_remarks: '请求失败',
            ext: { url: url, id: 'error' },
        })
    }

    return jsonify({ list: cards })
}

async function getTracks(ext) {
    ext = argsify(ext)
    return jsonify({
        list: [{
            title: 'GetAV',
            tracks: [{
                name: '播放',
                pan: '',
                ext: { url: ext.url || '', id: ext.id || '' },
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
        // 忽略错误
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
    return jsonify({ list: [] })
}
