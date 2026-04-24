const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

let appConfig = {
    ver: 1,
    title: 'GetAV',
    site: 'https://getav.net',
}

// 生成年龄验证所需的 Cookie
function getAgeVerificationCookies() {
    const timestamp = Date.now()
    return {
        'age_verified_at': timestamp.toString(),
        'age_verification_policy': '1:HK:18'
    }
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
    // 先测试网站是否可访问，检查是否需要验证
    try {
        const ageCookies = getAgeVerificationCookies()
        const cookieString = `age_verified_at=${ageCookies.age_verified_at}; age_verification_policy=${ageCookies.age_verification_policy}`

        const testResponse = await $fetch.get(appConfig.site + '/zh', {
            headers: {
                'User-Agent': UA,
                'Cookie': cookieString
            },
            timeout: 15000,
        })

        const cheerioTest = createCheerio()
        const $test = cheerioTest.load(testResponse.data)
        const pageTitle = $test('title').text()

        // 检查是否是 Cloudflare 验证页面
        if (pageTitle.includes('Just a moment') || pageTitle.includes('Checking')) {
            $print('检测到 Cloudflare 验证，打开浏览器...')
            $utils.openSafari(appConfig.site + '/zh', UA)
        }
        // 检查是否是年龄验证页面（页面很小且包含验证内容）
        else if (testResponse.data.length < 50000 && testResponse.data.includes('18') && testResponse.data.includes('年龄')) {
            $print('检测到年龄验证页面，打开浏览器...')
            $utils.openSafari(appConfig.site + '/zh', UA)
        }
    } catch (e) {
        $print('初始化检查失败: ' + e)
    }

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

    $print('GetAV 获取列表: ' + url)

    let data
    try {
        // 添加年龄验证 Cookie
        const ageCookies = getAgeVerificationCookies()
        const cookieString = `age_verified_at=${ageCookies.age_verified_at}; age_verification_policy=${ageCookies.age_verification_policy}`

        const response = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': appConfig.site,
                'Cookie': cookieString
            },
            timeout: 15000,
        })
        data = response.data
        $print('✓ 成功获取页面，大小: ' + data.length + ' 字节')

    } catch (e) {
        $print('✗ 请求失败: ' + e)
        return jsonify({ list: [] })
    }

    const $ = cheerio.load(data)

    // 检查是否需要验证
    const pageTitle = $('title').text()
    if (pageTitle.includes('Just a moment') || pageTitle.includes('Checking')) {
        $print('检测到 Cloudflare 验证，打开浏览器...')
        $utils.openSafari(url, UA)
        return jsonify({ list: [] })
    }

    if (data.length < 50000 && data.includes('18') && data.includes('年龄')) {
        $print('检测到年龄验证页面，打开浏览器...')
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

    $print('✓ 解析到 ' + uniqueCards.length + ' 个视频')

    return jsonify({ list: uniqueCards })
}

async function getTracks(ext) {
    ext = argsify(ext)
    let tracks = []
    let url = ext.url

    if (!url) {
        $print('✗ 缺少视频URL')
        return jsonify({ list: [] })
    }

    $print('GetAV 获取播放信息: ' + url)

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

    $print('✓ 找到播放源')

    return jsonify({
        list: tracks,
    })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    const url = ext.url
    let playurl = ''

    $print('GetAV 播放解析: ' + url)

    try {
        // 添加年龄验证 Cookie
        const ageCookies = getAgeVerificationCookies()
        const cookieString = `age_verified_at=${ageCookies.age_verified_at}; age_verification_policy=${ageCookies.age_verification_policy}`

        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': url,
                'Cookie': cookieString
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
                    $print('✓ 从 __NEXT_DATA__ 找到: ' + playurl.substring(0, 80))
                }
            } catch (e) {
                $print('✗ 解析 __NEXT_DATA__ 失败: ' + e)
            }
        }

        // 方法2: 提取 localM3u8Path
        if (!playurl) {
            const m3u8Match = data.match(/"localM3u8Path":"([^"]+)"/)
            if (m3u8Match && m3u8Match[1]) {
                playurl = appConfig.site + m3u8Match[1]
                $print('✓ 找到 localM3u8Path: ' + playurl.substring(0, 80))
            }
        }

        // 方法3: 提取预览视频
        if (!playurl) {
            const previewMatch = data.match(/"previewVideoUrl":"([^"]+)"/)
            if (previewMatch && previewMatch[1]) {
                playurl = previewMatch[1].startsWith('http') ? previewMatch[1] : 'https://static.worldstatic.com' + previewMatch[1]
                $print('✓ 找到预览视频: ' + playurl.substring(0, 80))
            }
        }

        // 方法4: 直接搜索 m3u8/mp4 URL
        if (!playurl) {
            const m3u8DirectMatch = data.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/)
            const mp4Match = data.match(/(https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*)/)

            if (m3u8DirectMatch) {
                playurl = m3u8DirectMatch[1]
                $print('✓ 找到 m3u8: ' + playurl.substring(0, 80))
            } else if (mp4Match) {
                playurl = mp4Match[1]
                $print('✓ 找到 mp4: ' + playurl.substring(0, 80))
            }
        }

        if (!playurl) {
            $print('✗ 未找到播放地址，可能需要登录或VIP')
        }

    } catch (error) {
        $print('✗ 请求失败: ' + error)
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

    $print('GetAV 搜索: ' + url)

    let data
    try {
        // 添加年龄验证 Cookie
        const ageCookies = getAgeVerificationCookies()
        const cookieString = `age_verified_at=${ageCookies.age_verified_at}; age_verification_policy=${ageCookies.age_verification_policy}`

        const response = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': appConfig.site,
                'Cookie': cookieString
            },
            timeout: 15000,
        })
        data = response.data
        $print('✓ 搜索成功')
    } catch (e) {
        $print('✗ 搜索失败: ' + e)
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

    $print('✓ 搜索到 ' + uniqueCards.length + ' 个结果')

    return jsonify({ list: uniqueCards })
}
