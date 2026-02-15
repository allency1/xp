const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

let appConfig = {
    ver: 1,
    title: '麻豆传媒',
    site: 'https://madou.com',
}

async function getConfig() {
    let config = appConfig
    config.tabs = await getTabs()
    return jsonify(config)
}

async function getTabs() {
    let list = [
        {
            name: '首页',
            ext: {
                url: appConfig.site + '/',
            },
        },
        {
            name: '麻豆AV',
            ext: {
                url: appConfig.site + '/topic/0/13678/',
            },
        },
        {
            name: '天美传媒',
            ext: {
                url: appConfig.site + '/topic/0/13931/',
            },
        },
        {
            name: '蜜桃传媒',
            ext: {
                url: appConfig.site + '/topic/0/13711/',
            },
        },
        {
            name: '皇家华人',
            ext: {
                url: appConfig.site + '/topic/0/13685/',
            },
        },
        {
            name: '星空传媒',
            ext: {
                url: appConfig.site + '/topic/0/13686/',
            },
        },
        {
            name: '精东影业',
            ext: {
                url: appConfig.site + '/topic/0/13688/',
            },
        },
        {
            name: '果冻传媒',
            ext: {
                url: appConfig.site + '/topic/0/13712/',
            },
        },
        {
            name: '国产视频',
            ext: {
                url: appConfig.site + '/topic/0/13713/',
            },
        },
        {
            name: '日本AV',
            ext: {
                url: appConfig.site + '/topic/0/13719/',
            },
        },
        {
            name: '欧美AV',
            ext: {
                url: appConfig.site + '/topic/0/13726/',
            },
        },
    ]
    return list
}

async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let { page = 1, url } = ext

    if (page > 1) {
        url = url.replace(/\/$/, '') + '/page/' + page + '/'
    }

    $print('麻豆 获取列表: ' + url)

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
        $print('✓ 成功获取页面')
    } catch (error) {
        $print('✗ 请求失败: ' + error)
        return jsonify({ list: [] })
    }

    const $ = cheerio.load(data)

    // 解析视频列表项
    $('.section-content__item').each((_, element) => {
        const linkElem = $(element).find('a')
        const href = linkElem.attr('href')
        const title = $(element).find('h3').text().trim()
        const cover = $(element).find('img').attr('data-src')
        const views = $(element).find('.eye').text().trim()

        if (href && title) {
            const fullUrl = href.startsWith('http') ? href : appConfig.site + href

            // 提取视频ID
            const match = href.match(/\/archives\/(\d+)/)
            const vod_id = match ? match[1] : href

            cards.push({
                vod_id: vod_id,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: views,
                ext: {
                    url: fullUrl,
                },
            })
        }
    })

    $print('✓ 解析到 ' + cards.length + ' 个视频')

    return jsonify({
        list: cards,
    })
}

async function getTracks(ext) {
    ext = argsify(ext)
    let tracks = []
    let url = ext.url

    $print('麻豆 获取播放线路: ' + url)

    // 麻豆的视频详情页就是播放页，直接返回一个播放线路
    tracks = [
        {
            title: '麻豆播放器',
            tracks: [
                {
                    name: '播放',
                    pan: '',
                    ext: {
                        url: url,
                    },
                },
            ],
        },
    ]

    $print('✓ 返回播放线路')

    return jsonify({
        list: tracks,
    })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    const url = ext.url
    let playurl = ''

    $print('麻豆 播放解析: ' + url)

    try {
        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': appConfig.site,
            },
            timeout: 15000,
        })

        // 方法1: 从 const path = "..." 中提取 m3u8 路径
        const pathMatch = data.match(/const\s+path\s*=\s*"([^"]+)"/)
        if (pathMatch) {
            let m3u8Path = pathMatch[1]
            // 解码 Unicode 转义序列
            m3u8Path = m3u8Path.replace(/\\u0026/g, '&')
            m3u8Path = m3u8Path.replace(/\\\//g, '/')

            // 构建完整 URL - 使用网站的代理路径
            playurl = appConfig.site + '/h5/m3u8/' + m3u8Path
            $print('✓ 从 const path 解析成功')
            $print('  视频地址: ' + playurl.substring(0, 80) + '...')
        }

        // 方法2: 直接查找 m3u8 URL
        if (!playurl) {
            const m3u8Match = data.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i)
            if (m3u8Match) {
                playurl = m3u8Match[1]
                $print('✓ 找到 m3u8: ' + playurl)
            }
        }

        if (!playurl) {
            $print('✗ 未找到播放地址')
        }

    } catch (error) {
        $print('✗ 请求失败: ' + error)
    }

    // 返回播放信息
    return jsonify({
        urls: [playurl],
        headers: {
            'User-Agent': UA,
            'Referer': appConfig.site,
            'Origin': appConfig.site,
            'Accept': '*/*',
        }
    })
}

async function search(ext) {
    ext = argsify(ext)
    let cards = []
    let text = encodeURIComponent(ext.text)
    let page = ext.page || 1
    let url = `${appConfig.site}/search/${text}/`

    if (page > 1) {
        url += `page/${page}/`
    }

    $print('麻豆 搜索: ' + url)

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
        $print('✓ 搜索成功')
    } catch (error) {
        $print('✗ 搜索失败: ' + error)
        return jsonify({ list: [] })
    }

    const $ = cheerio.load(data)

    // 解析搜索结果
    $('.section-content__item').each((_, element) => {
        const linkElem = $(element).find('a')
        const href = linkElem.attr('href')
        const title = $(element).find('h3').text().trim()
        const cover = $(element).find('img').attr('data-src')
        const views = $(element).find('.eye').text().trim()

        if (href && title) {
            const fullUrl = href.startsWith('http') ? href : appConfig.site + href

            const match = href.match(/\/archives\/(\d+)/)
            const vod_id = match ? match[1] : href

            cards.push({
                vod_id: vod_id,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: views,
                ext: {
                    url: fullUrl,
                },
            })
        }
    })

    $print('✓ 搜索到 ' + cards.length + ' 个结果')

    return jsonify({
        list: cards,
    })
}
