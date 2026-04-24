const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

let appConfig = {
    ver: 1,
    title: 'GetAV',
    site: 'https://getav.net',
    tabs: [
        { name: '热门', ext: { url: 'https://getav.net/zh/hot' } },
        { name: '最新', ext: { url: 'https://getav.net/zh/latest' } },
        { name: '首页', ext: { url: 'https://getav.net/zh' } },
    ],
}

async function getConfig(ext) {
    return jsonify(appConfig)
}

async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let page = ext.page || 1
    let url = ext.url

    if (!url) {
        url = 'https://getav.net/zh/hot'
    }

    // 如果是第2页及以后，添加页码参数
    if (page > 1) {
        url = url + '?page=' + page
    }

    $print('GetAV 获取列表: ' + url)

    let data
    try {
        const response = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': appConfig.site,
                'Accept': 'text/html',
                'Accept-Language': 'zh-CN,zh;q=0.9',
            },
            timeout: 15000,
        })
        data = response.data
    } catch (e) {
        $print('请求失败: ' + e)
        return jsonify({ list: [] })
    }

    const $ = cheerio.load(data)

    // 根据分析结果，视频卡片在 .site-catalog-grid 下的 .group.cursor-pointer 容器中
    $('.site-catalog-grid > div > .group.cursor-pointer').each((_, el) => {
        const $el = $(el)

        // 提取视频链接
        const $link = $el.find('a[href^="/zh/videos/"]').first()
        const href = $link.attr('href')

        if (!href) return

        // 提取视频 ID
        const videoId = href.replace('/zh/videos/', '')

        // 提取标题 - 从 h3 标签的 title 属性
        const title = $el.find('h3[title]').attr('title') || $el.find('h3').text().trim()

        if (!title) return

        // 提取封面图片
        const cover = $el.find('img').attr('src') || ''

        // 提取时长 - 在右下角的绝对定位元素中
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

    $print('✓ 解析到 ' + cards.length + ' 个视频')

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
    const id = ext.id
    let playurl = ''

    $print('GetAV 播放解析: ' + url)

    try {
        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': appConfig.site + '/',
            },
            timeout: 15000,
        })

        // 从详情页 HTML 中提取 m3u8 播放地址
        const m3u8Match = data.match(/"localM3u8Path"\s*:\s*"([^"]+)"/)
        if (m3u8Match && m3u8Match[1]) {
            playurl = appConfig.site + m3u8Match[1]
            $print('✓ 找到 m3u8: ' + playurl.substring(0, 80))
        }

        // 如果没找到 m3u8，尝试找预览视频
        if (!playurl) {
            const previewMatch = data.match(/"previewVideoUrl"\s*:\s*"([^"]+)"/)
            if (previewMatch && previewMatch[1]) {
                playurl = 'https://static.worldstatic.com' + previewMatch[1]
                $print('✓ 找到预览视频: ' + playurl.substring(0, 80))
            }
        }

        // 兜底：直接搜索 m3u8 URL
        if (!playurl) {
            const m3u8DirectMatch = data.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/)
            if (m3u8DirectMatch) {
                playurl = m3u8DirectMatch[1]
                $print('✓ 找到 m3u8 URL: ' + playurl.substring(0, 80))
            }
        }

        if (!playurl) {
            $print('✗ 未找到播放地址')
        }

    } catch (e) {
        $print('✗ 请求失败: ' + e)
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
    const text = encodeURIComponent(ext.text || '')
    const page = ext.page || 1
    let url = `${appConfig.site}/zh/search?q=${text}`
    if (page > 1) url += `&page=${page}`

    $print('GetAV 搜索: ' + url)

    let data
    try {
        const response = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': appConfig.site,
                'Accept': 'text/html',
            },
            timeout: 15000,
        })
        data = response.data
    } catch (e) {
        $print('搜索失败: ' + e)
        return jsonify({ list: [] })
    }

    const $ = cheerio.load(data)

    // 使用相同的选择器解析搜索结果
    $('.site-catalog-grid > div > .group.cursor-pointer').each((_, el) => {
        const $el = $(el)

        const $link = $el.find('a[href^="/zh/videos/"]').first()
        const href = $link.attr('href')

        if (!href) return

        const videoId = href.replace('/zh/videos/', '')
        const title = $el.find('h3[title]').attr('title') || $el.find('h3').text().trim()

        if (!title) return

        const cover = $el.find('img').attr('src') || ''
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

    $print('✓ 搜索到 ' + cards.length + ' 个结果')

    return jsonify({ list: cards })
}
