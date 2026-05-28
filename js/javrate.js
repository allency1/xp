const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

let appConfig = {
    ver: 1,
    title: 'JavRate',
    site: 'https://www.javrate.com',
    tabs: [
        { name: '最新更新', ext: { url: 'https://www.javrate.com/movie/new' } },
        { name: '無碼A片', ext: { url: 'https://www.javrate.com/menu/uncensored' } },
        { name: '日本A片', ext: { url: 'https://www.javrate.com/menu/censored' } },
        { name: '國產AV', ext: { url: 'https://www.javrate.com/menu/chinese' } },
        { name: '口交', ext: { url: 'https://www.javrate.com/keywords/movie/口交' } },
        { name: '中出', ext: { url: 'https://www.javrate.com/keywords/movie/中出' } },
        { name: '騎乗位', ext: { url: 'https://www.javrate.com/keywords/movie/騎乗位' } },
        { name: '美乳', ext: { url: 'https://www.javrate.com/keywords/movie/美乳' } },
        { name: '麻豆傳媒', ext: { url: 'https://www.javrate.com/issuer/麻豆傳媒' } },
        { name: 'SOD', ext: { url: 'https://www.javrate.com/issuer/SOD' } },
        { name: 'S1', ext: { url: 'https://www.javrate.com/issuer/S1' } },
        { name: '一本道', ext: { url: 'https://www.javrate.com/issuer/一本道' } },
    ],
}

async function getConfig() {
    return jsonify(appConfig)
}

async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let page = ext.page || 1
    let url = ext.url

    // JavRate 的分页格式：URL?page=N 或 URL/page/N
    if (page > 1) {
        if (url.includes('?')) {
            url = url + '&page=' + page
        } else {
            url = url + '?page=' + page
        }
    }

    let data
    try {
        const response = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': appConfig.site + '/',
            },
            timeout: 15000,
        })
        data = response.data
    } catch (e) {
        return jsonify({ list: [] })
    }

    const $ = cheerio.load(data)

    // 解析视频卡片：.mgn-item
    $('.mgn-item').each((_, el) => {
        const $el = $(el)

        // 视频链接
        const $link = $el.find('a.movie-card-link').first()
        const href = $link.attr('href')
        if (!href) return

        // 标题和番号
        const title = $link.attr('title') || ''
        const movieCode = $link.attr('data-movie-code') || ''
        const movieId = $link.attr('data-movie-id') || ''

        // 封面
        const cover = $el.find('img.mgn-cover').attr('src') || ''

        // 女优
        const actress = $el.find('.mgn-actress a').text().trim()

        // 年份和类型
        const year = $el.find('.mgn-badge-year').text().trim()
        const type = $el.find('.mgn-badge-type').text().trim()

        // 组合备注
        let remarks = []
        if (movieCode) remarks.push(movieCode)
        if (actress) remarks.push(actress)
        if (year) remarks.push(year)
        if (type) remarks.push(type)

        const fullUrl = href.startsWith('http') ? href : appConfig.site + href

        cards.push({
            vod_id: movieId || href,
            vod_name: title,
            vod_pic: cover,
            vod_remarks: remarks.join(' | '),
            ext: {
                url: fullUrl,
            },
        })
    })

    return jsonify({ list: cards })
}

async function getTracks(ext) {
    ext = argsify(ext)
    const url = ext.url
    if (!url) return jsonify({ list: [{ title: '默认', tracks: [] }] })

    // 先尝试提取播放地址，显示在线路名称上
    let debugInfo = '播放'
    try {
        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': appConfig.site + '/',
            },
            timeout: 15000,
        })

        // 从 iframe 提取 Player/V2
        const $ = cheerio.load(data)
        const iframeSrc = $('.player-box iframe').attr('src') || $('iframe#v2-player').attr('src')

        if (iframeSrc && iframeSrc.includes('/Player/V2')) {
            const playerUrl = iframeSrc.startsWith('http') ? iframeSrc : appConfig.site + iframeSrc

            // 请求 Player 页面
            const playerResp = await $fetch.get(playerUrl, {
                headers: {
                    'User-Agent': UA,
                    'Referer': url,
                },
                timeout: 15000,
            })

            // 提取带 token 的地址
            const tokenMatch = playerResp.data.match(/https:\/\/videocdn\.avking\.xyz\/bcdn_token=[^\s"'<>]+?\.m3u8/)
            if (tokenMatch && tokenMatch[0]) {
                debugInfo = tokenMatch[0].substring(0, 80) + '...'
            } else {
                debugInfo = '⚠未找到token地址'
            }
        } else {
            debugInfo = '✗未找到iframe'
        }
    } catch (e) {
        debugInfo = '✗请求失败: ' + e.toString().substring(0, 30)
    }

    return jsonify({
        list: [{
            title: 'JavRate',
            tracks: [{
                name: debugInfo,
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

    if (typeof $print !== 'undefined') {
        $print('=== JavRate 播放解析 ===')
        $print('详情页: ' + url)
    }

    try {
        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': appConfig.site + '/',
            },
            timeout: 15000,
        })

        if (typeof $print !== 'undefined') {
            $print('✓ 获取详情页成功')
        }

        // 方法1: 从 iframe 提取 Player/V2 的 src
        const $ = cheerio.load(data)
        const iframeSrc = $('.player-box iframe').attr('src') || $('iframe#v2-player').attr('src')

        if (iframeSrc && iframeSrc.includes('/Player/V2')) {
            if (typeof $print !== 'undefined') {
                $print('✓ 找到 Player iframe: ' + iframeSrc.substring(0, 80) + '...')
            }

            // 构建完整 URL
            const playerUrl = iframeSrc.startsWith('http')
                ? iframeSrc
                : appConfig.site + iframeSrc

            // 请求 Player 页面
            const playerResp = await $fetch.get(playerUrl, {
                headers: {
                    'User-Agent': UA,
                    'Referer': url,
                },
                timeout: 15000,
            })

            if (typeof $print !== 'undefined') {
                $print('✓ 获取 Player 页面成功')
            }

            // 从 Player 页面提取带 token 的播放地址
            // 修复正则：匹配到 .m3u8 结尾，而不是遇到空格就停止
            const tokenMatch = playerResp.data.match(/https:\/\/videocdn\.avking\.xyz\/bcdn_token=[^\s"'<>]+?\.m3u8/)
            if (tokenMatch && tokenMatch[0]) {
                playurl = tokenMatch[0]
                if (typeof $print !== 'undefined') {
                    $print('✓ 提取到带 token 的播放地址')
                }
            } else {
                // 兜底：查找不带 token 的地址
                const m3u8Match = playerResp.data.match(/https:\/\/videocdn\.avking\.xyz\/[^\s"'<>]+?\.m3u8/)
                if (m3u8Match && m3u8Match[0]) {
                    playurl = m3u8Match[0]
                    if (typeof $print !== 'undefined') {
                        $print('⚠ 只找到不带 token 的地址')
                    }
                }
            }
        } else {
            if (typeof $print !== 'undefined') {
                $print('✗ 未找到 Player iframe')
            }
        }

        if (!playurl && typeof $print !== 'undefined') {
            $print('✗ 未找到播放地址')
        }

    } catch (e) {
        if (typeof $print !== 'undefined') {
            $print('✗ 请求失败: ' + e)
        }
    }

    if (typeof $print !== 'undefined') {
        $print('=== 最终播放地址 ===')
        $print(playurl ? playurl.substring(0, 120) + '...' : '(空)')
    }

    return jsonify({
        urls: [playurl],
        headers: {
            'User-Agent': UA,
            'Referer': 'https://iframe.mediadelivery.net/',
        },
    })
}

async function search(ext) {
    ext = argsify(ext)
    let cards = []
    const keyword = ext.text || ''
    const page = ext.page || 1

    if (!keyword) return jsonify({ list: [] })

    // JavRate 搜索 URL 格式（需要根据实际情况调整）
    let url = `${appConfig.site}/search?q=${encodeURIComponent(keyword)}`
    if (page > 1) url += '&page=' + page

    let data
    try {
        const response = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': appConfig.site + '/',
            },
            timeout: 15000,
        })
        data = response.data
    } catch (e) {
        return jsonify({ list: [] })
    }

    const $ = cheerio.load(data)

    // 使用与 getCards 相同的解析逻辑
    $('.mgn-item').each((_, el) => {
        const $el = $(el)
        const $link = $el.find('a.movie-card-link').first()
        const href = $link.attr('href')
        if (!href) return

        const title = $link.attr('title') || ''
        const movieCode = $link.attr('data-movie-code') || ''
        const movieId = $link.attr('data-movie-id') || ''
        const cover = $el.find('img.mgn-cover').attr('src') || ''
        const actress = $el.find('.mgn-actress a').text().trim()

        const fullUrl = href.startsWith('http') ? href : appConfig.site + href

        cards.push({
            vod_id: movieId || href,
            vod_name: title,
            vod_pic: cover,
            vod_remarks: [movieCode, actress].filter(s => s).join(' | '),
            ext: {
                url: fullUrl,
            },
        })
    })

    return jsonify({ list: cards })
}
