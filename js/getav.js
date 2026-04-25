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
        { name: '有码', ext: { url: appConfig.site + '/zh/censored' }, ui: 1 },
        { name: '精翻字幕', ext: { url: appConfig.site + '/zh/subtitle?type=refined' }, ui: 1 },
        { name: '机翻字幕', ext: { url: appConfig.site + '/zh/subtitle?type=machine' }, ui: 1 },
        { name: '4K', ext: { url: appConfig.site + '/zh/4k' }, ui: 1 },
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

            // 获取封面图 - 同时检查 src 和 data-src
            const $img = $parent.find('img').first()
            let cover = $img.attr('src') || $img.attr('data-src') || ''

            // 如果封面是 logo 或其他非视频封面，尝试找下一个 img
            if (cover && (cover.includes('logo') || cover.includes('favicon'))) {
                const $img2 = $parent.find('img').eq(1)
                cover = $img2.attr('src') || $img2.attr('data-src') || cover
            }

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
    const url = ext.url
    let tracks = []

    try {
        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': url,
            },
            timeout: 15000,
        })

        // 提取所有 index.txt 播放列表
        const indexTxtRegex = /"(https:\/\/static\.worldstatic\.com\/cdn\/assets\/deliveries\/v2\/[^"]+\/index\.txt[^"]*)"/g
        const matches = []
        let match
        while ((match = indexTxtRegex.exec(data)) !== null) {
            const cleanUrl = match[1].replace(/\\u0026/g, '&')
            if (!matches.includes(cleanUrl)) {
                matches.push(cleanUrl)
            }
        }

        // 如果找到多个播放列表，按顺序命名（通常是从低到高）
        if (matches.length > 0) {
            const qualityNames = ['480P', '720P', '1080P', '4K']
            matches.forEach((playUrl, index) => {
                const qualityName = qualityNames[index] || `画质${index + 1}`
                tracks.push({
                    name: qualityName,
                    pan: '',
                    ext: { playUrl: playUrl, url: url },
                })
            })
        } else {
            // 如果没找到，返回默认
            tracks.push({
                name: '播放',
                pan: '',
                ext: { url: url },
            })
        }

    } catch (error) {
        tracks.push({
            name: '播放',
            pan: '',
            ext: { url: url },
        })
    }

    return jsonify({
        list: [{
            title: '播放',
            tracks: tracks,
        }],
    })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    let playurl = ''

    // 如果 ext 中已经有 playUrl（来自 getTracks），直接使用
    if (ext.playUrl) {
        playurl = ext.playUrl
    } else {
        // 否则从视频页面提取（默认第一个）
        const url = ext.url
        try {
            const { data } = await $fetch.get(url, {
                headers: {
                    'User-Agent': UA,
                    'Referer': url,
                },
                timeout: 15000,
            })

            // 方法1: 提取完整视频的 HLS 播放列表（index.txt）
            const indexTxtMatch = data.match(/"(https:\/\/static\.worldstatic\.com\/cdn\/assets\/deliveries\/v2\/[^"]+\/index\.txt[^"]*)"/)
            if (indexTxtMatch && indexTxtMatch[1]) {
                // 替换 Unicode 转义的 &
                playurl = indexTxtMatch[1].replace(/\\u0026/g, '&')
            }

            // 方法2: 如果没找到 index.txt，尝试查找任何 deliveries 路径
            if (!playurl) {
                const deliveriesMatch = data.match(/"(https:\/\/static\.worldstatic\.com\/cdn\/assets\/deliveries\/v2\/[^"]+)"/)
                if (deliveriesMatch && deliveriesMatch[1]) {
                    let baseUrl = deliveriesMatch[1].replace(/\\u0026/g, '&')
                    // 如果 URL 不包含 index.txt，尝试添加
                    if (!baseUrl.includes('index.txt')) {
                        if (baseUrl.includes('?')) {
                            baseUrl = baseUrl.split('?')[0] + '/index.txt?' + baseUrl.split('?')[1]
                        } else {
                            baseUrl = baseUrl + '/index.txt'
                        }
                    }
                    playurl = baseUrl
                }
            }

            // 方法3: 如果还是没找到，使用预览视频作为备用
            if (!playurl) {
                const videoId = url.match(/\/videos\/([^\/\?]+)/)
                if (videoId && videoId[1]) {
                    const upperVideoId = videoId[1].toUpperCase()
                    playurl = `https://static.worldstatic.com/sprites/videos/${upperVideoId}_preview.mp4`
                }
            }

        } catch (error) {
            // 请求失败，尝试使用预览视频
            const videoId = ext.url.match(/\/videos\/([^\/\?]+)/)
            if (videoId && videoId[1]) {
                const upperVideoId = videoId[1].toUpperCase()
                playurl = `https://static.worldstatic.com/sprites/videos/${upperVideoId}_preview.mp4`
            }
        }
    }

    return jsonify({
        urls: playurl ? [playurl] : [],
        headers: {
            'User-Agent': UA,
            'Referer': ext.url || appConfig.site,
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

            // 获取封面图 - 同时检查 src 和 data-src
            const $img = $parent.find('img').first()
            let cover = $img.attr('src') || $img.attr('data-src') || ''

            // 如果封面是 logo 或其他非视频封面，尝试找下一个 img
            if (cover && (cover.includes('logo') || cover.includes('favicon'))) {
                const $img2 = $parent.find('img').eq(1)
                cover = $img2.attr('src') || $img2.attr('data-src') || cover
            }

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
