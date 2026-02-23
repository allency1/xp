const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

let appConfig = {
    ver: 1,
    title: '91JAV',
    site: 'https://belt.cwzoisnd.xyz',
    tabs: [
        { name: '最新',     ext: { url: 'https://belt.cwzoisnd.xyz/cn/new/',         type: 'new' } },
        { name: '热门',     ext: { url: 'https://belt.cwzoisnd.xyz/cn/popular/week/', type: 'popular' } },
        { name: '中文字幕', ext: { url: 'https://belt.cwzoisnd.xyz/cn/tags/142/latest/', type: 'tag' } },
        { name: '无码',     ext: { url: 'https://belt.cwzoisnd.xyz/cn/tags/169/latest/', type: 'tag' } },
        { name: '有码',     ext: { url: 'https://belt.cwzoisnd.xyz/cn/tags/170/latest/', type: 'tag' } },
        { name: '国产',     ext: { url: 'https://belt.cwzoisnd.xyz/cn/tags/172/latest/', type: 'tag' } },
        { name: '素人',     ext: { url: 'https://belt.cwzoisnd.xyz/cn/tags/180/latest/', type: 'tag' } },
        { name: '人妻',     ext: { url: 'https://belt.cwzoisnd.xyz/cn/tags/181/latest/', type: 'tag' } },
    ],
}

async function getConfig() {
    return jsonify(appConfig)
}

async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let page = ext.page || 1
    let url = ext.url + page

    $print('91JAV 获取列表: ' + url)

    let data
    try {
        const response = await $fetch.get(url, {
            headers: { 'User-Agent': UA, 'Referer': appConfig.site },
            timeout: 15000,
        })
        data = response.data
    } catch (e) {
        $print('请求失败: ' + e)
        return jsonify({ list: [] })
    }

    const $ = cheerio.load(data)

    $('.video-img-box').each((_, el) => {
        const a = $(el).find('.bind_video_img a')
        const href = a.attr('href')

        // 跳过广告（href 不是 /cn/videos/ 开头）
        if (!href || !href.startsWith('/cn/videos/')) return

        // 跳过 data-id="0" 的广告位
        const dataId = $(el).find('.absolute-bottom-left').attr('data-id')
        if (dataId === '0') return

        const img = a.find('img.zximg')
        const cover = img.attr('z-image-loader-url') || ''
        const title = img.attr('alt') || ''
        const duration = $(el).find('.absolute-bottom-right .label').text().trim()

        if (!title) return

        cards.push({
            vod_id: href,
            vod_name: title,
            vod_pic: cover,
            vod_remarks: duration,
            ext: { url: appConfig.site + href },
        })
    })

    $print('✓ 解析到 ' + cards.length + ' 个视频')

    return jsonify({ list: cards })
}

async function getTracks(ext) {
    ext = argsify(ext)
    const url = ext.url
    if (!url) return jsonify({ list: [{ title: '默认', tracks: [] }] })

    return jsonify({
        list: [{
            title: '91JAV',
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

    $print('91JAV 播放解析: ' + url)

    try {
        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': appConfig.site + '/',
            },
            timeout: 15000,
        })

        // 直接提取 hlsUrl = "..."
        const hlsMatch = data.match(/hlsUrl\s*=\s*["']([^"']+\.m3u8[^"']*)["']/)
        if (hlsMatch) {
            playurl = hlsMatch[1]
            $print('✓ 找到 hlsUrl: ' + playurl.substring(0, 80))
        }

        // 兜底：直接搜索 m3u8
        if (!playurl) {
            const m3u8Match = data.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/)
            if (m3u8Match) {
                playurl = m3u8Match[1]
                $print('✓ 找到 m3u8: ' + playurl.substring(0, 80))
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
    const url = `${appConfig.site}/cn/search/${text}?page=${page}`

    $print('91JAV 搜索: ' + url)

    let data
    try {
        const response = await $fetch.get(url, {
            headers: { 'User-Agent': UA, 'Referer': appConfig.site },
            timeout: 15000,
        })
        data = response.data
    } catch (e) {
        $print('搜索失败: ' + e)
        return jsonify({ list: [] })
    }

    const $ = cheerio.load(data)

    $('.video-img-box').each((_, el) => {
        const a = $(el).find('.bind_video_img a')
        const href = a.attr('href')
        if (!href || !href.startsWith('/cn/videos/')) return

        const dataId = $(el).find('.absolute-bottom-left').attr('data-id')
        if (dataId === '0') return

        const img = a.find('img.zximg')
        const cover = img.attr('z-image-loader-url') || ''
        const title = img.attr('alt') || ''
        const duration = $(el).find('.absolute-bottom-right .label').text().trim()

        if (!title) return

        cards.push({
            vod_id: href,
            vod_name: title,
            vod_pic: cover,
            vod_remarks: duration,
            ext: { url: appConfig.site + href },
        })
    })

    $print('✓ 搜索到 ' + cards.length + ' 个结果')

    return jsonify({ list: cards })
}
