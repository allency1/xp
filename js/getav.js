const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

let appConfig = {
    ver: 1,
    title: 'GetAV调试',
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
        const response = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': appConfig.site,
                'Accept': 'text/html',
            },
            timeout: 15000,
        })

        const data = response.data

        // 检查是否成功获取数据
        if (!data || data.length < 1000) {
            // 数据太短，可能请求失败，返回测试数据
            cards.push({
                vod_id: 'error-001',
                vod_name: '请求失败或数据为空',
                vod_pic: '',
                vod_remarks: '调试信息',
                ext: { url: url, id: 'error' },
            })
            return jsonify({ list: cards })
        }

        const $ = cheerio.load(data)

        // 尝试多种选择器
        const selectors = [
            '.site-catalog-grid > div > .group.cursor-pointer',
            '.group.cursor-pointer',
            'a[href^="/zh/videos/"]',
        ]

        let foundElements = false

        for (let selector of selectors) {
            const elements = $(selector)

            if (elements.length > 0) {
                foundElements = true

                // 只处理前10个，避免重复
                elements.slice(0, 10).each((index, el) => {
                    const $el = $(el)

                    // 查找链接
                    let href = ''
                    if (selector === 'a[href^="/zh/videos/"]') {
                        href = $el.attr('href')
                    } else {
                        href = $el.find('a[href^="/zh/videos/"]').first().attr('href')
                    }

                    if (!href) return

                    const videoId = href.replace('/zh/videos/', '')

                    // 查找标题
                    const title = $el.find('h3[title]').attr('title') ||
                                  $el.find('h3').text().trim() ||
                                  '未知标题 ' + videoId

                    // 查找封面
                    const cover = $el.find('img').first().attr('src') || ''

                    // 查找时长
                    const duration = $el.find('.absolute').text().trim() || ''

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

                break // 找到数据就停止尝试其他选择器
            }
        }

        // 如果没找到任何元素，返回调试信息
        if (!foundElements || cards.length === 0) {
            cards.push({
                vod_id: 'debug-001',
                vod_name: '未找到视频元素 - HTML长度: ' + data.length,
                vod_pic: '',
                vod_remarks: '尝试了多个选择器',
                ext: { url: url, id: 'debug' },
            })
        }

    } catch (e) {
        cards.push({
            vod_id: 'error-002',
            vod_name: '请求异常: ' + e.toString(),
            vod_pic: '',
            vod_remarks: '网络错误',
            ext: { url: url, id: 'error' },
        })
    }

    return jsonify({ list: cards })
}

async function getTracks(ext) {
    ext = argsify(ext)
    const url = ext.url
    const id = ext.id

    if (!url) return jsonify({ list: [{ title: '默认', tracks: [] }] })

    return jsonify({
        list: [{
            title: 'GetAV',
            tracks: [{
                name: '播放',
                pan: '',
                ext: { url: url, id: id },
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

        // 提取 m3u8 地址
        const m3u8Match = data.match(/"localM3u8Path":"([^"]+)"/)
        if (m3u8Match && m3u8Match[1]) {
            playurl = appConfig.site + m3u8Match[1]
        } else {
            // 尝试预览视频
            const previewMatch = data.match(/"previewVideoUrl":"([^"]+)"/)
            if (previewMatch && previewMatch[1]) {
                playurl = 'https://static.worldstatic.com' + previewMatch[1]
            }
        }
    } catch (e) {
        // 请求失败
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
