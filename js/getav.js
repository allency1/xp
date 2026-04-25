const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

let appConfig = {
    ver: 1,
    title: 'GetAV',
    site: 'https://getav.net',
}

async function getConfig() {
    let config = appConfig
    config.tabs = [
        { name: '最新', ext: { url: appConfig.site + '/zh/latest' }, ui: 1 },
        { name: '热门', ext: { url: appConfig.site + '/zh/hot' }, ui: 1 },
        { name: '演员', ext: { url: appConfig.site + '/zh/stars' }, ui: 1 },
    ]
    return jsonify(config)
}

async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let page = ext.page || 1
    let url = ext.url || appConfig.site + '/zh/latest'

    // 添加页码
    if (page > 1) {
        url = url + (url.includes('?') ? '&' : '?') + 'page=' + page
    }

    try {
        const response = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': appConfig.site,
            },
            timeout: 15000,
        })

        const data = response.data
        const $ = cheerio.load(data)

        // 查找所有包含 class="group" 的 div
        const groups = $('div[class*="group"]')

        // 如果没找到，返回调试信息
        if (groups.length === 0) {
            cards.push({
                vod_id: 'debug-1',
                vod_name: '调试: 未找到 group 元素',
                vod_pic: '',
                vod_remarks: '页面大小: ' + data.length + ' 字节',
                ext: { url: url },
            })

            // 检查是否有视频链接
            const videoLinks = $('a[href*="/videos/"]')
            cards.push({
                vod_id: 'debug-2',
                vod_name: '调试: 视频链接数量',
                vod_pic: '',
                vod_remarks: videoLinks.length + ' 个',
                ext: { url: url },
            })

            return jsonify({ list: cards })
        }

        // 解析视频卡片
        groups.each((index, element) => {
            const $parent = $(element)
            const $link = $parent.find('a[href*="/videos/"]').first()
            const href = $link.attr('href')

            if (!href) return

            const match = href.match(/\/videos\/([^\/\?]+)/)
            const vod_id = match ? match[1] : ''

            if (!vod_id) return

            const $h3 = $parent.find('h3')
            const title = $h3.attr('title') || $h3.text().trim() || '无标题'

            const $img = $parent.find('img').first()
            const cover = $img.attr('src') || ''

            const fullUrl = href.startsWith('http') ? href : appConfig.site + href

            cards.push({
                vod_id: vod_id,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: '',
                ext: { url: fullUrl },
            })
        })

    } catch (e) {
        cards.push({
            vod_id: 'error',
            vod_name: '错误: ' + e.toString(),
            vod_pic: '',
            vod_remarks: '',
            ext: { url: url },
        })
    }

    return jsonify({ list: cards })
}

async function getTracks(ext) {
    ext = argsify(ext)
    return jsonify({
        list: [{
            title: '播放',
            tracks: [{
                name: '播放',
                pan: '',
                ext: { url: ext.url },
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
                'Referer': url,
            },
            timeout: 15000,
        })

        // 方法1: 提取预览视频（最可靠的方法）
        const previewMatch = data.match(/"previewVideoUrl":"([^"]+)"/)
        if (previewMatch && previewMatch[1]) {
            playurl = previewMatch[1].startsWith('http') ? previewMatch[1] : appConfig.site + previewMatch[1]
        }

        // 方法2: 提取 4K 预览视频
        if (!playurl) {
            const preview4kMatch = data.match(/"previewVideoUrl4k":"([^"]+)"/)
            if (preview4kMatch && preview4kMatch[1]) {
                playurl = preview4kMatch[1].startsWith('http') ? preview4kMatch[1] : appConfig.site + preview4kMatch[1]
            }
        }

        // 方法3: 从 __NEXT_DATA__ JSON 中提取
        if (!playurl) {
            const nextDataMatch = data.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/)
            if (nextDataMatch) {
                try {
                    const nextData = JSON.parse(nextDataMatch[1])

                    // 递归查找视频URL
                    const findVideoUrl = (obj) => {
                        if (typeof obj !== 'object' || obj === null) return null

                        for (const key in obj) {
                            const value = obj[key]
                            if (typeof value === 'string') {
                                // 查找 preview 或 m3u8
                                if (value.includes('preview') && (value.includes('.mp4') || value.includes('.m3u8'))) {
                                    return value
                                }
                                if (value.includes('.m3u8')) {
                                    return value
                                }
                            } else if (typeof value === 'object') {
                                const found = findVideoUrl(value)
                                if (found) return found
                            }
                        }
                        return null
                    }

                    const foundUrl = findVideoUrl(nextData)
                    if (foundUrl) {
                        playurl = foundUrl.startsWith('http') ? foundUrl : appConfig.site + foundUrl
                    }
                } catch (e) {
                    // 解析失败
                }
            }
        }

        // 方法4: 提取 localM3u8Path
        if (!playurl) {
            const m3u8Match = data.match(/"localM3u8Path":"([^"]+)"/)
            if (m3u8Match && m3u8Match[1]) {
                playurl = appConfig.site + m3u8Match[1]
            }
        }

    } catch (error) {
        // 请求失败
    }

    return jsonify({
        urls: playurl ? [playurl] : [],
        headers: {
            'User-Agent': UA,
            'Referer': url,
            'Origin': appConfig.site,
        }
    })
}

async function search(ext) {
    ext = argsify(ext)
    let cards = []
    const text = encodeURIComponent(ext.text || ext.wd || '')
    const page = ext.page || 1
    let url = `${appConfig.site}/zh/search?q=${text}`

    if (page > 1) {
        url += `&page=${page}`
    }

    try {
        const response = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': appConfig.site,
            },
            timeout: 15000,
        })

        const data = response.data
        const $ = cheerio.load(data)

        // 使用与 getCards 相同的解析逻辑
        const groups = $('div[class*="group"]')

        groups.each((index, element) => {
            const $parent = $(element)
            const $link = $parent.find('a[href*="/videos/"]').first()
            const href = $link.attr('href')

            if (!href) return

            const match = href.match(/\/videos\/([^\/\?]+)/)
            const vod_id = match ? match[1] : ''

            if (!vod_id) return

            const $h3 = $parent.find('h3')
            const title = $h3.attr('title') || $h3.text().trim() || '无标题'

            const $img = $parent.find('img').first()
            const cover = $img.attr('src') || ''

            const fullUrl = href.startsWith('http') ? href : appConfig.site + href

            cards.push({
                vod_id: vod_id,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: '',
                ext: { url: fullUrl },
            })
        })

    } catch (e) {
        // 搜索失败
    }

    return jsonify({ list: cards })
}
