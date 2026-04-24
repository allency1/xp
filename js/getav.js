const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

let appConfig = {
    ver: 1,
    title: 'GetAV',
    site: 'https://getav.net',
}

async function getLocalInfo() {
    return jsonify({
        ver: 1,
        name: 'GetAV',
        api: 'csp_getav',
        type: 3
    })
}

async function getConfig() {
    // 直接弹出浏览器让用户完成年龄验证
    // 用户点击"确认18岁"后，浏览器会设置必要的 Cookie
    $utils.openSafari(appConfig.site + '/zh', UA)

    let config = appConfig
    config.tabs = [
        { name: '最新', ext: { url: appConfig.site + '/zh/latest', page: 1 }, ui: 1 },
        { name: '热门', ext: { url: appConfig.site + '/zh/hot', page: 1 }, ui: 1 },
        { name: '演员', ext: { url: appConfig.site + '/zh/stars', page: 1 }, ui: 1 },
    ]
    return jsonify(config)
}

async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let page = ext.page || 1
    let url = ext.url || appConfig.site + '/zh/hot'

    // 添加页码
    if (page > 1) {
        url = url + (url.includes('?') ? '&' : '?') + 'page=' + page
    }

    let data
    try {
        const response = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': appConfig.site,
            },
            timeout: 15000,
        })
        data = response.data
    } catch (e) {
        return jsonify({ list: [] })
    }

    const $ = cheerio.load(data)

    // 检查是否还在年龄验证页面
    const videoLinks = $('a[href*="/videos/"]')
    if (videoLinks.length === 0) {
        // 没有视频链接，可能还需要验证
        $utils.openSafari(url, UA)
        return jsonify({ list: [] })
    }

    // 解析视频卡片
    $('div.group').each((_, element) => {
        const $parent = $(element)

        // 查找视频链接
        const $link = $parent.find('a[href*="/zh/videos/"]').first()
        const href = $link.attr('href')

        if (!href) {
            return
        }

        // 提取视频ID
        const match = href.match(/\/videos\/([^\/\?]+)/)
        const vod_id = match ? match[1] : ''

        if (!vod_id) {
            return
        }

        // 获取标题 - 从 h3 标签的 title 属性获取
        const $h3 = $parent.find('h3[title]')
        const title = $h3.attr('title') || $h3.text().trim()

        // 获取封面图
        const $img = $parent.find('img').first()
        let cover = $img.attr('src') || $img.attr('data-src') || ''

        // 提取时长
        const $durationDiv = $parent.find('div[class*="absolute"][class*="bottom-2"]')
        const remarks = $durationDiv.text().trim()

        if (title) {
            const fullUrl = href.startsWith('http') ? href : appConfig.site + href

            cards.push({
                vod_id: vod_id,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: remarks,
                ext: {
                    url: fullUrl,
                },
            })
        }
    })

    // 去重（基于vod_id）
    const uniqueCards = []
    const seenIds = new Set()
    for (const card of cards) {
        if (!seenIds.has(card.vod_id)) {
            seenIds.add(card.vod_id)
            uniqueCards.push(card)
        }
    }

    return jsonify({ list: uniqueCards })
}

async function getTracks(ext) {
    ext = argsify(ext)
    let tracks = []
    let url = ext.url

    if (!url) {
        return jsonify({ list: [] })
    }

    // GetAV 是单集视频，直接返回播放链接
    tracks.push({
        title: 'GetAV播放',
        tracks: [
            {
                name: '播放',
                pan: '',
                ext: {
                    url: url,
                },
            }
        ],
    })

    return jsonify({
        list: tracks,
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

        // 方法1: 从 __NEXT_DATA__ JSON 中提取
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
                            // 优先查找 m3u8
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
                // 解析失败，继续尝试其他方法
            }
        }

        // 方法2: 提取 localM3u8Path
        if (!playurl) {
            const m3u8Match = data.match(/"localM3u8Path":"([^"]+)"/)
            if (m3u8Match && m3u8Match[1]) {
                playurl = appConfig.site + m3u8Match[1]
            }
        }

        // 方法3: 提取预览视频
        if (!playurl) {
            const previewMatch = data.match(/"previewVideoUrl":"([^"]+)"/)
            if (previewMatch && previewMatch[1]) {
                playurl = previewMatch[1].startsWith('http') ? previewMatch[1] : 'https://static.worldstatic.com' + previewMatch[1]
            }
        }

        // 方法4: 直接搜索 m3u8/mp4 URL
        if (!playurl) {
            const m3u8DirectMatch = data.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/)
            const mp4Match = data.match(/(https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*)/)

            if (m3u8DirectMatch) {
                playurl = m3u8DirectMatch[1]
            } else if (mp4Match) {
                playurl = mp4Match[1]
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

    let data
    try {
        const response = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': appConfig.site,
            },
            timeout: 15000,
        })
        data = response.data
    } catch (e) {
        return jsonify({ list: [] })
    }

    const $ = cheerio.load(data)

    // 使用与 getCards 相同的解析逻辑
    $('div.group').each((_, element) => {
        const $parent = $(element)

        // 查找视频链接
        const $link = $parent.find('a[href*="/zh/videos/"]').first()
        const href = $link.attr('href')

        if (!href) {
            return
        }

        // 提取视频ID
        const match = href.match(/\/videos\/([^\/\?]+)/)
        const vod_id = match ? match[1] : ''

        if (!vod_id) {
            return
        }

        // 获取标题
        const $h3 = $parent.find('h3[title]')
        const title = $h3.attr('title') || $h3.text().trim()

        // 获取封面图
        const $img = $parent.find('img').first()
        let cover = $img.attr('src') || $img.attr('data-src') || ''

        // 提取时长
        const $durationDiv = $parent.find('div[class*="absolute"][class*="bottom-2"]')
        const remarks = $durationDiv.text().trim()

        if (title) {
            const fullUrl = href.startsWith('http') ? href : appConfig.site + href

            cards.push({
                vod_id: vod_id,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: remarks,
                ext: {
                    url: fullUrl,
                },
            })
        }
    })

    // 去重
    const uniqueCards = []
    const seenIds = new Set()
    for (const card of cards) {
        if (!seenIds.has(card.vod_id)) {
            seenIds.add(card.vod_id)
            uniqueCards.push(card)
        }
    }

    return jsonify({ list: uniqueCards })
}
